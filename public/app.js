/* PusoPay app (col 1 phone) + backend console (col 2) + results/docs (col 3). */
const S = {
  trn: null, phone: null, otp: null,
  selfieB64: null, idFrontB64: null, idBackB64: null,
  ocr: null, submit: null, idTypes: [], calls: 0,
};
const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = document.createElement('div'); t.textContent = m; $('toast').appendChild(t); setTimeout(() => t.remove(), 4200); };

/* ---------- theme ---------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $('themeLight').classList.toggle('active', t === 'light');
  $('themeDark').classList.toggle('active', t === 'dark');
  try { localStorage.setItem('pusopay-theme', t); } catch {}
}
$('themeLight').onclick = () => setTheme('light');
$('themeDark').onclick = () => setTheme('dark');
setTheme(localStorage.getItem('pusopay-theme') || 'light');
$('phoneTime').textContent = new Date().toTimeString().slice(0, 5);

/* ---------- live camera (liveness + ID scan) ---------- */
let camStream = null;
function stopCamera() {
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  camStream = null;
  document.querySelectorAll('.camvideo').forEach((v) => { v.srcObject = null; v.classList.remove('show'); });
}
async function openCamera(which) {
  // which: 'selfie' | 'id' | 'qr'
  const video = which === 'selfie' ? $('selfieVideo') : which === 'qr' ? $('qrVideo') : $('idVideo');
  const errEl = which === 'selfie' ? $('selfieCamErr') : which === 'qr' ? null : $('idCamErr');
  if (errEl) errEl.classList.add('hidden');
  if (!navigator.mediaDevices?.getUserMedia) {
    const msg = 'This browser has no camera API — upload a photo instead.';
    if (errEl) { errEl.classList.remove('hidden'); errEl.textContent = msg; }
    else toast(msg);
    return;
  }
  stopCamera();
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: which === 'selfie' ? 'user' : 'environment', width: { ideal: 1280 } },
      audio: false,
    });
    video.srcObject = camStream;
    await video.play().catch(() => {});
    video.classList.add('show');
  } catch (e) {
    const msg = 'Camera blocked or unavailable (' + (e.name || 'error') + ') — upload instead.';
    if (errEl) { errEl.classList.remove('hidden'); errEl.textContent = msg; }
    else { chip('qrChip', false, 'Camera unavailable — upload a QR image instead.'); toast(msg); }
  }
}
function snapToBase64(video, canvas) {
  const vw = video.videoWidth || 960, vh = video.videoHeight || 720;
  const scale = Math.min(1, 960 / Math.max(vw, vh));
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return url.slice(url.indexOf('base64,') + 7);
}
function showPreview(imgId, b64, mime = 'image/jpeg') {
  const img = $(imgId);
  img.src = `data:${mime};base64,${b64}`;
  img.classList.add('show');
}
$('btnSnapSelfie').onclick = () => {
  const v = $('selfieVideo');
  if (!camStream || !v.videoWidth) return toast('Camera is not ready — wait a second or upload a photo.');
  S.selfieB64 = snapToBase64(v, $('selfieCanvas'));
  showPreview('selfiePrev', S.selfieB64);
  v.classList.remove('show');
  $('btnSnapSelfie').classList.add('hidden');
  $('btnRetakeSelfie').classList.remove('hidden');
  chip('liveChip', undefined, 'Selfie captured — run liveness ✔');
  renderSessionData();
};
$('btnRetakeSelfie').onclick = () => {
  S.selfieB64 = null;
  $('selfiePrev').classList.remove('show');
  $('btnSnapSelfie').classList.remove('hidden');
  $('btnRetakeSelfie').classList.add('hidden');
  chip('liveChip', undefined, 'Liveness: not run');
  renderSessionData();
  openCamera('selfie');
};
$('btnSnapFront').onclick = () => {
  const v = $('idVideo');
  if (!camStream || !v.videoWidth) return toast('Camera is not ready — wait a second or upload.');
  S.idFrontB64 = snapToBase64(v, $('idCanvas'));
  showPreview('idFrontPrev', S.idFrontB64);
  $('btnSnapFront').textContent = '↺ Retake front';
  renderSessionData();
  toast('ID front captured — now capture the back (or continue).');
};
$('btnSnapBack').onclick = () => {
  const v = $('idVideo');
  if (!camStream || !v.videoWidth) return toast('Camera is not ready — wait a second or upload.');
  S.idBackB64 = snapToBase64(v, $('idCanvas'));
  showPreview('idBackPrev', S.idBackB64);
  $('btnSnapBack').textContent = '↺ Retake back';
  renderSessionData();
  toast('ID back captured ✔');
};
$('btnPickFront').onclick = () => $('idFrontFile').click();
$('btnPickBack').onclick = () => $('idBackFile').click();

