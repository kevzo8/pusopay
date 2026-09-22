/* PusoPay app (col 1 phone) + backend console (col 2) + results/docs (col 3). */
const S = {
  trn: null, phone: null, otp: null,
  selfieB64: null, idFrontB64: null, idBackB64: null,
  ocr: null, submit: null, idTypes: [], calls: 0, idCode: '3', idType: null,
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
  const ctx = canvas.getContext('2d');
  // Mirror the capture when the preview is mirrored, so the photo
  // matches what the user just saw (no awkward flip).
  if (video.classList.contains('mirror')) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
  $('btnSnapFront').innerHTML = '<svg class="ic"><use href="#i-cam"/></svg>Retake front';
  renderSessionData();
  toast('ID front captured — now capture the back (or continue).');
};
$('btnSnapBack').onclick = () => {
  const v = $('idVideo');
  if (!camStream || !v.videoWidth) return toast('Camera is not ready — wait a second or upload.');
  S.idBackB64 = snapToBase64(v, $('idCanvas'));
  showPreview('idBackPrev', S.idBackB64);
  $('btnSnapBack').innerHTML = '<svg class="ic"><use href="#i-cam"/></svg>Retake back';
  renderSessionData();
  toast('ID back captured ✔');
};
$('btnPickFront').onclick = () => $('idFrontFile').click();
$('btnPickBack').onclick = () => $('idBackFile').click();

/* ---------- phone navigation (camera auto-opens, stops on leave) ---------- */
function go(name) {
  stopCamera();
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
  if (name === 'selfie') openCamera('selfie');
  if (name === 'idscan') openCamera('id');
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
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function truncDeep(v) {
  if (typeof v === 'string') return v.length > 300 ? v.slice(0, 60) + `…[${v.length} chars]` : v;
  if (Array.isArray(v)) return v.map(truncDeep);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) o[k] = truncDeep(v[k]);
    return o;
  }
  return v;
}
/* Owner map: PusoPay (DigiCash) demo routes → SVI upstream they proxy.
   String = upstream SVI call; {local} = handled entirely by this demo. */
const UPSTREAM = {
  '/api/kyc/token': 'POST /auth/token',
  '/api/kyc/transaction/create': 'POST /transaction/create',
  '/api/kyc/liveness/passive': 'POST /liveness/passive',
  '/api/kyc/id/ocr': 'POST /id/ocr',
  '/api/kyc/face-match/check': 'POST /face-match/check',
  '/api/kyc/verifications/qr': 'POST /verifications/qr',
  '/api/kyc/transaction/submit': 'POST /transaction/submit',
  '/api/kyc/health': 'GET /health',
};
function upstreamOf(path) {
  const clean = String(path).split('?')[0];
  if (UPSTREAM[clean]) return { svi: UPSTREAM[clean] };
  if (clean.startsWith('/api/kyc/result/') || clean === '/api/kyc/sessions' || clean === '/api/kyc/config') {
    return { local: 'demo store — no upstream call' };
  }
  if (clean.startsWith('/api/wallet/')) return { local: 'DigiCash eWallet mock ledger' };
  return { local: 'local only' };
}

