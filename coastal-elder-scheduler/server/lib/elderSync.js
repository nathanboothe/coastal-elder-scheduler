// lib/elderSync.js
// Manual "Refresh from M365" sync, triggered by an admin button on
// /manage (no polling/scheduled job — see routes/elderScheduling.js for
// the endpoint). Diffs the ElderConnect group's membership (via
// lib/graphDirectory.js) against Elder records this sync previously
// created, and:
//   - adds elders newly present in the group
//   - updates name/email/phone/campus for elders already synced
//   - marks elders no longer in the group as Inactive (kept, not deleted,
//     for appointment history) and cancels any future appointments they
//     still have, reporting those cancellations to the OME email
//
// Elders with Source = 'Manual' (e.g. the Demo elder, and the original
// 30-person roster) are never touched by this — only records this sync
// itself created or previously matched by M365 Object ID are in scope.

const { listRecords, createRecords, updateRecords } = require('./airtable');
const { getElderGroupMembers } = require('./graphDirectory');
const mail = require('./graphMail');
const config = require('../config');

const SOURCE_M365 = 'M365 Group Sync';

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function escapeFormulaValue(value) {
  return String(value).replace(/'/g, "\\'");
}

async function getValidCampusNames() {
  const records = await listRecords(config.airtable.tables.campuses);
  return new Set(records.map((r) => r.fields['Name']));
}

/** Elder records this sync is allowed to touch — i.e. ones it created before. */
async function getPreviouslySyncedElders() {
  return listRecords(config.airtable.tables.elders, {
    filterByFormula: `{Source} = '${SOURCE_M365}'`,
  });
}

/** Cancels any future 'Confirmed' appointments for an elder (by name) and returns what was cancelled. */
async function cancelFutureAppointments(elderName) {
  const today = isoToday();
  const rows = await listRecords(config.airtable.tables.appointments, {
    filterByFormula: `AND({Elder Name} = '${escapeFormulaValue(elderName)}', {Status} = 'Confirmed', OR(IS_SAME({Date}, '${today}', 'day'), IS_AFTER({Date}, '${today}')))`,
  });

  if (rows.length === 0) return [];

  await updateRecords(
    config.airtable.tables.appointments,
    rows.map((r) => ({ id: r.id, fields: { Status: 'Cancelled' } }))
  );

  return rows.map((r) => ({
    elderName,
    memberName: r.fields['Member Name'],
    memberEmail: r.fields['Member Email'],
    campus: r.fields['Campus'],
    date: r.fields['Date'],
    timeSlot: r.fields['Time Slot'],
  }));
}

/**
 * Runs the full refresh. Returns a summary object describing what changed,
 * suitable for rendering on the admin screen.
 */
async function refreshFromM365() {
  const [groupMembers, validCampuses, syncedElders] = await Promise.all([
    getElderGroupMembers(),
    getValidCampusNames(),
    getPreviouslySyncedElders(),
  ]);

  const byObjectId = new Map(syncedElders.map((r) => [r.fields['M365 Object ID'], r]));
  const seenObjectIds = new Set();

  const toCreate = [];
  const toUpdate = [];
  const skipped = [];
  const added = [];
  const updated = [];
  const reactivated = [];

  for (const member of groupMembers) {
    if (!member.objectId) continue;
    seenObjectIds.add(member.objectId);

    if (!validCampuses.has(member.department)) {
      skipped.push({
        name: member.name || member.email || member.objectId,
        reason: member.department
          ? `Department "${member.department}" doesn't match any campus name`
          : 'No department set in M365 profile',
      });
      continue;
    }

    const existing = byObjectId.get(member.objectId);

    if (!existing) {
      toCreate.push({
        'Full Name': member.name,
        Email: member.email,
        Phone: member.phone,
        Campus: member.department,
        'M365 Object ID': member.objectId,
        Status: 'Active',
        Source: SOURCE_M365,
        'Visible In Wizard': true,
      });
      added.push(member.name);
    } else {
      const wasInactive = existing.fields['Status'] === 'Inactive';
      const fields = {
        'Full Name': member.name,
        Email: member.email,
        Phone: member.phone,
        Campus: member.department,
        Status: 'Active',
      };
      toUpdate.push({ id: existing.id, fields });
      if (wasInactive) reactivated.push(member.name);
      else updated.push(member.name);
    }
  }

  // Anything previously synced but no longer in the group's membership.
  const removedElders = syncedElders.filter(
    (r) => !seenObjectIds.has(r.fields['M365 Object ID']) && r.fields['Status'] !== 'Inactive'
  );

  const cancelledAppointments = [];
  const deactivated = [];

  for (const elder of removedElders) {
    const elderName = elder.fields['Full Name'];
    const cancelled = await cancelFutureAppointments(elderName);
    cancelledAppointments.push(...cancelled);
    toUpdate.push({ id: elder.id, fields: { Status: 'Inactive' } });
    deactivated.push(elderName);
  }

  if (toCreate.length > 0) {
    await createRecords(config.airtable.tables.elders, toCreate);
  }
  if (toUpdate.length > 0) {
    await updateRecords(config.airtable.tables.elders, toUpdate);
  }

  if (cancelledAppointments.length > 0) {
    const lines = cancelledAppointments
      .map(
        (a) =>
          `- ${a.elderName} was removed from the ElderConnect group but had a future appointment: ` +
          `${a.memberName} (${a.memberEmail}) at ${a.campus} on ${a.date} ${a.timeSlot}. This appointment has been cancelled.`
      )
      .join('\n');

    try {
      await mail.sendMail({
        to: config.notifications.omeEmail,
        subject: 'Elder sync: future appointments cancelled',
        body:
          `An M365 elder-roster refresh removed one or more elders who still had upcoming ` +
          `appointments. These have been cancelled and need manual follow-up:\n\n${lines}`,
      });
    } catch (emailErr) {
      // Don't fail the whole sync just because the report email didn't go
      // out — same "email is a secondary effect" pattern used elsewhere.
      console.error('Elder sync completed, but the OME report email failed:', emailErr);
    }
  }

  return {
    added,
    updated,
    reactivated,
    deactivated,
    skipped,
    cancelledAppointments,
  };
}

module.exports = { refreshFromM365 };