/* ---------- phone navigation (camera auto-opens, stops on leave) ---------- */
function go(name) {
  stopCamera();
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
  if (name === 'selfie' && !S.selfieB64) openCamera('selfie');
  if (name === 'idscan' && !S.idFrontB64) openCamera('id');
  if (name === 'facematch') renderMatchInputs();
}
document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  const isQr = t.dataset.tab === 'qr';
  $('tabMatch').classList.toggle('hidden', isQr);
  $('tabQr').classList.toggle('hidden', !isQr);
  if (!isQr) { stopCamera(); $('btnQrSnap').disabled = true; }
}));

/* ---------- backend console log ---------- */
function logCall({ label, endpoint, ms, ok, body }) {
  S.calls += 1;
  $('apiCount').textContent = `${S.calls} call${S.calls === 1 ? '' : 's'}`;
  const b = document.createElement('button');
  b.className = 'api-row';
  b.innerHTML = `<div class="t"><b>${label}</b><span class="badge ${ok ? 'ok' : 'bad'}">${ok ? 'OK' : 'FAIL'} · ${ms}ms</span></div>
    <div class="muted">${new Date().toLocaleTimeString()} · ${endpoint}</div>`;
  b.onclick = () => { $('outDetail').textContent = typeof body === 'string' ? body : JSON.stringify(body, null, 2); };
  const log = $('apiLog');
  if (S.calls === 1) log.innerHTML = '';
  log.prepend(b);
  $('outDetail').textContent = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
}
async function api(label, endpoint, { method = 'GET', body } = {}) {
  const t0 = performance.now();
  const headers = { 'Content-Type': 'application/json' };
  if (S.trn) headers['X-Transaction-Id'] = S.trn;
  try {
    const res = await fetch(endpoint, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    const ms = Math.round(performance.now() - t0);
    logCall({ label, endpoint: `${method} ${endpoint}`, ms, ok: res.ok, body: data });
    if (!res.ok) { const e = new Error(data.message || `HTTP ${res.status}`); e.body = data; throw e; }
    return data;
  } catch (e) {
    if (!e.body) logCall({ label, endpoint: `${method} ${endpoint}`, ms: Math.round(performance.now() - t0), ok: false, body: { message: e.message } });
    throw e;
  }
}
function chip(id, ok, text) {
  const el = $(id);
  el.className = 'chip ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'idle');
  el.textContent = text;
}
/* 0.82 → "82%" */
function pct(score) {
  const n = Number(score);
  return Number.isFinite(n) ? ` ${Math.round(n * 100)}%` : '';
}

/* Disable + spinner while an async action runs — prevents double-taps / repeat calls. */
async function withBusy(id, fn) {
  const btn = typeof id === 'string' ? $(id) : id;
  if (!btn || btn.disabled) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.classList.add('busy');
  btn.textContent = '⏳ Working…';
  try { await fn(); } finally { btn.disabled = false; btn.classList.remove('busy'); btn.textContent = orig; }
}

/* ---------- session data panel (live, below verification results) ---------- */
function b64bytes(b64) { return b64 ? Math.round(String(b64).length * 3 / 4) : 0; }
function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B'; }
const stepStatus = { live: 'Liveness', ocr: 'ID read', face: 'Face match', submit: 'Decision' };

async function renderSessionData() {
  const el = $('sessData');
  if (!S.trn) {
    el.innerHTML = '<p class="muted">No session yet — start verification in the app.</p>';
    $('sessSync').textContent = 'local only';
    return;
  }
  const thumbs = [
    ['Selfie', S.selfieB64],
    ['ID front', S.idFrontB64],
    ['ID back', S.idBackB64],
  ]
    .filter(([, b]) => b)
    .map(([label, b]) => `<figure><img src="data:image/jpeg;base64,${b}" alt="${label}" /><figcaption>${label} · ${fmtSize(b64bytes(b))}</figcaption></figure>`)
    .join('');
  const done = Object.keys(stepStatus).filter((k) => S['done_' + k]);
  // Every captured KYC detail, auto-refreshed on each capture + each API result.
  const det = [];
  if (S.liveness?.results) det.push(`Liveness: ${S.liveness.results.passed ? 'LIVE ✔' + pct(S.liveness.results.confidence_score) : 'not live ✘'}`);
  if (S.face?.results) det.push(`Face: ${S.face.results.is_matched ? 'MATCH ✔' + pct(S.face.results.confidence_score) : 'no match ✘'}`);
  if (S.qrRes) det.push(`QR: ${S.qrRes.is_verified ? 'VERIFIED ✔' : 'not verified ✘'}`);
  const ex = S.ocr?.extracted_information;
  if (ex) {
    const p = ex.personal_information || {}, id = ex.id_information || {};
    const who = [p.first_name, p.last_name].filter(Boolean).join(' ') || '—';
    det.push(`ID: ${who} · ${id.type || '?'} ${id.id_number || ''} · born ${p.birthdate || '?'}`);
  }
  if (S.submit) det.push(`Decision: ${S.submit.verification_status}`);
  el.innerHTML = `
    <div class="kv"><span>Session</span><code>${S.trn.slice(0, 8)}…</code></div>
    <div class="kv"><span>Account</span><code>${S.phone || '—'} · OTP ${S.otpOk ? 'verified ✔' : '—'}</code></div>
    ${thumbs ? `<div class="sess-thumbs">${thumbs}</div>` : '<p class="muted">No images captured yet.</p>'}
    ${det.length ? `<div class="detlist">${det.map((d) => `<div>${d}</div>`).join('')}</div>` : '<p class="muted">No verification results yet.</p>'}
    <div class="kv"><span>Steps</span><code>${done.length ? done.map((k) => stepStatus[k]).join(' · ') : '—'}</code></div>
    <div class="kv"><span>Server copy</span><code id="sessServer">syncing…</code></div>`;
  // Prove persistence: read back what the backend stored for this TRN (quietly — not an API-log entry).
  try {
    const r = await fetch(`/api/kyc/session/${S.trn}`);
    const s = await r.json();
    const names = Object.keys(s.captures || {});
    const total = names.reduce((a, n) => a + (s.captures[n].bytes || 0), 0);
    const srv = $('sessServer');
    if (srv) srv.textContent = names.length ? `${names.length} captures · ${fmtSize(total)} stored ✔` : 'nothing stored yet';
    $('sessSync').textContent = names.length ? 'server ✓' : 'local only';
  } catch {
    const srv = $('sessServer');
    if (srv) srv.textContent = 'unreachable';
  }
}

function markStep(k) { S['done_' + k] = true; renderSessionData(); }

function renderMatchInputs() {
  const a = $('mSelfie'), b = $('mId');
  if (S.selfieB64) a.src = `data:image/jpeg;base64,${S.selfieB64}`;
  else a.removeAttribute('src');
  if (S.idFrontB64) b.src = `data:image/jpeg;base64,${S.idFrontB64}`;
  else b.removeAttribute('src');
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const cfg = await api('Load reference data', '/api/kyc/config');
    S.idTypes = cfg.idTypes || [];
    $('sviBase').textContent = cfg.sviBaseUrl;
    $('idTypeTable').innerHTML = S.idTypes.map((t) => `<div class="trow"><span><b>${t.code}</b> · ${t.type}</span><span>PH</span></div>`).join('');
    $('errTable').innerHTML = Object.entries(cfg.errorCodes || {}).map(([k, v]) => `<div class="trow"><span><b>${v.http}</b> ${k}</span></div>`).join('');
  } catch (e) { console.warn(e); }
  try {
    const h = await api('Check service health', '/api/kyc/health');
    $('healthLabel').textContent = h.ok ? `UP (${h.upstream.httpStatus})` : `DOWN (${h.upstream.httpStatus}) — see log`;
  } catch { $('healthLabel').textContent = 'unreachable'; }
  renderSessionData();
}
boot();

