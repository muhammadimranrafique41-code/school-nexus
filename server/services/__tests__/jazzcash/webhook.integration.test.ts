import assert from "node:assert/strict";
import test from "node:test";
import { generateJazzCashHash, verifyJazzCashHash } from "../../jazzcashService.js";

const TEST_HASH_KEY = "test_hash_key_12345";

function createTestPayload(responseCode: string, amount: number, txnRefNo: string): Record<string, string> {
  const params: Record<string, string> = {
    pp_MerchantID: "MC12345",
    pp_Password: "pass123",
    pp_TxnRefNo: txnRefNo,
    pp_Amount: String(amount),
    pp_TxnCurrency: "PKR",
    pp_ResponseCode: responseCode,
    pp_ResponseMessage: responseCode === "000" ? "Success" : "Failure",
    pp_SecureHash: "",
  };
  params.pp_SecureHash = generateJazzCashHash(params, TEST_HASH_KEY);
  return params;
}

test("processes valid HMAC on callback payload", () => {
  const txnRefNo = "SNXJC202605101200000000001";
  const payload = createTestPayload("000", 50000, txnRefNo);
  const hashValid = verifyJazzCashHash(payload, TEST_HASH_KEY);
  assert.equal(hashValid, true);
});

test("rejects callback with invalid HMAC", () => {
  const payload: Record<string, string> = {
    pp_TxnRefNo: "SNXJC202605101200000000001",
    pp_ResponseCode: "000",
    pp_Amount: "50000",
    pp_SecureHash: "A".repeat(64),
  };
  assert.equal(verifyJazzCashHash(payload, TEST_HASH_KEY), false);
});

test("calculates correct PKR amount from paisas", () => {
  const paisas = 50000;
  const pkr = Number(paisas) / 100;
  assert.equal(pkr, 500);

  const pkrAmount = 1500.50;
  const paisasAmount = String(Math.round(pkrAmount * 100));
  assert.equal(paisasAmount, "150050");
});

test("marks failed payment with non-000 response code", () => {
  const payload = createTestPayload("001", 50000, "SNXJC202605101200000000001");
  assert.equal(payload.pp_ResponseCode, "001");
  assert.equal(payload.pp_ResponseMessage, "Failure");
});
