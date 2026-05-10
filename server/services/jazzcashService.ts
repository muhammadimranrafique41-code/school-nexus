// jazzcashService.ts
// JazzCash MCP Wallet Top-Up & Fee Settlement Service
// Integration model: JazzCash → creditFamilyWallet() → payFamily() (existing)
// The existing financeService.payFamily() handles all fee settlement logic.

import crypto from 'crypto';
import { db } from '../db.js';
import { storage } from '../storage.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JazzCashInitiateInput {
  familyId: number;
  amountPKR: number; // e.g. 1500.00
  initiatedByUserId: number;
  billReference?: string; // optional: fee invoice numbers, e.g. "INV-2026-001"
  description?: string; // e.g. "School Fee Payment - Term 1"
}

export interface JazzCashInitiateResult {
  checkoutUrl: string;
  formParams: Record<string, string>;
  txnRefNo: string;
  intentId: number;
}

export interface JazzCashCallbackPayload {
  pp_TxnRefNo: string;
  pp_ResponseCode: string;
  pp_ResponseMessage: string;
  pp_Amount: string; // paisas
  pp_TxnCurrency: string;
  pp_MerchantID: string;
  pp_SecureHash: string;
  [key: string]: string;
}

// ─── HMAC Utilities ───────────────────────────────────────────────────────────

/**
 * Generates JazzCash HMAC-SHA256 secure hash.
 * Fields are sorted alphabetically, joined with '&', prefixed by the hash key.
 */
export function generateJazzCashHash(
  params: Record<string, string>,
  hashKey: string
): string {
  const hashString =
    hashKey +
    '&' +
    Object.keys(params)
      .filter((k) => k !== 'pp_SecureHash' && params[k] !== '')
      .sort()
      .map((k) => params[k])
      .join('&');

  return crypto.createHmac('sha256', hashKey).update(hashString).digest('hex').toUpperCase();
}

/**
 * Verifies the HMAC on an inbound JazzCash callback.
 * ALWAYS call this before any database write.
 */
export function verifyJazzCashHash(
  payload: Record<string, string>,
  hashKey: string
): boolean {
  const received = payload.pp_SecureHash;
  if (!received) return false;
  const computed = generateJazzCashHash(payload, hashKey);
  return crypto.timingSafeEqual(Buffer.from(received.toUpperCase()), Buffer.from(computed.toUpperCase()));
}

// ─── Transaction Reference ───────────────────────────────────────────────────