/* ---------- OTP: tap-to-fill, paste-anywhere, autofill ---------- */
const otpInputs = [...document.querySelectorAll('.otp-row input')];
function fillOtp(code) {
  const d = String(code).replace(/\D/g, '').slice(0, 6).split('');
  otpInputs.forEach((inp, i) => (inp.value = d[i] || ''));
}
function readOtp() { return otpInputs.map((x) => x.value).join(''); }
otpInputs.forEach((inp, i) => {
  inp.addEventListener('input', () => {
    inp.value = inp.value.replace(/\D/g, '').slice(-1);
    if (inp.value && i < 5) otpInputs[i + 1].focus();
    if (readOtp().length === 6) verifyOtp();
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && i > 0) otpInputs[i - 1].focus(); });
  inp.addEventListener('paste', (e) => {
    e.preventDefault();
    fillOtp(e.clipboardData.getData('text') || '');
    const len = readOtp().length;
    if (len === 6) verifyOtp();
    else otpInputs[Math.min(len, 5)].focus();
  });
});
function newOtp() {
  S.otp = String(Math.floor(100000 + Math.random() * 900000));
  $('smsBox').innerHTML = `<div class="sms">📩 <b>PusoPay:</b> your code is
    <button class="sms-code" id="smsCode" title="Tap to copy + fill the app">${S.otp}</button>
    <span class="muted">→ ${S.phone} · tap the code to copy &amp; fill the boxes</span></div>`;
  $('smsCode').onclick = async () => {
    fillOtp(S.otp);
    try { await navigator.clipboard.writeText(S.otp); toast('Code copied + filled ✔'); }
    catch { toast('Code filled ✔'); }
  };
}
function verifyOtp() {
  if (readOtp() === S.otp) { S.otpOk = true; toast('Number verified ✔'); renderSessionData(); go('kycintro'); }
  else toast('Wrong code — tap the code in the backend inbox.');
}
$('btnFillOtp').onclick = () => { if (S.otp) { fillOtp(S.otp); verifyOtp(); } };
$('btnSendOtp').onclick = () => {
  const n = $('phoneNum').value.replace(/\D/g, '');
  if (n.length < 10) return toast('Enter a valid mobile number.');
  S.phone = '+63' + n.slice(-10);
  $('otpTo').textContent = S.phone;
  fillOtp('');
  renderSessionData();
  newOtp();
  toast(`Code sent to ${S.phone} — tap it in the inbox.`);
  go('otp');
  setTimeout(() => otpInputs[0].focus(), 100);
};
$('btnResend').onclick = () => { fillOtp(''); newOtp(); toast('New code sent.'); };
$('btnVerifyOtp').onclick = verifyOtp;

