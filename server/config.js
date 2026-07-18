// config.js
// GITIGNORED IN PRINCIPLE — but since this project deploys to Render (not a
// self-hosted Windows Service), actual secret values live in Render's
// Environment Variables dashboard, not in a local file at all. This module
// just reads them from process.env and fails loudly if something's missing.
//
// Set these in Render: Dashboard -> your service -> Environment.

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  // --- Airtable ---
  airtable: {
    apiKey: required('AIRTABLE_API_KEY'),       // Personal access token, scoped to this base only
    baseId: required('AIRTABLE_BASE_ID'),        // app3N5PBKrcbX0kBu (the "Elder Scheduling" base)
    tables: {
      campuses: 'Campuses',
      elders: 'Elders',
      availability: 'Availability',
      timeOff: 'TimeOff',
      appointments: 'Appointments',
      sundayOptOut: 'SundayOptOut',
    },
  },

  // --- Microsoft Graph (email via OAuth client credentials, not SMTP) ---
  graph: {
    tenantId: required('GRAPH_TENANT_ID'),
    clientId: required('GRAPH_CLIENT_ID'),
    clientSecret: required('GRAPH_CLIENT_SECRET'),
    // The shared mailbox that sends confirmation emails. Placeholder until
    // the real M365 admin creates/confirms the actual shared mailbox address.
    sendAsMailbox: process.env.GRAPH_SEND_AS_MAILBOX || 'scheduling@gocoastal.org',
    // The M365/Entra group whose membership defines who's an elder, for the
    // manual "Refresh from M365" sync on the admin screen. During the demo
    // period this lives in TechFoundry360's tenant; when this moves to
    // Coastal's own tenant, only the tenant/client env vars need to change.
    elderGroupName: process.env.GRAPH_ELDER_GROUP_NAME || 'ElderConnect',
  },

  // --- Notification recipients ---
  notifications: {
    // Plain FYI email, no structured data, per the decided requirement.
    omeEmail: process.env.OME_EMAIL || 'engagement@gocoastal.org',
  },

  // --- Manage page (elder/admin availability manager) ---
  manage: {
    pin: required('MANAGE_PIN'),
    sessionSecret: required('MANAGE_SESSION_SECRET'),
  },

  // --- Member wizard PIN gate (NEW — separate from the manage-page PIN above,
  // so unlocking one doesn't unlock the other) ---
  scheduler: {
    pin: required('SCHEDULER_PIN'),
    sessionSecret: required('SCHEDULER_SESSION_SECRET'),
  },

  // --- Scheduling behavior ---
  scheduling: {
    // How many upcoming Sundays to offer on the member wizard.
    weeksAhead: 8,
    timeZone: 'America/New_York',
  },

  port: process.env.PORT || 3000,
};
