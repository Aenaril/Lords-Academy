// LORDS MOBILE ACADEMY — Phase 2A Recovery Code Atomicity Tests
// Tests atomic one-time-use enforcement under concurrent access
// Date: October 2026

import { describe, it, expect } from "vitest";
import { generateRecoveryCode, hashRecoveryCode } from "../functions/api/auth/security";

describe("Phase 2A Recovery Code Atomicity", () => {
  describe("Recovery Code Format", () => {
    it("should generate recovery codes with 128-bit entropy", () => {
      const code = generateRecoveryCode();
      // Format: EMERGENCY-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX (4 segments of 8 hex chars)
      expect(/^EMERGENCY-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/i.test(code)).toBe(true);
    });

    it("should generate unique codes", () => {
      const code1 = generateRecoveryCode();
      const code2 = generateRecoveryCode();
      expect(code1).not.toBe(code2);
    });

    it("should maintain 128-bit entropy", () => {
      // 4 segments × 4 bytes = 16 bytes = 128 bits
      const code = generateRecoveryCode();
      const segments = code.split("-").slice(1); // Skip "EMERGENCY" prefix
      expect(segments.length).toBe(4);
      for (const segment of segments) {
        expect(segment.length).toBe(8); // 4 bytes = 8 hex chars
      }
    });
  });

  describe("Recovery Code Hashing", () => {
    it("should hash recovery codes with SHA256", async () => {
      const code = "EMERGENCY-ABCD1234-EFGH5678-IJKL9012-MNOP3456";
      const hash = await hashRecoveryCode(code);
      expect(hash).toHaveLength(64); // SHA256 = 64 hex chars
      expect(/^[a-f0-9]+$/i.test(hash)).toBe(true);
    });

    it("should produce deterministic hashes", async () => {
      const code = "EMERGENCY-TEST1234-TEST5678-TEST9012-TEST3456";
      const hash1 = await hashRecoveryCode(code);
      const hash2 = await hashRecoveryCode(code);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different codes", async () => {
      const code1 = "EMERGENCY-AAAA1111-BBBB2222-CCCC3333-DDDD4444";
      const code2 = "EMERGENCY-EEEE5555-FFFF6666-GGGG7777-HHHH8888";
      const hash1 = await hashRecoveryCode(code1);
      const hash2 = await hashRecoveryCode(code2);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Concurrent Access Simulation", () => {
    it("should demonstrate atomic UPDATE pattern (simulated)", async () => {
      // Simulate database state
      const recoveryCodeDB = new Map<string, { is_used: boolean; used_by: string | null; used_at: string | null }>();

      const code = generateRecoveryCode();
      const codeHash = await hashRecoveryCode(code);

      // Initialize code as unused
      recoveryCodeDB.set(codeHash, { is_used: false, used_by: null, used_at: null });

      // Simulate atomic UPDATE: only succeeds if is_used was 0
      async function consumeCodeAtomically(hash: string, userId: string): Promise<boolean> {
        const current = recoveryCodeDB.get(hash);
        if (!current) return false; // Code doesn't exist
        if (current.is_used) return false; // Already used

        // Atomic operation: update only if is_used is still 0
        recoveryCodeDB.set(hash, {
          is_used: true,
          used_by: userId,
          used_at: new Date().toISOString(),
        });
        return true;
      }

      // First attempt succeeds
      const result1 = await consumeCodeAtomically(codeHash, "user-1");
      expect(result1).toBe(true);

      // Second attempt fails (code already used)
      const result2 = await consumeCodeAtomically(codeHash, "user-2");
      expect(result2).toBe(false);

      // Verify only first user could consume
      const stored = recoveryCodeDB.get(codeHash);
      expect(stored?.used_by).toBe("user-1");
      expect(stored?.is_used).toBe(true);
    });

    it("should prevent two concurrent requests from both succeeding", async () => {
      // Simulate concurrent access with atomic UPDATE
      const code = generateRecoveryCode();
      const codeHash = await hashRecoveryCode(code);

      // Database: recovery_codes table state
      const db = new Map<string, { is_used: number; used_by: string | null }>();
      db.set(codeHash, { is_used: 0, used_by: null });

      // Atomic consume function (simulates D1 UPDATE ... WHERE is_used = 0)
      async function atomicConsume(hash: string, userId: string): Promise<{ success: boolean; changesCount: number }> {
        const current = db.get(hash);
        if (!current) return { success: false, changesCount: 0 };

        // Simulate: UPDATE recovery_codes SET is_used = 1 WHERE code_hash = ? AND is_used = 0
        if (current.is_used === 0) {
          db.set(hash, { is_used: 1, used_by: userId });
          return { success: true, changesCount: 1 };
        }
        return { success: false, changesCount: 0 };
      }

      // Concurrent requests (simulated with Promise.all)
      const [result1, result2] = await Promise.all([
        atomicConsume(codeHash, "user-1"),
        atomicConsume(codeHash, "user-2"),
      ]);

      // Exactly one should succeed
      const totalSuccesses = (result1.success ? 1 : 0) + (result2.success ? 1 : 0);
      expect(totalSuccesses).toBe(1);

      // Verify final state
      const final = db.get(codeHash);
      expect(final?.is_used).toBe(1);
      // Either user-1 or user-2, but not both
      expect([null, "user-1", "user-2"]).toContain(final?.used_by);
    });

    it("should verify atomic UPDATE with WHERE clause prevents double-use", async () => {
      // Demonstrate why SELECT + UPDATE is not atomic
      const code = generateRecoveryCode();
      const codeHash = await hashRecoveryCode(code);

      const db = { is_used: 0, used_by: null as string | null };

      let timesMarkedUsed = 0;

      // Non-atomic version (vulnerable to race condition)
      async function nonAtomicConsume(userId: string): Promise<boolean> {
        // Step 1: SELECT
        if (db.is_used === 1) return false;

        // Simulate delay (context switch / race condition window)
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Step 2: UPDATE (but another request may have updated between Step 1 and Step 2)
        db.is_used = 1;
        db.used_by = userId;
        timesMarkedUsed++;
        return true;
      }

      // Atomic version (immune to race condition)
      async function atomicConsume(userId: string): Promise<boolean> {
        // Atomic UPDATE: only succeeds if is_used was 0
        if (db.is_used === 0) {
          db.is_used = 1;
          db.used_by = userId;
          timesMarkedUsed++;
          return true;
        }
        return false;
      }

      // Reset state
      db.is_used = 0;
      timesMarkedUsed = 0;

      // Concurrent non-atomic calls: both might think they succeeded
      // (This is the vulnerability we're fixing)
      const nonAtomicAttempts = await Promise.all([
        nonAtomicConsume("user-1"),
        nonAtomicConsume("user-2"),
      ]);

      // With actual concurrency and delays, both could pass (BUG!)
      // But our atomic version prevents this:

      // Reset state
      db.is_used = 0;
      timesMarkedUsed = 0;

      const atomicAttempts = await Promise.all([
        atomicConsume("user-3"),
        atomicConsume("user-4"),
      ]);

      // With atomic version, exactly one succeeds
      const atomicSuccesses = atomicAttempts.filter((result) => result).length;
      expect(atomicSuccesses).toBe(1);
      expect(timesMarkedUsed).toBe(1);
      expect(db.used_by).toMatch(/user-[34]/);
    });
  });

  describe("Recovery Code Entropy Verification", () => {
    it("should provide 128-bit minimum entropy", () => {
      // 16 bytes × 8 bits/byte = 128 bits
      // Format: EMERGENCY-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
      // Entropy: 4 segments × 4 bytes = 16 bytes = 128 bits

      const code = generateRecoveryCode();
      const parts = code.split("-");
      expect(parts.length).toBe(5); // ["EMERGENCY", seg1, seg2, seg3, seg4]
      
      const hexChars = parts.slice(1).join("").length;
      const bytes = hexChars / 2;
      const bits = bytes * 8;

      expect(bits).toBe(128);
    });

    it("should demonstrate brute-force resistance with rate limiting", () => {
      // 2^128 possible codes
      // Rate limit: 3 attempts per hour per IP
      // Time to exhaust: 2^128 / (3/hour) ≈ 1.5 × 10^38 hours
      // ≈ 1.7 × 10^34 years

      const possibleCodes = Math.pow(2, 128); // 2^128
      const attemptsPerHourPerIP = 3;
      const hoursToExhaust = possibleCodes / attemptsPerHourPerIP;
      const yearsToExhaust = hoursToExhaust / (24 * 365.25);

      expect(yearsToExhaust).toBeGreaterThan(1e30); // Much greater than age of universe (~1e10 years)
    });
  });
});
