import assert from "node:assert/strict";
import test from "node:test";
import { generateJazzCashHash } from "../../jazzcashService.js";

const HASH_KEY = process.env.JAZZCASH_HASH_KEY || "test_hash_key";

test("initiatePayment throws for amount <= 0", async () => {
  const { jazzCashService } = await import("../../jazzcashService.js");
  await assert.rejects(
    () =>
      jazzCashService.initiatePayment({
        familyId: 1,
        amountPKR: 0,
        initiatedByUserId: 2,
      }),
    /Payment amount must be greater than 0/
  );
});

test("initiatePayment throws for amount exceeding limit", async () => {
  const { jazzCashService } = await import("../../jazzcashService.js");
  await assert.rejects(
    () =>
      jazzCashService.initiatePayment({
        familyId: 1,
        amountPKR: 1_000_000,
        initiatedByUserId: 2,
      }),
    /Payment amount exceeds maximum limit/
  );
});

test("generates valid hash with merchant credentials", () => {
  const params = {
    pp_MerchantID: "MC12345",
    pp_Password: "pass123",
    pp_Amount: "50000",
    pp_TxnRefNo: "SNXJC202605101200000000001",
  };
  const hash = generateJazzCashHash(params, HASH_KEY);
  assert.match(hash, /^[A-F0-9]{64}$/);
});
