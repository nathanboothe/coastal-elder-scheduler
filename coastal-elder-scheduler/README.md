# Elder Scheduling

Module of a larger church-membership tool. Lets members book a meeting with
an Elder at their campus, and lets Elders self-manage their availability.
Built on the Self-Hosted Dashboard Framework (Nexus-derived), adapted for
public cloud hosting since this module needs to be reachable by church
members without a VPN.

## Relationship to Nexus

Nexus here is a **framework, not a dependency** — the same way you'd use
.NET to write a program without that program depending on some running
Nexus system. This project borrows Nexus's conventions (single backend
chokepoint, one module per session, secrets never in source control,
module-based project structure) purely as an architectural pattern. Nothing
in this codebase imports from, calls into, or runs alongside your actual
Nexus install. It has its own repo, its own dependencies, and its own
deployment target (Render, not your Nexus Windows Service — this needs
public internet access, which is a different networking model than
Nexus's LAN/VPN-oriented conventions).

## This is being built for the church's own Airtable account — not staying in yours

To be direct about the actual plan, not a hypothetical: **the church will
have their own Airtable account, and that's where this lives permanently.**
Building the base under your account right now is a development
convenience — a staging step — not the destination. Everything below is
written with that as the definite plan, not a maybe.

Good news: Airtable's base ID (`app3N5PBKrcbX0kBu`) **does not change**
when ownership moves to a different account — table IDs, field IDs, and
all existing records stay intact. `AIRTABLE_BASE_ID` in Render's
environment never needs to be touched during the handoff. The only thing
that changes is `AIRTABLE_API_KEY`, since a Personal Access Token is tied
to the account that created it.

**Do this now, before the base has real production data in it:** move it
into its own dedicated workspace (not the "Projects" workspace it
currently lives in, which has other unrelated bases in it). I don't have
tool access to do this move myself — the Airtable MCP tools available to
me can list and search bases/workspaces, but there's no "move base" or
"transfer ownership" action exposed — so this is a couple of manual clicks
on your end:

1. Airtable home screen → find the "Elder Scheduling" base → **`...`** menu
   → **Move base** → choose or create a new workspace (something like
   "Elder Scheduling — Church") → confirm.

Doing this now, while it's just staging, means the base is already
isolated and ready to hand off cleanly whenever the church's Airtable
account exists — no untangling it from unrelated bases later.

**When the church's Airtable account is ready, the actual handoff:**
1. Open that dedicated workspace → **Share** → **Manage access** → invite
   the church's Airtable account → set their permission to **Owner**.
2. Have them log in and generate their own Personal Access Token, scoped to
   this base.
3. Update `AIRTABLE_API_KEY` in Render's environment variables to their new
   token — that's the only config change needed anywhere.
4. Once confirmed working, downgrade your own permission level on that
   workspace, or remove yourself entirely.

No code changes, no redeployment logic, no rebuilding anything. One
environment variable, one Airtable ownership handoff.

## Domain, hosting, and repo — staged in mine, handed off to the church

Same pattern as the Airtable base: this is built and tested under your own
GitHub/Render accounts and a subdomain of `techfoundry360.com` as staging,
not as the permanent home.

**Staging setup (now):**
- Host under a subdomain of `techfoundry360.com` (e.g.
  `elder-scheduling.techfoundry360.com`), not the bare domain. In Render:
  **Settings → Custom Domains → Add Custom Domain**, then add the CNAME
  record Render gives you wherever `techfoundry360.com`'s DNS is managed.

**Important difference from the Airtable handoff:** Render has no
"transfer service to another account" feature — confirmed directly from
Render's own FAQ, which states it isn't currently possible to transfer
existing services between workspaces at all (only whole *workspaces* on
paid Scale/Enterprise plans, via contacting Render support — not relevant
at this scale). So the Render side of the handoff isn't a transfer, it's a
clean recreation — which is low-friction specifically because this app is
stateless. Everything that actually matters (bookings, availability,
elders) lives in Airtable, not in Render.

**Full handoff sequence, once the church has their own accounts:**

1. **GitHub repo** — real ownership transfer exists here. Repo
   **Settings → Danger Zone → Transfer ownership**, enter the church's
   GitHub username or org, they accept within 14 days. Issues, stars, and
   full commit history move with it; GitHub auto-redirects the old URL.
2. **Render** — *after* the GitHub transfer completes, the church creates
   their own free Render account and does **New → Blueprint**, connecting
   to their now-owned copy of the repo. Render reads `render.yaml`
   automatically and recreates the service from scratch.
3. **Environment variables** — re-entered fresh in the church's Render
   dashboard: their own Airtable token (per the Airtable handoff above),
   and their Entra credentials — which were always meant to live in their
   own M365 tenant from the start, so that piece was never staged under
   your accounts to begin with.
4. **DNS** — the church points their own subdomain (e.g.
   `schedule.gocoastal.org`) at their new Render service via CNAME, same
   mechanism as the `techfoundry360.com` staging setup.
5. **Decommission** — once confirmed working on their infrastructure,
   delete the staging Render service and remove the `techfoundry360.com`
   DNS entry.

## Architecture

- **Backend (Express, `server/`)** — single chokepoint. Only this code
  touches Airtable or Microsoft Graph directly.
- **Frontend (React/Vite, `client/`)** — the actual wizard, matching the
  original wireframe (campus → Sunday/not → date → time → elder → confirm),
  calling the `/api/*` endpoints below. Built and verified — `npm run build`
  succeeds and the Express server correctly serves the built files.
- **Data layer** — Airtable base "Elder Scheduling" (`app3N5PBKrcbX0kBu`),
  6 tables: Campuses, Elders, Availability, TimeOff, Appointments,
  SundayOptOut.
- **Email** — Microsoft Graph `sendMail`, OAuth 2.0 client credentials
  (app-only). Deliberately not SMTP AUTH — Microsoft is retiring Basic Auth
  for SMTP AUTH on Exchange Online.
- **Hosting** — Render free tier (chosen over self-hosting at home to keep
  the church's home network out of the picture and get free TLS/HTTPS).


## API endpoints (server/routes/elderScheduling.js)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/campuses` | List all 8 campuses |
| GET | `/api/dates?campusName=&dayOfWeek=` | Upcoming dates with at least one open slot |
| GET | `/api/times?campusName=&date=` | Open time slots for a date |
| GET | `/api/elders?campusName=&date=&timeSlot=` | Elders free at that date+time |
| POST | `/api/appointments` | Create a booking + fire confirmation emails |
| POST | `/api/sunday-optout` | The "I can't meet on Sunday" branch |
| GET/POST | `/api/elder-availability` | Elder self-service availability read/write |

## Going live — step by step

### 1. Get the code into a git repo
```powershell
cd elder-scheduling
git init
git add .
git commit -m "Initial elder scheduling build"
```
Create a new repo on GitHub (or your preferred host) and push:
```powershell
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

### 2. Generate an Airtable Personal Access Token
In Airtable: account icon → **Developer hub** → **Personal access tokens**
→ Create new token. Scope it to:
- **Access**: only the "Elder Scheduling" base (`app3N5PBKrcbX0kBu`)
- **Scopes**: `data.records:read`, `data.records:write` (add
  `schema.bases:read` too if you ever want to inspect field IDs later)

Copy the token now — Airtable only shows it once.

### 3. Entra app registration (for email)
Needs the M365 tenant admin. In the Entra admin center:
1. **App registrations** → New registration (any name, e.g. "Elder
   Scheduling Mailer"). No redirect URI needed — this is app-only auth.
2. **API permissions** → Add a permission → Microsoft Graph → Application
   permissions → search `Mail.Send` → add it → **Grant admin consent**.
3. **Certificates & secrets** → New client secret → copy the *value*
   immediately (not the secret ID).
4. Note down: the **Application (client) ID**, the **Directory (tenant)
   ID**, and the client secret value.
5. Confirm or create the shared mailbox — currently a placeholder
   (`scheduling@gocoastal.org`) in the code.

Optional but recommended: ask the admin to scope the app's `Mail.Send`
permission to just that one mailbox via an **Application Access Policy**,
rather than leaving it able to send as anyone in the tenant.

### 4. Deploy to Render
1. Go to Render → New → Blueprint → connect the GitHub repo. Render reads
   `render.yaml` automatically and creates the service.
2. When prompted for the `sync: false` environment variables, enter:
   - `AIRTABLE_API_KEY` — the token from step 2
   - `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` — from step 3
3. Render builds (`cd client && npm install && npm run build && cd
   ../server && npm install`) and starts (`node server/server.js`)
   automatically. First deploy takes a few minutes.
4. Render gives you a public URL immediately
   (`https://elder-scheduling-xxxx.onrender.com`) with free HTTPS. A custom
   domain (e.g. `schedule.gocoastal.org`) can be added later under the
   service's **Settings → Custom Domains** — just a CNAME record on your
   DNS provider.

### 5. Smoke-test before sharing the link
Visit `https://<your-render-url>/api/campuses` directly in a browser — you
should get back JSON listing the 8 campuses. If that works, the Airtable
connection is good. Then click through the actual wizard at the root URL
and complete one real test booking end-to-end (you can delete the test
`Appointments` row in Airtable afterward).

### 6. Free-tier reality check
Render's free tier spins the service down after ~15 minutes of no traffic;
the next visitor waits 30–60 seconds for a cold start. Fine for low-traffic
internal testing; if that delay isn't acceptable once real members are
using it, upgrade that one service to the $7/month Starter plan in Render's
dashboard — no code or redeploy needed, just a plan change.

## Outstanding setup items (not something Claude can do for you)

1. **Entra app registration** — see step 3 above; requires the customer's
   M365 tenant admin.
2. **Shared mailbox** — `scheduling@gocoastal.org` is a placeholder. Confirm
   whether it needs to be created, and update the `GRAPH_SEND_AS_MAILBOX`
   environment variable in Render once it's real.
3. **Real elder roster** — the Elders table currently has 24 placeholder
   rows (3 per campus). Rename/replace with real names and emails directly
   in Airtable.
4. **Real Availability data** — no Availability rows exist yet beyond the
   table structure. Populate from the elders' actual reported schedules
   (paper form, or the `/api/elder-availability` endpoint once a
   self-service frontend exists for it).

## Next session

Build the elder self-service availability form — same no-login pattern as
the member wizard, hitting the existing `/api/elder-availability`
endpoints, which are already live in the backend.
