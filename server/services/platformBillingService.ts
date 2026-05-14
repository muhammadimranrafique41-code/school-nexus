import crypto from "crypto";
import { db } from "../db.js";
import { eq, and, sql } from "drizzle-orm";
import { campuses, billingRecords } from "../../shared/schema.js";
import { AppError } from "../errors.js";
import { generateJazzCashHash } from "./jazzcashService.js";

function buildTxnRefNo(intentId: number): string {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `SNXJC${ts}${String(intentId).padStart(5, "0")}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function initiatePlatformPayment(
  billingRecordId: number,
  userId: number
): Promise<{
  checkoutUrl: string;
  formParams: Record<string, string>;
  txnRefNo: string;
  intentId: number;
}> {
  const [record] = await db
    .select({
      id: billingRecords.id,
      amountPaise: billingRecords.amountPaise,
      status: billingRecords.status,
      billingMonth: billingRecords.billingMonth,
      billingYear: billingRecords.billingYear,
      campusId: billingRecords.campusId,
      campusOwnerId: campuses.ownerId,
    })
    .from(billingRecords)
    .innerJoin(campuses, eq(billingRecords.campusId, campuses.id))
    .where(eq(billingRecords.id, billingRecordId))
    .limit(1);

  if (!record) throw new AppError("Billing record not found", "NOT_FOUND", 404);
  if (record.status !== "PENDING" && record.status !== "OVERDUE") {
    throw new AppError("Billing record is not payable", "ALREADY_PAID", 400);
  }
  if (record.campusOwnerId !== userId) {
    throw new AppError("Billing record does not belong to your account", "FORBIDDEN", 403);
  }

  const amountPKR = record.amountPaise / 100;
  if (amountPKR <= 0) throw new AppError("Payment amount must be greater than 0", "INVALID_AMOUNT", 400);
  if (amountPKR > 999999.99) throw new AppError("Payment amount exceeds maximum limit", "AMOUNT_TOO_HIGH", 400);

  const intentRes = await db.query(
    `INSERT INTO jazzcash_payment_intents
     (billing_record_id, pp_TxnRefNo, requested_amount_pkr, status, initiated_by_user_id, idempotency_key)
     VALUES ($1, 'PLACEHOLDER', $2, 'PENDING', $3, $4)
     RETURNING id`,
    [billingRecordId, amountPKR, userId, `PLAT-${billingRecordId}-${Date.now()}`]
  );
  const intentId = intentRes.rows[0].id as number;

  const txnRefNo = buildTxnRefNo(intentId);
  await db.query("UPDATE jazzcash_payment_intents SET pp_TxnRefNo = $1 WHERE id = $2", [txnRefNo, intentId]);

  const txnDateTime = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const amountPaisas = String(Math.round(amountPKR * 100));
  const billReference = `PLAT-${billingRecordId}`;
  const monthLabel = MONTH_NAMES[record.billingMonth - 1] ?? "Unknown";
  const description = `Platform Fee - ${monthLabel} ${record.billingYear}`;

  const params: Record<string, string> = {
    pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID!,
    pp_Password: process.env.JAZZCASH_PASSWORD!,
    pp_TxnRefNo: txnRefNo,
    pp_Amount: amountPaisas,
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: txnDateTime,
    pp_BillReference: billReference,
    pp_Description: description,
    pp_ReturnURL: process.env.JAZZCASH_RETURN_URL!,
    pp_Language: "EN",
    pp_Version: "1.1",
    pp_TxnType: "MWALLET",
  };

  params.pp_SecureHash = generateJazzCashHash(params, process.env.JAZZCASH_HASH_KEY!);

  const gatewayUrl =
    process.env.JAZZCASH_MODE === "production"
      ? process.env.JAZZCASH_PRODUCTION_URL!
      : process.env.JAZZCASH_SANDBOX_URL!;

  console.info({ intentId, txnRefNo, amountPKR, billingRecordId }, "Platform JazzCash payment intent created");

  return { checkoutUrl: gatewayUrl, formParams: params, txnRefNo, intentId };
}
