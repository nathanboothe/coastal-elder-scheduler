// routes/elderScheduling.js
// All HTTP endpoints for the member-facing wizard, the elder self-service
// form, and admin lookups. This is the only thing the frontend (built next
// session) talks to — it never touches Airtable or Graph directly.

const express = require('express');
const { listRecords, createRecord, deleteRecords } = require('../lib/airtable');
const availability = require('../lib/availability');
const mail = require('../lib/graphMail');
const manageAuth = require('../lib/manageAuth');
const schedulerAuth = require('../lib/schedulerAuth');
const elderSync = require('../lib/elderSync');
const config = require('../config');

const router = express.Router();

// --- Member wizard PIN gate (public — this is how the cookie gets set) ---

router.post('/scheduler-auth', (req, res) => schedulerAuth.checkPin(req, res));

// --- Campuses ---

router.get('/campuses', schedulerAuth.requireSchedulerAuth, async (req, res, next) => {
  try {
    const records = await listRecords(config.airtable.tables.campuses);
    res.json(records.map((r) => ({ id: r.id, name: r.fields['Name'] })));
  } catch (err) {
    next(err);
  }
});

// --- Member wizard: cascading availability ---

router.get('/dates', schedulerAuth.requireSchedulerAuth, async (req, res, next) => {
  try {
    const { campusId, campusName, dayOfWeek, classDate } = req.query;
    if (!campusName) return res.status(400).json({ error: 'campusName is required' });
    if (!classDate) return res.status(400).json({ error: 'classDate is required' });
    const dates = await availability.getAvailableDates(campusId, campusName, dayOfWeek || 'Sunday', classDate);
    res.json(dates);
  } catch (err) {
    next(err);
  }
});

router.get('/times', schedulerAuth.requireSchedulerAuth, async (req, res, next) => {
  try {
    const { campusId, campusName, date, elderName } = req.query;
    if (!campusName || !date) {
      return res.status(400).json({ error: 'campusName and date are required' });
    }
    const times = await availability.getAvailableTimes(campusId, campusName, date, elderName);
    res.json(times);
  } catch (err) {
    next(err);
  }
});

// --- Preferred-elder lookup (campus roster, no date/time filtering yet) ---

router.get('/campus-elders', schedulerAuth.requireSchedulerAuth, async (req, res, next) => {
  try {
    const { campusName } = req.query;
    if (!campusName) return res.status(400).json({ error: 'campusName is required' });
    const elders = await availability.getEldersForCampusPublic(campusName);
    res.json(elders);
  } catch (err) {
    next(err);
  }
});

router.get('/elders', schedulerAuth.requireSchedulerAuth, async (req, res, next) => {
  try {
    const { campusId, campusName, date, timeSlot } = req.query;
    if (!campusName || !date || !timeSlot) {
      return res.status(400).json({ error: 'campusName, date, and timeSlot are required' });
    }
    const elders = await availability.getAvailableElders(campusId, campusName, date, timeSlot);
    res.json(elders.map((e) => ({ id: e.id, name: e.fields['Full Name'] })));
  } catch (err) {
    next(err);
  }
});

// --- Booking submission ---

