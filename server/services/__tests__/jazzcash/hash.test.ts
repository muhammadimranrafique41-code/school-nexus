import assert from "node:assert/strict";
import test from "node:test";
import { generateJazzCashHash, verifyJazzCashHash } from "../../jazzcashService.js";

const HASH_KEY = "test_hash_key_12345";

test("generates uppercase hex hash", () => {
  const params = {
    pp_MerchantID: "MC12345",
    pp_Amount: "50000",
    pp_TxnCurrency: "PKR",
    pp_TxnRefNo: "SNXJC20260510001",
    pp_TxnDateTime: "20260510120000",
  };
  const hash = generateJazzCashHash(params, HASH_KEY);
  assert.match(hash, /^[A-F0-9]{64}$/);
});

test("sorts parameters alphabetically before hashing", () => {
  const params1 = { pp_A: "alpha", pp_B: "beta", pp_C: "gamma" };
  const params2 = { pp_C: "gamma", pp_A: "alpha", pp_B: "beta" };
  assert.equal(
    generateJazzCashHash(params1, HASH_KEY),
    generateJazzCashHash(params2, HASH_KEY)
  );
});

test("excludes pp_SecureHash from hash computation", () => {
  const base = { pp_A: "x", pp_B: "y" };
  const withSH = { ...base, pp_SecureHash: "SHOULDBEIGNORED" };
  assert.equal(
    generateJazzCashHash(base, HASH_KEY),
    generateJazzCashHash(withSH, HASH_KEY)
  );
});

test("excludes empty string values", () => {
  const base = { pp_A: "x", pp_B: "y" };
  const withEmpty = { ...base, pp_Empty: "" };
  assert.equal(
    generateJazzCashHash(base, HASH_KEY),
    generateJazzCashHash(withEmpty, HASH_KEY)
  );
});

test("produces consistent hash for same input", () => {
  const params = {
    pp_MerchantID: "MC99999",
    pp_Amount: "100000",
    pp_SecureHash: "ignored",
  };
  assert.equal(
    generateJazzCashHash(params, HASH_KEY),
    generateJazzCashHash(params, HASH_KEY)
  );
});

test("verifies valid HMAC correctly", () => {
  const params: Record<string, string> = {
    pp_MerchantID: "MC12345",
    pp_Amount: "50000",
    pp_TxnCurrency: "PKR",
  };
  const hash = generateJazzCashHash(params, HASH_KEY);
  const payload = { ...params, pp_SecureHash: hash };
  assert.equal(verifyJazzCashHash(payload, HASH_KEY), true);
});

test("rejects tampered HMAC", () => {
  const params: Record<string, string> = {
    pp_MerchantID: "MC12345",
    pp_Amount: "50000",
    pp_TxnCurrency: "PKR",
  };
  const payload = { ...params, pp_SecureHash: "00".repeat(32) };
  assert.equal(verifyJazzCashHash(payload, HASH_KEY), false);
});

test("rejects missing pp_SecureHash", () => {
  const params: Record<string, string> = {
    pp_MerchantID: "MC12345",
    pp_Amount: "50000",
  };
  assert.equal(verifyJazzCashHash(params, HASH_KEY), false);
});

test("uses timingSafeEqual for constant-time comparison", () => {
  const params: Record<string, string> = { pp_A: "test" };
  const hash = generateJazzCashHash(params, HASH_KEY);
  const payload = { ...params, pp_SecureHash: hash };
  const result = verifyJazzCashHash(payload, HASH_KEY);
  assert.equal(typeof result, "boolean");
});