/* ---------- upload fallback (camera-first, upload if needed) ---------- */
function fileToB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); const i = s.indexOf('base64,'); res(i >= 0 ? s.slice(i + 7) : s); };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
$('selfieFile').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  S.selfieB64 = await fileToB64(f);
  showPreview('selfiePrev', S.selfieB64, f.type || 'image/jpeg');
  $('selfieVideo').classList.remove('show');
  $('btnSnapSelfie').classList.add('hidden');
  $('btnRetakeSelfie').classList.remove('hidden');
  renderSessionData();
});
$('idFrontFile').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  S.idFrontB64 = await fileToB64(f);
  showPreview('idFrontPrev', S.idFrontB64, f.type || 'image/jpeg');
  renderSessionData();
});
$('idBackFile').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  S.idBackB64 = await fileToB64(f);
  showPreview('idBackPrev', S.idBackB64, f.type || 'image/jpeg');
  renderSessionData();
});

/* ---------- KYC flow ---------- */
$('btnStartKyc').onclick = () => withBusy('btnStartKyc', async () => {
  try {
    await api('Get access token', '/api/kyc/token', { method: 'POST', body: {} });
    const t = await api('Create secure session', '/api/kyc/transaction/create', { method: 'POST', body: {} });
    S.trn = t.transaction_id;
    $('trnLabel').textContent = S.trn;
    $('outTrn').textContent = `Secure session:\n${S.trn}`;
    toast('Session created.');
    renderSessionData();
    go('selfie');
  } catch (e) { toast(e.body?.message || e.message); }
});
$('btnCopyTrn').onclick = async () => {
  if (!S.trn) return toast('No session yet.');
  try { await navigator.clipboard.writeText(S.trn); toast('Session ID copied.'); } catch { toast(S.trn); }
};
$('btnToken').onclick = () => withBusy('btnToken', async () => {
  try { await api('Get access token', '/api/kyc/token', { method: 'POST', body: {} }); toast('Token OK.'); }
  catch (e) { toast(e.body?.message || e.message); }
});

