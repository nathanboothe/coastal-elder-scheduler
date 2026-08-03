# Schedule a Membership Meeting
## Admin Guide — Advanced

This guide is for whoever holds technical/IT-level admin responsibility for the system — typically someone comfortable with Microsoft 365 admin settings, not day-to-day scheduling staff. For routine tasks (elder availability, appointments, rescheduling), see the **General Admin Guide**.

---

## 1. System Overview

The scheduling app has two audience-facing parts:

- **Public booking wizard** (`/`) — where new members, after completing the WAC (We Are Coastal) membership class, book a meeting with an elder.
- **Management area** (`/manage`) — PIN-gated, used by elders and admins to manage availability and view appointments.

The elder list is not maintained by hand. It's synced from Coastal's Microsoft 365 directory (Entra ID), specifically from three mail-enabled security groups — **Elder Group 1**, **Elder Group 2**, and **Elder Group 3** (one per elder type at Coastal). This is the piece this guide focuses on.

---

## 2. The Microsoft 365 (Entra) Sync

### What it does

The **"Refresh from M365"** button, available in the management area, synchronizes the Elders list against the combined membership of all three elder groups in Microsoft 365:

- **Adds** any new members of any of the three groups as new elder records.
- **Marks removed members Inactive** rather than deleting them — this preserves their appointment history. "Removed" means no longer in *any* of the three groups.
- **Cancels any future appointments** that were orphaned because the elder was removed.
- **Emails a summary report** of what changed to the designated OME (Office of Ministry Engagement) address.
- **Flags anyone found in more than one of the three groups.** Elders are expected to belong to exactly one group; if someone is in two or more, the sync uses the first group's data for their record and reports the overlap in the email so it can be corrected in M365.

### Where elder data comes from

- **Name, email, phone:** pulled from the elder's Microsoft 365 profile — not manually maintained. If an elder's info is wrong, it needs to be fixed in Microsoft 365/Entra, not in this app.
- **Campus:** mapped directly from the elder's `department` field in Entra, using an exact text match (e.g., the field must say exactly "Yorktown", "Hampton," etc.). If an elder's department field doesn't exactly match one of the eight campus names, they won't map correctly — check spelling/formatting in Entra first.

### When to run it

Run "Refresh from M365" after:
- Someone is added to or removed from any of the three elder groups in Microsoft 365
- An elder's department (campus) changes
- You're troubleshooting why an elder isn't showing up correctly

It's a manual button — nothing runs this automatically on a schedule.

### Reading the email report

After a sync, an email report goes to the OME address summarizing what was added, marked inactive, and any appointments canceled as a result — plus, if it happens, anyone found in more than one elder group. Review it after every sync to confirm the changes match what you expected (e.g., confirm nobody was unexpectedly marked inactive, and follow up on any duplicate-group notices).

---

## 3. The Demo Elder

There's a demo/test elder record (`bethanyl@gocoastal.org`, Yorktown campus) used for testing the booking flow without exposing a real elder. This record:

- Is **hidden** from the public booking wizard
- Is **exempt** from the M365 group sync (won't be added, removed, or modified by "Refresh from M365")

Leave it in place — it's there intentionally for ongoing testing/demos, not leftover test data to clean up.

---

## 4. Permissions & Setup (Entra / Azure)

If the sync stops working entirely, check these first:

1. **App registration is in the correct tenant.** The Entra app registration must target Coastal Church's actual business M365 tenant — not a personal Microsoft account's Default Directory. Signing in against the wrong tenant produces an **AADSTS700016** error, which is the diagnostic signal for this specific mistake.
2. **API permissions:** the app registration needs `User.Read.All` and `GroupMember.Read.All`, both as **Application** permissions (not Delegated), with **admin consent granted** by someone with Global Admin or Application Admin rights in that tenant.
3. **Credentials location:** the Client ID, Client Secret, and Tenant ID live as environment variables in Render (`GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_TENANT_ID`) — never in the code repository. `GRAPH_SEND_AS_MAILBOX`, `OME_EMAIL`, and `GRAPH_ELDER_GROUP_NAME_1`/`_2`/`_3` (the three elder group display names) have fallback defaults in `config.js`, but should also be set as env vars where possible so a group rename in M365 doesn't require a code change.

> **Security note:** Credentials must never be committed to the GitHub repo, even temporarily. If this ever happens, rotate the exposed credentials immediately and remove them from the repo history — don't just delete the file going forward.

---

## 5. Email Behavior & Troubleshooting

Email sending is **decoupled** from booking success by design: if Microsoft Graph (email) is down or misconfigured, a booking still completes successfully, but the app reports `emailSent: false` internally rather than failing the member's booking outright. This means:

- A member can successfully book a meeting even during a Graph/email outage.
- If elders or members report **not receiving confirmation emails**, check Graph/Microsoft 365 health and the app registration's `Mail.Send` permission before assuming bookings themselves are broken.
- The shared sending mailbox is `scheduling@gocoastal.org`.

---

## 6. Hosting & Deployment

- Hosted on **Render**, deployed via **GitHub push** (no local build step — Render builds directly from the repo).
- Repo: `nathanboothe/coastal-elder-scheduler` (public).
- Render cannot route sub-paths (like `/elder`) without a reverse proxy on the origin domain — a custom subdomain via CNAME (e.g., `elder.techfoundry360.com`) is the correct approach, and is how the current test environment is configured.

---

## 7. Data Storage (Airtable)

The system uses Airtable as its database. Schema changes (adding tables or fields) must be made directly in the Airtable UI — this isn't something that can be scripted or automated from within the app.

---

## Need Help?

For anything not covered here, or for help with the transition to Coastal's own infrastructure, contact **TechFoundry360** (Nathan Boothe).
