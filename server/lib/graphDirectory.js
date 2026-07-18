// lib/graphDirectory.js
// Reads elder roster info from Microsoft Graph (Entra ID) — specifically,
// the membership of the group that defines "who is an elder" for the
// M365 sync feature (manual refresh, triggered from /manage — see
// lib/elderSync.js for the actual add/update/deactivate logic).
//
// Requires, on top of what graphMail.js already needs:
//   1. The `User.Read.All` APPLICATION permission (to read member profiles:
//      name, email, phone, department), admin-consented.
//   2. The `GroupMember.Read.All` APPLICATION permission (to enumerate the
//      group's members), admin-consented.
//   3. The group referenced by config.graph.elderGroupName must exist in
//      the same tenant as the app registration.
//
// During the demo period this points at TechFoundry360's own tenant (the
// "ElderConnect" group living there). When this moves to Coastal Church's
// own tenant, only config.graph.tenantId/clientId/clientSecret and the
// group need to change — nothing in this file is tenant-specific.

const config = require('../config');
const { graphFetch } = require('./graphClient');

/**
 * Resolves the elder group's Graph object ID by display name. Not cached —
 * this only runs when an admin clicks "Refresh from M365", so there's no
 * hot-path cost to looking it up fresh each time (and it avoids ever
 * serving a stale ID if the group is ever recreated).
 */
async function getElderGroupId() {
  const filter = encodeURIComponent(`displayName eq '${config.graph.elderGroupName.replace(/'/g, "''")}'`);
  const data = await graphFetch(`/groups?$filter=${filter}&$select=id,displayName`);

  if (!data.value || data.value.length === 0) {
    throw new Error(
      `No M365 group named "${config.graph.elderGroupName}" was found in the tenant. ` +
        `Check GRAPH_ELDER_GROUP_NAME and that the group exists.`
    );
  }
  return data.value[0].id;
}

/**
 * Returns the elder group's member users, with just the fields the sync
 * needs. Non-user members (nested groups, service principals, etc.) are
 * filtered out — only real people become elder records.
 *
 * @returns {Promise<Array<{objectId: string, name: string, email: string, phone: string, department: string}>>}
 */
async function getElderGroupMembers() {
  const groupId = await getElderGroupId();

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

module.exports = { getElderGroupMembers };
