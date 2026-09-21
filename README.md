# PusoPay Demo — DigiCash eWallet × SVI Onboarding/KYC

Demo app implementing **SVI_PusoPay_API_Guide_v1.0.0** end-to-end. PusoPay is the
eWallet product of DigiCash; **SVI handles onboarding + KYC**, PusoPay owns the wallet.

Base URL (Guide §1): `https://verify.dev.svi.cloud/api/v1`

## Flow

```
[1] POST /auth/token (§2) ──Basic(clientId:secret)+x-api-key──▶ Bearer (15 min, cached)
[2] POST /transaction/create (§3) ───────────────────────────▶ TRN (UUID) → X-Transaction-Id
[3] POST /liveness/passive (§4) { image } ──────────────────▶ passed / confidence / 0.80
[4] POST /id/ocr (§5) { front, back? } ─────────────────────▶ extracted_information
[5] POST /face-match/check (§6) { selfie, id } ─────────────▶ is_matched / 0.75
     POST /verifications/qr (§7) { qr_value, selfie } ──────▶ is_verified (alt path)
[6] POST /transaction/submit (§8) { id_info, personal, images } ▶ PENDING_REVIEW | PASSED
[7] Mock PusoPay wallet unlocked (DigiCash-side simulation)
```

`GET /health` (unauthenticated) is exposed for availability checks.
`Get KYC Result` / `Transaction Image Upload` appear in the Guide overview but have
no spec in v1.0.0 — the demo persists submit responses locally (`GET /api/kyc/result/:trn`).

## Quick start

```powershell
cd svi-pusopay-demo
npm install
npm start        # or: npm run dev
```

Open http://localhost:3025 and work steps 1→6:
1. **Transaction** — get token (§2), create TRN (§3)
2. **Liveness** — upload selfie, run §4
3. **ID OCR** — upload ID front (+back), run §5, data autofills step 5
4. **Face / QR** — face match (§6) and/or PNID QR (§7)
5. **Review & Submit** — confirm identity, submit (§8) → `PENDING_REVIEW` (or `PASSED` for PNID)
6. **Wallet** — mock DigiCash ledger: balance, cash-in, send, history

Credentials live in `config.env` (server-side only — the browser talks to `/api/kyc/*`
proxy routes that attach `Authorization: Bearer` + `x-api-key` + `X-Transaction-Id`).

## API (backend)

| Route | Guide mapping |
|---|---|
| `POST /api/kyc/token` | §2 (cached; token truncated in response) |
| `POST /api/kyc/transaction/create` | §3 |
| `POST /api/kyc/liveness/passive` | §4 |
| `POST /api/kyc/id/ocr` | §5 |
| `POST /api/kyc/face-match/check` | §6 |
| `POST /api/kyc/verifications/qr` | §7 |
| `POST /api/kyc/transaction/submit` | §8 |
| `GET /api/kyc/result/:trn`, `GET /api/kyc/sessions` | local store (unspecified in v1.0.0) |
| `GET /api/kyc/health` | upstream `/health` |
| `GET /api/kyc/config` | ID types (§10) + error codes (§9) |
| `GET/POST /api/wallet/:id…` | mock PusoPay ledger |

## Request shapes (from Guide)

- Token: `Content-Type: application/x-www-form-urlencoded`, `Authorization: Basic base64(id:secret)`, `x-api-key`, body `grant_type=client_credentials`
- All verification calls: `Authorization: Bearer`, `x-api-key`, JSON; transaction calls add `X-Transaction-Id`
- Submit requires `id_information.{code,type,id_number}`, `personal_information.{last_name,first_name,birthdate}`, `images.{face_bio_base64,id_front_base64}` (+ optionals)

## ID types (§10)

1 PASSPORT · 2 PNID · 3 PNID (ePhil ID) · 4 UMID · 5 PRC_ID · 6 SSS_ID · 7 GSIS_ID ·
8 TIN · 9 PWD_ID · 10 SENIOR_CITIZEN_ID · 11 PHILHEALTH · 12 POSTAL_ID ·
13 DRIVERS_LICENSE · 14 BATAENO_PASS. Use only types in your contract scope.

## Tests

```powershell
npm test        # health + token
npm run test:auth
```

## Layout

```
svi-pusopay-demo/
├── config.env(.example)     # SVI creds + port (server-side only)
├── src/
│   ├── index.js             # Express server
│   ├── config/index.js      # base URL, endpoints, ID types, error codes
│   ├── api/svi-kyc-client.js# §§2–8 client (token cache, TRN headers, base64)
│   └── routes/{kyc, wallet}.js
├── public/{index.html,app.js,styles.css}  # 6-step wizard + wallet + reference
└── tests/
```