$('btnLiveness').onclick = () => withBusy('btnLiveness', async () => {
  if (!S.trn) return toast('Start verification first.');
  if (!S.selfieB64) return toast('Capture or upload a selfie first.');
  try {
    const r = await api('Selfie liveness check', '/api/kyc/liveness/passive', { method: 'POST', body: { image: S.selfieB64 } });
    S.liveness = r;
    const p = r?.results?.passed;
    const score = pct(r?.results?.confidence_score);
    chip('liveChip', p, `Liveness: ${p ? `LIVE ✔${score}` : 'not live ✘ — try clearer light'}`);
    chip('cLive', p, `Liveness ${p ? 'passed' + score : 'failed'}`);
    if (p) markStep('live');
    if (p) { $('btnToId').disabled = false; toast('Liveness passed ✔'); }
  } catch (e) { chip('liveChip', false, 'Liveness: error — see backend log'); chip('cLive', false, 'Liveness error'); }
});

$('btnOcr').onclick = () => withBusy('btnOcr', async () => {
  if (!S.trn) return toast('Start verification first.');
  if (!S.idFrontB64) return toast('Capture the ID front first.');
  try {
    const r = await api('Read ID details', '/api/kyc/id/ocr', { method: 'POST', body: { id_front_base64: S.idFrontB64, ...(S.idBackB64 ? { id_back_base64: S.idBackB64 } : {}) } });
    S.ocr = r;
    chip('cOcr', true, 'ID read done');
    markStep('ocr');
    autofill();
    $('btnToFace').disabled = false;
    toast('ID details captured — check the review screen.');
  } catch (e) { chip('cOcr', false, 'ID read failed'); }
});

