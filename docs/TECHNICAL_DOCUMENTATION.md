# Coastal Elder Connect — Technical Documentation

## 1. Overview

Coastal Elder Connect lets Coastal Church members book a meeting with an
Elder at their campus, and lets Elders (or an admin on their behalf)
manage recurring availability and time off. It replaces a paper-based
sign-up process with a live, custom-built scheduling engine.

This document assumes email notifications are fully configured against a
real Microsoft 365 tenant (see §6) — it describes the system as it runs in
production, not the placeholder/staging state used during development.

## 2. Architecture

```
Browser (React SPA)
      |
      v
Express backend  <-- single chokepoint; the ONLY thing that talks to
      |               Airtable or Microsoft Graph
      +--> Airtable REST API (data layer)
      +--> Microsoft Graph API (email, OAuth 2.0 client credentials)
```

**Design principle:** the browser never holds an Airtable API key, a Graph
client secret, or any other credential. Every read and write goes through
the backend, which is the single point of authority over both external
systems. This follows the "single chokepoint" convention from the Nexus
architectural framework — used here purely as a design pattern, not a
runtime dependency (this project has no code or infrastructure ties to any
other Nexus-based system).

**Hosting:** Render (Node web service), chosen specifically because this
tool must be reachable by the public with no VPN or network access
requirement — unlike LAN/VPN-oriented tools, this is a public-facing
booking system.

## 3. Data model (Airtable)

Base: "Elder Scheduling." Six tables:

### Campuses
| Field | Type | Notes |
|---|---|---|
| Name | Single line text | Primary field. One of the 8 campuses. |

### Elders
| Field | Type | Notes |
|---|---|---|
| Full Name | Single line text | Primary field. Used as the join key to Availability/TimeOff/Appointments (see §3.1). |
| Email | Email | Used for elder booking-confirmation emails. |
| Campus | Single select | One of the 8 campus names. |

### Availability
| Field | Type | Notes |
|---|---|---|
| Elder Name | Single line text | Primary field. Matches an Elders.Full Name value. |
| Day of Week | Single select | Sunday–Saturday. |
| Week of Month | Multiple select | 1st–5th, or "Every Week." |
| Time Slots | Multiple select | Any of 30 half-hour increments, 7:30 AM–10:00 PM. |

