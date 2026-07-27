# Migration Plan: Dev Setup → Coastal Church Ownership

**Purpose:** Move Schedule a Membership Meeting (formerly "Coastal Elder Connect") off Nathan's/TechFoundry360's personal accounts and onto infrastructure Coastal Church owns and controls outright.

**Current state (as of this writing):**

| System | Currently | Needs to become |
|---|---|---|
| Code | GitHub — `nathanboothe/coastal-elder-scheduler` (personal) | Church-owned GitHub org/account |
| Data | Airtable — Nathan's personal workspace, base `app3N5PBKrcbX0kBu` | Church's own Airtable account |
| Hosting | Render — Nathan's personal account | Church-owned Render account |
| Email/Directory | Microsoft Graph — TechFoundry360 tenant (demo) | Coastal's own M365/Entra tenant |
| Domain | `elder.techfoundry360.com` | A `gocoastal.org` subdomain (e.g. `elder.gocoastal.org`) |
| Secrets | Airtable PAT, Graph client secret, PINs — all issued under Nathan's accounts | Freshly issued under church ownership, not copied over |

Each section below is written so it can be handed to whoever owns that piece — you don't need to be the one to physically do all of it.

---

## 1. GitHub — code ownership

1. Decide: does the church want its own GitHub organization, or should this live under an existing church GitHub account?
2. In repo Settings → General → Danger Zone → **Transfer ownership**, transfer `coastal-elder-scheduler` to the church's GitHub account/org.
   - Alternative if a full transfer isn't wanted yet: add the church's technical contact as a **collaborator with Admin access**, and revisit a full transfer later.
3. After transfer, update the local remote on any machine that still has it cloned:
   ```powershell
   git remote set-url origin https://github.com/<new-owner>/coastal-elder-scheduler.git
   ```
4. Re-check Render's GitHub connection (see §3) — it's linked by repo, not by owner account, so a transfer usually keeps working, but confirm the auto-deploy webhook still fires after transfer by watching the next push.

---

## 2. Airtable — data ownership

This is the one with no shortcut — the MCP/API tooling used to build this project **cannot move a base between accounts**; it has to be done via the Airtable UI.

1. Church sets up its own Airtable account (Team plan or higher recommended, so Nathan's account isn't a single point of failure).
2. From Nathan's workspace, use Airtable's built-in **"Duplicate base"** feature, sharing the duplicate with the church's new account — or export/import each table (Campuses, Elders, Availability, TimeOff, Appointments, SundayOptOut) as CSV and rebuild the schema by hand if a clean duplicate isn't available under the current plan.
3. **Important:** duplicating a base does not preserve field IDs in a way this codebase depends on incorrectly — the server code (`server/lib/*.js`) reads/writes by **field name**, not field ID, so a duplicated base with identically-named fields will work without code changes. Double-check field names match exactly (including `M365 Object ID`, `Visible In Wizard`, etc. — added mid-project, easy to fumble on a manual rebuild).
4. Generate a **new Airtable Personal Access Token** scoped to the new base, owned by the church's account.
5. Update Render env vars: `AIRTABLE_API_KEY` (new PAT), `AIRTABLE_BASE_ID` (new base ID).
6. Once verified working end-to-end against the new base, revoke Nathan's original PAT and consider archiving (not deleting, for a while) the original base.

---

## 3. Render — hosting ownership

1. Church creates its own Render account.
2. Two paths:
   - **Transfer the existing service** (Render supports team/ownership transfer in some plan tiers — check current Render docs, this has changed over time).
   - **Recreate the service** under the church's account, pointed at the (now church-owned) GitHub repo, and re-enter all environment variables from scratch. This is the more reliable path if a direct transfer isn't available.