$('btnFaceMatch').onclick = () => withBusy('btnFaceMatch', async () => {
  if (!S.trn) return toast('Start verification first.');
  if (!S.selfieB64) { toast('Capture your selfie first.'); go('selfie'); return; }
  if (!S.idFrontB64) { toast('Capture your ID front first.'); go('idscan'); return; }
  try {
    const r = await api('Match face to ID', '/api/kyc/face-match/check', { method: 'POST', body: { face_bio_base64: S.selfieB64, id_base64: S.idFrontB64 } });
    S.face = r;
    const m = r?.results?.is_matched;
    const score = pct(r?.results?.confidence_score);
    chip('matchChip', m, `Face match: ${m ? `MATCH ✔${score}` : 'no match ✘'}`);
    chip('cFace', m, `Face match ${m ? 'passed' + score : 'failed'}`);
    if (m) markStep('face');
    if (m) $('btnToReview').disabled = false;
  } catch (e) { chip('matchChip', false, 'Face match: error — see backend log'); }
});
/* ---------- PNID QR reader (live scan + upload → fills the QR string) ---------- */
function decodeQrCanvas(canvas) {
  if (typeof jsQR !== 'function') {
    toast('QR decoder failed to load — paste the code manually.');
    return null;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const found = jsQR(img.data, img.width, img.height);
  return found ? found.data : null;
}
function useQrString(s) {
  if (!s) {
    chip('qrChip', false, 'No QR found — hold steady, fill the frame, try again.');
    return;
  }
  $('qrValue').value = s;
  chip('qrChip', undefined, `QR read ✔ (${s.length} chars) — verify below.`);
  toast('QR decoded ✔');
}
$('btnQrCam').onclick = async () => {
  await openCamera('qr');
  if (camStream) {
    $('btnQrSnap').disabled = false;
    $('qrPrev').classList.remove('show');
    toast('Point the camera at the PNID QR, then Capture & decode.');
  }
};
$('btnQrSnap').onclick = () => {
  const v = $('qrVideo');
  if (!camStream || !v.videoWidth) return toast('Camera is not ready yet.');
  const c = $('qrCanvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  useQrString(decodeQrCanvas(c));
};
$('qrFile').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const url = String(r.result);
    const prev = $('qrPrev');
    prev.src = url;
    prev.classList.add('show');
    const img = new Image();
    img.onload = () => {
      const c = $('qrCanvas');
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      useQrString(decodeQrCanvas(c));
    };
    img.onerror = () => toast('Could not read that image.');
    img.src = url;
  };
  r.readAsDataURL(f);
  e.target.value = '';
});
$('btnQr').onclick = () => withBusy('btnQr', async () => {
  if (!S.trn || !S.selfieB64) return toast('Need a selfie first.');
  const qr = $('qrValue').value.trim();
  if (!qr) return toast('Paste the PNID QR string first.');
  try {
    const r = await api('Verify PNID QR', '/api/kyc/verifications/qr', { method: 'POST', body: { qr_value: qr, face_biometric_base64: S.selfieB64 } });
    S.qrRes = r;
    chip('qrChip', r?.is_verified, `QR: ${r?.is_verified ? 'VERIFIED ✔' : 'not verified ✘'}`);
    chip('cFace', r?.is_verified, `QR ${r?.is_verified ? 'verified' : 'failed'}`);
    if (r?.is_verified) markStep('face');
    if (r?.is_verified) $('btnToReview').disabled = false;
  } catch (e) { chip('qrChip', false, 'QR: error — see backend log'); }
});

/* ---------- review + submit ---------- */
function autofill() {
  const ex = S.ocr?.extracted_information;
  if (!ex) return toast('Run "Read my ID" first.');
  const id = ex.id_information || {}, p = ex.personal_information || {};
  // Auto-detected ID type — no dropdown; falls back to PNID (code 3) if OCR omits it.
  if (id.code) S.idCode = String(id.code);
  if (id.type) S.idType = id.type;
  const det = $('idDetected');
  if (det) {
    const label = S.idType || S.idCode ? `Detected: ${S.idType || 'ID'}${S.idCode ? ' (code ' + S.idCode + ')' : ''}` : 'Type unclear — confirm on review';
    chip('idDetected', !!(S.idType || S.idCode), label);
  }
  if (id.type) $('f_type').value = id.type;
  if (id.id_number) $('f_idnum').value = id.id_number;
  if (id.expiration_date) $('f_exp').value = String(id.expiration_date).slice(0, 10);
  if (p.last_name) $('f_last').value = p.last_name;
  if (p.first_name) $('f_first').value = p.first_name;
  if (p.suffix) $('f_suffix').value = p.suffix;
  if (p.birthdate) $('f_bday').value = String(p.birthdate).slice(0, 10);
  const a = typeof p.address === 'object' && p.address ? p.address : {};
  if (a.address_line_1) $('f_addr1').value = a.address_line_1;
  if (a.barangay) $('f_brgy').value = a.barangay;
  if (a.city_municipality) $('f_city').value = a.city_municipality;
  if (a.province) $('f_prov').value = a.province;
  if (a.zipcode) $('f_zip').value = a.zipcode;
}
$('btnAutofill').onclick = autofill;

