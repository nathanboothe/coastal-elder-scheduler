import { useState } from 'react';

const STEP = {
  PIN_GATE: 'pin_gate',
  CAMPUS: 'campus',
  CLASS_DATE: 'class_date',
  SUNDAY_CHECK: 'sunday_check',
  OPT_OUT_FORM: 'opt_out_form',
  OPT_OUT_DONE: 'opt_out_done',
  DATE: 'date',
  ELDER_PREFERENCE: 'elder_preference',
  ELDER_CHOICE: 'elder_choice',
  TIME: 'time',
  ELDER: 'elder',
  MEMBER_FORM: 'member_form',
  CONFIRMED: 'confirmed',
};

async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function StepList({ items, getLabel, onPick, emptyMessage, gridClassName }) {
  if (items.length === 0) {
    return <p className="empty-message">{emptyMessage}</p>;
  }
  return (
    <div className={`option-grid${gridClassName ? ` ${gridClassName}` : ''}`}>
      {items.map((item, i) => (
        <button key={i} className="option-btn" onClick={() => onPick(item)}>
          {getLabel(item)}
        </button>
      ))}
    </div>
  );
}

export default function ElderScheduling() {
  const [step, setStep] = useState(STEP.PIN_GATE);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(null);

  const [campuses, setCampuses] = useState([]);
  const [campus, setCampus] = useState(null); // { id, name }
  const [classDate, setClassDate] = useState('');

  const [dates, setDates] = useState([]);
  const [date, setDate] = useState(null);

  const [times, setTimes] = useState([]);
  const [time, setTime] = useState(null);

  const [elders, setElders] = useState([]);
  const [elder, setElder] = useState(null);

  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [emailSent, setEmailSent] = useState(true);

  function reset() {
    setStep(STEP.CAMPUS);
    setCampus(null);
    setClassDate('');
    setDate(null);
    setTime(null);
    setElder(null);
    setMemberName('');
    setMemberEmail('');
    setNotes('');
    setError(null);
  }

  function submitPin(ev) {
    ev.preventDefault();
    setLoading(true);
    setPinError(null);
    api('/scheduler-auth', { method: 'POST', body: JSON.stringify({ pin }) })
      .then(() => api('/campuses'))
      .then((data) => {
        setCampuses([...data].sort((a, b) => a.name.localeCompare(b.name)));
        setStep(STEP.CAMPUS);
      })
      .catch((e) => setPinError(e.message))
      .finally(() => setLoading(false));
  }

  function pickCampus(c) {
    setCampus(c);
    setStep(STEP.CLASS_DATE);
  }

  function submitClassDate(cd) {
    setClassDate(cd);
    setStep(STEP.SUNDAY_CHECK);
  }

  function pickSunday() {
    setLoading(true);
    setError(null);
    api(`/dates?campusName=${encodeURIComponent(campus.name)}&dayOfWeek=Sunday&classDate=${classDate}`)
      .then((d) => {
        setDates(d);
        setStep(STEP.DATE);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function pickDate(d) {
    setDate(d);
    setStep(STEP.ELDER_PREFERENCE);
  }

  function noPreference() {
    setLoading(true);
    setError(null);
    api(`/times?campusName=${encodeURIComponent(campus.name)}&date=${date}`)
      .then((t) => {
        setTimes(t);
        setStep(STEP.TIME);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function wantsPreference() {
    setLoading(true);
    setError(null);
    api(`/campus-elders?campusName=${encodeURIComponent(campus.name)}`)
      .then((list) => {
        setElders(list);
        setStep(STEP.ELDER_CHOICE);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function pickPreferredElder(e) {
    setElder(e); // marks the elder as already locked in for pickTime() below
    setLoading(true);
    setError(null);
    api(
      `/times?campusName=${encodeURIComponent(campus.name)}&date=${date}&elderName=${encodeURIComponent(e.name)}`
    )
      .then((t) => {
        setTimes(t);
        setStep(STEP.TIME);
      })
      .catch((e2) => setError(e2.message))
      .finally(() => setLoading(false));
  }

  function pickTime(t) {
    setTime(t);
    if (elder) {
      // Preferred elder already chosen back in ELDER_CHOICE — skip the elder step entirely.
      setStep(STEP.MEMBER_FORM);
      return;
    }
    setLoading(true);
    setError(null);
    api(
      `/elders?campusName=${encodeURIComponent(campus.name)}&date=${date}&timeSlot=${encodeURIComponent(t)}`
    )
      .then((e) => {
        setElders(e);
        setStep(STEP.ELDER);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function pickElder(e) {
    setElder(e);
    setStep(STEP.MEMBER_FORM);
  }

  function submitAppointment(ev) {
    ev.preventDefault();
    setLoading(true);
    setError(null);
    api('/appointments', {
      method: 'POST',
      body: JSON.stringify({
        campusName: campus.name,
        elderName: elder.name,
        date,
        timeSlot: time,
        memberName,
        memberEmail,
      }),
    })
      .then((res) => {
        setEmailSent(res.emailSent !== false);
        setStep(STEP.CONFIRMED);
      })
      .catch((e) => {
        setError(e.message);
        // If the slot was just taken, send them back to re-pick a time.
        if (e.message.includes('just booked')) {
          setStep(STEP.TIME);
        }
      })
      .finally(() => setLoading(false));
  }

  function submitOptOut(ev) {
    ev.preventDefault();
    setLoading(true);
    setError(null);
    api('/sunday-optout', {
      method: 'POST',
      body: JSON.stringify({
        campusName: campus.name,
        memberName,
        memberEmail,
        notes,
      }),
    })
      .then((res) => {
        setEmailSent(res.emailSent !== false);
        setStep(STEP.OPT_OUT_DONE);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  return (
    <div className="wizard">
      <img src="/logo.png" alt="Coastal Church" className="logo-img" />
      <h1>Schedule a Membership Meeting</h1>

      {step !== STEP.PIN_GATE && (
        <div className="breadcrumb">
          {campus && (
            <span className="crumb done">Campus: {campus.name}</span>
          )}
          {campus && step !== STEP.SUNDAY_CHECK && (
            <span className={date || step === STEP.OPT_OUT_FORM || step === STEP.OPT_OUT_DONE ? 'crumb done' : 'crumb'}>
              {step === STEP.OPT_OUT_FORM || step === STEP.OPT_OUT_DONE
                ? "Can't meet Sunday"
                : date
                  ? `Date: ${new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
                  : 'Date'}
            </span>
          )}
          {date && <span className={time ? 'crumb done' : 'crumb'}>{time ? `Time: ${time}` : 'Time'}</span>}
          {time && <span className={elder ? 'crumb done' : 'crumb'}>{elder ? `Elder: ${elder.name}` : 'Elder'}</span>}
        </div>
      )}

      {error && <p className="error-message">{error}</p>}
      {loading && <p className="loading-message">Loading…</p>}

      {!loading && step === STEP.PIN_GATE && (
        <form className="member-form" onSubmit={submitPin}>
          <h2>Enter PIN to schedule a meeting</h2>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          <button type="submit">Continue</button>
          {pinError && <p className="error-message">{pinError}</p>}
        </form>
      )}

      {!loading && step === STEP.CAMPUS && (
        <>
          <h2>Select your campus</h2>
          <StepList
            items={campuses}
            getLabel={(c) => c.name}
            onPick={pickCampus}
            emptyMessage="No campuses found."
            gridClassName="campus-grid"
          />
        </>
      )}

      {!loading && step === STEP.CLASS_DATE && (
        <form
          className="member-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitClassDate(classDate);
          }}
        >
          <h2>When did you take the "We Are Coastal" class?</h2>
          <label>
            Class date
            <input
              type="date"
              required
              value={classDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setClassDate(e.target.value)}
            />
          </label>
          <button type="submit">Next</button>
        </form>
      )}

      {!loading && step === STEP.SUNDAY_CHECK && (
        <>
          <h2>When can you meet?</h2>
          <div className="option-grid">
            <button className="option-btn" onClick={pickSunday}>
              Sunday
            </button>
            <button className="option-btn" onClick={() => setStep(STEP.OPT_OUT_FORM)}>
              I can't meet on Sunday
            </button>
          </div>
        </>
      )}

      {!loading && step === STEP.OPT_OUT_FORM && (
        <form className="member-form" onSubmit={submitOptOut}>
          <h2>Let us know how to reach you</h2>
          <label>
            Your name
            <input required value={memberName} onChange={(e) => setMemberName(e.target.value)} />
          </label>
          <label>
            Your email
            <input required type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
          </label>
          <label>
            Notes (optional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button type="submit">Submit</button>
        </form>
      )}

      {!loading && step === STEP.OPT_OUT_DONE && (
        <div className="confirmation">
          <p>Thank you — we've let our engagement team know, and they'll follow up to find a time that works.</p>
          {!emailSent && (
            <p className="empty-message">(Note: the notification email couldn't be sent — this is expected while email isn't fully configured yet. The request itself was saved.)</p>
          )}
        </div>
      )}

      {!loading && step === STEP.DATE && (
        <>
          <h2>Choose a date</h2>
          <StepList
            items={dates}
            getLabel={(d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
            onPick={pickDate}
            emptyMessage="No upcoming Sundays are open at this campus right now."
          />
        </>
      )}

      {!loading && step === STEP.ELDER_PREFERENCE && (
        <>
          <h2>Do you have a preferred elder?</h2>
          <div className="option-grid">
            <button className="option-btn" onClick={wantsPreference}>Yes</button>
            <button className="option-btn" onClick={noPreference}>No preference</button>
          </div>
        </>
      )}

      {!loading && step === STEP.ELDER_CHOICE && (
        <>
          <h2>Choose an Elder</h2>
          <StepList
            items={elders}
            getLabel={(e) => e.name}
            onPick={pickPreferredElder}
            emptyMessage="No Elders found for this campus."
          />
        </>
      )}

      {!loading && step === STEP.TIME && (
        <>
          <h2>Choose a time</h2>
          <StepList items={times} getLabel={(t) => t} onPick={pickTime} emptyMessage="No open times for that date." />
        </>
      )}

      {!loading && step === STEP.ELDER && (
        <>
          <h2>Choose an Elder</h2>
          <StepList
            items={elders}
            getLabel={(e) => e.name}
            onPick={pickElder}
            emptyMessage="No Elders available at that time."
          />
        </>
      )}

      {!loading && step === STEP.MEMBER_FORM && (
        <form className="member-form" onSubmit={submitAppointment}>
          <h2>Your information</h2>
          <label>
            Your name
            <input required value={memberName} onChange={(e) => setMemberName(e.target.value)} />
          </label>
          <label>
            Your email
            <input required type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
          </label>
          <button type="submit">Confirm appointment</button>
        </form>
      )}

      {!loading && step === STEP.CONFIRMED && (
        <div className="confirmation">
          <p>
            Your meeting is confirmed — {campus.name}, {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} at {time}, with {elder.name}.
          </p>
          <p>A confirmation email is on its way to you.</p>
          {!emailSent && (
            <p className="empty-message">(Note: the confirmation email couldn't be sent — this is expected while email isn't fully configured yet. Your appointment was saved.)</p>
          )}
        </div>
      )}

      {step !== STEP.CAMPUS && step !== STEP.PIN_GATE && (
        <button className="restart-btn" onClick={reset}>
          Start over
        </button>
      )}

      <div style={{ marginTop: '3rem', borderTop: '1px solid #e5e5e2', paddingTop: '1rem' }}>
        <a href="/manage" className="empty-message" style={{ fontSize: '12px' }}>
          Elder or admin? Manage availability →
        </a>
      </div>
    </div>
  );
}
