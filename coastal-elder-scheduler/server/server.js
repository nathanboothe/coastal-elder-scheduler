// server.js
// Entry point. Single Express app, single chokepoint, per the framework.

const express = require('express');
const path = require('path');
const config = require('./config');
const elderSchedulingRoutes = require('./routes/elderScheduling');

const app = express();

app.use(express.json());

// API routes for this module.
app.use('/api', elderSchedulingRoutes);

// Serve the built React frontend (added next session) as static assets.
// Until that exists, this just won't find anything to serve at "/" — the
// API endpoints above will still work fine for testing via curl/Postman.
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) res.status(200).send('Elder Scheduling backend is running. Frontend not built yet.');
  });
});

// Basic error handler - logs server-side, returns a generic message to the client.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`Elder Scheduling server listening on port ${config.port}`);
});
