# JazzCash MCP Integration - Setup Guide

## Overview

JazzCash MCP integration adds external payment gateway capability to School-Nexus, allowing families to top up their wallet balance via JazzCash mobile wallet payments.

## Architecture

```
Parent App → POST /api/payment/jazzcash/initiate → JazzCash Gateway
                                              ↓
JazzCash Gateway → POST /api/payment/jazzcash/callback → jazzCashService
                                              ↓
                                        creditFamilyWallet()
                                              ↓
payFamily() (existing fee settlement engine - unchanged)
```

## Environment Variables

Add the following to `.env.local`:

```env
JAZZCASH_MERCHANT_ID=your_merchant_id
JAZZCASH_PASSWORD=your_api_password
JAZZCASH_HASH_KEY=your_secure_hash_key
JAZZCASH_MODE=sandbox # or 'production'
JAZZCASH_SANDBOX_URL=https://sandbox.jazzcash.com/gateway-api/rest/simple/MobileWap/SnapServlet
JAZZCASH_PRODUCTION_URL=https://jazzcash.com/gateway-api/rest/simple/MobileWap/SnapServlet
JAZZCASH_RETURN_URL=http://localhost:3000/api/payment/jazzcash/callback
```

## Database Migration

Run the migration:

```bash
npx drizzle-kit migrate
```

This creates the `jazzcash_payment_intents` table and adds the `jazzcash_intent_id` column to `family_transactions`.

## API Endpoints

### POST /api/payment/jazzcash/initiate

Initiates a JazzCash payment.

**Request**:
```json
{
  "familyId": 1,
  "amountPKR": 1500.00,
  "initiatedByUserId": 2,
  "description": "School Fee Payment - Term 1"
}
```

**Response**:
```json
{
  "checkoutUrl": "https://sandbox.jazzcash.com/...",
  "formParams": {
    "pp_MerchantID": "MC12345",
    "pp_Amount": "150000",
    "pp_SecureHash": "...",
    ...
  },
  "txnRefNo": "SNXJC202605101200000000001",
  "intentId": 1
}
```

### POST /api/payment/jazzcash/callback

Receives JazzCash webhook callback.

**Payload**:
```json
{
  "pp_TxnRefNo": "SNXJC202605101200000000001",
  "pp_ResponseCode": "000",
  "pp_ResponseMessage": "Success",
  "pp_Amount": "150000",
  "pp_TxnCurrency": "PKR",
  "pp_SecureHash": "..."
}
```

**Response**:
```json
{
  "success": true,
  "intentId": 1,
  "amountCredited": 1500.00,
  "settlementResult": { ... }
}
```

### GET /api/payment/jazzcash/status

Checks payment status.

**Query**:
```
?txnRefNo=SNXJC202605101200000000001&familyId=1
```

## Key Features

- **HMAC-SHA256 Verification**: All callbacks verified before processing
- **Idempotency**: Safe to retry callbacks with same txnRefNo
- **Wallet Credit**: Credits family.walletBalance after successful payment
- **Automatic Settlement**: Calls existing payFamily() to settle outstanding fees
- **Audit Trail**: Full callback payload stored in raw_callback_payload
- **Unit Tests**: Hash verification, idempotency, amount conversion tests

## Testing

Run tests:

```bash
npm test -- --testPathPattern="jazzcash"
```

## Security Notes

- HMAC key never exposed to client
- Callbacks verified before any database write
- Idempotency prevents double-crediting
- All transactions logged with full callback data

## Amount Handling

JazzCash uses paisas (1 PKR = 100 paisas).

```typescript
// JazzCash → School Nexus
const amountPKR = Number(pp_Amount) / 100; // 50000 paisas → 500.00 PKR

// School Nexus → JazzCash
const amountPaisas = String(Math.round(amountPKR * 100)); // 500.00 PKR → "50000"
```

## Integration with Existing System

The existing `payFamily()` function handles all fee settlement logic:
- FIFO fee application (ordered by dueDate ASC, id ASC)
- Partial payments across multiple students
- Atomic DB transactions
- Status transitions (Unpaid → Partially Paid → Paid → Overdue)
- Ledger entries in financeLedgerEntries
- familyTransactions allocation JSON audit trail

JazzCash MCP only credits the wallet; existing fee settlement is unchanged.