function buildTxnRefNo(intentId: number): string {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `SNXJC${ts}${String(intentId).padStart(5, '0')}`;
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export const jazzCashService = {
  /**
   * Step 1 of 3: Create a payment intent and return JazzCash checkout params.
   */
  async initiatePayment(input: JazzCashInitiateInput): Promise<JazzCashInitiateResult> {
    const { familyId, amountPKR, initiatedByUserId, description } = input;
    if (amountPKR <= 0) throw new Error('Payment amount must be greater than 0');
    if (amountPKR > 999999.99) throw new Error('Payment amount exceeds maximum limit');

    // Verify family exists
    const familyRes = await db.query('SELECT id, wallet_balance FROM families WHERE id = $1', [familyId]);
    if (!familyRes.rows[0]) throw new Error(`Family ${familyId} not found`);

    // Insert intent (PENDING)
    const intentRes = await db.query(
      `INSERT INTO jazzcash_payment_intents
       (family_id, pp_TxnRefNo, requested_amount_pkr, status, initiated_by_user_id, idempotency_key)
       VALUES ($1, 'PLACEHOLDER', $2, 'PENDING', $3, $4)
       RETURNING id`,
      [familyId, amountPKR, initiatedByUserId, `${familyId}-${Date.now()}`]
    );
    const intentId = intentRes.rows[0].id as number;

    // Build final txnRefNo and update record
    const txnRefNo = buildTxnRefNo(intentId);
    await db.query('UPDATE jazzcash_payment_intents SET pp_TxnRefNo = $1 WHERE id = $2', [txnRefNo, intentId]);

    const txnDateTime = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const amountPaisas = String(Math.round(amountPKR * 100));

    const params: Record<string, string> = {
      pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID!,
      pp_Password: process.env.JAZZCASH_PASSWORD!,
      pp_TxnRefNo: txnRefNo,
      pp_Amount: amountPaisas,
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: txnDateTime,
      pp_BillReference: `FAM-${familyId}`,
      pp_Description: description ?? `School Nexus Fee Payment - Family ${familyId}`,
      pp_ReturnURL: process.env.JAZZCASH_RETURN_URL!,
      pp_Language: 'EN',
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
    };

    params.pp_SecureHash = generateJazzCashHash(params, process.env.JAZZCASH_HASH_KEY!);

    const gatewayUrl =
      process.env.JAZZCASH_MODE === 'production'
        ? process.env.JAZZCASH_PRODUCTION_URL!
        : process.env.JAZZCASH_SANDBOX_URL!;

    console.info({ intentId, txnRefNo, amountPKR }, 'JazzCash payment intent created');

    return { checkoutUrl: gatewayUrl, formParams: params, txnRefNo, intentId };
  },

  /**
   * Step 2 of 3: Process the inbound JazzCash webhook callback.
   */
  async processCallback(payload: JazzCashCallbackPayload): Promise<{
    success: boolean;
    alreadyProcessed?: boolean;
    intentId?: number;
    amountCredited?: number;
    settlementResult?: unknown;
  }> {
    // HMAC verification
    const hashValid = verifyJazzCashHash(payload, process.env.JAZZCASH_HASH_KEY!);
    if (!hashValid) {
      console.warn({ txnRefNo: payload.pp_TxnRefNo }, 'JazzCash callback HMAC verification FAILED');
      throw new Error('SECURITY_VIOLATION: Invalid HMAC signature on JazzCash callback');
    }

    const { pp_TxnRefNo, pp_ResponseCode, pp_Amount } = payload;

    // Idempotency check
    const existing = await db.query(
      `SELECT id, family_id, status, requested_amount_pkr FROM jazzcash_payment_intents WHERE pp_TxnRefNo = $1`,
      [pp_TxnRefNo]
    );
    if (!existing.rows[0]) {
      console.error({ pp_TxnRefNo }, 'JazzCash callback for unknown txnRefNo');
      throw new Error(`No payment intent found for txnRefNo: ${pp_TxnRefNo}`);
    }
    const intent = existing.rows[0];
    if (intent.status === 'COMPLETED') {
      console.info({ pp_TxnRefNo, intentId: intent.id }, 'Duplicate JazzCash callback — skipping');
      return { success: true, alreadyProcessed: true, intentId: intent.id };
    }

    const isSuccess = pp_ResponseCode === '000';
    const amountPKR = Number(pp_Amount) / 100;

    return await db.transaction(async (trx) => {
      // Update intent record
      await trx.query(
        `UPDATE jazzcash_payment_intents
         SET status = $1,
             pp_ResponseCode = $2,
             pp_ResponseMessage = $3,
             applied_amount_pkr = $4,
             raw_callback_payload = $5,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $6`,
        [
          isSuccess ? 'COMPLETED' : 'FAILED',
          pp_ResponseCode,
          payload.pp_ResponseMessage ?? '',
          isSuccess ? amountPKR : null,
          JSON.stringify(payload),
          intent.id,
        ]
      );

      if (!isSuccess) {
        console.warn({ pp_TxnRefNo, pp_ResponseCode }, 'JazzCash payment FAILED');
        return { success: false, intentId: intent.id };
      }

      // Credit family wallet
      await trx.query(
        `UPDATE families SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2`,
        [amountPKR, intent.family_id]
      );

      // Record top‑up transaction
      await trx.query(
        `INSERT INTO family_transactions (family_id, amount, type, method, jazzcash_intent_id, description)
         VALUES ($1, $2, 'jazzcash_topup', 'JazzCash', $3, $4)`,
        [
          intent.family_id,
          amountPKR,
          intent.id,
          `JazzCash top-up via MCP — Ref: ${pp_TxnRefNo}`,
        ]
      );

      console.info({ intentId: intent.id, familyId: intent.family_id, amountPKR }, 'Family wallet credited via JazzCash');

      // Settle outstanding fees using existing payFamily logic (wallet-only)
      const settlementResult = await storage.payFamily(
        intent.family_id,
        {
          amount: 0,
          paymentDate: new Date().toISOString().slice(0, 10),
          method: 'JazzCash',
          reference: pp_TxnRefNo,
          notes: `Settled from JazzCash MCP payment. TxnRef: ${pp_TxnRefNo}`,
        },
        {
          tx,
          createdBy: intent.initiated_by_user_id ?? undefined,
        }
      );

      console.info({ intentId: intent.id, settlementResult }, 'Fee settlement completed after JazzCash top-up');

      return { success: true, intentId: intent.id, amountCredited: amountPKR, settlementResult };
    });
  },

  /**
   * Step 3 of 3: Get payment status.
   */
  async getPaymentStatus(txnRefNo: string, familyId: number) {
    const result = await db.query(
      `SELECT id, status, pp_ResponseCode, pp_ResponseMessage, requested_amount_pkr, applied_amount_pkr, created_at, completed_at
       FROM jazzcash_payment_intents
       WHERE pp_TxnRefNo = $1 AND family_id = $2`,
      [txnRefNo, familyId]
    );
    if (!result.rows[0]) throw new Error('Payment intent not found');
    return result.rows[0];
  },
};
