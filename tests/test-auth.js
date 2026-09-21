const SviKycClient = require('../src/api/svi-kyc-client');

(async () => {
  const c = new SviKycClient();
  console.log('SVI base:', c.baseUrl, c.maskedCredentials());
  try {
    const h = await c.health();
    console.log('GET /health →', h.httpStatus, JSON.stringify(h.body).slice(0, 300));
  } catch (e) {
    console.error('health failed:', e.message);
  }
  try {
    const t = await c.getAccessToken(true);
    console.log('POST /auth/token → OK, expires_in =', t.expires_in, '| expires_at =', t.expires_at);
  } catch (e) {
    console.error('token failed:', e.message);
    if (e.apiBody) console.error(JSON.stringify(e.apiBody, null, 2));
    process.exit(1);
  }
})();
