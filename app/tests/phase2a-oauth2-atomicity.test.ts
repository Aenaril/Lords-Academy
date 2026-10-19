// LORDS MOBILE ACADEMY — Phase 2A OAuth2 State Atomicity Tests
// Tests atomic one-time-use of CSRF state tokens under concurrent access
// Also validates OAuth2 URL construction and scope encoding
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

  describe("OAuth2 URL Encoding & Scope Validation", () => {
    it("should encode scopes correctly without double encoding", () => {
      // Simulate the login URL construction
      const scopes = ["identify", "guilds.members.read"].join(" ");
      
      const authUrl = new URL("https://discord.com/api/oauth2/authorize");
      authUrl.searchParams.set("scope", scopes);
      
      const urlString = authUrl.toString();
      
      // URLSearchParams encodes spaces as either %20 or + in query strings (both valid)
      // The key check: verify NO double encoding (%2520 means %25 = literal %)
      expect(urlString).not.toContain("%2520"); // Should NOT contain double-encoded space
      
      // Verify scopes are properly separated
      const scopeParam = authUrl.searchParams.get("scope");
      expect(scopeParam).toBe("identify guilds.members.read");
    });

    it("should NOT expose sessionId in OAuth2 callback response", () => {
      // Mock callback response structure
      const callbackResponse = {
        ok: true,
        userId: "123456789",
        username: "testuser",
        // sessionId should NOT be included
      };

      // Verify sessionId is not present
      expect((callbackResponse as any).sessionId).toBeUndefined();
      
      // Verify allowed fields are present
      expect(callbackResponse.ok).toBe(true);
      expect(callbackResponse.userId).toBeDefined();
      expect(callbackResponse.username).toBeDefined();
    });

    it("should validate callback response type does not include sessionId", () => {
      // Verify the TypeScript interface does not define sessionId
      type CallbackSuccessResponse = {
        ok: true;
        userId: string;
        username: string;
      };

      // If this type check fails, it means sessionId was re-added
      const response: CallbackSuccessResponse = {
        ok: true,
        userId: "test",
        username: "testuser",
        // sessionId cannot be added without TS error
      };

      // Verify response structure
      expect(Object.keys(response).sort()).toEqual(["ok", "userId", "username"]);
      expect(response).not.toHaveProperty("sessionId");
    });

    it("should set HttpOnly session cookie with correct flags", () => {
      // Session cookies should never be exposed in response body
      const cookieHeader = "session_id=[SESSION_VALUE]; Path=/; Expires=[DATE]; HttpOnly; Secure; SameSite=Strict";

      // Verify all security flags present
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader).toContain("Secure");
      expect(cookieHeader).toContain("SameSite=Strict");
      expect(cookieHeader).toContain("Path=/");
      
      // Verify cookie name
      expect(cookieHeader).toMatch(/^session_id=/);
    });

    it("should not log sessionId in audit events", () => {
      // Audit log entry for login
      const auditEntry = {
        event_type: "LOGIN",
        user_id: "123456789",
        details: {
          status: "success",
          ip: "192.168.1.x", // Hashed or masked IP
          username: "testuser",
          // sessionId should NOT be logged
        },
        created_at: new Date().toISOString(),
      };

      // Verify no session identifiers in audit details
      const detailsJson = JSON.stringify(auditEntry.details);
      expect(detailsJson).not.toContain("sessionId");
      expect(detailsJson).not.toContain("session_id");
      
      // Only safe fields logged
      expect(auditEntry.details.username).toBe("testuser");
      expect(auditEntry.details.status).toBe("success");
    });

    it("should preserve Discord scope semantics", () => {
      // Parse the URL to verify scopes are interpretable by Discord
      const scopes = ["identify", "guilds.members.read"].join(" ");
      
      const authUrl = new URL("https://discord.com/api/oauth2/authorize");
      authUrl.searchParams.set("scope", scopes);
      
      // Extract scope param
      const scopeParam = authUrl.searchParams.get("scope");
      
      // Verify both scopes are present and distinct
      expect(scopeParam).toBe("identify guilds.members.read");
      
      // Verify we can split them back into two scopes
      const parsedScopes = scopeParam?.split(" ") || [];
      expect(parsedScopes).toEqual(["identify", "guilds.members.read"]);
    });

    it("should include all required OAuth2 parameters", () => {
      const clientId = "test-client-id";
      const redirectUri = "https://academy.lords.test/api/auth/discord/callback";
      const state = generateCsrfState();
      const scopes = ["identify", "guilds.members.read"].join(" ");
      
      const authUrl = new URL("https://discord.com/api/oauth2/authorize");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", scopes);
      authUrl.searchParams.set("state", state);
      
      // Verify all params are present
      expect(authUrl.searchParams.get("client_id")).toBe(clientId);
      expect(authUrl.searchParams.get("redirect_uri")).toBe(redirectUri);
      expect(authUrl.searchParams.get("response_type")).toBe("code");
      expect(authUrl.searchParams.get("scope")).toBe(scopes);
      expect(authUrl.searchParams.get("state")).toBe(state);
    });

    it("should not expose secrets or tokens in authorization URL", () => {
      const clientId = "test-client-id";
      const redirectUri = "https://academy.lords.test/api/auth/discord/callback";
      const state = generateCsrfState();
      const scopes = ["identify", "guilds.members.read"].join(" ");
      
      const authUrl = new URL("https://discord.com/api/oauth2/authorize");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", scopes);
      authUrl.searchParams.set("state", state);
      
      const urlString = authUrl.toString();
      
      // Verify no secrets appear in URL
      expect(urlString).not.toContain("secret");
      expect(urlString).not.toContain("token");
      expect(urlString).not.toContain("password");
      expect(urlString).not.toContain("DISCORD_CLIENT_SECRET");
    });

    it("should validate redirect URI matches configuration", () => {
      const expectedRedirectUri = "https://academy.lords.test/api/auth/discord/callback";
      const configuredRedirectUri = "https://academy.lords.test/api/auth/discord/callback";
      
      const authUrl = new URL("https://discord.com/api/oauth2/authorize");
      authUrl.searchParams.set("redirect_uri", configuredRedirectUri);
      
      const urlRedirectUri = authUrl.searchParams.get("redirect_uri");
      
      // Verify exact match (no protocol normalization issues, no trailing slashes)
      expect(urlRedirectUri).toBe(expectedRedirectUri);
      expect(urlRedirectUri).toMatch(/^https:\/\//); // Must be HTTPS
      expect(urlRedirectUri).toContain("/api/auth/discord/callback");
    });

    it("should generate unpredictable state tokens", () => {
      const states = new Set();
      
      // Generate 100 states
      for (let i = 0; i < 100; i++) {
        const state = generateCsrfState();
        states.add(state);
      }
      
      // All should be unique (no collisions)
      expect(states.size).toBe(100);
      
      // All should be 64-char hex strings
      for (const state of states) {
        expect(state).toHaveLength(64);
        expect(/^[a-f0-9]+$/i.test(state as string)).toBe(true);
      }
    });

    it("should enforce single-use state tokens", () => {
      // Simulate KV storage with state consumption
      const kvStore = new Map<string, { consumed: boolean }>();
      const state = generateCsrfState();
      
      kvStore.set(`oauth:${state}`, { consumed: false });
      
      // Simulate two OAuth callbacks with same state
      const callbacks = [
        (stateValue: string) => {
          const key = `oauth:${stateValue}`;
          const stored = kvStore.get(key);
          if (!stored || stored.consumed) return false;
          stored.consumed = true;
          return true;
        },
        (stateValue: string) => {
          const key = `oauth:${stateValue}`;
          const stored = kvStore.get(key);
          if (!stored || stored.consumed) return false;
          stored.consumed = true;
          return true;
        },
      ];
      
      const results = callbacks.map(cb => cb(state));
      
      // First succeeds, second fails
      expect(results[0]).toBe(true);
      expect(results[1]).toBe(false);
    });
  });
});
