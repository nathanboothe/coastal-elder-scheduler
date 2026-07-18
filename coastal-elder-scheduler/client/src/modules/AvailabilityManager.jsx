import { useEffect, useState } from 'react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKS = ['Every Week', '1st', '2nd', '3rd', '4th', '5th'];
const SLOTS = [
  '7:30 AM', '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM',
  '2:30 PM', '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM',
  '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM', '9:00 PM',
  '9:30 PM', '10:00 PM',
];

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function Toggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      className={`toggle-chip${checked ? ' toggle-chip-active' : ''}`}
      onClick={() => onChange(!checked)}
    >
      {label}
    </button>
  );
}

export default function AvailabilityManager() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(null);
  const [pinLoading, setPinLoading] = useState(false);

  const [elders, setElders] = useState([]);
  const [selectedElder, setSelectedElder] = useState('');
  const [availability, setAvailability] = useState([]);
  const [timeOff, setTimeOff] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSummary, setSyncSummary] = useState(null);
  const [syncError, setSyncError] = useState(null);

  // New availability form state
  const [newDay, setNewDay] = useState('Sunday');
  const [newWeeks, setNewWeeks] = useState([]);
  const [newSlots, setNewSlots] = useState([]);

  // New time-off form state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (unlocked) {
      api('/all-elders').then(setElders).catch((e) => setError(e.message));
    }
  }, [unlocked]);

  function submitPin(ev) {
    ev.preventDefault();
    setPinLoading(true);
    setPinError(null);
    api('/manage-auth', { method: 'POST', body: JSON.stringify({ pin }) })
      .then(() => setUnlocked(true))
      .catch((e) => setPinError(e.message))
      .finally(() => setPinLoading(false));
  }

  function loadElderData(elderName) {
    setSelectedElder(elderName);
    setError(null);
    if (!elderName) {
      setAvailability([]);
      setTimeOff([]);
      return;
    }
    setLoading(true);
    Promise.all([
      api(`/elder-availability?elderName=${encodeURIComponent(elderName)}`),
      api(`/elder-timeoff?elderName=${encodeURIComponent(elderName)}`),
    ])
      .then(([avail, off]) => {
        setAvailability(avail);
        setTimeOff(off);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function refreshFromM365() {
    setSyncLoading(true);
    setSyncError(null);
    setSyncSummary(null);
    api('/elder-sync/refresh', { method: 'POST' })
      .then((summary) => {
        setSyncSummary(summary);
        return api('/all-elders').then(setElders); // roster may have changed
      })
      .catch((e) => setSyncError(e.message))
      .finally(() => setSyncLoading(false));
  }

  function toggleInArray(arr, setArr, value) {
    setArr(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  }

  function addAvailability(ev) {
    ev.preventDefault();
    if (newWeeks.length === 0 || newSlots.length === 0) {
      setError('Pick at least one week and one time slot.');
      return;
    }
    setLoading(true);
    setError(null);
    api('/elder-availability', {
      method: 'POST',
      body: JSON.stringify({
        elderName: selectedElder,
        dayOfWeek: newDay,
        weekOfMonth: newWeeks,
        timeSlots: newSlots,
      }),
    })
      .then(() => {
        setNewWeeks([]);
        setNewSlots([]);
        return loadElderData(selectedElder);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function deleteAvailability(id) {
    setLoading(true);
    api(`/elder-availability/${id}`, { method: 'DELETE' })
      .then(() => loadElderData(selectedElder))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function addTimeOff(ev) {
    ev.preventDefault();
    if (!startDate || !endDate) {
      setError('Start and end date are required.');
      return;
    }
    setLoading(true);
    setError(null);
    api('/elder-timeoff', {
      method: 'POST',
      body: JSON.stringify({ elderName: selectedElder, startDate, endDate, notes }),
    })
      .then(() => {
        setStartDate('');
        setEndDate('');
        setNotes('');
        return loadElderData(selectedElder);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function deleteTimeOff(id) {
    setLoading(true);
    api(`/elder-timeoff/${id}`, { method: 'DELETE' })
      .then(() => loadElderData(selectedElder))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  if (!unlocked) {
    return (
      <div className="wizard">
        <img src="/logo.png" alt="Coastal Church" className="logo-img" />
        <h1>Schedule a Membership Meeting — Manage Availability</h1>
        <p className="empty-message">Enter the PIN to continue.</p>

        <form className="member-form" onSubmit={submitPin}>
          <label>
            PIN
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          {pinError && <p className="error-message">{pinError}</p>}
          <button type="submit" disabled={pinLoading}>
            {pinLoading ? 'Checking…' : 'Unlock'}
          </button>
        </form>

        <a href="/" className="restart-btn" style={{ display: 'inline-block', marginTop: '2rem' }}>
          ← Back to scheduling
        </a>
      </div>
    );
  }

  return (
    <div className="wizard">
      <img src="/logo.png" alt="Coastal Church" className="logo-img" />
      <h1>Schedule a Membership Meeting — Manage Availability</h1>
      <p className="empty-message">
        For elders adjusting their own schedule, or an admin adjusting it on their behalf — pick
        a name below.
      </p>

      <section className="manager-section">
        <h2>Elder roster (M365)</h2>
        <p className="empty-message">
          Syncs elders from the ElderConnect group. Elders added manually (like Demo) aren't
          affected.
        </p>
        <button type="button" onClick={refreshFromM365} disabled={syncLoading}>
          {syncLoading ? 'Refreshing…' : 'Refresh from M365'}
        </button>

        {syncError && <p className="error-message">{syncError}</p>}

        {syncSummary && (
          <div className="manager-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <div>✅ Added: {syncSummary.added.length ? syncSummary.added.join(', ') : 'none'}</div>
            <div>🔄 Updated: {syncSummary.updated.length ? syncSummary.updated.join(', ') : 'none'}</div>
            <div>
              ↩️ Reactivated: {syncSummary.reactivated.length ? syncSummary.reactivated.join(', ') : 'none'}
            </div>
            <div>
              🚫 Marked inactive:{' '}
              {syncSummary.deactivated.length ? syncSummary.deactivated.join(', ') : 'none'}
            </div>
            {syncSummary.skipped.length > 0 && (
              <div>
                ⚠️ Skipped: {syncSummary.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}
              </div>
            )}
            {syncSummary.cancelledAppointments.length > 0 && (
              <div>
                📧 {syncSummary.cancelledAppointments.length} future appointment(s) were cancelled
                and reported to the OME email.
              </div>
            )}
          </div>
        )}
      </section>

      <label className="elder-select-label">
        Elder
        <select
          value={selectedElder}
          onChange={(e) => loadElderData(e.target.value)}
          className="elder-select"
        >
          <option value="">— Select an elder —</option>
          {elders.map((e) => (
            <option key={e.id} value={e.name}>
              {e.name} ({e.campus})
            </option>
          ))}
        </select>
      </label>

      {error && <p className="error-message">{error}</p>}
      {loading && <p className="loading-message">Loading…</p>}

      {selectedElder && !loading && (
        <>
          <section className="manager-section">
            <h2>Current weekly availability</h2>
            {availability.length === 0 && <p className="empty-message">No availability set yet.</p>}
            {availability.map((row) => (
              <div className="manager-row" key={row.id}>
                <div>
                  <strong>{row['Day of Week']}</strong>
                  {' — '}
                  {(row['Week of Month'] || []).join(', ')}
                  <br />
                  <span className="empty-message">{(row['Time Slots'] || []).join(', ')}</span>
                </div>
                <button className="delete-btn" onClick={() => deleteAvailability(row.id)}>
                  Remove
                </button>
              </div>
            ))}

            <form className="member-form" onSubmit={addAvailability} style={{ marginTop: '1rem' }}>
              <h3>Add availability</h3>
              <label>
                Day of week
                <select value={newDay} onChange={(e) => setNewDay(e.target.value)}>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              <span className="empty-message">Which weeks of the month?</span>
              <div className="chip-row">
                {WEEKS.map((w) => (
                  <Toggle
                    key={w}
                    label={w}
                    checked={newWeeks.includes(w)}
                    onChange={() => toggleInArray(newWeeks, setNewWeeks, w)}
                  />
                ))}
              </div>

              <span className="empty-message">Which times?</span>
              <div className="chip-row">
                {SLOTS.map((s) => (
                  <Toggle
                    key={s}
                    label={s}
                    checked={newSlots.includes(s)}
                    onChange={() => toggleInArray(newSlots, setNewSlots, s)}
                  />
                ))}
              </div>

              <button type="submit">Add availability</button>
            </form>
          </section>

          <section className="manager-section">
            <h2>Time off</h2>
            {timeOff.length === 0 && <p className="empty-message">No time off scheduled.</p>}
            {timeOff.map((row) => (
              <div className="manager-row" key={row.id}>
                <div>
                  <strong>
                    {row['Start Date']} → {row['End Date']}
                  </strong>
                  {row['Notes'] && <div className="empty-message">{row['Notes']}</div>}
                </div>
                <button className="delete-btn" onClick={() => deleteTimeOff(row.id)}>
                  Remove
                </button>
              </div>
            ))}

            <form className="member-form" onSubmit={addTimeOff} style={{ marginTop: '1rem' }}>
              <h3>Add time off</h3>
              <label>
                Start date
                <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label>
                End date
                <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
              <label>
                Notes (optional)
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <button type="submit">Add time off</button>
            </form>
          </section>
        </>
      )}

      <a href="/" className="restart-btn" style={{ display: 'inline-block', marginTop: '2rem' }}>
        ← Back to scheduling
      </a>
    </div>
  );
}
