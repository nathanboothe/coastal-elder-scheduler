# Coastal Elder Scheduler — Feature Spec: PIN Gate, Class-Date Gating, Preferred Elder

This is a build-ready spec for the three new requests. I don't have write access to
`nathanboothe/coastal-elder-scheduler` (private repo, no credentials in this session), so
this is code to paste in or hand to Claude Code — not a live commit. Filenames below are
illustrative; adapt paths to match your actual repo structure. Everything follows your
Nexus conventions: single backend chokepoint, secrets stay in Render env vars, one module
per concern.

Decisions locked in from our conversation:
- **PIN:** one shared PIN for everyone, stored as a Render env var.
- **No preferred elder chosen:** fall back to today's behavior — show all campus elders
  with an open slot at the chosen day/time.
- **Class date < 2 weeks ago:** don't block — just show the earliest slot that's 2+ weeks
  out, however far that is.
- **Elder titles** (Lead Pastor, etc.): dropped from Airtable; `Full Name` is plain name only.

---

## 1. PIN Gate

**Where it sits:** a single gate screen shown once per browser session, before the campus
picker. Not per-member — just a shared "you belong here" checkpoint.

### Env vars (Render)
```
SCHEDULER_PIN=<the shared PIN>
```
Never hardcode it; never put it in the frontend bundle. It's checked server-side only.

### Backend — `server/middleware/requirePin.js`
```js
// Nexus: single chokepoint for PIN verification.
// Client sends the PIN once, backend issues a short-lived signed token,
// client stores that token (not the PIN) and sends it on every subsequent call.
const jwt = require('jsonwebtoken');

const PIN_SECRET = process.env.SCHEDULER_PIN_SECRET; // separate from the PIN itself
const TOKEN_TTL = '12h';

function issuePinToken(req, res) {
  const { pin } = req.body;
  if (!pin || pin !== process.env.SCHEDULER_PIN) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }
  const token = jwt.sign({ scope: 'scheduler' }, PIN_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token });
}

function requirePinToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing session token' });
  try {
    jwt.verify(token, PIN_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, re-enter PIN' });
  }
}

module.exports = { issuePinToken, requirePinToken };
```

Add `SCHEDULER_PIN_SECRET` (a random 32+ char string, unrelated to the PIN itself) as
another Render env var — it signs the token so the token can't be forged even if someone
guesses the PIN's length.

### Route wiring — `server/routes/index.js`
```js
const { issuePinToken, requirePinToken } = require('../middleware/requirePin');

app.post('/api/pin/verify', issuePinToken);       // public
app.use('/api/booking', requirePinToken, bookingRouter); // everything else gated
```

### Frontend — gate screen (`client/src/components/PinGate.jsx`)
```jsx
import { useState } from 'react';

export default function PinGate({ onUnlocked }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const res = await fetch('/api/pin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) { setError('Incorrect PIN. Please try again.'); return; }
    const { token } = await res.json();
    sessionStorage.setItem('schedulerToken', token); // cleared when tab closes
    onUnlocked();
  }

  return (
    <form onSubmit={submit}>
      <h2>Enter PIN to schedule a meeting</h2>
      <input type="password" inputMode="numeric" value={pin}
             onChange={e => setPin(e.target.value)} autoFocus />
      <button type="submit">Continue</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

Every subsequent fetch to `/api/booking/*` attaches
`Authorization: Bearer ${sessionStorage.getItem('schedulerToken')}`. If the wizard ever
gets a 401, drop back to `PinGate`.

**Note:** this protects against casual walk-up access, not a determined attacker — the
same PIN is visible to everyone who's supposed to use it. If you later want per-member
accountability, that's the "individual PIN" path we didn't pick, and it's a bigger lift
(new table + issuing workflow).

---

## 2. "We Are Coastal" Class Date Gate

**Where it sits:** immediately after campus selection, before the Sunday/opt-out step.

**Rule:** ask for the class date, then only offer meeting dates that are **≥ 14 days**
after it — no upper bound. If the next few generated Sundays don't clear that bar, keep
generating further out until one does (don't just filter a fixed 5-week window and come
up empty).

### Frontend step — insert into wizard state machine
```jsx
// New step between CampusSelect and SundayOptOut
function ClassDateStep({ onNext }) {
  const [classDate, setClassDate] = useState('');
  return (
    <div>
      <label>
        What date did you take the "We Are Coastal" class?
        <input type="date" value={classDate}
               max={new Date().toISOString().slice(0,10)}
               onChange={e => setClassDate(e.target.value)} required />
      </label>
      <button onClick={() => onNext(classDate)}>Next</button>
    </div>
  );
}
```

### Backend — date generation, `server/services/dateAvailability.js`
```js
const { addDays, nextDay, isBefore } = require('date-fns'); // or plain Date math if you'd rather avoid the dep

const MIN_LEAD_DAYS = 14;

/**
 * Returns the next N Sundays that are at least MIN_LEAD_DAYS after classDate.
 * Keeps walking forward until it finds N qualifying dates — no artificial ceiling.
 */
