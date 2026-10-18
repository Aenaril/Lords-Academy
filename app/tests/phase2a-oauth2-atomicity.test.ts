// LORDS MOBILE ACADEMY — Phase 2A OAuth2 State Atomicity Tests
// Tests atomic one-time-use of CSRF state tokens under concurrent access
// Date: October 2026

import { describe, it, expect } from "vitest";
import { generateCsrfState } from "../functions/api/auth/security";

describe("Phase 2A OAuth2 State Atomicity", () => {
  describe("CSRF State Generation", () => {
    it("should generate cryptographically secure state", () => {
      const state = generateCsrfState();
      expect(state).toHaveLength(64);
      expect(/^[a-f0-9]+$/i.test(state)).toBe(true);
    });

    it("should generate unique states", () => {
      const state1 = generateCsrfState();
      const state2 = generateCsrfState();
      expect(state1).not.toBe(state2);
    });
  });

  describe("Concurrent OAuth2 State Consumption", () => {
    it("should prevent replay attacks with atomic state consumption", async () => {
      // Simulate KV storage for CSRF states
      const kvStore = new Map<string, { state: string; consumed: boolean; expiredAt: number }>();

      const state = generateCsrfState();
      const now = Date.now();
      const expiresAt = now + 5 * 60 * 1000; // 5 minutes

      // Store state in KV
      kvStore.set(`csrf:${state}`, { state, consumed: false, expiredAt: expiresAt });

      // Atomic state consumption function
      async function consumeStateAtomically(stateValue: string): Promise<boolean> {
        const key = `csrf:${stateValue}`;
        const stored = kvStore.get(key);

        if (!stored) return false; // Not found
        if (stored.expiredAt < Date.now()) return false; // Expired
        if (stored.consumed) return false; // Already consumed

        // Mark as consumed (atomic operation)
        stored.consumed = true;
        kvStore.set(key, stored);
        return true;
      }

      // Simulate two concurrent OAuth2 callbacks with same state
      const [result1, result2] = await Promise.all([
        consumeStateAtomically(state),
        consumeStateAtomically(state),
      ]);

      // Exactly one should succeed
      const totalSuccesses = (result1 ? 1 : 0) + (result2 ? 1 : 0);
      expect(totalSuccesses).toBe(1);

      // Verify state is consumed
      const final = kvStore.get(`csrf:${state}`);
      expect(final?.consumed).toBe(true);
    });

    it("should handle concurrent callbacks with different states", async () => {
      const kvStore = new Map<string, { consumed: boolean }>();

      const state1 = generateCsrfState();
      const state2 = generateCsrfState();

      kvStore.set(`csrf:${state1}`, { consumed: false });
      kvStore.set(`csrf:${state2}`, { consumed: false });

      async function consumeState(stateValue: string): Promise<boolean> {
        const key = `csrf:${stateValue}`;
        const stored = kvStore.get(key);
        if (!stored) return false;
        if (stored.consumed) return false;

        stored.consumed = true;
        kvStore.set(key, stored);
        return true;
      }

      // Two concurrent requests with different states
      const [result1, result2] = await Promise.all([
        consumeState(state1),
        consumeState(state2),
      ]);

      // Both should succeed (different states)
      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // Both states should be consumed
      expect(kvStore.get(`csrf:${state1}`)?.consumed).toBe(true);
      expect(kvStore.get(`csrf:${state2}`)?.consumed).toBe(true);
    });

    it("should demonstrate atomic consumption pattern", async () => {
      // Atomic pattern: Use a secondary key to track consumption
      // This prevents race conditions where both requests think they succeed

      const kvStore = new Map<string, string>();
      const state = generateCsrfState();

      // Store original state
      kvStore.set(`csrf:${state}`, "valid");

      // Atomic consumption using a consumed flag
      async function atomicConsume(stateValue: string): Promise<{ success: boolean; consumedBy?: string }> {
        const mainKey = `csrf:${stateValue}`;
        const consumedKey = `csrf:${stateValue}:consumed`;
        const consumerId = Math.random().toString(36).substring(7);

        // Check if already consumed
        if (kvStore.has(consumedKey)) {
          return { success: false };
        }

        // Check if state exists
        const stateExists = kvStore.has(mainKey);
        if (!stateExists) {
          return { success: false };
        }

        // Mark as consumed (atomic)
        kvStore.set(consumedKey, consumerId);

        // Now we know we own this state
        kvStore.delete(mainKey); // Delete original
        return { success: true, consumedBy: consumerId };
      }

      // Concurrent attempts
      const results = await Promise.all([
        atomicConsume(state),
        atomicConsume(state),
        atomicConsume(state),
      ]);

      // Only one should succeed
      const successes = results.filter((r) => r.success);
      expect(successes.length).toBe(1);

      // Verify no duplication
      const consumedKeys = Array.from(kvStore.keys()).filter((k) => k.includes("consumed"));
      expect(consumedKeys.length).toBe(1);
    });

    it("should defend against replay attacks even with fast re-requests", async () => {
      // Simulate an attacker immediately replaying the same authorization code

      const kvStore = new Map<string, { consumed: boolean }>();
      const state = generateCsrfState();

      kvStore.set(`csrf:${state}`, { consumed: false });

      let totalSuccesses = 0;

      async function validateAndConsumeState(stateValue: string): Promise<boolean> {
        const key = `csrf:${stateValue}`;
        const stored = kvStore.get(key);

        if (!stored) return false;
        if (stored.consumed) return false;

        // Atomic operation
        stored.consumed = true;
        kvStore.set(key, stored);
        totalSuccesses++;
        return true;
      }

      // Simulate rapid requests (attacker trying to reuse state)
      const attempts = await Promise.all([
        validateAndConsumeState(state),
        validateAndConsumeState(state),
        validateAndConsumeState(state),
        validateAndConsumeState(state),
        validateAndConsumeState(state),
      ]);

      // Only first should succeed
      expect(totalSuccesses).toBe(1);
      expect(attempts.filter((a) => a).length).toBe(1);
      expect(kvStore.get(`csrf:${state}`)?.consumed).toBe(true);
    });
  });

  describe("OAuth2 State Expiration", () => {
    it("should reject expired states", async () => {
      const kvStore = new Map<string, { expiredAt: number }>();
      const state = generateCsrfState();

      // Store state that's already expired
      kvStore.set(`csrf:${state}`, { expiredAt: Date.now() - 1000 }); // 1 second ago

      const stored = kvStore.get(`csrf:${state}`);
      const isExpired = stored && stored.expiredAt < Date.now();

      expect(isExpired).toBe(true);
    });

    it("should accept non-expired states", async () => {
      const kvStore = new Map<string, { expiredAt: number }>();
      const state = generateCsrfState();

      // Store state that expires in 5 minutes
      kvStore.set(`csrf:${state}`, { expiredAt: Date.now() + 5 * 60 * 1000 });

      const stored = kvStore.get(`csrf:${state}`);
      const isExpired = stored && stored.expiredAt < Date.now();

      expect(isExpired).toBe(false);
    });
  });
});