One row = one recurring pattern (e.g., "every 2nd and 4th Sunday, 8:30–9:30
AM"). An elder can have multiple rows to represent multiple patterns.

### TimeOff
| Field | Type | Notes |
|---|---|---|
| Elder Name | Single line text | Primary field. |
| Start Date / End Date | Date | Inclusive range. |
| Notes | Long text | Optional. |

Exceptions layered on top of Availability — an elder is excluded from
availability calculations for any date falling inside a TimeOff range.

### Appointments
| Field | Type | Notes |
|---|---|---|
| Member Name / Member Email | Single line text / Email | |
| Campus | Single select | |
| Elder Name | Single line text | |
| Date / Time Slot | Date / Single select | |
| Status | Single select | Confirmed / Cancelled |
| Created At | Date/time | |

### SundayOptOut
| Field | Type | Notes |
|---|---|---|
| Member Name / Member Email | Single line text / Email | |
| Campus | Single select | |
| Notes | Long text | |
| Created At | Date/time | |

### 3.1 Note on relationships

Cross-table references (Elder Name, Campus) are plain text/select fields
matching by value, **not** Airtable linked-record fields. This was a
deliberate simplification: linked-record fields require the target table
to already exist with a known ID before the link field can be created, and
the tooling used to provision this base creates all tables/fields in a
single pass. Converting to true linked records is possible later directly
in Airtable's UI if relational lookups/rollups become worth the schema
change.

## 4. API reference

All endpoints are under `/api`. Responses are JSON. Errors return
`{ "error": "<message>" }` with an appropriate HTTP status.

### Public (member-facing, no auth)

| Method | Path | Params | Purpose |
|---|---|---|---|
| GET | `/campuses` | — | List all campuses |
| GET | `/dates` | `campusName`, `dayOfWeek` (default `Sunday`) | Upcoming dates with ≥1 open slot |
| GET | `/times` | `campusName`, `date` | Open time slots for that date |
| GET | `/elders` | `campusName`, `date`, `timeSlot` | Elders free at that exact date+time |
| POST | `/appointments` | `campusName, elderName, date, timeSlot, memberName, memberEmail` | Creates a booking; re-checks the slot is still free (race-condition guard) before writing; fires 3 confirmation emails |
| POST | `/sunday-optout` | `campusName, memberName, memberEmail, notes` | The "I can't meet on Sunday" branch; fires 1 FYI email |

Booking and opt-out endpoints return `{ success: true, emailSent: boolean }`
— the write always succeeds independently of email delivery (see §6.3).

### PIN-gated (elder/admin availability management)

All of the following require a valid session (see §5).

| Method | Path | Params | Purpose |
|---|---|---|---|
| POST | `/manage-auth` | `pin` | Public — checks the PIN, sets a signed session cookie on success |
| GET | `/all-elders` | — | List all elders with campus, for the picker UI |
| GET | `/elder-availability` | `elderName` | List an elder's recurring availability rows |
| POST | `/elder-availability` | `elderName, dayOfWeek, weekOfMonth[], timeSlots[]` | Add a recurring availability row |
| DELETE | `/elder-availability/:id` | — | Remove a row |
| GET | `/elder-timeoff` | `elderName` | List an elder's time-off rows |
| POST | `/elder-timeoff` | `elderName, startDate, endDate, notes` | Add a time-off row |
| DELETE | `/elder-timeoff/:id` | — | Remove a row |

## 5. Authentication & security model

**Public wizard (`/`):** intentionally no authentication. Anyone with the
URL can book a meeting or submit the Sunday opt-out — this mirrors the
original paper sign-up process, which had no identity verification either.

**Manage page (`/manage`):** gated behind a single shared PIN, not
per-person login. Mechanism:
- `POST /manage-auth` checks the submitted PIN against `MANAGE_PIN`
  (server-side env var).
- On success, the server issues a signed, HMAC-SHA256 session token
  (Node's built-in `crypto`, no external auth library) as an `httpOnly`,
  `Secure`, `SameSite=Lax` cookie, valid 12 hours.
- Every PIN-gated endpoint verifies this cookie server-side before
  proceeding — the check cannot be bypassed by calling the API directly,
  since it's enforced on the backend, not just hidden in the UI.

**Explicit trade-off:** this is a shared secret, not real authentication.
Anyone with the PIN has full access to every elder's schedule, and there is
no audit trail distinguishing which person made a given change. This was a
deliberate choice for simplicity; moving to per-person authentication would
require a materially different (heavier) system.

**Secrets handling:** Airtable API key and Graph client secret live only
in Render's environment variables, never in source control, and are only
ever read server-side.

## 6. Email notifications (Microsoft Graph)

### 6.1 Why Graph API instead of SMTP

Microsoft is retiring Basic Authentication for SMTP AUTH on Exchange
Online. Building on SMTP with a mailbox password (or an app password)
would have broken within months of launch. Email is instead sent via
Microsoft Graph's `sendMail` endpoint using **OAuth 2.0 client credentials
flow** (app-only authentication — no interactive user, no expiring app
password).

### 6.2 Configuration

An Entra ID app registration in the church's M365 tenant, with:
- The `Mail.Send` **application** permission (not delegated), admin-consented
- A client secret
- Recommended: scoped to the sending mailbox only, via an Application
  Access Policy, rather than tenant-wide send-as capability

Required environment variables: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`,
`GRAPH_CLIENT_SECRET`, `GRAPH_SEND_AS_MAILBOX` (the shared mailbox emails
are sent from), `OME_EMAIL` (the FYI recipient).

### 6.3 What gets sent, and failure handling

Every confirmed booking triggers three emails: to the member, to the
booked elder, and an FYI to `OME_EMAIL`. The opt-out path sends one FYI
email.

Email sending is deliberately decoupled from the booking transaction: the
Airtable write happens first and is considered the source of truth: if
Graph is unreachable or misconfigured, the booking still succeeds and the
API response includes `emailSent: false` rather than failing the request.
The frontend surfaces a small note to the user in that case. This prevents
an email-provider outage from silently losing bookings.

## 7. Frontend

React + Vite SPA, two routes handled by a simple `pathname` check (no
router library, since two pages don't justify the dependency):

- `/` — `ElderScheduling.jsx`: the member-facing wizard (campus → Sunday
  or opt-out → date → time → elder → confirm)
- `/manage` — `AvailabilityManager.jsx`: PIN gate, then elder picker +
  availability/time-off management

Both are built as static assets (`client/dist`) and served directly by the
Express backend — same origin, no CORS configuration needed, no separate
frontend hosting.

### Branding

Primary accent color `#407DA8` and black `#000000`, sampled directly from
the church's website (gocoastal.org) to match its existing visual identity.
Logo asset at `client/public/logo.png`.

## 8. Deployment

Single Render web service, built from `render.yaml`:
- Build: `cd client && npm install && npm run build && cd ../server && npm install`
- Start: `node server/server.js`

| Env var | Purpose |
|---|---|
| `AIRTABLE_API_KEY` | Personal Access Token, scoped to the Elder Scheduling base |
| `AIRTABLE_BASE_ID` | The base ID (stable across ownership transfers) |
| `GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` | Entra app registration credentials |
| `GRAPH_SEND_AS_MAILBOX` | Shared mailbox emails are sent from |
| `OME_EMAIL` | FYI recipient address |
| `MANAGE_PIN` | Shared PIN for `/manage` |
| `MANAGE_SESSION_SECRET` | Random string signing the session cookie |

## 9. Known limitations

- **Shared-PIN access control** (§5) — no per-person identity or audit trail on the manage page.
- **No true relational integrity** in Airtable (§3.1) — cross-table references match by text value, not linked-record IDs.
- **No login on the member wizard** — anyone with the URL can book on behalf of any email address; matches the original paper process's trust model but doesn't verify identity.
- **Race condition window**: two members could theoretically view the same open slot simultaneously; the booking endpoint re-checks and rejects the second write with a 409, but the UI experience is "your slot was just taken, pick another," not a queue or lock.
- **Render free tier** (if not upgraded to Starter): the service sleeps after ~15 minutes of inactivity, adding a 30–60 second delay to the first request after a lull.
