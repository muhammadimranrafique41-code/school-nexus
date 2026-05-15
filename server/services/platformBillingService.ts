import { db, pool } from "../db.js";
import { eq } from "drizzle-orm";
import { campuses, billingRecords, platformSettings } from "../../shared/schema.js";
import { AppError } from "../errors.js";
import { buildTxnRefNo, buildCheckoutForm } from "./jazzcashService.js";

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

  const monthLabel = MONTH_NAMES[record.billingMonth - 1] ?? "Unknown";
  const billReference = `PLAT-${billingRecordId}`;

  const { checkoutUrl, formParams } = buildCheckoutForm({
    txnRefNo,
    amountPKR,
    billReference,
    description: `Platform Fee - ${monthLabel} ${record.billingYear}`,
  });

  console.info({ intentId, txnRefNo, amountPKR, billingRecordId }, "Platform JazzCash payment intent created");

  return { checkoutUrl, formParams, txnRefNo, intentId };
}

const PLAN_FEE_KEYS: Record<string, string> = {
  STARTER: "monthly_fee_pkr",
  PROFESSIONAL: "professional_fee_pkr",
  ENTERPRISE: "enterprise_fee_pkr",
};

export async function createPlatformBillingAndPay(
  plan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE",
  userId: number
): Promise<{
  checkoutUrl: string;
  formParams: Record<string, string>;
  txnRefNo: string;
  intentId: number;
  billingRecordId: number;
  amountPKR: number;
  plan: string;
}> {
  const feeKey = PLAN_FEE_KEYS[plan];
  if (!feeKey) throw new AppError("Invalid plan", "INVALID_PLAN", 400);

  const [feeSetting] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, feeKey))
    .limit(1);

  if (!feeSetting) throw new AppError("Fee configuration not found for plan", "CONFIG_ERROR", 500);
  const amountPKR = Number(feeSetting.value);
  if (amountPKR <= 0) throw new AppError("Invalid fee amount", "CONFIG_ERROR", 500);
  const amountPaise = Math.round(amountPKR * 100);

  const ownerCampuses = await db
    .select({ id: campuses.id })
    .from(campuses)
    .where(eq(campuses.ownerId, userId))
    .limit(1);

  if (ownerCampuses.length === 0) throw new AppError("No campus found for your account", "NO_CAMPUS", 400);
  const campus = ownerCampuses[0];

  const now = new Date();
  const billingMonth = now.getMonth() + 1;
  const billingYear = now.getFullYear();
  const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 10).toISOString().split("T")[0];

  const [billingRecord] = await db
    .insert(billingRecords)
    .values({
      campusId: campus.id,
      amountPaise,
      currency: "PKR",
      status: "PENDING",
      billingMonth,
      billingYear,
      dueDate,
    })
    .returning();

  if (!billingRecord) throw new AppError("Failed to create billing record", "DB_ERROR", 500);

  const intentRes = await pool.query(
    `INSERT INTO jazzcash_payment_intents
     (billing_record_id, pp_TxnRefNo, requested_amount_pkr, status, initiated_by_user_id, idempotency_key)
     VALUES ($1, 'PLACEHOLDER', $2, 'PENDING', $3, $4)
     RETURNING id`,
    [billingRecord.id, amountPKR, userId, `SUB-${billingRecord.id}-${Date.now()}`]
  );
  const intentId = intentRes.rows[0].id as number;

  const txnRefNo = buildTxnRefNo(intentId);
  await pool.query("UPDATE jazzcash_payment_intents SET pp_TxnRefNo = $1 WHERE id = $2", [txnRefNo, intentId]);

  const monthLabel = MONTH_NAMES[billingMonth - 1] ?? "Unknown";
  const billReference = `SUB-${billingRecord.id}`;

  const { checkoutUrl, formParams } = buildCheckoutForm({
    txnRefNo,
    amountPKR,
    billReference,
    description: `${plan} Plan - ${monthLabel} ${billingYear}`,
  });

  console.info({ intentId, txnRefNo, amountPKR, billingRecordId: billingRecord.id, plan }, "Platform subscription payment intent created");

  return { checkoutUrl, formParams, txnRefNo, intentId, billingRecordId: billingRecord.id, amountPKR, plan };
}