$('btnSubmit').onclick = () => withBusy('btnSubmit', async () => {
  if (!S.trn || !S.selfieB64 || !S.idFrontB64) return toast('Selfie + ID are required.');
  const code = S.idCode || '3';
  const payload = {
    id_information: {
      code, type: $('f_type').value.trim() || S.idTypes.find((t) => t.code === code)?.type || 'PNID',
      id_number: $('f_idnum').value.trim(),
      ...($('f_exp').value ? { expiration_date: $('f_exp').value } : {}),
    },
    personal_information: {
      last_name: $('f_last').value.trim(), first_name: $('f_first').value.trim(),
      ...($('f_suffix').value.trim() ? { suffix: $('f_suffix').value.trim() } : {}),
      birthdate: $('f_bday').value,
      ...(($('f_addr1').value || $('f_brgy').value || $('f_city').value || $('f_prov').value || $('f_zip').value)
        ? { address: { address_line_1: $('f_addr1').value, barangay: $('f_brgy').value, city_municipality: $('f_city').value, province: $('f_prov').value, zipcode: $('f_zip').value } }
        : {}),
    },
    images: { face_bio_base64: S.selfieB64, id_front_base64: S.idFrontB64, ...(S.idBackB64 ? { id_back_base64: S.idBackB64 } : {}) },
  };
  if (!payload.id_information.id_number || !payload.personal_information.last_name || !payload.personal_information.first_name || !payload.personal_information.birthdate)
    return toast('ID number, names, and birthdate are required.');
  go('result');
  $('resTitle').textContent = 'Checking… ⏳';
  $('resSub').textContent = 'SVI is reviewing your submission.';
  $('resCard').className = 'res-card';
  $('resCard').textContent = 'Waiting for decision…';
  $('btnToWallet').classList.add('hidden');
  try {
    const r = await api('Submit for decision', '/api/kyc/transaction/submit', { method: 'POST', body: payload });
    S.submit = r;
    const passed = r.verification_status === 'PASSED';
    chip('cSubmit', passed, `Decision: ${r.verification_status}`);
    markStep('submit');
    $('resTitle').textContent = passed ? 'Verified! 🎉' : 'Under review 👀';
    $('resSub').textContent = passed ? 'Your wallet is unlocked.' : 'Usually cleared within a day — demo unlocks your wallet anyway.';
    $('resCard').className = 'res-card ' + (passed ? 'pass' : 'pend');
    $('resCard').innerHTML = `<b>${r.verification_status}</b><br />Session <code>${r.session_transaction_id}</code><br /><span class="muted">${r.create_at}</span>`;
    $('btnToWallet').classList.remove('hidden');
    $('kycBanner').textContent = passed ? '✔ Verified' : `◷ ${r.verification_status}`;
    $('kycBanner').classList.toggle('pend', !passed);
    $('wName').textContent = `Hi, ${payload.personal_information.first_name || 'Ka-Puso'}! 💛`;
    await refreshWallet();
  } catch (e) {
    chip('cSubmit', false, 'Decision failed');
    $('resTitle').textContent = 'Something went wrong';
    $('resSub').textContent = e.body?.message || e.message;
    $('resCard').textContent = 'Check the backend log, fix, and try again.';
  }
});
$('btnToWallet').onclick = () => go('wallet');
$('btnRetry').onclick = () => go('kycintro');

