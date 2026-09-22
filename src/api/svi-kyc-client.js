const axios = require('axios');
const config = require('../config');

/**
 * SVI PusoPay Onboarding KYC API client.
 * Implements SVI_PusoPay_API_Guide_v1.0.0 Sections 2–8 + /health.
 *
 * Base URL: https://verify.dev.svi.cloud/api/v1
 *
 * Auth model:
 *   1) POST /auth/token with HTTP Basic (clientId:clientSecret) + x-api-key
 *      + form body grant_type=client_credentials → { access_token, token_type, expires_in, expires_at }
 *   2) All verification endpoints use `Authorization: Bearer <token>` + `x-api-key`.
 *      Transaction-scoped endpoints additionally require `X-Transaction-Id`.
 */
class SviKycClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || config.svi.baseUrl).replace(/\/$/, '');
    this.clientId = options.clientId || config.svi.clientId;
    this.clientSecret = options.clientSecret || config.svi.clientSecret;
    this.apiKey = options.apiKey || config.svi.apiKey;

    this._token = null;
    this._expiresAtMs = 0;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000,
      validateStatus: () => true // we surface API error bodies ourselves (Section 9)
    });
  }

  // ---------- helpers ----------

  maskedCredentials() {
    const mask = (s = '') => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-4)}`);
    return { clientId: mask(this.clientId), apiKey: mask(this.apiKey), baseUrl: this.baseUrl };
  }

  isTokenCached() {
    // 30s clock-skew buffer
    return !!(this._token && Date.now() < this._expiresAtMs - 30000);
  }

  authHeaders(extra = {}) {
    if (!this._token) throw new Error('No access token. Call getAccessToken() first (Guide Section 2).');
    return {
      Authorization: `Bearer ${this._token}`,
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      ...extra
    };
  }

  static stripDataUrl(b64) {
    if (!b64 || typeof b64 !== 'string') return b64;
    const i = b64.indexOf('base64,');
    return i >= 0 ? b64.slice(i + 'base64,'.length) : b64;
  }

  static throwIfApiError(res, context) {
    if (res.status >= 200 && res.status < 300) return res.data;
    const body = res.data || {};
    const err = new Error(
      `[${context}] HTTP ${res.status} ${body.error_code || body.status || ''}: ${body.message || JSON.stringify(body).slice(0, 300)}`
    );
    err.httpStatus = res.status;
    err.apiBody = body;
    throw err;
  }

  // ---------- Section 2 Authentication ----------

  /**
   * POST /auth/token — OAuth2 client_credentials.
   * Headers: Content-Type application/x-www-form-urlencoded,
   *          Authorization: Basic base64(clientId:clientSecret), x-api-key.
   * @param {boolean} forceRefresh bypass cache
   */
  async getAccessToken(forceRefresh = false) {
    if (!forceRefresh && this.isTokenCached()) {
      return {
        access_token: this._token,
        token_type: 'Bearer',
        expires_in: Math.max(0, Math.round((this._expiresAtMs - Date.now()) / 1000)),
        cached: true
      };
    }
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const params = new URLSearchParams({ grant_type: 'client_credentials' });
    const res = await this.http.post(config.svi.endpoints.token, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        'x-api-key': this.apiKey
      }
    });
    const data = SviKycClient.throwIfApiError(res, 'auth/token');
    this._token = data.access_token;
    const expiresInSec = Number(data.expires_in) || 900; // Guide: 900s = 15 min
    this._expiresAtMs = Date.now() + expiresInSec * 1000;
    this._expiresAtIso = data.expires_at || new Date(this._expiresAtMs).toISOString();
    return { ...data, cached: false };
  }

  async ensureToken() {
    if (!this.isTokenCached()) await this.getAccessToken(false);
  }

  // ---------- /health (unauthenticated) ----------

  async health() {
    // Guide labels /health unauthenticated; the gateway currently answers 403
    // ("Missing Authentication Token") with or without x-api-key — surfaced as-is.
    const res = await this.http.get(config.svi.endpoints.health, {
      headers: { 'x-api-key': this.apiKey }
    });
    return { httpStatus: res.status, body: res.data };
  }

  // ---------- Section 3 Create Transaction ----------

  /**
   * POST /transaction/create — no body. Returns { transaction_id } (UUID/TRN).
   * This TRN goes into `X-Transaction-Id` for Sections 4–8.
   */
  async createTransaction() {
    await this.ensureToken();
    const res = await this.http.post(
      config.svi.endpoints.create,
      {},
      { headers: this.authHeaders() }
    );
    return SviKycClient.throwIfApiError(res, 'transaction/create');
  }

  // ---------- Section 4 Passive Liveness Check ----------

  /**
   * POST /liveness/passive — { image } → { status, results: { passed, confidence_score, threshold=0.80 } }
   * Note: HTTP 200 + passed:false means "processed but not live".
   */
  async passiveLiveness({ transactionId, image }) {
    if (!transactionId) throw new Error('transactionId (TRN) is required (X-Transaction-Id).');
    if (!image) throw new Error('image (base64 JPEG/PNG) is required.');
    await this.ensureToken();
    const res = await this.http.post(
      config.svi.endpoints.liveness,
      { image: SviKycClient.stripDataUrl(image) },
      { headers: this.authHeaders({ 'X-Transaction-Id': transactionId }) }
    );
    return SviKycClient.throwIfApiError(res, 'liveness/passive');
  }

  // ---------- Section 5 Identity Document OCR ----------

  /**
   * POST /id/ocr — { id_front_base64, id_back_base64? } → { status, extracted_information: {...} }
   */
  async ocrId({ transactionId, idFrontBase64, idBackBase64 }) {
    if (!transactionId) throw new Error('transactionId (TRN) is required (X-Transaction-Id).');
    if (!idFrontBase64) throw new Error('idFrontBase64 is required.');
    await this.ensureToken();
    const body = { id_front_base64: SviKycClient.stripDataUrl(idFrontBase64) };
    if (idBackBase64) body.id_back_base64 = SviKycClient.stripDataUrl(idBackBase64);
    const res = await this.http.post(config.svi.endpoints.ocr, body, {
      headers: this.authHeaders({ 'X-Transaction-Id': transactionId })
    });
    return SviKycClient.throwIfApiError(res, 'id/ocr');
  }

  // ---------- Section 6 ID and Face Match ----------

  /**
   * POST /face-match/check — { face_bio_base64, id_base64 }
   * → { status, results: { is_matched, confidence_score, threshold=0.75 } }
   */
  async faceMatch({ transactionId, faceBioBase64, idBase64 }) {
    if (!transactionId) throw new Error('transactionId (TRN) is required (X-Transaction-Id).');
    if (!faceBioBase64 || !idBase64) throw new Error('faceBioBase64 and idBase64 are required.');
    await this.ensureToken();
    const res = await this.http.post(
      config.svi.endpoints.faceMatch,
      {
        face_bio_base64: SviKycClient.stripDataUrl(faceBioBase64),
        id_base64: SviKycClient.stripDataUrl(idBase64)
      },
      { headers: this.authHeaders({ 'X-Transaction-Id': transactionId }) }
    );
    return SviKycClient.throwIfApiError(res, 'face-match/check');
  }

  // ---------- Section 7 PNID QR Verification ----------

  /**
   * POST /verifications/qr — { qr_value, face_biometric_base64 } → { status, is_verified }
   */
  async verifyQr({ transactionId, qrValue, faceBiometricBase64 }) {
    if (!transactionId) throw new Error('transactionId (TRN) is required (X-Transaction-Id).');
    if (!qrValue) throw new Error('qrValue (raw PNID QR payload) is required.');
    if (!faceBiometricBase64) throw new Error('faceBiometricBase64 is required.');
    await this.ensureToken();
    const res = await this.http.post(
      config.svi.endpoints.qr,
      {
        qr_value: qrValue,
        face_biometric_base64: SviKycClient.stripDataUrl(faceBiometricBase64)
      },
      { headers: this.authHeaders({ 'X-Transaction-Id': transactionId }) }
    );
    return SviKycClient.throwIfApiError(res, 'verifications/qr');
  }

  // ---------- Section 8 Submit Transaction ----------

  /**
   * POST /transaction/submit — confirmed identity + images for final KYC processing.
   * → { verification_status: PENDING_REVIEW | PASSED, session_transaction_id, create_at }
   */
  async submitTransaction({ transactionId, idInformation, personalInformation, images }) {
    if (!transactionId) throw new Error('transactionId (TRN) is required (X-Transaction-Id).');
    if (!idInformation?.code || !idInformation?.type || !idInformation?.id_number) {
      throw new Error('idInformation.code, .type, .id_number are required (Section 8).');
    }
    if (!personalInformation?.last_name || !personalInformation?.first_name || !personalInformation?.birthdate) {
      throw new Error('personalInformation.last_name, .first_name, .birthdate are required (Section 8).');
    }
    if (!images?.face_bio_base64 || !images?.id_front_base64) {
      throw new Error('images.face_bio_base64 and images.id_front_base64 are required (Section 8).');
    }
    await this.ensureToken();
    const body = {
      id_information: idInformation,
      personal_information: personalInformation,
      images: {
        face_bio_base64: SviKycClient.stripDataUrl(images.face_bio_base64),
        id_front_base64: SviKycClient.stripDataUrl(images.id_front_base64),
        ...(images.id_back_base64
          ? { id_back_base64: SviKycClient.stripDataUrl(images.id_back_base64) }
          : {})
      }
    };
    const res = await this.http.post(config.svi.endpoints.submit, body, {
      headers: this.authHeaders({ 'X-Transaction-Id': transactionId })
    });
    return SviKycClient.throwIfApiError(res, 'transaction/submit');
  }

  // ---------- Overview mentions without a spec section ----------

  /**
   * "Get KYC Result" and "Transaction Image Upload" are listed in Section 1 Overview
   * but have no request/response spec in v1.0.0. The demo server persists the
   * submit response locally and exposes it via its own /api/kyc/result/:trn
   * endpoint. If SVI publishes these paths later, implement them here.
   */
  getUnspecifiedNote() {
    return 'Get KYC Result / Transaction Image Upload are listed in Guide Section 1 but unspecified in v1.0.0 — tracked locally by the demo server.';
  }
}

module.exports = SviKycClient;
