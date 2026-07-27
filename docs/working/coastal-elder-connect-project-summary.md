# Coastal Elder Connect — Project Summary

## Purpose
A church member scheduling web app for **Coastal Church** (gocoastal.org), built by Nathan (TechFoundry360). It lets church members book meetings with elders across **eight campuses** and lets elders/admins manage their own availability.

**Campuses:** Battery Park, Bethany Campus, Chesapeake, Gloucester, Hampton, Mathews, Williamsburg, Yorktown.

## Original Design Intent (from early wireframes)
The initial hand-sketched mockups (member booking flow + elder availability form) established the core flow, which the built app follows and extends:

**Member booking flow (wireframe):**
1. Select campus (8 buttons)
2. Select "Sunday" or "I can't meet on a Sunday" — if the latter, an email is sent to `engagement@gocoastal.org`
3. If Sunday: pick from available Sunday dates
4. Pick an available time slot
5. Pick from the list of available elders for that slot
6. Confirm — emails go to the elder, the participant, and OME (engagement@gocoastal.org)

**Elder Availability Form (wireframe):**
- Elder enters first/last name
- Checks days available (Sunday–Saturday) and week-of-month (1st–5th week)
- Checks specific time slots from a fixed grid (7:30 AM–10:00 PM in 30-min increments)
- Notes: elders can choose any times, are encouraged (not required) to cluster around service times, should pick a regular time (reschedules are fine), and meetings default to their campus (though they can call to change location after booking)

The built app generalized this into a full booking wizard (not limited to Sundays) and a PIN-gated elder/admin availability manager, while preserving the same underlying logic (campus → date → time → elder → confirm, with email notifications).

## Tech Stack
- **Frontend:** React (Vite)
- **Backend:** Node.js / Express — single chokepoint pattern, informed by Nathan's **Nexus framework** (used as an architectural pattern, not a runtime dependency)
- **Data layer:** Airtable
- **Email:** Microsoft Graph API (OAuth 2.0 client credentials flow)
- **Hosting:** Render (free tier), deployed via GitHub push only (Render auto-builds — no local Node.js execution; Nathan works on Windows/PowerShell without Node installed locally)
- **GitHub repo:** `nathanboothe/coastal-elder-scheduler`

## Current App Routes
- `/` — Member booking wizard (multi-step)
- `/manage` — PIN-gated elder/admin availability manager
  - Shared PIN via `SCHEDULER_PIN` env var
  - HMAC-SHA256 signed, HTTP-only cookies
  - Session secret env var: `SCHEDULER_SESSION_SECRET`
  - Auth pattern lives in `manageAuth.js`; new auth work should mirror this

## Key Business Rules
- **"We Are Coastal" class filter:** a member's meeting date must be ≥14 days after their class date (no upper bound)
- **Preferred elder selection:** after date selection, members can optionally filter available time slots by a preferred elder
- **Email decoupled from booking success:** if Microsoft Graph is down, the booking still succeeds and the API returns `emailSent: false` rather than failing the request
- **Sunday-only fallback (legacy):** original design routed non-Sunday-availability members to an email to `engagement@gocoastal.org`; current `OME_EMAIL` env var defaults to this address

## Branding
- Coastal blue `#407DA8`, black `#000000`
- Coastal Church logo processed via luminance-as-alpha technique

## Airtable Base — "Elder Scheduling" (`app3N5PBKrcbX0kBu`)
Six tables:
| Table | Notes |
|---|---|
| Campuses | 8 rows |
| Elders | `tbluN8ILMjygkS1nN` — 30-person real roster, no title suffixes, emails still need to be filled in |
| Availability | `tblpVFDPpTVrTQj4O` — sample data across all 30 elders |
| TimeOff | — |
| Appointments | — |
| SundayOptOut | — |

**Airtable quirks:**
- Record create/update calls require **field IDs**, not field names
- No `move_base`, `create_table`, or `add_field` tool via MCP — schema changes need the Airtable UI
- `filterByFormula` with name fields needs apostrophe escaping: `.replace(/'/g, "\\'")`
- Church will eventually run this on their own Airtable account; Nathan's workspace is a dev convenience for now

## Key Files (server-side)
- `server/config.js`
- `server/lib/schedulerAuth.js`
- `server/lib/availability.js`
- `server/routes/elderScheduling.js`
- `client/src/modules/ElderScheduling.jsx`

Two early-draft files are obsolete and should be deleted: `PinGate.jsx`, `requirePin.js`.

## Outstanding Work
1. **Microsoft Graph email setup**
   - Entra app registration must be created in the correct **business M365 tenant** (not the personal "Default Directory") — `AADSTS700016` error means it landed in the wrong tenant
   - Needs `Mail.Send` application permission + admin consent
   - Needs a shared mailbox `scheduling@gocoastal.org` in Exchange Online
   - `GRAPH_SEND_AS_MAILBOX` (default `scheduling@gocoastal.org`) and `OME_EMAIL` (default `engagement@gocoastal.org`) are optional in Render since fallbacks are hardcoded in `config.js`
2. **Fill in elder email addresses** in the Airtable Elders table
3. **Custom domain:** `elder.techfoundry360.com` — chosen because Render can't route sub-paths like `/elder` without a reverse proxy; needs a CNAME to the Render service hostname
4. **Airtable account transition** to the church's own account

## Working Conventions / Preferences
- Nathan wants **complete, working code**, not partial snippets
- Builds **iteratively, one module per session**, following Nexus conventions
- **Deploys only via GitHub push** — no local Node.js, so nothing that requires local `npm run`/`node` testing
- New auth/pattern work should **mirror existing conventions** in the codebase rather than introducing new patterns
- Always work from **actual repo file contents** when available — early guidance given before repo access had incorrect filenames/line numbers, which caused rework
- Browser extensions have previously caused false-positive CSS bugs (confirmed by testing in incognito) — worth ruling out before deep debugging

## Useful Tooling Notes
- **Airtable MCP:** `list_tables_for_base` with `baseId: app3N5PBKrcbX0kBu` returns full schema + field IDs; batch record creation must be split when it exceeds single-call limits
- **Render:** `render.yaml` uses `sync: false` for env vars managed manually in the dashboard; all builds are GitHub-push-triggered
