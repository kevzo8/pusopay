const express = require('express');
const path = require('path');
const config = require('./config');
const SviKycClient = require('./api/svi-kyc-client');
const kycRoutes = require('./routes/kyc');
const walletRoutes = require('./routes/wallet');

const app = express();

// Base64 images can be several MB → allow large JSON bodies.
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Demo APIs (backend keeps SVI secrets server-side; browser never sees them)
app.use('/api/kyc', kycRoutes);
app.use('/api/wallet', walletRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'svi-pusopay-demo' }));
app.get('/api', (req, res) => {
  res.json({
    name: `${config.pusopay.brand} Demo (${config.pusopay.issuer} eWallet + SVI Onboarding/KYC)`,
    version: '1.0.0',
    guide: 'SVI_PusoPay_API_Guide_v1.0.0',
    sviBaseUrl: config.svi.baseUrl,
    kyc: {
      'POST /api/kyc/transaction/create': 'Guide §3 — new TRN',
      'POST /api/kyc/liveness/passive': 'Guide §4 — { image } + X-Transaction-Id',
      'POST /api/kyc/id/ocr': 'Guide §5 — { id_front_base64, id_back_base64? }',
      'POST /api/kyc/face-match/check': 'Guide §6 — { face_bio_base64, id_base64 }',
      'POST /api/kyc/verifications/qr': 'Guide §7 — { qr_value, face_biometric_base64 }',
      'POST /api/kyc/transaction/submit': 'Guide §8 — confirmed identity + images',
      'GET /api/kyc/result/:trn': 'Local demo store (Guide lists Get KYC Result without spec)',
      'GET /api/kyc/health': 'Upstream GET /health (unauthenticated)',
      'POST /api/kyc/token': 'Guide §2 (cached; token truncated in response)'
    },
    wallet: {
      'GET /api/wallet/:walletId': 'Mock eWallet ledger',
      'POST /api/wallet/:walletId/cash-in': '{ amount, memo? }',
      'POST /api/wallet/:walletId/send': '{ to, amount }'
    },
    frontend: `http://localhost:${config.server.port}`
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'PusoPay_Logo.png')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ status: 'error', error_code: 'INVALID_REQUEST', message: 'Image payload too large. Use smaller images (< ~8MB each).' });
  }
  res.status(500).json({ error: 'Internal server error', message: config.server.env === 'development' ? err.message : undefined });
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

global.svi = new SviKycClient();

const PORT = config.server.port;

// Only listen when run directly (`node src/index.js`). On Vercel the
// exported app is invoked serverlessly via api/index.js instead.
let server = null;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log('\n==============================================');
    console.log(`  ${config.pusopay.brand} Demo — ${config.pusopay.issuer} eWallet x SVI KYC`);
    console.log('==============================================');
    console.log(`  UI:      http://localhost:${PORT}`);
    console.log(`  API:     http://localhost:${PORT}/api`);
    console.log(`  SVI:     ${config.svi.baseUrl}`);
    console.log('==============================================\n');
  });

  process.on('SIGINT', () => server.close(() => process.exit(0)));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

module.exports = { app };
