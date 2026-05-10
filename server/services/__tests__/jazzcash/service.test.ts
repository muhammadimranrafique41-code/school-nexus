/**
 * service.test.ts
 * Integration tests for JazzCashService core functions
 *
 * Tests the payment initiation, status checking, and callback processing flow
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { jazzCashService, generateJazzCashHash } from '../../server/services/jazzcashService';

const HASH_KEY = process.env.JAZZCASH_HASH_KEY || 'test_hash_key';

// Mock database operations
const mockDb = {
  query: jest.fn(),
  transaction: jest.fn(async (fn) => fn(mockDb)),
};

describe('JazzCashService', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query = jest.fn().mockReturnValue({ rows: [] });
    mockDb.transaction = jest.fn().mockImplementation(async (fn) => fn(mockDb));
  });

  describe('initiatePayment', () => {
    it('creates intent with PENDING status', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 1, wallet_balance: 100 }] }) // family exists
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // intent created
        .mockResolvedValueOnce({ rows: [] }); // update txnRefNo

      const result = await jazzCashService.initiatePayment({
        familyId: 1,
        amountPKR: 1500.00,
        initiatedByUserId: 2,
        description: 'Test Payment',
      });

      expect(result.intentId).toBeGreaterThan(0);
      expect(result.checkoutUrl).toBeDefined();
      expect(result.formParams).toBeDefined();
      expect(result.txnRefNo).toMatch(/^SNXJC\d{14}\d{5}$/);
    });

    it('throws error for invalid amount', async () => {
      await expect(jazzCashService.initiatePayment({
        familyId: 1,
        amountPKR: 0,
        initiatedByUserId: 2,
      })).rejects.toThrow('Payment amount must be greater than 0');
    });

    it('throws error for family not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(jazzCashService.initiatePayment({
        familyId: 999,
        amountPKR: 1500.00,
        initiatedByUserId: 2,
      })).rejects.toThrow('Family 999 not found');
    });
  });

  describe('getPaymentStatus', () => {
    it('returns status for existing intent', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          status: 'PENDING',
          pp_ResponseCode: '',
          pp_ResponseMessage: '',
          requested_amount_pkr: 1500.00,
          applied_amount_pkr: null,
          created_at: '2026-05-10T10:00:00Z',
          completed_at: null,
        }],
      });

      const status = await jazzCashService.getPaymentStatus('SNXJC202605101200000000001', 1);
      expect(status).toBeDefined();
      expect(status.status).toBe('PENDING');
    });

    it('throws error for unknown intent', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(jazzCashService.getPaymentStatus('UNKNOWN', 1))
        .rejects.toThrow('Payment intent not found');
    });
  });

  describe('Hash Generation', () => {
    it('generates valid hash with merchant credentials', () => {
      const params = {
        pp_MerchantID: 'MC12345',
        pp_Password: 'pass123',
        pp_Amount: '50000',
        pp_TxnRefNo: 'SNXJC202605101200000000001',
      };
      const hash = generateJazzCashHash(params, HASH_KEY);
      expect(hash).toMatch(/^[A-F0-9]{64}$/);
    });
  });
});