router.post('/appointments', schedulerAuth.requireSchedulerAuth, async (req, res, next) => {
  try {
    const { campusName, elderName, date, timeSlot, memberName, memberEmail } = req.body;
    if (!campusName || !elderName || !date || !timeSlot || !memberName || !memberEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await availability.createAppointment({ campusName, elderName, date, timeSlot, memberName, memberEmail });

    // Look up the elder's email for the confirmation.
    const elderRecords = await listRecords(config.airtable.tables.elders, {
      filterByFormula: `{Full Name} = '${elderName.replace(/'/g, "\\'")}'`,
    });
    const elderEmail = elderRecords[0]?.fields?.['Email'];

    const summary = `Campus: ${campusName}\nElder: ${elderName}\nDate: ${date}\nTime: ${timeSlot}\nMember: ${memberName} (${memberEmail})`;

    // The booking itself already succeeded above - that's the part that
    // matters. Email is a secondary effect: if it fails (e.g. Graph
    // credentials not configured yet), log it server-side and tell the
    // client via `emailSent: false`, but don't fail the whole request.
    // A booking with a Graph outage shouldn't be lost or bounced back to
    // the member just because a notification couldn't go out.
    let emailSent = true;
    try {
      await Promise.all([
        mail.sendMail({
          to: memberEmail,
          subject: 'Your meeting with an Elder is confirmed',
          body: `Your meeting is confirmed.\n\n${summary}`,
        }),
        elderEmail
          ? mail.sendMail({
              to: elderEmail,
              subject: 'New meeting scheduled',
              body: `A member has scheduled a meeting with you.\n\n${summary}`,
            })
          : Promise.resolve(),
        mail.sendMail({
          to: config.notifications.omeEmail,
          subject: 'New Elder meeting scheduled (FYI)',
          body: `FYI — a new meeting was scheduled.\n\n${summary}`,
        }),
      ]);
    } catch (emailErr) {
      console.error('Booking saved, but email failed:', emailErr);
      emailSent = false;
    }

    res.status(201).json({ success: true, emailSent });
  } catch (err) {
    if (err.message === 'SLOT_NO_LONGER_AVAILABLE') {
      return res.status(409).json({ error: 'That time was just booked by someone else. Please pick another.' });
    }
    next(err);
  }
});

// --- Sunday opt-out branch ---

router.post('/sunday-optout', schedulerAuth.requireSchedulerAuth, async (req, res, next) => {
  try {
    const { campusName, memberName, memberEmail, notes } = req.body;
    if (!campusName || !memberName || !memberEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await availability.createSundayOptOut({ campusName, memberName, memberEmail, notes });

    let emailSent = true;
    try {
      await mail.sendMail({
        to: config.notifications.omeEmail,
        subject: 'Member cannot meet on Sunday (FYI)',
        body: `A member requested a non-Sunday meeting time.\n\nCampus: ${campusName}\nMember: ${memberName} (${memberEmail})\nNotes: ${notes || '(none)'}`,
      });
    } catch (emailErr) {
      console.error('Opt-out saved, but email failed:', emailErr);
      emailSent = false;
    }

    res.status(201).json({ success: true, emailSent });
  } catch (err) {
    next(err);
  }
});

// --- Manage page PIN gate (separate gate/cookie from the scheduler PIN above) ---

router.post('/manage-auth', (req, res) => manageAuth.checkPin(req, res));

// --- Elder self-service availability (no login distinguishing elder vs admin,
// but gated behind the shared PIN now that this is only reachable via /manage) ---

router.get('/elder-availability', manageAuth.requireManageAuth, async (req, res, next) => {
  try {
    const { elderName } = req.query;
    if (!elderName) return res.status(400).json({ error: 'elderName is required' });
    const rows = await listRecords(config.airtable.tables.availability, {
      filterByFormula: `{Elder Name} = '${elderName.replace(/'/g, "\\'")}'`,
    });
    res.json(rows.map((r) => ({ id: r.id, ...r.fields })));
  } catch (err) {
    next(err);
  }
});

router.post('/elder-availability', manageAuth.requireManageAuth, async (req, res, next) => {
  try {
    const { elderName, dayOfWeek, weekOfMonth, timeSlots } = req.body;
    if (!elderName || !dayOfWeek || !Array.isArray(weekOfMonth) || !Array.isArray(timeSlots)) {
      return res.status(400).json({ error: 'Missing or invalid fields' });
    }
    const record = await createRecord(config.airtable.tables.availability, {
      'Elder Name': elderName,
      'Day of Week': dayOfWeek,
      'Week of Month': weekOfMonth,
      'Time Slots': timeSlots,
    });
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

// --- Elder picker (serves both the elder self-service and admin-on-behalf-of use case,
// since there's no login system distinguishing them) ---

router.get('/all-elders', manageAuth.requireManageAuth, async (req, res, next) => {
  try {
    const records = await listRecords(config.airtable.tables.elders);
    res.json(
      records.map((r) => ({
        id: r.id,
        name: r.fields['Full Name'],
        campus: r.fields['Campus'],
      }))
    );
  } catch (err) {
    next(err);
  }
});

// --- M365 elder roster sync (manual refresh button, no polling) ---

router.post('/elder-sync/refresh', manageAuth.requireManageAuth, async (req, res, next) => {
  try {
    const summary = await elderSync.refreshFromM365();
    res.json({ success: true, ...summary });
  } catch (err) {
    next(err);
  }
});

router.delete('/elder-availability/:id', manageAuth.requireManageAuth, async (req, res, next) => {
  try {
    await deleteRecords(config.airtable.tables.availability, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- Elder self-service time off (exceptions layered on top of Availability) ---

router.get('/elder-timeoff', manageAuth.requireManageAuth, async (req, res, next) => {
  try {
    const { elderName } = req.query;
    if (!elderName) return res.status(400).json({ error: 'elderName is required' });
    const rows = await listRecords(config.airtable.tables.timeOff, {
      filterByFormula: `{Elder Name} = '${elderName.replace(/'/g, "\\'")}'`,
    });
    res.json(rows.map((r) => ({ id: r.id, ...r.fields })));
  } catch (err) {
    next(err);
  }
});

router.post('/elder-timeoff', manageAuth.requireManageAuth, async (req, res, next) => {
  try {
    const { elderName, startDate, endDate, notes } = req.body;
    if (!elderName || !startDate || !endDate) {
      return res.status(400).json({ error: 'elderName, startDate, and endDate are required' });
    }
    const record = await createRecord(config.airtable.tables.timeOff, {
      'Elder Name': elderName,
      'Start Date': startDate,
      'End Date': endDate,
      Notes: notes || '',
    });
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

router.delete('/elder-timeoff/:id', manageAuth.requireManageAuth, async (req, res, next) => {
  try {
    await deleteRecords(config.airtable.tables.timeOff, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
