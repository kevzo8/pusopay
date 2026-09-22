const express = require('express');
const config = require('../config');

const router = express.Router();

// In-memory demo store: trn -> { createdAt, steps: {...}, captures: { base64 images }, applicant }
const sessions = new Map();
function getSession(trn) {
  if (!sessions.has(trn)) sessions.set(trn, { trn, createdAt: new Date().toISOString(), steps: {}, captures: {} });
  const s = sessions.get(trn);
  if (!s.captures) s.captures = {};
  if (!s.steps) s.steps = {};
  return s;
}

function stripDataUrl(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  const i = b64.indexOf('base64,');
  return i >= 0 ? b64.slice(i + 7) : b64;
}

function bytesOf(b64) {
  if (!b64) return 0;
  try { return Buffer.byteLength(b64, 'base64'); } catch { return 0; }
}

// Persist a captured image (full base64) against the session.
function saveCapture(trn, name, b64) {
  const clean = stripDataUrl(b64);
  if (!trn || !clean) return null;
  const s = getSession(trn);
  s.captures[name] = { data: clean, bytes: bytesOf(clean), at: new Date().toISOString() };
  return { bytes: s.captures[name].bytes, at: s.captures[name].at };
}

function forwardError(res, err, fallback = 500) {
  const status = err.httpStatus || err.response?.status || fallback;
  const body = err.apiBody || err.response?.data;
  if (body && typeof body === 'object') return res.status(status).json({ ...body, httpStatus: status });
  return res.status(status).json({ status: 'error', message: err.message, httpStatus: status });
}

// ---- config / reference data (Guide Sections 9–10) ----
router.get('/config', (req, res) => {
  res.json({
    brand: config.pusopay.brand,
    issuer: config.pusopay.issuer,
    sviBaseUrl: config.svi.baseUrl,
    credentials: {
      clientId: config.svi.clientId ? `${String(config.svi.clientId).slice(0, 4)}…` : null,
      hasSecret: !!config.svi.clientSecret,
      apiKey: config.svi.apiKey ? `${String(config.svi.apiKey).slice(0, 4)}…` : null
    },
    endpoints: config.svi.endpoints,
    idTypes: config.idTypes,
    errorCodes: config.errorCodes
  });
});

// ---- Guide endpoints table: /health (unauthenticated, proxied for the demo UI) ----
router.get('/health', async (req, res) => {
  try {
    const result = await global.svi.health();
    res.json({ ok: result.httpStatus >= 200 && result.httpStatus < 300, upstream: result });
  } catch (err) {
    forwardError(res, err, 502);
  }
});

// ---- Guide Section 2: token (cached server-side; secrets never leave the backend) ----
router.post('/token', async (req, res) => {
  try {
    const force = req.query.refresh === '1' || req.body?.refresh === true;
    const token = await global.svi.getAccessToken(force);
    res.json({ ...token, access_token: token.cached ? '(cached — hidden)' : `${String(token.access_token).slice(0, 24)}…(truncated)` });
  } catch (err) {
    forwardError(res, err, 401);
  }
});

// ---- Guide Section 3: create transaction ----
router.post('/transaction/create', async (req, res) => {
  try {
    const data = await global.svi.createTransaction();
    if (data?.transaction_id) getSession(data.transaction_id);
    res.json(data);
  } catch (err) {
    forwardError(res, err);
  }
});

// ---- Guide Section 4: passive liveness ----
router.post('/liveness/passive', async (req, res) => {
  try {
    const trn = req.header('X-Transaction-Id') || req.body.transactionId;
    saveCapture(trn, 'selfie', req.body.image);
    const data = await global.svi.passiveLiveness({ transactionId: trn, image: req.body.image });
    getSession(trn).steps.liveness = data;
    res.json(data);
  } catch (err) {
    forwardError(res, err);
  }
});

// ---- Guide Section 5: ID OCR ----
router.post('/id/ocr', async (req, res) => {
  try {
    const trn = req.header('X-Transaction-Id') || req.body.transactionId;
    saveCapture(trn, 'idFront', req.body.id_front_base64 || req.body.idFrontBase64);
    saveCapture(trn, 'idBack', req.body.id_back_base64 || req.body.idBackBase64);
    const data = await global.svi.ocrId({
      transactionId: trn,
      idFrontBase64: req.body.id_front_base64 || req.body.idFrontBase64,
      idBackBase64: req.body.id_back_base64 || req.body.idBackBase64
    });
    getSession(trn).steps.ocr = data;
    res.json(data);
  } catch (err) {
    forwardError(res, err);
  }
});

