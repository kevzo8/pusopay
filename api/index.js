// Vercel serverless entry — reuses the Express app (no app.listen here).
const { app } = require('../src/index');

module.exports = app;
