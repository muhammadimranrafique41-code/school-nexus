# JazzCash MCP Wallet — Implementation Plan
## School Nexus · Senior Developer Reference

> **Repositories**
> - School Nexus: `git@github.com:muhammadimranrafique41-code/school-nexus.git`
> - JazzCash MCP: `https://github.com/TehreemArbab/JazzCashMCP.git`
> - **Target Branch:** `feature/jazzcash-mcp-integration`
> - **Author:** Lead Developer
> - **Date:** May 2026
> - **Status:** 🔴 Not Started

---

## Table of Contents

1. [Codebase Analysis — School Nexus Finance System](#1-codebase-analysis)
2. [Integration Strategy](#2-integration-strategy)
3. [Database Changes](#3-database-changes)
4. [New Files to Create](#4-new-files-to-create)
5. [Existing Files to Modify](#5-existing-files-to-modify)
6. [Implementation Phases](#6-implementation-phases)
7. [API Contract](#7-api-contract)
8. [Security Requirements](#8-security-requirements)
9. [Testing Plan](#9-testing-plan)
10. [GitHub Workflow](#10-github-workflow)
11. [Environment Variables](#11-environment-variables)
12. [Go-Live Checklist](#12-go-live-checklist)

---

## 1. Codebase Analysis

### 1.1 Existing Finance Architecture (from actual codebase)

The School Nexus finance system is already a well-structured, family-centric payment engine. JazzCash MCP integrates as an **external top-up source** — it funds the family wallet, after which the existing `payFamily()` engine handles all fee settlement logic untouched.

```
families.walletBalance          ← JazzCash MCP credits HERE
        ↓
familyTransactions              ← existing audit trail (unchanged)
        ↓
fees (paidAmount, remainingBalance, status)   ← existing (unchanged)
        ↓
financeLedgerEntries            ← existing per-student ledger (unchanged)
```

**Key insight:** Do NOT re-implement fee settlement. The existing `payFamily()` function in `server/services/financeService.ts` already handles:
- ✅ FIFO fee application (ordered by `dueDate ASC, id ASC`)
- ✅ Partial payments across multiple students
- ✅ Atomic DB transactions
- ✅ Status transitions (`Unpaid → Partially Paid → Paid → Overdue`)
- ✅ Ledger entries in `financeLedgerEntries`
- ✅ `familyTransactions` allocation JSON audit trail
- ✅ Receipt number generation via `buildDocumentNumber()`
- ✅ Overpayment protection (`Math.max(available, 0)`)

**JazzCash MCP's only job:** Validate a JazzCash payment → credit `families.walletBalance` → call existing `payFamily()`.

---

### 1.2 Relevant Existing Tables

| Table | Relevant Fields | JazzCash Interaction |
|---|---|---|
| `families` | `walletBalance numeric(12,2)` | **Top-up target** — credit after JazzCash success |
| `fees` | `amount`, `paidAmount`, `remainingBalance`, `status` | Read-only — updated by existing `payFamily()` |
| `familyTransactions` | `type`, `amount`, `allocation JSON`, `method` | New `type: 'jazzcash_topup'` entry |
| `financeLedgerEntries` | `type`, `credit`, `balanceAfter`, `referenceId` | Written by existing `payFamily()` — no change |
| `fee_payments` | `receiptNumber`, `amount`, `method`, `familyId` | Written by existing `payFamily()` — no change |

### 1.3 Relevant Existing Code

| File | What It Does | Our Touch-point |
|---|---|---|
| `server/services/financeService.ts` | Contains `payFamily()` — the full fee settlement engine | Call after wallet top-up |
| `server/routes.ts` (lines 2220–2300) | Existing finance API routes | Add 3 new JazzCash routes here |
| `server/storage.ts` (lines 2600–2800) | DB query layer for families/fees | Add `getFamily()`, `creditWallet()` queries |
| `migrations/0019_wallet_system.sql` | Existing wallet schema | Reference — do not modify |
| `migrations/0002_finance_schema.sql` | Core fee/ledger schema | Reference — do not modify |
| `migrations/0016_family_management.sql` | Family table schema | Reference — do not modify |

---

## 2. Integration Strategy

### 2.1 Architecture Decision

```
                      ┌─────────────────────────────────────┐
                      │         School Nexus Backend         │
                      │                                      │
  Parent App/Portal   │  routes.ts                           │
       │              │    POST /api/payment/jazzcash/initiate│
       │ HTTPS        │    POST /api/payment/jazzcash/callback│
       ▼              │    GET  /api/payment/jazzcash/status  │
  [Frontend]          │         │                            │
       │              │  JazzCashService (NEW)               │
       │              │    ├─ initiatePayment()              │
       │              │    ├─ verifyCallback()               │
       │              │    └─ topUpAndSettle()               │
       │              │         │                            │
       │              │  financeService.ts (EXISTING)        │
       │              │    └─ payFamily()  ← UNCHANGED       │
       │              └──────────┬──────────────────────────┘
       │                         │ HTTPS REST
       │                         ▼
       │              ┌─────────────────────┐
       │              │  JazzCashMCP Server  │
       │              │  (microservice)      │
       │              └──────────┬──────────┘
       │                         │ HTTPS REST
       │                         ▼
       │              ┌─────────────────────────────┐
       │◄─────────────│  JazzCash Payment Gateway    │
       │  redirect    │  sandbox / production        │
                      └──────────┬──────────────────┘
                                 │ Webhook POST
                                 ▼
                      POST /api/payment/jazzcash/callback
```

### 2.2 Integration Principle

> **Wallet Top-Up Model** — JazzCash acts as a deposit channel. It credits `families.walletBalance`, and the existing `payFamily()` engine settles fees from wallet balance. This requires zero changes to existing fee settlement logic.

**Flow:**
1. Parent initiates JazzCash payment → we create a `jazzcash_payment_intents` record
2. JazzCash callback received → HMAC verified → `families.walletBalance` credited
3. `payFamily()` called with `{ amount: 0 }` (wallet-only mode) → fees auto-settled from wallet
4. `familyTransactions` record created with `type: 'jazzcash_topup'`, `method: 'JazzCash'`

### 2.3 Amount Handling

JazzCash sends amounts in **paisas** (1 PKR = 100 paisas). The existing system uses `numeric(12,2)` in PKR.

```typescript
// JazzCash → School Nexus conversion
const amountPKR = Number(pp_Amount) / 100;  // 50000 paisas → PKR 500.00

// School Nexus → JazzCash conversion
const amountPaisas = String(Math.round(amountPKR * 100));  // PKR 500.00 → "50000"
```

---

## 3. Database Changes

### 3.1 New Migration File

**File:** `migrations/0025_jazzcash_integration.sql`

```sql
-- ============================================================
-- Migration: 0025_jazzcash_integration
-- Purpose:   JazzCash MCP wallet top-up payment tracking
-- Author:    Lead Developer
-- Date:      2026-05-10
-- ============================================================

-- Payment intents track the full lifecycle of each JazzCash transaction
CREATE TABLE IF NOT EXISTS jazzcash_payment_intents (
  id                    SERIAL PRIMARY KEY,
  family_id             INTEGER NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
  pp_TxnRefNo           VARCHAR(50)  NOT NULL UNIQUE,   -- JazzCash transaction reference
  pp_ResponseCode       VARCHAR(10),                    -- '000' = success
  pp_ResponseMessage    VARCHAR(255),
  requested_amount_pkr  NUMERIC(12,2) NOT NULL,          -- Amount parent intended to pay
  applied_amount_pkr    NUMERIC(12,2),                   -- Amount actually credited to wallet
  currency              CHAR(3)      NOT NULL DEFAULT 'PKR',
  status                VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','COMPLETED','FAILED','EXPIRED')),
  initiated_by_user_id  INTEGER REFERENCES users(id),
  raw_callback_payload  JSONB,                           -- Full JazzCash callback for audit
  idempotency_key       VARCHAR(100) UNIQUE,             -- Prevents duplicate processing
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_jcp_family_id   ON jazzcash_payment_intents (family_id);
CREATE INDEX idx_jcp_txnref      ON jazzcash_payment_intents (pp_TxnRefNo);
CREATE INDEX idx_jcp_status      ON jazzcash_payment_intents (status);
CREATE INDEX idx_jcp_created_at  ON jazzcash_payment_intents (created_at DESC);

-- Link JazzCash intents to family transactions (created after successful top-up)
ALTER TABLE family_transactions
  ADD COLUMN IF NOT EXISTS jazzcash_intent_id INTEGER
    REFERENCES jazzcash_payment_intents(id);

-- Track JazzCash as a recognised payment method in existing audit entries
COMMENT ON COLUMN family_transactions.method IS
  'Payment method: Cash | Bank Transfer | Cheque | JazzCash | Other';
```

### 3.2 No Changes to Core Finance Tables

The following tables are **read or written by existing `payFamily()` only** — this migration does not touch them:

- `fees` — no schema change
- `fee_payments` — no schema change
- `finance_ledger_entries` — no schema change
- `families.walletBalance` — existing column, credited by new service

---

## 4. New Files to Create

```
school-nexus/
├── server/
│   └── services/
│       └── jazzcashService.ts          ← PRIMARY NEW FILE
├── server/
│   └── middleware/
│       └── rateLimiter.ts              ← if not already present
├── migrations/
│   └── 0025_jazzcash_integration.sql   ← DB migration (Section 3)
├── tests/
│   └── jazzcash/
│       ├── hash.test.ts
│       ├── service.test.ts
│       └── webhook.integration.test.ts
└── docs/
    └── jazzcash_setup.md               ← operator setup guide
```

---

### 4.1 `server/services/jazzcashService.ts`

This is the complete implementation. Paste this file as-is and adjust imports to match your project's DB/logger utilities.

```typescript
/**
 * jazzcashService.ts
 * JazzCash MCP Wallet Top-Up & Fee Settlement Service
 *
 * Integration model: JazzCash → creditFamilyWallet() → payFamily() (existing)
 * The existing financeService.payFamily() handles all fee settlement logic.
 *
 * @author   Lead Developer
 * @version  1.0.0
 */

import crypto from 'crypto';
import { db } from '../db';                           // adjust to your DB import
import { financeService } from './financeService';    // existing service
import { logger } from '../utils/logger';             // adjust to your logger

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JazzCashInitiateInput {
  familyId: number;
  amountPKR: number;       // e.g. 1500.00
  initiatedByUserId: number;
  billReference?: string;  // optional: fee invoice numbers, e.g. "INV-2026-001"
  description?: string;    // e.g. "School Fee Payment - Term 1"
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
  pp_Amount: string;        // paisas
  pp_TxnCurrency: string;
  pp_MerchantID: string;
  pp_SecureHash: string;
  [key: string]: string;
}

// ─── HMAC Utilities ───────────────────────────────────────────────────────────

/**
 * Generates JazzCash HMAC-SHA256 secure hash.
 * Fields are sorted alphabetically, joined with '&', prefixed by the hash key.
 * This is the EXACT algorithm JazzCash documents — do not alter field ordering.
 */
export function generateJazzCashHash(
  params: Record<string, string>,
  hashKey: string
): string {
  const hashString =
    hashKey +
    '&' +
    Object.keys(params)
      .filter(k => k !== 'pp_SecureHash' && params[k] !== '')
      .sort()
      .map(k => params[k])
      .join('&');

  return crypto
    .createHmac('sha256', hashKey)
    .update(hashString)
    .digest('hex')
    .toUpperCase();
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
  return crypto.timingSafeEqual(
    Buffer.from(received.toUpperCase()),
    Buffer.from(computed.toUpperCase())
  );
}

// ─── Transaction Reference ───────────────────────────────────────────────────

function buildTxnRefNo(intentId: number): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);                // yyyyMMddHHmmss
  return `SNXJC${ts}${String(intentId).padStart(5, '0')}`;
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export const jazzCashService = {

  /**
   * Step 1 of 3: Create a payment intent and return JazzCash checkout params.
   *
   * The frontend POSTs these params to the JazzCash hosted checkout URL.
   * School Nexus stores the intent as PENDING until the webhook arrives.
   */
  async initiatePayment(input: JazzCashInitiateInput): Promise<JazzCashInitiateResult> {
    const { familyId, amountPKR, initiatedByUserId, description } = input;

    if (amountPKR <= 0) throw new Error('Payment amount must be greater than 0');
    if (amountPKR > 999999.99) throw new Error('Payment amount exceeds maximum limit');

    // Verify family exists
    const family = await db.query(
      'SELECT id, wallet_balance FROM families WHERE id = $1',
      [familyId]
    );
    if (!family.rows[0]) throw new Error(`Family ${familyId} not found`);

    // Create the intent record (PENDING status)
    const intentResult = await db.query(
      `INSERT INTO jazzcash_payment_intents
         (family_id, pp_TxnRefNo, requested_amount_pkr, status, initiated_by_user_id, idempotency_key)
       VALUES ($1, 'PLACEHOLDER', $2, 'PENDING', $3, $4)
       RETURNING id`,
      [familyId, amountPKR, initiatedByUserId, `${familyId}-${Date.now()}`]
    );
    const intentId: number = intentResult.rows[0].id;

    // Build the final txnRefNo using the intent ID for traceability
    const txnRefNo = buildTxnRefNo(intentId);
    await db.query(
      'UPDATE jazzcash_payment_intents SET pp_TxnRefNo = $1 WHERE id = $2',
      [txnRefNo, intentId]
    );

    const txnDateTime = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);

    const amountPaisas = String(Math.round(amountPKR * 100));

    const params: Record<string, string> = {
      pp_MerchantID:   process.env.JAZZCASH_MERCHANT_ID!,
      pp_Password:     process.env.JAZZCASH_PASSWORD!,
      pp_TxnRefNo:     txnRefNo,
      pp_Amount:       amountPaisas,
      pp_TxnCurrency:  'PKR',
      pp_TxnDateTime:  txnDateTime,
      pp_BillReference: `FAM-${familyId}`,
      pp_Description:  description ?? `School Nexus Fee Payment - Family ${familyId}`,
      pp_ReturnURL:    process.env.JAZZCASH_RETURN_URL!,
      pp_Language:     'EN',
      pp_Version:      '1.1',
      pp_TxnType:      'MWALLET',
    };

    params.pp_SecureHash = generateJazzCashHash(
      params,
      process.env.JAZZCASH_HASH_KEY!
    );

    const gatewayUrl =
      process.env.JAZZCASH_MODE === 'production'
        ? process.env.JAZZCASH_PRODUCTION_URL!
        : process.env.JAZZCASH_SANDBOX_URL!;

    logger.info({ intentId, txnRefNo, amountPKR }, 'JazzCash payment intent created');

    return { checkoutUrl: gatewayUrl, formParams: params, txnRefNo, intentId };
  },

  /**
   * Step 2 of 3: Process the inbound JazzCash webhook callback.
   *
   * Called by POST /api/payment/jazzcash/callback (public endpoint).
   * Security-critical: HMAC verified BEFORE any DB write.
   * Idempotent: safe to call multiple times with the same txnRefNo.
   *
   * On success: credits families.wallet_balance, then calls payFamily().
   */
  async processCallback(payload: JazzCashCallbackPayload): Promise<{
    success: boolean;
    alreadyProcessed?: boolean;
    intentId?: number;
    amountCredited?: number;
    settlementResult?: unknown;
  }> {
    // ── 1. HMAC Verification — reject before touching DB ──────────────────
    const hashValid = verifyJazzCashHash(payload, process.env.JAZZCASH_HASH_KEY!);
    if (!hashValid) {
      logger.warn({ txnRefNo: payload.pp_TxnRefNo }, 'JazzCash callback HMAC verification FAILED');
      throw new Error('SECURITY_VIOLATION: Invalid HMAC signature on JazzCash callback');
    }

    const { pp_TxnRefNo, pp_ResponseCode, pp_Amount } = payload;

    // ── 2. Idempotency check ───────────────────────────────────────────────
    const existing = await db.query(
      `SELECT id, family_id, status, requested_amount_pkr
       FROM jazzcash_payment_intents
       WHERE pp_TxnRefNo = $1`,
      [pp_TxnRefNo]
    );

    if (!existing.rows[0]) {
      logger.error({ pp_TxnRefNo }, 'JazzCash callback for unknown txnRefNo');
      throw new Error(`No payment intent found for txnRefNo: ${pp_TxnRefNo}`);
    }

    const intent = existing.rows[0];

    if (intent.status === 'COMPLETED') {
      logger.info({ pp_TxnRefNo, intentId: intent.id }, 'Duplicate JazzCash callback — skipping');
      return { success: true, alreadyProcessed: true, intentId: intent.id };
    }

    const isSuccess = pp_ResponseCode === '000';
    const amountPKR = Number(pp_Amount) / 100;

    // ── 3. Wrap entire settlement in a DB transaction ──────────────────────
    return await db.transaction(async (trx) => {

      // Update intent record
      await trx.query(
        `UPDATE jazzcash_payment_intents
         SET status               = $1,
             pp_ResponseCode      = $2,
             pp_ResponseMessage   = $3,
             applied_amount_pkr   = $4,
             raw_callback_payload = $5,
             completed_at         = NOW(),
             updated_at           = NOW()
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
        logger.warn({ pp_TxnRefNo, pp_ResponseCode }, 'JazzCash payment FAILED');
        return { success: false, intentId: intent.id };
      }

      // ── 4. Credit family wallet ──────────────────────────────────────────
      await trx.query(
        `UPDATE families
         SET wallet_balance = wallet_balance + $1,
             updated_at     = NOW()
         WHERE id = $2`,
        [amountPKR, intent.family_id]
      );

      // Record the top-up in familyTransactions (existing table, new type)
      await trx.query(
        `INSERT INTO family_transactions
           (family_id, amount, type, method, jazzcash_intent_id, description)
         VALUES ($1, $2, 'jazzcash_topup', 'JazzCash', $3, $4)`,
        [
          intent.family_id,
          amountPKR,
          intent.id,
          `JazzCash top-up via MCP — Ref: ${pp_TxnRefNo}`,
        ]
      );

      logger.info(
        { intentId: intent.id, familyId: intent.family_id, amountPKR },
        'Family wallet credited via JazzCash'
      );

      // ── 5. Trigger existing payFamily() to settle outstanding fees ───────
      //
      // IMPORTANT: Pass amount: 0 here. The existing payFamily() logic reads:
      //   available = input.amount + toWalletNumber(family.walletBalance)
      // Since we just credited the wallet, the full balance is already there.
      // Passing 0 means "use wallet only" — no double-counting.
      //
      const settlementResult = await financeService.payFamily(
        trx,           // pass the same transaction object
        {
          familyId: intent.family_id,
          amount:   0,           // wallet-only: balance already credited above
          method:   'JazzCash',
          notes:    `Settled from JazzCash MCP payment. TxnRef: ${pp_TxnRefNo}`,
        }
      );

      logger.info(
        { intentId: intent.id, settlementResult },
        'Fee settlement completed after JazzCash top-up'
      );

      return {
        success:          true,
        intentId:         intent.id,
        amountCredited:   amountPKR,
        settlementResult,
      };
    });
  },

  /**
   * Step 3 of 3: Get payment status (for frontend polling or admin views).
   */
  async getPaymentStatus(txnRefNo: string, familyId: number) {
    const result = await db.query(
      `SELECT id, status, pp_ResponseCode, pp_ResponseMessage,
              requested_amount_pkr, applied_amount_pkr, created_at, completed_at
       FROM jazzcash_payment_intents
       WHERE pp_TxnRefNo = $1 AND family_id = $2`,
      [txnRefNo, familyId]
    );
    if (!result.rows[0]) throw new Error('Payment intent not found');
    return result.rows[0];
  },
};
```

---

### 4.2 `tests/jazzcash/hash.test.ts`

```typescript
import { generateJazzCashHash, verifyJazzCashHash } from '../../server/services/jazzcashService';

const HASH_KEY = 'test_hash_key_12345';

describe('JazzCash HMAC Hash', () => {

  it('generates uppercase hex hash', () => {
    const params = {
      pp_MerchantID:  'MC12345',
      pp_Amount:      '50000',
      pp_TxnCurrency: 'PKR',
      pp_TxnRefNo:    'SNXJC20260510001',
      pp_TxnDateTime: '20260510120000',
    };
    const hash = generateJazzCashHash(params, HASH_KEY);
    expect(hash).toMatch(/^[A-F0-9]{64}$/);
  });

  it('sorts parameters alphabetically before hashing', () => {
    const params1 = { pp_A: 'alpha', pp_B: 'beta', pp_C: 'gamma' };
    const params2 = { pp_C: 'gamma', pp_A: 'alpha', pp_B: 'beta' };
    expect(generateJazzCashHash(params1, HASH_KEY))
      .toBe(generateJazzCashHash(params2, HASH_KEY));
  });

  it('excludes pp_SecureHash from hash computation', () => {
    const base   = { pp_A: 'x', pp_B: 'y' };
    const withSH = { ...base, pp_SecureHash: 'SHOULDBEIGNORED' };
    expect(generateJazzCashHash(base, HASH_KEY))
      .toBe(generateJazzCashHash(withSH, HASH_KEY));
  });

  it('excludes empty string values', () => {
    const withEmpty    = { pp_A: 'x', pp_B: '' };
    const withoutEmpty = { pp_A: 'x' };
    expect(generateJazzCashHash(withEmpty, HASH_KEY))
      .toBe(generateJazzCashHash(withoutEmpty, HASH_KEY));
  });

  it('verifies a valid callback payload', () => {
    const params = { pp_MerchantID: 'MC12345', pp_Amount: '50000', pp_TxnCurrency: 'PKR' };
    const hash   = generateJazzCashHash(params, HASH_KEY);
    expect(verifyJazzCashHash({ ...params, pp_SecureHash: hash }, HASH_KEY)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const params = { pp_MerchantID: 'MC12345', pp_Amount: '50000', pp_TxnCurrency: 'PKR' };
    const hash   = generateJazzCashHash(params, HASH_KEY);
    const tampered = { ...params, pp_Amount: '99999', pp_SecureHash: hash };
    expect(verifyJazzCashHash(tampered, HASH_KEY)).toBe(false);
  });

  it('returns false when pp_SecureHash is missing', () => {
    const params = { pp_MerchantID: 'MC12345', pp_Amount: '50000' };
    expect(verifyJazzCashHash(params, HASH_KEY)).toBe(false);
  });
});
```

---

### 4.3 `tests/jazzcash/service.test.ts`

```typescript
import { jazzCashService } from '../../server/services/jazzcashService';
import { db } from '../../server/db';
import { financeService } from '../../server/services/financeService';

jest.mock('../../server/db');
jest.mock('../../server/services/financeService');

const ENV = {
  JAZZCASH_MERCHANT_ID:   'MC_TEST',
  JAZZCASH_PASSWORD:      'test_pass',
  JAZZCASH_HASH_KEY:      'test_hash_key_12345',
  JAZZCASH_SANDBOX_URL:   'https://sandbox.jazzcash.com.pk/CustomerPortal/...',
  JAZZCASH_RETURN_URL:    'https://school.test/api/payment/jazzcash/callback',
  JAZZCASH_MODE:          'sandbox',
};

beforeAll(() => Object.assign(process.env, ENV));
afterAll(() => Object.keys(ENV).forEach(k => delete process.env[k]));

describe('JazzCashService.initiatePayment()', () => {

  it('returns checkout URL and pp_SecureHash', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 1, wallet_balance: '0.00' }] }) // family check
      .mockResolvedValueOnce({ rows: [{ id: 99 }] })                        // insert intent
      .mockResolvedValueOnce({ rows: [] });                                  // update txnRefNo

    const result = await jazzCashService.initiatePayment({
      familyId: 1, amountPKR: 1500, initiatedByUserId: 5
    });

    expect(result.checkoutUrl).toContain('jazzcash.com.pk');
    expect(result.formParams.pp_SecureHash).toMatch(/^[A-F0-9]{64}$/);
    expect(result.formParams.pp_Amount).toBe('150000');  // 1500 PKR in paisas
    expect(result.formParams.pp_TxnCurrency).toBe('PKR');
  });

  it('rejects amount <= 0', async () => {
    await expect(
      jazzCashService.initiatePayment({ familyId: 1, amountPKR: 0, initiatedByUserId: 1 })
    ).rejects.toThrow('greater than 0');
  });

  it('rejects unknown family', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    await expect(
      jazzCashService.initiatePayment({ familyId: 999, amountPKR: 100, initiatedByUserId: 1 })
    ).rejects.toThrow('not found');
  });
});

describe('JazzCashService.processCallback() — success path', () => {

  it('credits wallet and calls payFamily()', async () => {
    const { generateJazzCashHash } = await import('../../server/services/jazzcashService');
    const basePayload = {
      pp_TxnRefNo:      'SNXJC20260510000099',
      pp_ResponseCode:  '000',
      pp_ResponseMessage: 'Transaction Successful',
      pp_Amount:        '50000',  // PKR 500
      pp_TxnCurrency:   'PKR',
      pp_MerchantID:    'MC_TEST',
    };
    const pp_SecureHash = generateJazzCashHash(basePayload, ENV.JAZZCASH_HASH_KEY);
    const payload = { ...basePayload, pp_SecureHash };

    const mockTrx = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };
    (db.transaction as jest.Mock).mockImplementation(cb => cb(mockTrx));
    (db.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 99, family_id: 1, status: 'PENDING', requested_amount_pkr: '500.00' }]
    });
    (financeService.payFamily as jest.Mock).mockResolvedValue({ applied: 500 });

    const result = await jazzCashService.processCallback(payload);

    expect(result.success).toBe(true);
    expect(result.amountCredited).toBe(500);
    expect(financeService.payFamily).toHaveBeenCalledWith(
      mockTrx,
      expect.objectContaining({ familyId: 1, amount: 0, method: 'JazzCash' })
    );
  });

  it('returns alreadyProcessed: true for duplicate callbacks', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 99, family_id: 1, status: 'COMPLETED', requested_amount_pkr: '500.00' }]
    });

    const { generateJazzCashHash } = await import('../../server/services/jazzcashService');
    const base = { pp_TxnRefNo: 'DUP001', pp_ResponseCode: '000',
                   pp_Amount: '10000', pp_TxnCurrency: 'PKR', pp_MerchantID: 'MC_TEST',
                   pp_ResponseMessage: 'OK' };
    const payload = { ...base, pp_SecureHash: generateJazzCashHash(base, ENV.JAZZCASH_HASH_KEY) };

    const result = await jazzCashService.processCallback(payload);
    expect(result.alreadyProcessed).toBe(true);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('throws on invalid HMAC', async () => {
    const payload = {
      pp_TxnRefNo: 'BAD001', pp_ResponseCode: '000', pp_Amount: '10000',
      pp_TxnCurrency: 'PKR', pp_MerchantID: 'MC_TEST', pp_ResponseMessage: 'OK',
      pp_SecureHash: 'INVALIDSIGNATURE'
    };
    await expect(jazzCashService.processCallback(payload))
      .rejects.toThrow('SECURITY_VIOLATION');
  });
});
```

---

## 5. Existing Files to Modify

### 5.1 `server/routes.ts` — Add 3 New Routes

Add these routes in the finance/payment section (around line 2220–2300 where existing finance routes live):

```typescript
// ── JazzCash MCP Payment Routes ───────────────────────────────────────────────
// Import at top of file:
// import { jazzCashService } from './services/jazzcashService';
// import rateLimit from 'express-rate-limit';

const jazzCashLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 5,                // 5 requests per IP per minute
  message: { error: 'Too many payment requests. Please wait.' },
  standardHeaders: true,
});

/**
 * POST /api/payment/jazzcash/initiate
 * Authenticated parents initiate a JazzCash fee payment.
 * Returns hosted-checkout URL + form params.
 */
router.post(
  '/api/payment/jazzcash/initiate',
  requireAuth,          // existing auth middleware
  jazzCashLimiter,
  async (req, res) => {
    try {
      const { amountPKR, description } = req.body;
      const familyId = req.user.familyId;  // adjust to your auth shape

      if (!amountPKR || typeof amountPKR !== 'number') {
        return res.status(400).json({ error: 'amountPKR is required and must be a number' });
      }

      const result = await jazzCashService.initiatePayment({
        familyId,
        amountPKR,
        initiatedByUserId: req.user.id,
        description,
      });

      return res.json({
        checkoutUrl: result.checkoutUrl,
        formParams:  result.formParams,
        txnRefNo:    result.txnRefNo,
        intentId:    result.intentId,
      });
    } catch (err: any) {
      logger.error({ err }, 'JazzCash initiate failed');
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/payment/jazzcash/callback
 * PUBLIC — called directly by JazzCash gateway after payment.
 * No auth middleware. HMAC signature verified inside the service.
 *
 * IMPORTANT: This URL must be registered in your JazzCash merchant portal
 * as the pp_ReturnURL and must be on a publicly accessible HTTPS domain.
 */
router.post('/api/payment/jazzcash/callback', async (req, res) => {
  try {
    const result = await jazzCashService.processCallback(req.body);
    // JazzCash expects HTTP 200 to stop retrying
    return res.status(200).json({ received: true, ...result });
  } catch (err: any) {
    // Return 200 even on business errors to prevent JazzCash retry storm,
    // but log the error for investigation
    logger.error({ err, body: req.body }, 'JazzCash callback processing error');
    return res.status(200).json({ received: true, error: err.message });
  }
});

/**
 * GET /api/payment/jazzcash/status/:txnRefNo
 * Authenticated — parents/admins check payment status.
 */
router.get(
  '/api/payment/jazzcash/status/:txnRefNo',
  requireAuth,
  async (req, res) => {
    try {
      const { txnRefNo } = req.params;
      const familyId = req.user.familyId;
      const status = await jazzCashService.getPaymentStatus(txnRefNo, familyId);
      return res.json(status);
    } catch (err: any) {
      return res.status(404).json({ error: err.message });
    }
  }
);
```

### 5.2 `server/services/financeService.ts` — Verify `payFamily()` Signature

Before integrating, confirm the `payFamily()` function accepts a transaction object as the first argument. If it currently uses the module-level `db` instance directly, refactor its signature to:

```typescript
// CURRENT (if db is module-level):
async payFamily(input: PayFamilyInput): Promise<PayFamilyResult>

// REQUIRED (to accept external transaction for atomicity):
async payFamily(trx: DbTransaction, input: PayFamilyInput): Promise<PayFamilyResult>
```

> ⚠️ **If `payFamily()` does not accept a transaction object**, wrap the wallet credit and `payFamily()` call in a single `db.transaction()` at the service level — as shown in `jazzcashService.ts` above. Do **not** modify the existing `payFamily()` logic itself.

### 5.3 `.env.example` — Add JazzCash Variables

```bash
# ── JazzCash MCP Integration ─────────────────────────────────────────────────
# Register at https://developer.jazzcash.com.pk to receive these values
JAZZCASH_MODE=sandbox                          # sandbox | production
JAZZCASH_MERCHANT_ID=                          # From JazzCash merchant portal
JAZZCASH_PASSWORD=                             # API password
JAZZCASH_HASH_KEY=                             # HMAC signing key (keep SECRET)
JAZZCASH_SANDBOX_URL=https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/
JAZZCASH_PRODUCTION_URL=https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/
JAZZCASH_RETURN_URL=https://your-school.pk/api/payment/jazzcash/callback

# ── JazzCashMCP Microservice (if deployed separately) ────────────────────────
JAZZCASHMCP_SERVER_URL=http://localhost:3001   # remove if using direct REST calls
```

---

## 6. Implementation Phases

### Phase 1 — Foundation (Day 1–2)

- [ ] Run migration `0025_jazzcash_integration.sql` on development DB
- [ ] Add all `JAZZCASH_*` vars to `.env.example` and local `.env`
- [ ] Create `server/services/jazzcashService.ts` (paste from Section 4.1)
- [ ] Confirm `financeService.payFamily()` transaction signature (Section 5.2)
- [ ] Write `tests/jazzcash/hash.test.ts` and verify all pass
- [ ] Commit: `feat(payments): add JazzCash service foundation and DB migration`

### Phase 2 — Route Integration (Day 3)

- [ ] Add 3 routes to `server/routes.ts` (Section 5.1)
- [ ] Add rate limiter middleware
- [ ] Write `tests/jazzcash/service.test.ts` (paste from Section 4.3)
- [ ] Manually test `POST /api/payment/jazzcash/initiate` with Postman/curl
- [ ] Confirm JazzCash checkout URL returns correctly
- [ ] Commit: `feat(payments): add JazzCash initiate and callback routes`

### Phase 3 — End-to-End Sandbox Test (Day 4)

- [ ] Deploy to staging with JazzCash sandbox credentials
- [ ] Register `JAZZCASH_RETURN_URL` in JazzCash merchant portal (sandbox)
- [ ] Complete a test transaction: initiate → JazzCash sandbox → callback → DB
- [ ] Verify `jazzcash_payment_intents.status = 'COMPLETED'`
- [ ] Verify `families.wallet_balance` incremented correctly
- [ ] Verify existing `payFamily()` settled outstanding fees from wallet
- [ ] Verify `familyTransactions` record created with `type: 'jazzcash_topup'`
- [ ] Test duplicate callback — must return `alreadyProcessed: true` without DB change
- [ ] Test tampered `pp_SecureHash` — must return `SECURITY_VIOLATION` error
- [ ] Commit: `test(payments): sandbox E2E test passing — JazzCash wallet integration`

### Phase 4 — Production Hardening (Day 5)

- [ ] Switch `JAZZCASH_MODE=production` on production server
- [ ] Register production `JAZZCASH_RETURN_URL` in JazzCash merchant portal
- [ ] Verify production `.env` set (never committed to repo)
- [ ] Run `git log -p | grep -i 'HASH_KEY\|PASSWORD\|SECRET'` — must find nothing
- [ ] Open PR: `feat(payments): integrate JazzCash MCP wallet with school-nexus`
- [ ] Request code review from tech lead
- [ ] Merge to `main` after CI passes

---

## 7. API Contract

### `POST /api/payment/jazzcash/initiate`

**Auth:** Required (parent role)
**Rate limit:** 5 req/min per IP

Request:
```json
{
  "amountPKR": 1500.00,
  "description": "Term 1 Fee Payment — 3 students"
}
```

Response `200`:
```json
{
  "checkoutUrl": "https://sandbox.jazzcash.com.pk/CustomerPortal/...",
  "formParams": {
    "pp_MerchantID": "MC12345",
    "pp_Amount": "150000",
    "pp_TxnCurrency": "PKR",
    "pp_TxnRefNo": "SNXJC202605100000099",
    "pp_SecureHash": "A3F9....",
    "..."
  },
  "txnRefNo": "SNXJC202605100000099",
  "intentId": 99
}
```

Response `400`: `{ "error": "amountPKR is required and must be a number" }`
Response `500`: `{ "error": "..." }`

---

### `POST /api/payment/jazzcash/callback`

**Auth:** None (public — HMAC verified inside service)
**Called by:** JazzCash gateway directly

Body (sent by JazzCash):
```json
{
  "pp_TxnRefNo": "SNXJC202605100000099",
  "pp_ResponseCode": "000",
  "pp_ResponseMessage": "Transaction Successful",
  "pp_Amount": "150000",
  "pp_TxnCurrency": "PKR",
  "pp_MerchantID": "MC12345",
  "pp_SecureHash": "A3F9...."
}
```

Response `200` (always — to prevent JazzCash retry):
```json
{ "received": true, "success": true, "amountCredited": 1500 }
```

---

### `GET /api/payment/jazzcash/status/:txnRefNo`

**Auth:** Required

Response `200`:
```json
{
  "id": 99,
  "status": "COMPLETED",
  "pp_ResponseCode": "000",
  "requested_amount_pkr": "1500.00",
  "applied_amount_pkr": "1500.00",
  "created_at": "2026-05-10T12:00:00Z",
  "completed_at": "2026-05-10T12:01:30Z"
}
```

---

## 8. Security Requirements

All items below are **mandatory**. PR will be rejected if any are unmet.

| # | Requirement | How Verified |
|---|---|---|
| S1 | `JAZZCASH_HASH_KEY` and `JAZZCASH_PASSWORD` never appear in source code or git history | `git log -p \| grep HASH_KEY` returns nothing |
| S2 | HMAC verified via `crypto.timingSafeEqual()` before any DB write in callback | Code review |
| S3 | Same `pp_TxnRefNo` cannot update `families.wallet_balance` twice | Idempotency test in `service.test.ts` |
| S4 | `jazzcash_payment_intents.pp_TxnRefNo` has `UNIQUE` constraint | Migration verified |
| S5 | Rate limiter on `/api/payment/jazzcash/initiate` (max 5/min per IP) | Load test: 6th request returns 429 |
| S6 | All JazzCash API calls over HTTPS only | Review `JAZZCASH_*_URL` env values |
| S7 | `raw_callback_payload` stored for every callback (success and failure) | DB query post-test |
| S8 | Wallet balance never goes negative (`Math.max(available, 0)` in existing `payFamily()`) | Existing logic — verify unchanged |
| S9 | `jazzcash_payment_intents` records never deleted — audit trail permanent | No DELETE queries on this table |
| S10 | Callback returns HTTP 200 always (even on HMAC failure) to prevent JazzCash retry storms — but logs the violation | Confirmed in `routes.ts` and `logger` calls |

---

## 9. Testing Plan

### Unit Tests (must pass before PR)

| Test File | Tests | Expected |
|---|---|---|
| `hash.test.ts` | HMAC generation, sorting, exclusions, verification, tamper detection | 7/7 pass |
| `service.test.ts` | initiatePayment (valid, zero amount, unknown family) | 3/3 pass |
| `service.test.ts` | processCallback (success, duplicate, tampered HMAC, failure code) | 4/4 pass |

### Integration Tests (must pass before merge)

| Test | Env | Expected |
|---|---|---|
| Sandbox E2E: initiate → checkout → callback → DB | Sandbox | `intent.status = COMPLETED`, `wallet_balance` incremented |
| Duplicate callback | Sandbox | Second call returns `alreadyProcessed: true`, no DB change |
| HMAC tamper | Any | `SECURITY_VIOLATION` error, `intent.status` unchanged |
| `payFamily()` settlement | Sandbox | Fee `status` transitions: `Unpaid → Partially Paid / Paid` |
| Partial top-up (wallet < total fees) | Sandbox | FIFO partial settlement — oldest fees paid first |

### JazzCash Sandbox Response Codes to Cover

| `pp_ResponseCode` | Meaning | Expected `intent.status` |
|---|---|---|
| `000` | Success | `COMPLETED` |
| `121` | Transaction failed | `FAILED` |
| `157` | Invalid hash | Should never arrive (HMAC mismatch caught locally) |
| `200` | Cancelled by user | `FAILED` |
| `400` | Invalid merchant | `FAILED` |

---

## 10. GitHub Workflow

### Branches

```
main
 └── develop
       └── feature/jazzcash-mcp-integration   ← work here
```

### Commit Convention (Conventional Commits)

```bash
feat(payments): add jazzcash_payment_intents migration
feat(payments): add JazzCashService with HMAC hash utilities
feat(routes): add JazzCash initiate, callback, and status routes
feat(env): add JAZZCASH_* vars to .env.example
test(payments): add hash unit tests — 7 passing
test(payments): add service unit tests — 7 passing
test(payments): add sandbox E2E integration test
docs: add jazzcash_setup.md operator guide
chore: add express-rate-limit dependency
```

### Pull Request Template

```markdown
## feat(payments): JazzCash MCP Wallet Integration

### Summary
Integrates JazzCash MCP wallet top-up into School Nexus.
Parents can pay school fees via JazzCash; wallet is credited and
existing `payFamily()` auto-settles outstanding fees.

### Files Changed
- `server/services/jazzcashService.ts` — NEW
- `server/routes.ts` — 3 new routes added
- `migrations/0025_jazzcash_integration.sql` — NEW
- `.env.example` — JAZZCASH_* vars added
- `tests/jazzcash/` — NEW (3 test files)

### Checklist
- [ ] `npm test` — all tests passing
- [ ] Sandbox E2E test completed
- [ ] `git log -p | grep HASH_KEY` — returns nothing
- [ ] No changes to existing `payFamily()` logic
- [ ] Rate limiting tested (6th req → 429)
- [ ] Duplicate callback idempotency tested
- [ ] Migration tested on staging DB
```

---

## 11. Environment Variables

| Variable | Required | Example | Notes |
|---|---|---|---|
| `JAZZCASH_MODE` | ✅ | `sandbox` | `sandbox` or `production` |
| `JAZZCASH_MERCHANT_ID` | ✅ | `MC12345` | From JazzCash merchant portal |
| `JAZZCASH_PASSWORD` | ✅ | `••••••••` | API password — never log |
| `JAZZCASH_HASH_KEY` | ✅ | `••••••••` | HMAC key — never log or commit |
| `JAZZCASH_SANDBOX_URL` | ✅ | `https://sandbox.jazzcash.com.pk/...` | JazzCash sandbox endpoint |
| `JAZZCASH_PRODUCTION_URL` | ✅ | `https://payments.jazzcash.com.pk/...` | JazzCash live endpoint |
| `JAZZCASH_RETURN_URL` | ✅ | `https://school.pk/api/payment/jazzcash/callback` | Must be HTTPS, registered in JazzCash portal |

**Register merchant account:** Contact `MFS-SPU@jazz.com.pk` or `merchantsupport@jazz.com.pk`
**Developer portal:** `developer.jazzcash.com.pk`

---

## 12. Go-Live Checklist

```
PRE-DEVELOPMENT
[ ] JazzCash merchant account approved — sandbox credentials in hand
[ ] JAZZCASH_RETURN_URL domain registered in JazzCash merchant portal (sandbox)
[ ] Migration 0025 applied to development DB

DEVELOPMENT
[ ] jazzcashService.ts created and compiles with zero TS errors
[ ] All 7 hash.test.ts tests passing
[ ] All 7 service.test.ts tests passing
[ ] 3 new routes added to routes.ts — no existing routes broken

SANDBOX TESTING
[ ] E2E sandbox: initiate → JazzCash checkout → callback → DB updated
[ ] families.wallet_balance incremented correctly (paisas → PKR conversion)
[ ] payFamily() triggered — fees settled from wallet (FIFO order verified)
[ ] familyTransactions record: type = 'jazzcash_topup', method = 'JazzCash'
[ ] jazzcash_payment_intents record: status = 'COMPLETED'
[ ] Duplicate callback returns alreadyProcessed: true — no double credit
[ ] Tampered pp_SecureHash rejected with SECURITY_VIOLATION log
[ ] Rate limit: 6th request within 1 minute returns HTTP 429
[ ] Partial top-up: FIFO applied correctly across multiple students

SECURITY
[ ] git log -p | grep -i "HASH_KEY\|jazzcash_password" → 0 results
[ ] No JAZZCASH_* values in .env.example (only key names, blank values)
[ ] Production .env on server only — not in repo
[ ] HTTPS-only URLs in all JAZZCASH_*_URL env vars

PRODUCTION
[ ] JAZZCASH_MODE=production in production .env
[ ] Production JAZZCASH_RETURN_URL registered in JazzCash merchant portal
[ ] Migration 0025 applied to production DB
[ ] First live transaction monitored end-to-end
[ ] School admin notified — JazzCash payments active
```

---

*Document version 1.0 — School Nexus JazzCash MCP Integration — May 2026*
*Confidential: Internal developer reference only*