function logCall({ label, endpoint, ms, ok, body, req }) {
  S.calls += 1;
  $('apiCount').textContent = `${S.calls} call${S.calls === 1 ? '' : 's'}`;
  const up = upstreamOf(endpoint.replace(/^[A-Z]+ /, ''));
  const routeHtml = up.svi
    ? `<div class="route"><span class="who pp">PUSOPAY</span><code>${endpoint}</code></div><div class="route"><span class="who svi">SVI</span><code>${up.svi}</code><span class="arr">↑ upstream</span></div>`
    : `<div class="route"><span class="who pp">PUSOPAY</span><code>${endpoint}</code></div><div class="muted">${up.local}</div>`;
  const b = document.createElement('div');
  b.className = 'api-row';
  b.innerHTML = `<div class="t"><b>${label}</b><span class="badge ${ok ? 'ok' : 'bad'}">${ok ? 'OK' : 'FAIL'} · ${ms}ms</span></div>
    <div class="muted">${new Date().toLocaleTimeString()}</div>${routeHtml}
    <div class="api-detail"><b>Request</b><pre>${escHtml(JSON.stringify(truncDeep(req ?? {}), null, 2))}</pre><b>Response</b><pre>${escHtml(typeof body === 'string' ? body : JSON.stringify(body, null, 2))}</pre></div>`;
  b.onclick = () => {
    b.classList.toggle('open');
    $('outDetail').textContent = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  };
  const log = $('apiLog');
  if (S.calls === 1) log.innerHTML = '';
  log.prepend(b);
  log.scrollTop = 0;
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
    logCall({ label, endpoint: `${method} ${endpoint}`, ms, ok: res.ok, body: data, req: body || null });
    if (!res.ok) { const e = new Error(data.message || `HTTP ${res.status}`); e.body = data; throw e; }
    return data;
  } catch (e) {
    if (!e.body) logCall({ label, endpoint: `${method} ${endpoint}`, ms: Math.round(performance.now() - t0), ok: false, body: { message: e.message }, req: body || null });
    throw e;
  }
}
function chip(id, ok, text) {
  const el = $(id);
  el.className = 'chip ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'wait');
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
  btn.textContent = 'Working…';
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
  saveSession();
  const thumbs = [
    ['Selfie', S.selfieB64],
    ['ID front', S.idFrontB64],
    ['ID back', S.idBackB64],
  ]
    .filter(([, b]) => b)
    .map(([label, b]) => `<figure><img src="data:image/jpeg;base64,${b}" alt="${label}" /><figcaption>${label} · ${fmtSize(b64bytes(b))}</figcaption></figure>`)
    .join('');
  const done = Object.keys(stepStatus).filter((k) => S['done_' + k]);
  // Every captured KYC detail as label/value rows — refreshed on each capture + result.
  const kv = [];
  if (S.liveness?.results) kv.push(['Liveness', `${S.liveness.results.passed ? 'Live' : 'Not live'} · ${Math.round(Number(S.liveness.results.confidence_score) * 100)}%`]);
  if (S.face?.results) kv.push(['Face match', `${S.face.results.is_matched ? 'Match' : 'No match'} · ${Math.round(Number(S.face.results.confidence_score) * 100)}%`]);
  if (S.qrRes) kv.push(['PNID QR', S.qrRes.is_verified ? 'Verified' : 'Not verified']);
  const ex = S.ocr?.extracted_information;
  if (ex) {
    const p = ex.personal_information || {}, id = ex.id_information || {};
    const a = typeof p.address === 'object' && p.address ? p.address : {};
    kv.push(['Full name', [p.first_name, p.last_name].filter(Boolean).join(' ') || '—']);
    kv.push(['ID', `${(id.type || '—').replace(/_/g, ' ')} · ${id.id_number || '—'}`]);
    kv.push(['Birthdate', p.birthdate || '—']);
    kv.push(['Address', [a.address_line_1 || a.address_line1, a.barangay, a.city_municipality, a.province, a.zipcode].filter(Boolean).join(', ') || '—']);
  }
  if (S.submit) kv.push(['Decision', S.submit.verification_status]);
  el.innerHTML = `
    <div class="kv"><span>Session</span><code>${S.trn.slice(0, 8)}…</code></div>
    <div class="kv"><span>Account</span><code>${S.phone || '—'} · OTP ${S.otpOk ? 'verified ✔' : '—'}</code></div>
    ${thumbs ? `<div class="sess-thumbs">${thumbs}</div>` : '<p class="muted">No images captured yet.</p>'}
    ${kv.length ? `<div class="prof-list">${kv.map(([k, v]) => `<div class="prow"><span>${k}</span><b>${v}</b></div>`).join('')}</div>` : '<p class="muted">No verification results yet.</p>'}
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

/* ---------- verified / pending badges (icon beside the name) ---------- */
const BADGE_OK = `<svg viewBox="0 0 24 24" aria-label="Verified"><path fill="#1d9bf0" d="M12 1.5l2.3 2 3-.4 1 2.9 2.9 1-.4 3 2 2.3-2 2.3.4 3-2.9 1-1 2.9-3-.4-2.3 2-2.3-2-3 .4-1-2.9-2.9-1 .4-3-2-2.3 2-2.3-.4-3 2.9-1 1-2.9 3 .4z"/><path fill="#fff" d="M10.7 14.9l-2.8-2.8 1.4-1.4 1.4 1.4 4.2-4.2 1.4 1.4z"/></svg>`;
const BADGE_PEND = `<svg viewBox="0 0 24 24" aria-label="Pending review"><circle cx="12" cy="12" r="10" fill="#f5b301"/><circle cx="12" cy="12" r="10" fill="none" stroke="#7a4d00" stroke-width="1.5" opacity=".45"/><path d="M12 7v5.2l3.4 2" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function setBadge(el, status) {
  if (!el) return;
  if (status === 'PASSED') { el.innerHTML = BADGE_OK; el.title = 'Verified'; }
  else if (status) { el.innerHTML = BADGE_PEND; el.title = status; }
  else { el.innerHTML = ''; el.title = ''; }
}
/* Wallet + profile header from a verification status + first name. */
function applyVerificationUI(status, firstName) {
  const passed = status === 'PASSED';
  const banner = $('kycBanner');
  banner.textContent = passed ? '✔ Verified' : status ? `◷ ${status}` : 'Not verified';
  banner.classList.toggle('pend', !passed);
  setBadge($('wBadge'), status);
  $('wName').textContent = `Hi, ${firstName || 'Ka-Puso'}`;
}

/* ---------- boot ---------- */
async function boot() {
  try {
    const cfg = await api('Load reference data', '/api/kyc/config');
    S.idTypes = cfg.idTypes || [];
    $('sviBase').textContent = cfg.sviBaseUrl;
    // Review-form dropdown: 0–14 with friendly labels ("0 — Other ID").
    const sel = $('f_type');
    sel.innerHTML = S.idTypes.map((t) => `<option value="${t.code}">${t.code} — ${t.type.replace(/_/g, ' ')}</option>`).join('');
    sel.value = S.idCode;
    sel.onchange = () => {
      S.idCode = sel.value;
      S.idType = (S.idTypes.find((t) => t.code === sel.value) || {}).type || null;
    };
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
  $('smsBox').innerHTML = `<div class="sms"><span><svg class="ic" style="vertical-align:-3px"><use href="#i-inbox"/></svg> <b>PusoPay:</b> your code is</span>
    <button class="sms-code" id="smsCode" title="Tap to copy + fill the app">${S.otp}</button>
    <span class="muted">→ ${S.phone} · tap the code to copy &amp; fill the boxes</span></div>`;
  $('smsCode').onclick = async () => {
    fillOtp(S.otp);
    try { await navigator.clipboard.writeText(S.otp); toast('Code copied + filled ✔'); }
    catch { toast('Code filled ✔'); }
  };
}
function verifyOtp() {
  if (readOtp() !== S.otp) return toast('Wrong code — tap the code in the backend inbox.');
  S.otpOk = true;
  // Returning user? Reload their stored session (fresh login number kept).
  const stored = loadStored();
  if (stored?.trn) {
    Object.assign(S, {
      trn: stored.trn, selfieB64: stored.selfieB64, idFrontB64: stored.idFrontB64, idBackB64: stored.idBackB64,
      ocr: stored.ocr, submit: stored.submit, liveness: stored.liveness, face: stored.face, qrRes: stored.qrRes,
      idCode: stored.idCode || '3', idType: stored.idType || null, ...(stored.done || {}),
    });
    $('trnLabel').textContent = S.trn;
    $('outTrn').textContent = `Secure session:\n${S.trn}`;
    if (S.liveness) chip('cLive', S.liveness.results?.passed, `Liveness ${S.liveness.results?.passed ? 'passed' : 'failed'}`);
    if (S.ocr) { chip('cOcr', true, 'ID read done'); autofill(); }
    if (S.face) chip('cFace', S.face.results?.is_matched, 'Face match restored');
    if (S.qrRes) chip('cFace', S.qrRes.is_verified, 'QR restored');
    if (S.submit) chip('cSubmit', S.submit.verification_status === 'PASSED', `Decision: ${S.submit.verification_status}`);
    renderSessionData();
    if (S.submit) {
      applyVerificationUI(S.submit.verification_status, S.ocr?.extracted_information?.personal_information?.first_name);
      refreshWallet().catch(() => {});
      toast('Welcome back — session reloaded ✔');
      go('wallet');
    } else {
      toast('Welcome back — continue where you left off ✔');
      go('kycintro');
    }
    return;
  }
  toast('Number verified ✔');
  renderSessionData();
  go('kycintro');
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
  // Auto-detected ID type: known OCR code/type wins, anything else → 0 (Other ID).
  const known = (S.idTypes || []).find(
    (t) => (id.code != null && String(id.code) === t.code) || (id.type && id.type === t.type)
  );
  if (known) { S.idCode = known.code; S.idType = known.type; }
  else if (id.code != null || id.type) { S.idCode = '0'; S.idType = 'OTHER_ID'; }
  const sel = $('f_type');
  if (sel && S.idCode) sel.value = S.idCode;
  const det = $('idDetected');
  if (det) {
    const pretty = (S.idType || 'ID').replace(/_/g, ' ');
    const label = S.idType || S.idCode ? `Detected: ${pretty}${S.idCode ? ' (code ' + S.idCode + ')' : ''}` : 'Type unclear — confirm on review';
    chip('idDetected', S.idCode !== '0' && !!(S.idType || S.idCode), label);
  }
  if (id.id_number) $('f_idnum').value = id.id_number;
  if (id.expiration_date) $('f_exp').value = String(id.expiration_date).slice(0, 10);
  if (p.last_name) $('f_last').value = p.last_name;
  if (p.first_name) $('f_first').value = p.first_name;
  if (p.suffix) $('f_suffix').value = p.suffix;
  if (p.birthdate) $('f_bday').value = String(p.birthdate).slice(0, 10);
  const a = typeof p.address === 'object' && p.address ? p.address : {};
  if (a.address_line_1 || a.address_line1) $('f_addr1').value = a.address_line_1 || a.address_line1;
  if (a.barangay) $('f_brgy').value = a.barangay;
  if (a.city_municipality) $('f_city').value = a.city_municipality;
  if (a.province) $('f_prov').value = a.province;
  if (a.zipcode) $('f_zip').value = a.zipcode;
}
$('btnAutofill').onclick = autofill;

$('btnSubmit').onclick = () => withBusy('btnSubmit', async () => {
  if (!S.trn || !S.selfieB64 || !S.idFrontB64) return toast('Selfie + ID are required.');
  const code = $('f_type').value || S.idCode || '3';
  const payload = {
    id_information: {
      code, type: (S.idTypes.find((t) => t.code === code) || {}).type || 'OTHER_ID',
      id_number: $('f_idnum').value.trim(),
      ...($('f_exp').value ? { expiration_date: $('f_exp').value } : {}),
    },
    personal_information: {
      last_name: $('f_last').value.trim(), first_name: $('f_first').value.trim(),
      ...($('f_suffix').value.trim() ? { suffix: $('f_suffix').value.trim() } : {}),
      birthdate: $('f_bday').value,
      // address_line1 is always required by /transaction/submit — send the
      // object every time, empty strings when the applicant left blanks.
      // NOTE: the dev backend actually validates the "address_line_1"
      // spelling (despite the error naming "address_line1"), so send both.
      address: {
        address_line1: $('f_addr1').value.trim(),
        address_line_1: $('f_addr1').value.trim(),
        barangay: $('f_brgy').value.trim(),
        city_municipality: $('f_city').value.trim(),
        province: $('f_prov').value.trim(),
        zipcode: $('f_zip').value.trim(),
      },
    },
    images: { face_bio_base64: S.selfieB64, id_front_base64: S.idFrontB64, ...(S.idBackB64 ? { id_back_base64: S.idBackB64 } : {}) },
  };
  if (!payload.id_information.id_number || !payload.personal_information.last_name || !payload.personal_information.first_name || !payload.personal_information.birthdate)
    return toast('ID number, names, and birthdate are required.');
  if (!payload.personal_information.address.address_line1)
    return toast('Address line 1 is required by SVI — fill it before submitting.');
  go('result');
  $('resTitle').textContent = 'Checking…';
  $('resSub').textContent = 'SVI is reviewing your submission.';
  $('resCard').className = 'res-card';
  $('resCard').textContent = 'Waiting for decision…';
  $('btnToWallet').classList.add('hidden');
  try {
    const r = await api('Submit for decision', '/api/kyc/transaction/submit', { method: 'POST', body: payload });
    // Demo rule: PNID passes, every other ID stays pending review.
    const raw = r.verification_status;
    const status = String(payload.id_information.type || '').toUpperCase().includes('PNID') ? 'PASSED' : 'PENDING_REVIEW';
    // Upstream field names vary — accept any session/timestamp key it sends.
    const sessId = r.session_transaction_id || r.transaction_id || r.session_id || r.trn || r.id || S.trn;
    const created = r.create_at || r.created_at || r.createdAt || r.timestamp || new Date().toISOString();
    const knownKeys = ['verification_status', 'session_transaction_id', 'transaction_id', 'session_id', 'trn', 'id', 'create_at', 'created_at', 'createdAt', 'timestamp'];
    const extraKeys = Object.keys(r).filter((k) => !knownKeys.includes(k));
    S.submit = { ...r, session_transaction_id: sessId, create_at: created, verification_status: status };
    const passed = status === 'PASSED';
    chip('cSubmit', passed, `Decision: ${status}`);
    markStep('submit');
    $('resTitle').textContent = passed ? 'Verified!' : 'Under review';
    $('resSub').textContent = passed ? 'Your wallet is unlocked.' : 'Usually cleared within a day — demo unlocks your wallet anyway.';
    $('resCard').className = 'res-card ' + (passed ? 'pass' : 'pend');
    $('resCard').innerHTML = `<b>${status}</b><br />Session <code>${sessId}</code><br /><span class="muted">${created}${raw !== status ? ` · upstream said ${raw}` : ''}${extraKeys.length ? ` · also returned: ${extraKeys.join(', ')}` : ''}</span>`;
    $('btnToWallet').classList.remove('hidden');
    applyVerificationUI(status, payload.personal_information.first_name);
    await refreshWallet();
  } catch (e) {
    chip('cSubmit', false, 'Decision failed');
    $('resTitle').textContent = 'Something went wrong';
    $('resSub').textContent = e.body?.message || e.message;
    $('resCard').textContent = 'Check the backend log, fix, and try again.';
  }
});
$('btnToWallet').onclick = () => go('wallet');
$('btnBackReview').onclick = () => go('review');
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
  setBadge($('pBadge'), S.submit?.verification_status);
  const addr = [a.address_line_1 || a.address_line1, a.barangay, a.city_municipality, a.province, a.zipcode].filter(Boolean).join(', ') || '—';
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
/* ---------- stored session: logout clears it, next login reloads it ---------- */
const LS_KEY = 'pusopay-session-v1';
function saveSession() {
  if (!S.trn) return;
  try {
    const done = {};
    Object.keys(S).filter((k) => k.startsWith('done_')).forEach((k) => (done[k] = S[k]));
    localStorage.setItem(LS_KEY, JSON.stringify({
      trn: S.trn, selfieB64: S.selfieB64, idFrontB64: S.idFrontB64, idBackB64: S.idBackB64,
      ocr: S.ocr, submit: S.submit, liveness: S.liveness, face: S.face, qrRes: S.qrRes,
      idCode: S.idCode, idType: S.idType, done, at: Date.now(),
    }));
  } catch { /* quota or private mode — session just won't survive reload */ }
}
function loadStored() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
}
function resetSession() {
  stopCamera();
  try { localStorage.removeItem(LS_KEY); } catch {}
  Object.assign(S, {
    trn: null, phone: null, otp: null, otpOk: false,
    selfieB64: null, idFrontB64: null, idBackB64: null,
    ocr: null, submit: null, liveness: null, face: null, qrRes: null,
    idCode: '3', idType: null,
  });
  Object.keys(S).filter((k) => k.startsWith('done_')).forEach((k) => delete S[k]);
  $('trnLabel').textContent = '— none —';
  $('outTrn').textContent = 'Secure session not started.';
  chip('cLive', undefined, 'Liveness · waiting');
  chip('cOcr', undefined, 'ID read · waiting');
  chip('cFace', undefined, 'Face match · waiting');
  chip('cSubmit', undefined, 'Decision · waiting');
  chip('liveChip', undefined, 'Liveness: not run');
  chip('matchChip', undefined, 'Face match: not run');
  chip('qrChip', undefined, 'QR: not run');
  chip('idDetected', undefined, 'ID type: auto-detected on scan');
  $('qrValue').value = '';
  $('btnSnapSelfie').classList.remove('hidden');
  $('btnRetakeSelfie').classList.add('hidden');
  ['selfiePrev', 'idFrontPrev', 'idBackPrev', 'qrPrev'].forEach((id) => $(id).classList.remove('show'));
  $('btnSnapFront').innerHTML = '<svg class="ic"><use href="#i-cam"/></svg>Capture front *';
  $('btnSnapBack').textContent = '+ Capture back';
  setBadge($('wBadge'), null);
  renderSessionData();
}
function logout() {
  stopCamera();
  fillOtp('');
  go('welcome');
  toast('Logged out — session kept. Log in to continue.');
}
$('btnLogout').onclick = logout;
$('btnCreate').onclick = () => { resetSession(); go('phone'); };
$('btnLogin').onclick = () => go('phone');
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