/* ---------- wallet (phone) ---------- */
async function refreshWallet() {
  const id = S.submit?.session_transaction_id || S.trn;
  if (!id) return;
  const w = await api('Load wallet', `/api/wallet/${id}`);
  $('wBalance').textContent = `₱${Number(w.balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  $('wNum').textContent = `${S.phone || '+63…'} · ${w.walletId.slice(0, 8)}`;
  $('wHistory').innerHTML = w.history.map((h) => `<div class="hrow"><span><b>${h.type.replace('_', ' ')}</b> · ${h.memo || ''}</span><span>₱${Number(h.amount).toLocaleString()}</span></div>`).join('') || '<p class="muted">Nothing yet.</p>';
}
$('btnCashIn').onclick = () => { $('sheetCashIn').classList.toggle('hidden'); $('sheetSend').classList.add('hidden'); };
$('btnSend').onclick = () => { $('sheetSend').classList.toggle('hidden'); $('sheetCashIn').classList.add('hidden'); };
$('btnQrShow').onclick = () => toast('My QR is decorative in this demo.');
$('btnMore').onclick = () => toast('Bills, load & bank transfer live in the full DigiCash integration.');

/* ---------- profile (Me tab — selfie + ID details from this session) ---------- */
function renderProfile() {
  const ex = S.ocr?.extracted_information;
  const p = ex?.personal_information || {};
  const id = ex?.id_information || {};
  const a = typeof p.address === 'object' && p.address ? p.address : {};
  const photo = $('pPhoto');
  if (S.selfieB64) { photo.src = `data:image/jpeg;base64,${S.selfieB64}`; photo.style.display = 'block'; }
  else { photo.removeAttribute('src'); photo.style.display = 'none'; }
  $('pName').textContent = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unverified user';
  $('pPhone').textContent = S.phone || 'No number';
  const st = S.submit?.verification_status;
  const ps = $('pStatus');
  ps.className = 'chip ' + (st === 'PASSED' ? 'ok' : st ? 'bad' : 'idle');
  ps.style.background = st && st !== 'PASSED' ? '#fff3d6' : '';
  ps.style.color = st && st !== 'PASSED' ? '#7a4d00' : '';
  ps.style.borderColor = st && st !== 'PASSED' ? '#ecd194' : '';
  ps.textContent = st === 'PASSED' ? '✔ Verified' : st ? `◷ ${st}` : 'Not submitted';
  const addr = [a.address_line_1, a.barangay, a.city_municipality, a.province, a.zipcode].filter(Boolean).join(', ') || '—';
  const rows = [
    ['ID', `${id.type || '—'}${id.id_number ? ' · ' + id.id_number : ''}`],
    ['Birthdate', p.birthdate || '—'],
    ['Address', addr],
    ['Session', S.trn ? S.trn.slice(0, 8) + '…' : '—'],
  ];
  $('pList').innerHTML = rows.map(([k, v]) => `<div class="prow"><span>${k}</span><b>${v}</b></div>`).join('');
}
document.querySelectorAll('.tabbar span').forEach((t) => (t.onclick = () => {
  const w = t.dataset.tab;
  if (w === 'me') { renderProfile(); go('profile'); }
  else if (w === 'home') go('wallet');
  else if (w === 'qr') toast('My QR is decorative in this demo.');
  else toast('Bills live in the full DigiCash integration.');
}));
$('doCashIn').onclick = () => withBusy('doCashIn', async () => {
  const id = S.submit?.session_transaction_id || S.trn;
  await api('Wallet cash-in', `/api/wallet/${id}/cash-in`, { method: 'POST', body: { amount: Number($('wAmountIn').value), memo: 'Cash in (demo)' } });
  toast('Cash in done ✔'); refreshWallet();
});
$('doSend').onclick = () => withBusy('doSend', async () => {
  const id = S.submit?.session_transaction_id || S.trn;
  try {
    await api('Wallet send', `/api/wallet/${id}/send`, { method: 'POST', body: { to: $('wTo').value, amount: Number($('wAmountOut').value) } });
    toast('Sent ✔'); refreshWallet();
  } catch (e) { toast(e.body?.message || e.message); }
});
$('btnResult').onclick = () => withBusy('btnResult', async () => {
  if (!S.trn) return toast('No session yet.');
  try { await api('Fetch stored KYC result', `/api/kyc/result/${S.submit?.session_transaction_id || S.trn}`); }
  catch (e) { toast(e.body?.message || e.message); }
});
