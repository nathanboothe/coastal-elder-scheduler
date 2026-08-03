// lib/graphDirectory.js
// Reads elder roster info from Microsoft Graph (Entra ID) — specifically,
// the COMBINED membership of the three groups that define "who is an
// elder" for the M365 sync feature (manual refresh, triggered from
// /manage — see lib/elderSync.js for the actual add/update/deactivate
// logic).
//
// Coastal splits elders across three mail-enabled security groups by elder
// type (config.graph.elderGroupNames — "Elder Group 1/2/3" by default).
// This module doesn't care what the type distinction means; it just reads
// all three groups and merges their membership into one list. No elder is
// expected to belong to more than one of the three groups — if one does,
// that's reported back via `duplicates` rather than silently resolved, so
// an admin can fix the M365 membership instead of the sync guessing which
// group "wins."
//
// Requires, on top of what graphMail.js already needs:
//   1. The `User.Read.All` APPLICATION permission (to read member profiles:
//      name, email, phone, department), admin-consented.
//   2. The `GroupMember.Read.All` APPLICATION permission (to enumerate each
//      group's members), admin-consented.
//   3. All three groups referenced by config.graph.elderGroupNames must
//      exist in the same tenant as the app registration.
//
// During the demo period this points at TechFoundry360's own tenant. When
// this moves to Coastal Church's own tenant, only
// config.graph.tenantId/clientId/clientSecret and the three group names
// need to change — nothing in this file is tenant-specific.

const config = require('../config');
const { graphFetch } = require('./graphClient');

/**
 * Resolves a group's Graph object ID by display name. Not cached — this
 * only runs when an admin clicks "Refresh from M365", so there's no
 * hot-path cost to looking it up fresh each time (and it avoids ever
 * serving a stale ID if a group is ever recreated).
 */
async function getElderGroupId(groupName) {
  const filter = encodeURIComponent(`displayName eq '${groupName.replace(/'/g, "''")}'`);
  const data = await graphFetch(`/groups?$filter=${filter}&$select=id,displayName`);

  if (!data.value || data.value.length === 0) {
    throw new Error(
      `No M365 group named "${groupName}" was found in the tenant. ` +
        `Check the GRAPH_ELDER_GROUP_NAME_1/2/3 environment variables and that the group exists.`
    );
  }
  return data.value[0].id;
}

/**
 * Returns one group's member users, with just the fields the sync needs.
 * Non-user members (nested groups, service principals, etc.) are filtered
 * out — only real people become elder records.
 */
async function getGroupMembers(groupId) {
  const members = [];
  let path = `/groups/${groupId}/members?$select=id,displayName,mail,userPrincipalName,mobilePhone,businessPhones,department`;

  while (path) {
    const data = await graphFetch(path);
    for (const m of data.value) {
      if (m['@odata.type'] !== '#microsoft.graph.user') continue; // skip nested groups/service principals
      members.push({
        objectId: m.id,
        name: m.displayName || '',
        // mail can be null for accounts without an Exchange mailbox — fall
        // back to userPrincipalName (usually the sign-in email) rather
        // than silently producing a blank Elder email.
        email: m.mail || m.userPrincipalName || '',
        phone: m.mobilePhone || (m.businessPhones && m.businessPhones[0]) || '',
        department: (m.department || '').trim(),
      });
    }
    // Graph paginates with an opaque @odata.nextLink; strip the host since
    // graphFetch prepends the v1.0 base itself.
    path = data['@odata.nextLink'] ? data['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
  }

  return members;
}

/**
 * Returns the combined membership of all three elder groups
 * (config.graph.elderGroupNames), deduplicated by object ID.
 *
 * Groups are read in the order configured (Elder Group 1, then 2, then 3).
 * If the same person turns up in more than one group, the FIRST group's
 * data is kept for that person and the collision is recorded in
 * `duplicates` so it can be surfaced to an admin — it's not expected to
 * happen per Coastal's group structure, so it's treated as worth flagging
 * rather than silently resolving.
 *
 * @returns {Promise<{
 *   members: Array<{objectId: string, name: string, email: string, phone: string, department: string, sourceGroup: string}>,
 *   duplicates: Array<{name: string, objectId: string, groups: string[]}>
 * }>}
 */
async function getElderGroupMembers() {
  const byObjectId = new Map();
  const duplicates = [];

  for (const groupName of config.graph.elderGroupNames) {
    const groupId = await getElderGroupId(groupName);
    const members = await getGroupMembers(groupId);

    for (const member of members) {
      const existing = byObjectId.get(member.objectId);
      if (existing) {
        existing._groups.push(groupName);
        duplicates.push({
          name: member.name || member.email || member.objectId,
          objectId: member.objectId,
          groups: existing._groups.slice(),
        });
        continue; // keep the first group's data; don't overwrite
      }
      byObjectId.set(member.objectId, { ...member, sourceGroup: groupName, _groups: [groupName] });
    }
  }

  const members = Array.from(byObjectId.values()).map(({ _groups, ...member }) => member);
  return { members, duplicates };
}

module.exports = { getElderGroupMembers };
