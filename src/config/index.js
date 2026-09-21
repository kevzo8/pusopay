const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'config.env') });

/**
 * Central config for the PusoPay demo.
 * Maps 1:1 to SVI_PusoPay_API_Guide_v1.0.0.
 */
module.exports = {
  svi: {
    baseUrl: process.env.SVI_BASE_URL || 'https://verify.dev.svi.cloud/api/v1',
    clientId: process.env.SVI_CLIENT_ID,
    clientSecret: process.env.SVI_CLIENT_SECRET,
    apiKey: process.env.SVI_API_KEY,
    endpoints: {
      token: '/auth/token',            // §2  POST
      create: '/transaction/create',    // §3  POST
      liveness: '/liveness/passive',    // §4  POST
      ocr: '/id/ocr',                   // §5  POST (§5 shows "/id/ocr/" — trailing slash also accepted server-side)
      faceMatch: '/face-match/check',   // §6  POST
      qr: '/verifications/qr',          // §7  POST
      submit: '/transaction/submit',    // §8  POST
      health: '/health'                 // §2 table GET (unauthenticated)
    }
  },
  server: {
    port: parseInt(process.env.PORT, 10) || 3025,
    env: process.env.NODE_ENV || 'development'
  },
  pusopay: {
    brand: process.env.PUSOPAY_BRAND || 'PusoPay',
    issuer: process.env.PUSOPAY_ISSUER || 'DigiCash',
    welcomeBalance: parseFloat(process.env.PUSOPAY_WELCOME_BALANCE || '1000000')
  },
  // §10 Supported Identity Types
  idTypes: [
    { code: '0', type: 'OTHER_ID' },
    { code: '1', type: 'PASSPORT' },
    { code: '2', type: 'PNID' },
    { code: '3', type: 'PNID (ePhil ID)' },
    { code: '4', type: 'UMID' },
    { code: '5', type: 'PRC_ID' },
    { code: '6', type: 'SSS_ID' },
    { code: '7', type: 'GSIS_ID' },
    { code: '8', type: 'TIN' },
    { code: '9', type: 'PWD_ID' },
    { code: '10', type: 'SENIOR_CITIZEN_ID' },
    { code: '11', type: 'PHILHEALTH' },
    { code: '12', type: 'POSTAL_ID' },
    { code: '13', type: 'DRIVERS_LICENSE' },
    { code: '14', type: 'BATAENO_PASS' }
  ],
  // §9 Error Codes
  errorCodes: {
    INVALID_REQUEST: { http: 400, hint: 'Missing/malformed body fields, header validation failures, or incorrect JSON formatting.' },
    INVALID_ID_TYPE: { http: 400, hint: 'id_type_code unrecognized, inactive, or not in your contract scope (§10).' },
    UNAUTHORIZED: { http: 401, hint: 'Bearer token missing, expired, or invalid. Re-authenticate via /auth/token.' },
    FORBIDDEN: { http: 403, hint: 'Token lacks biometric.verify scope or IP not allowed.' },
    METHOD_NOT_ALLOWED: { http: 405, hint: 'Invalid HTTP verb for the endpoint.' },
    UNSUPPORTED_MEDIA_TYPE: { http: 415, hint: 'Missing/incorrect Content-Type (expected application/json, or x-www-form-urlencoded for token).' },
    INVALID_BIOMETRIC: { http: 422, hint: 'Base64 image could not be decoded, or image quality/liveness checks failed.' },
    LIMIT_EXCEEDED: { http: 429, hint: 'Rate limit exceeded. Retry after waiting.' },
    REGISTRY_UNAVAILABLE: { http: 502, hint: 'Downstream identity database/partner registry temporarily offline.' },
    UPSTREAM_ERROR: { http: 502, hint: 'Upstream processing dependency failed.' },
    SERVER_ERROR: { http: 500, hint: 'Unexpected server error. Contact support if it persists.' }
  }
};