// ---- Guide Section 6: face match (captured selfie vs captured ID front) ----
router.post('/face-match/check', async (req, res) => {
  try {
    const trn = req.header('X-Transaction-Id') || req.body.transactionId;
    saveCapture(trn, 'faceBio', req.body.face_bio_base64 || req.body.faceBioBase64);
    saveCapture(trn, 'idPortrait', req.body.id_base64 || req.body.idBase64);
    const data = await global.svi.faceMatch({
      transactionId: trn,
      faceBioBase64: req.body.face_bio_base64 || req.body.faceBioBase64,
      idBase64: req.body.id_base64 || req.body.idBase64
    });
    getSession(trn).steps.faceMatch = data;
    res.json(data);
  } catch (err) {
    forwardError(res, err);
  }
});

// ---- Guide Section 7: PNID QR verification ----
router.post('/verifications/qr', async (req, res) => {
  try {
    const trn = req.header('X-Transaction-Id') || req.body.transactionId;
    saveCapture(trn, 'qrFace', req.body.face_biometric_base64 || req.body.faceBiometricBase64);
    const s = getSession(trn);
    const qrValue = req.body.qr_value || req.body.qrValue;
    if (qrValue) s.captures.qrValue = { data: String(qrValue), bytes: Buffer.byteLength(String(qrValue)), at: new Date().toISOString() };
    const data = await global.svi.verifyQr({
      transactionId: trn,
      qrValue,
      faceBiometricBase64: req.body.face_biometric_base64 || req.body.faceBiometricBase64
    });
    getSession(trn).steps.qr = data;
    res.json(data);
  } catch (err) {
    forwardError(res, err);
  }
});

// ---- Guide Section 8: submit transaction ----
router.post('/transaction/submit', async (req, res) => {
  try {
    const trn = req.header('X-Transaction-Id') || req.body.transactionId || req.body.session_transaction_id;
    const b = req.body;
    const data = await global.svi.submitTransaction({
      transactionId: trn,
      idInformation: b.id_information || b.idInformation,
      personalInformation: b.personal_information || b.personalInformation,
      images: normaliseImages(b.images || b)
    });
    const s = getSession(data.session_transaction_id || trn);
    s.steps.submit = data;
    s.submittedAt = new Date().toISOString();
    s.applicant = b.personal_information || b.personalInformation;
    const imgs = normaliseImages(b.images || b);
    saveCapture(s.trn, 'submitFace', imgs.face_bio_base64);
    saveCapture(s.trn, 'submitIdFront', imgs.id_front_base64);
    saveCapture(s.trn, 'submitIdBack', imgs.id_back_base64);
    res.json(data);
  } catch (err) {
    forwardError(res, err);
  }
});

function normaliseImages(images = {}) {
  return {
    face_bio_base64: images.face_bio_base64 || images.faceBioBase64,
    id_front_base64: images.id_front_base64 || images.idFrontBase64,
    id_back_base64: images.id_back_base64 || images.idBackBase64
  };
}

// ---- Session data: everything captured during the session, base64 included ----
router.get('/session/:trn', (req, res) => {
  const s = sessions.get(req.params.trn);
  if (!s) return res.status(404).json({ status: 'error', error_code: 'INVALID_REQUEST', message: 'Unknown TRN in demo store.', httpStatus: 404 });
  const withImages = req.query.images === '1';
  const captures = {};
  for (const [name, c] of Object.entries(s.captures || {})) {
    captures[name] = { bytes: c.bytes, at: c.at, ...(withImages ? { data: c.data } : { chars: (c.data || '').length }) };
  }
  res.json({
    trn: s.trn,
    createdAt: s.createdAt,
    submittedAt: s.submittedAt || null,
    applicant: s.applicant || null,
    stepsCompleted: Object.keys(s.steps || {}),
    verification_status: s.steps?.submit?.verification_status || null,
    captures
  });
});

// ---- Local "Get KYC Result" (Guide Section 1 lists it; v1.0.0 has no spec — served from demo store) ----
router.get('/result/:trn', (req, res) => {
  const s = sessions.get(req.params.trn);
  if (!s) return res.status(404).json({ status: 'error', error_code: 'INVALID_REQUEST', message: 'Unknown TRN in demo store.', httpStatus: 404 });
  res.json({
    trn: s.trn,
    createdAt: s.createdAt,
    submittedAt: s.submittedAt || null,
    verification_status: s.steps.submit?.verification_status || null,
    submitResponse: s.steps.submit || null,
    steps: s.steps,
    applicant: s.applicant || null,
    note: 'Get KYC Result / Image Upload are listed in Guide Overview but unspecified in v1.0.0 — served from demo store.'
  });
});

router.get('/sessions', (req, res) => {
  res.json([...sessions.values()].map((s) => ({
    trn: s.trn,
    createdAt: s.createdAt,
    submittedAt: s.submittedAt || null,
    verification_status: s.steps.submit?.verification_status || null,
    stepsCompleted: Object.keys(s.steps)
  })));
});

module.exports = router;