function getEligibleSundays(classDate, count = 5) {
  const earliestAllowed = addDays(new Date(classDate), MIN_LEAD_DAYS);
  let cursor = nextDay(new Date(), 0); // next Sunday from today (0 = Sunday)
  const results = [];

  while (results.length < count) {
    if (!isBefore(cursor, earliestAllowed)) {
      results.push(new Date(cursor));
    }
    cursor = addDays(cursor, 7);
  }
  return results;
}

module.exports = { getEligibleSundays, MIN_LEAD_DAYS };
```

Then cross-reference `getEligibleSundays()` output against actual elder `Availability` /
`TimeOff` records the same way the current date-picker step already does — this function
only handles the "how far out" rule, not elder availability itself.

**Edge case handled:** someone who took the class yesterday just sees a Sunday ~2 weeks
out instead of an error — matches what you picked.

---

## 3. Preferred Elder — Reordered Flow

**New sequence:**
```
Campus → Class Date → Sunday date → "Do you have a preferred elder?"
  ├─ No  → show time slots (union of all campus elders' openings, as today)
  │         → then show elders available at the chosen time (existing final step)
  └─ Yes → pick elder from campus roster
            → show ONLY that elder's open time slots for the chosen date
            → confirm (elder already locked in, skip the final elder-picker)
```

Good news: the `Availability` table is already keyed per elder (`Elder Name`, `Day of
Week`, `Week of Month`, `Time Slots`), so no schema change is needed — this is a query
+ wizard-order change only.

### Backend — `server/routes/booking.js`
```js
// GET /api/booking/elders?campus=Yorktown
router.get('/elders', requirePinToken, async (req, res) => {
  const { campus } = req.query;
  const elders = await airtable('Elders')
    .select({ filterByFormula: `{Campus} = "${campus}"` })
    .all();
  res.json(elders.map(e => ({ id: e.id, name: e.get('Full Name') })));
});

// GET /api/booking/slots?campus=Yorktown&date=2026-08-02&elder=Paul%20Clegg
router.get('/slots', requirePinToken, async (req, res) => {
  const { campus, date, elder } = req.query; // elder is optional
  const dow = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
  const weekOfMonth = getWeekOfMonth(date); // e.g. "1st Week"

  const filterParts = [
    `{Day of Week} = "${dow}"`,
    `FIND("${weekOfMonth}", ARRAYJOIN({Week of Month})) > 0`,
  ];
  if (elder) filterParts.push(`{Elder Name} = "${elder}"`);

  const availability = await airtable('Availability')
    .select({ filterByFormula: `AND(${filterParts.join(',')})` })
    .all();

  // Exclude anyone on TimeOff for this date, and slots already booked in Appointments
  const openSlots = await resolveOpenSlots(availability, date, campus);
  res.json(openSlots); // [{ time: "8:00 AM", elders: ["Paul Clegg","Frank Council"] }, ...]
});
```

### Frontend — branch point
```jsx
function PreferredElderStep({ campus, onChoose }) {
  const [wantsPreference, setWantsPreference] = useState(null);
  const [elders, setElders] = useState([]);

  useEffect(() => {
    if (wantsPreference) {
      fetch(`/api/booking/elders?campus=${encodeURIComponent(campus)}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('schedulerToken')}` },
      }).then(r => r.json()).then(setElders);
    }
  }, [wantsPreference, campus]);

  if (wantsPreference === null) {
    return (
      <div>
        <p>Do you have a preferred elder?</p>
        <button onClick={() => setWantsPreference(true)}>Yes</button>
        <button onClick={() => onChoose(null)}>No preference</button>
      </div>
    );
  }

  return (
    <div>
      {elders.map(e => (
        <button key={e.id} onClick={() => onChoose(e.name)}>{e.name}</button>
      ))}
    </div>
  );
}
```

When `onChoose(elderName)` fires, pass `elderName` into the `/slots` call above as the
`elder` param; when `onChoose(null)` fires, omit it and keep today's "elder list after
time" step at the end of the wizard.

---

## What's still needed before shipping

1. **Populate real `Availability` records** for all 30 elders — this is separate from
   today's Elders-table repopulation (already done) and blocks features 2 & 3 from doing
   anything useful, since there's no real per-elder schedule data yet.
2. **`getWeekOfMonth()` / `resolveOpenSlots()`** — referenced above but presumably already
   exist somewhere in your current date/slot logic; wire the new filters into them rather
   than duplicating.
3. **Entra/Graph blocker** — unrelated to this spec, but still open per your notes.

I populated the Airtable `Elders` table with your real 30-person roster (dropping titles,
leaving `Email` blank as you asked) — that part's done. Let me know if you want me to also
build out the `Availability` table scaffolding once you have real elder schedules to enter.
