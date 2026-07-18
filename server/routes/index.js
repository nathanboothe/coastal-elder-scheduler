const { issuePinToken, requirePinToken } = require('../middleware/requirePin');

app.post('/api/pin/verify', issuePinToken);       // public
app.use('/api/booking', requirePinToken, bookingRouter); // everything else gated