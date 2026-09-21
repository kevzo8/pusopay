const express = require('express');
const config = require('../config');

const router = express.Router();

/**
 * Mock PusoPay (DigiCash) eWallet ledger.
 * Real money movement would go through DigiCash Pay/Payout APIs
 * (see ../svi-digicash reference). This demo focuses on SVI onboarding/KYC,
 * so the wallet is an in-memory simulation unlocked after KYC submit.
 */

const wallets = new Map(); // walletId (TRN or demo id) -> { balance, history }

function getWallet(id) {
  if (!wallets.has(id)) {
    wallets.set(id, {
      walletId: id,
      brand: config.pusopay.brand,
      issuer: config.pusopay.issuer,
      balance: Number(config.pusopay.welcomeBalance) || 5000,
      currency: 'PHP',
      history: [
        {
          id: `WELCOME-${Date.now()}`,
          type: 'cash_in',
          amount: Number(config.pusopay.welcomeBalance) || 5000,
          memo: 'Welcome bonus (demo)',
          at: new Date().toISOString()
        }
      ]
    });
  }
  return wallets.get(id);
}

router.get('/:walletId', (req, res) => {
  res.json(getWallet(req.params.walletId));
});

router.post('/:walletId/cash-in', (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ status: 'error', error_code: 'INVALID_REQUEST', message: 'amount must be a positive number.' });
  }
  const w = getWallet(req.params.walletId);
  w.balance = Math.round((w.balance + amount) * 100) / 100;
  w.history.unshift({ id: `CI-${Date.now()}`, type: 'cash_in', amount, memo: req.body.memo || 'Cash in (demo)', at: new Date().toISOString() });
  res.json(w);
});

router.post('/:walletId/send', (req, res) => {
  const amount = Number(req.body.amount);
  const to = String(req.body.to || '').trim();
  if (!to) return res.status(400).json({ status: 'error', error_code: 'INVALID_REQUEST', message: 'Recipient "to" (mobile/account) is required.' });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ status: 'error', error_code: 'INVALID_REQUEST', message: 'amount must be a positive number.' });
  }
  const w = getWallet(req.params.walletId);
  if (amount > w.balance) {
    return res.status(400).json({ status: 'error', error_code: 'INVALID_REQUEST', message: 'Insufficient balance.' });
  }
  w.balance = Math.round((w.balance - amount) * 100) / 100;
  w.history.unshift({ id: `SEND-${Date.now()}`, type: 'send', amount, memo: `Send to ${to}`, to, at: new Date().toISOString() });
  res.json(w);
});

module.exports = router;