3. Either way, re-enter/verify every env var against the new owner's values:
   - `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` (from §2)
   - `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` (from §4 — will be entirely new values)
   - `GRAPH_SEND_AS_MAILBOX` (should become `scheduling@gocoastal.org` for real, once that mailbox exists in Coastal's own tenant)
   - `GRAPH_ELDER_GROUP_NAME` (the group name in Coastal's tenant — may or may not still be called `ElderConnect`, church's call)
   - `OME_EMAIL` (confirm `engagement@gocoastal.org` is still correct)
   - `MANAGE_PIN`, `MANAGE_SESSION_SECRET`, `SCHEDULER_PIN`, `SCHEDULER_SESSION_SECRET` — **generate fresh values**, don't copy these over from the current deployment
4. Point the custom domain (see §5) at the new service's hostname.
5. Once the new deployment is confirmed working, decommission the old Render service under Nathan's account.

---

## 4. Microsoft 365 / Entra — the biggest piece

Everything here currently lives in **TechFoundry360's tenant** as a demo/proof-of-concept. Moving to Coastal's own tenant means redoing this from scratch there — nothing about the app registration itself can be "moved," only recreated.

1. **New app registration** in Coastal's Entra ID (Azure AD), created by someone with admin rights in `gocoastal.org`'s M365 tenant.
2. Grant these **Application permissions** (not delegated) and get **admin consent**:
   - `Mail.Send` — for booking confirmation emails
   - `User.Read.All` — for the elder-profile sync (name, email, phone, department)
   - `GroupMember.Read.All` — for reading the elder group's membership
3. Generate a **client secret** for the new registration (note its expiration date — client secrets expire, unlike certificates; put a reminder somewhere for renewal).
4. Create/confirm the **shared mailbox** `scheduling@gocoastal.org` exists in Exchange Online, and — as a least-privilege step — scope the `Mail.Send` permission to just that mailbox via an Exchange **application access policy**, rather than leaving it able to send as any mailbox in the tenant.
5. Create the **elder group** in Coastal's tenant (mirroring `ElderConnect` from the demo tenant), and add real elders to it. Decide: does the group's `department` field (or equivalent) map cleanly to the 8 real campus names (Battery Park, Bethany Campus, Chesapeake, Gloucester, Hampton, Mathews, Williamsburg, Yorktown)? If Coastal's directory doesn't already tag people by campus, that data will need to be entered as part of standing up each elder's profile.
6. Update Render env vars `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` to the new registration's values.
7. Run a test: click "Refresh from M365" on `/manage` and confirm elders sync in correctly, and send a test booking to confirm `Mail.Send` works end-to-end.
8. Once verified, the TechFoundry360 app registration and `ElderConnect` group can be deleted — they were only ever a demo scaffold.

---

## 5. Domain / DNS

1. Decide the real subdomain — `elder.gocoastal.org` is the natural choice, matching the pattern already used for `scheduling@gocoastal.org` and `engagement@gocoastal.org`.
2. Whoever manages `gocoastal.org`'s DNS adds a **CNAME** record pointing that subdomain at the new Render service's hostname (from §3).
3. Add the custom domain in Render's dashboard for the new service, and let Render provision the HTTPS certificate.
4. Once DNS propagates and the cert is issued, confirm the site loads correctly at the new URL.
5. `elder.techfoundry360.com` can be decommissioned once the new domain is live and confirmed working — keep it pointed at the old service for a short overlap window in case anything needs to roll back.

---

## 6. Secrets — do not carry these over

As a rule for this whole migration: **don't copy any secret value from the old environment into the new one.** Every credential below should be freshly generated under church ownership:

- Airtable Personal Access Token
- Graph client secret
- `MANAGE_PIN` / `MANAGE_SESSION_SECRET`
- `SCHEDULER_PIN` / `SCHEDULER_SESSION_SECRET`

This also happens to be a natural checkpoint to confirm the credentials file that was previously committed to git history (`elder-cmd-id-key.md`, removed from the repo but not yet purged from git history) is fully retired — since everything it contained will be replaced by new values anyway, the exposure risk from that old history effectively goes to zero once this migration is done.

---

## 7. Suggested order of operations

Doing these roughly in this order avoids a lot of back-and-forth:

1. Church sets up its own GitHub, Airtable, Render, and confirms M365 admin access — no app changes yet, just accounts existing.
2. Duplicate the Airtable base (§2) into the church's account. Verify the schema matches.
3. Stand up the new Entra app registration + elder group (§4) in Coastal's tenant. Get admin consent granted — this step often has the longest lead time since it may need IT/leadership sign-off, so start it early.
4. Stand up the new Render service (§3) pointed at the (still Nathan-owned, for now) GitHub repo, with all env vars pointed at the new Airtable base and new Entra app registration.
5. Test everything end-to-end against the new Render service's default `.onrender.com` URL before touching DNS.
6. Cut over DNS (§5) once testing passes.
7. Transfer GitHub ownership (§1) last, since it's the least urgent and least risky to leave for the end.
8. Decommission old Render service, old Airtable base, old Entra app registration/group once the new setup has run cleanly for a week or two.

---

## 8. Open questions to resolve before starting

- Who at the church will hold admin rights for each of GitHub, Airtable, Render, and Entra/M365 going forward?
- Does Coastal's Entra directory already have a `department` field populated per employee/volunteer, or does that need to be entered as part of onboarding elders into the group?
- Airtable plan tier for the church's new account — does it need to support "Duplicate base" the way the current plan does?
- Timeline/deadline — is there a target date (e.g. before a specific membership class cohort) driving this?
