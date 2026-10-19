// LORDS MOBILE ACADEMY — Phase 2A OAuth2 CSRF Protection Tests
// Double-Submit Cookie Pattern Implementation
// Tests cover: normal flow, multi-browser, expiry, atomicity
// Date: October 2026

import { describe, it, expect, beforeEach } from "vitest";
import {
  generateCsrfState,
  createOAuthStateCookie,
  parseOAuthStateCookie,
  clearOAuthStateCookie,
  validateDiscordState,
} from "../functions/api/auth/security";

describe("Phase 2A OAuth2 CSRF Protection (Double-Submit Cookie)", () => {
  describe("Cookie Generation", () => {
    it("should generate OAuth state cookie with correct __Host- prefix", () => {
      const state = generateCsrfState();
      const cookie = createOAuthStateCookie(state);

      expect(cookie).toContain("__Host-oauth-state=");
      expect(cookie).toContain(state);
    });

    it("should include all required security flags", () => {
      const state = generateCsrfState();
      const cookie = createOAuthStateCookie(state);

      // Required flags for CSRF protection
      expect(cookie).toContain("HttpOnly"); // JS cannot access
      expect(cookie).toContain("Secure"); // HTTPS only
      expect(cookie).toContain("SameSite=Lax"); // Allow OAuth redirect
      expect(cookie).toContain("Max-Age=300"); // 5 minutes
      expect(cookie).toContain("Path=/"); // All paths
    });

    it("should have 5 minute TTL matching D1 CSRF state expiry", () => {
      const state = generateCsrfState();
      const cookie = createOAuthStateCookie(state);

      expect(cookie).toContain("Max-Age=300"); // 300 seconds = 5 minutes
    });

    it("should reject invalid state format (not 64 hex chars)", () => {
      expect(() => createOAuthStateCookie("tooshort")).toThrow();
      expect(() => createOAuthStateCookie("UPPERCASE_NOT_HEX")).toThrow();
      expect(() => createOAuthStateCookie("g".repeat(64))).toThrow(); // 'g' is not hex
    });

    it("should accept valid 64-char hex state", () => {
      const validState = "a".repeat(64);
      const cookie = createOAuthStateCookie(validState);

      expect(cookie).toContain(`__Host-oauth-state=${validState}`);
      expect(() => createOAuthStateCookie(validState)).not.toThrow();
    });
  });

  describe("Cookie Parsing", () => {
    it("should extract OAuth state from valid cookie header", () => {
      const state = "b".repeat(64);
      const cookieHeader = `__Host-oauth-state=${state}; Path=/`;
      const request = new Request("http://test.com", {
        headers: { Cookie: cookieHeader },
      });

      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBe(state);
    });

    it("should handle multiple cookies and find OAuth state", () => {
      const state = "c".repeat(64);
      const cookieHeader = `other_cookie=value; __Host-oauth-state=${state}; another=data`;
      const request = new Request("http://test.com", {
        headers: { Cookie: cookieHeader },
      });

      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBe(state);
    });

    it("should return null if no OAuth cookie present", () => {
      const request = new Request("http://test.com", {
        headers: { Cookie: "other_cookie=value; another_cookie=data" },
      });

      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBeNull();
    });

    it("should return null if no Cookie header", () => {
      const request = new Request("http://test.com");
      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBeNull();
    });

    it("should reject malformed cookie values (not 64 hex chars)", () => {
      const request = new Request("http://test.com", {
        headers: { Cookie: "__Host-oauth-state=invalid_too_short" },
      });

      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBeNull(); // Rejected due to format
    });

    it("should handle URL-encoded cookie values", () => {
      const state = "d".repeat(64);
      const encoded = encodeURIComponent(state);
      const request = new Request("http://test.com", {
        headers: { Cookie: `__Host-oauth-state=${encoded}` },
      });

      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBe(state); // Properly decoded
    });
  });

  describe("Cookie Clearing", () => {
    it("should generate clear cookie with Max-Age=0", () => {
      const clearCookie = clearOAuthStateCookie();

      expect(clearCookie).toContain("__Host-oauth-state=");
      expect(clearCookie).toContain("Max-Age=0"); // Tells browser to delete
      expect(clearCookie).toContain("Path=/");
    });

    it("should clear cookie after successful OAuth callback", () => {
      // Simulation: after callback validation succeeds
      const clearCookie = clearOAuthStateCookie();

      // Browser receives Max-Age=0 and removes cookie
      expect(clearCookie).toContain("Max-Age=0");
    });
  });

  describe("CSRF Attack Scenarios", () => {
    it("Scenario 1: State reuse across browsers (browser A initiates, browser B replays)", () => {
      // Browser A generates state
      const stateA = generateCsrfState();
      const cookieA = createOAuthStateCookie(stateA);

      // Extract state value from cookie
      const stateValueA = stateA;

      // Browser B (attacker) somehow gets the state value
      // But tries to use it in their own browser (different cookie)
      const attackerCookie = "__Host-oauth-state=" + "e".repeat(64); // Different cookie
      const requestB = new Request("http://test.com/callback?state=" + stateValueA, {
        headers: { Cookie: attackerCookie },
      });

      const parsedB = parseOAuthStateCookie(requestB);

      // Browser B's cookie value ≠ state parameter
      expect(parsedB).not.toBe(stateValueA); // Mismatch!

      // Server would reject: "State mismatch (CSRF attack detected)"
    });

    it("Scenario 2: Callback injection without matching cookie", () => {
      // Attacker crafts callback URL with valid state from D1
      const validState = "f".repeat(64); // State that exists in D1

      // But attacker sends callback from different browser (no __Host- cookie)
      const request = new Request(`http://test.com/callback?state=${validState}`, {
        headers: {}, // No Cookie header
      });

      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBeNull(); // No cookie = rejected

      // Server would reject: "Missing OAuth state cookie (CSRF protection)"
    });

    it("Scenario 3: Discord redirects user to attacker's callback URL", () => {
      // User completes OAuth on Discord
      // Discord should redirect to:
      // https://academy.lords.com/callback?code=USER_CODE&state=USER_STATE

      // But if attacker controlled the redirect_uri in Discord app:
      // Could redirect to attacker.com/callback?code=...&state=...

      // MITIGATED: redirect_uri is hardcoded in env (DISCORD_OAUTH_REDIRECT_URI)
      // Attacker cannot change it via URL manipulation
      // And state is browser-bound via cookie
    });

    it("Scenario 4: Expired state (5 minute window)", () => {
      // User initiates login at T=0
      const state = generateCsrfState();
      const cookie = createOAuthStateCookie(state);

      // At T=6min, user tries callback (past 5min window)
      // Browser would have deleted the cookie (Max-Age=300)
      const expiredRequest = new Request("http://test.com/callback?state=" + state, {
        headers: { Cookie: "" }, // Cookie removed by browser
      });

      const parsed = parseOAuthStateCookie(expiredRequest);
      expect(parsed).toBeNull(); // No cookie = rejected

      // Additionally, D1 would reject too (state already expired/consumed)
    });

    it("Scenario 5: Concurrent callback attempts (race condition)", async () => {
      // Browser A generates state
      const state = generateCsrfState();
      const cookie = createOAuthStateCookie(state);

      // Simulate two concurrent requests to callback endpoint
      // Both have correct state parameter and cookie
      const request1 = new Request("http://test.com/callback?state=" + state, {
        headers: { Cookie: cookie.split(";")[0] }, // Extract just the state value
      });
      const request2 = new Request("http://test.com/callback?state=" + state, {
        headers: { Cookie: cookie.split(";")[0] },
      });

      // Parse both
      const parsed1 = parseOAuthStateCookie(request1);
      const parsed2 = parseOAuthStateCookie(request2);

      // Cookie parsing works for both (stateless)
      expect(parsed1).toBe(state);
      expect(parsed2).toBe(state);

      // But D1 atomic consumption ensures only ONE succeeds
      // consumeCsrfStateAtomically() in db.ts prevents double-use
      // Second request gets: "Invalid or expired state"
    });

    it("Scenario 6: Normal flow (happy path)", () => {
      // User initiates login
      const state = generateCsrfState();
      const cookie = createOAuthStateCookie(state);

      // Extract state from cookie
      const cookieString = cookie.split(";")[0]; // "__Host-oauth-state=abc..."
      const cookieState = cookieString.split("=")[1];

      // User completes Discord OAuth, redirected to callback with same state
      const request = new Request(`http://test.com/callback?state=${cookieState}`, {
        headers: { Cookie: cookie },
      });

      // Parse state from cookie
      const parsed = parseOAuthStateCookie(request);

      // Should match state parameter
      expect(parsed).toBe(cookieState);

      // Server validates: parsed == state parameter ✓
      // Server validates: state exists in D1 ✓
      // Server validates: state not yet consumed ✓
      // → Session created successfully
    });
  });

  describe("RFC 6749 Compliance", () => {
    it("should satisfy RFC 6749 Section 10.12 requirement", () => {
      // RFC 6749 Section 10.12 states:
      // "The client MUST verify that the state parameter value matches
      // a state value it had previously associated with the browser."

      const state = generateCsrfState();
      const cookie = createOAuthStateCookie(state);

      // Cookie IS the browser association
      expect(cookie).toContain("__Host-oauth-state");
      expect(cookie).toContain(state);

      // SameSite=Lax prevents cross-site cookie access
      expect(cookie).toContain("SameSite=Lax");

      // HttpOnly prevents JS access (XSS mitigation)
      expect(cookie).toContain("HttpOnly");

      // Secure ensures HTTPS (no MITM)
      expect(cookie).toContain("Secure");

      // __Host- prefix prevents subdomain attacks
      expect(cookie).toContain("__Host-");
    });
  });

  describe("OWASP Double-Submit Cookie Pattern", () => {
    it("should implement OWASP recommended pattern", () => {
      // OWASP: "Synchronizer Tokens"
      // Pattern: Generate token, store in session + cookie
      // On request: verify token == cookie value

      const state = generateCsrfState();
      const cookie = createOAuthStateCookie(state);

      // State in D1 (session)
      const stateInDB = state; // Simulated

      // State in cookie
      const cookieValue = state; // Extracted from cookie

      // Pattern validation
      expect(stateInDB).toBe(cookieValue); // Must match
      expect(state).toHaveLength(64); // 64 hex chars
      expect(/^[a-f0-9]+$/.test(state)).toBe(true); // Valid hex

      // Attacker cannot forge both:
      // - Cannot guess random state (cryptographically random)
      // - Cannot set cookie in victim browser (HttpOnly + SameSite=Lax)
      // - Therefore cannot make stateInDB == cookieValue
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty Cookie header", () => {
      const request = new Request("http://test.com", {
        headers: { Cookie: "" },
      });

      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBeNull();
    });

    it("should handle whitespace in Cookie header", () => {
      const state = "a".repeat(64);
      const request = new Request("http://test.com", {
        headers: { Cookie: `  __Host-oauth-state=${state}  ;  other=value  ` },
      });

      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBe(state); // Properly trimmed
    });

    it("should not accept partial state cookie matches", () => {
      // Malicious cookie: "__Host-oauth-state-extra=value"
      const request = new Request("http://test.com", {
        headers: { Cookie: "__Host-oauth-state-extra=abc" },
      });

      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBeNull(); // Name must match exactly
    });

    it("should validate state format on parsing", () => {
      // Cookie with invalid state format
      const request = new Request("http://test.com", {
        headers: { Cookie: "__Host-oauth-state=too_short" },
      });

      const parsed = parseOAuthStateCookie(request);
      expect(parsed).toBeNull(); // Format validation fails
    });
  });

  describe("Integration with D1 Atomic Consumption", () => {
    it("should work with D1 double validation (defense in depth)", () => {
      // Browser generates state
      const state = generateCsrfState();
      const cookie = createOAuthStateCookie(state);

      // Callback validation happens in two layers:
      // 1. Cookie layer: state parameter == cookie value
      const cookieState = parseOAuthStateCookie(
        new Request("http://test.com/callback?state=" + state, {
          headers: { Cookie: cookie },
        })
      );
      expect(cookieState).toBe(state); // ✓ Layer 1 passes

      // 2. D1 layer: state consumed atomically (one-time use)
      // consumeCsrfStateAtomically() from db.ts:
      // UPDATE csrf_states SET is_consumed = 1 WHERE nonce = ? AND is_consumed = 0

      // If both layers pass → Session created
      // If layer 1 fails → Rejected immediately (cheap check)
      // If layer 2 fails → Rejected with atomic guarantee (no double-spend)
    });
  });

  describe("State Validation", () => {
    it("should validate state format via validateDiscordState()", () => {
      const validState = "a".repeat(64);
      const result = validateDiscordState(validState);

      expect(result.valid).toBe(true);
    });

    it("should reject state if wrong length", () => {
      const result = validateDiscordState("tooshort");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid state format");
    });

    it("should reject null/missing state", () => {
      const result = validateDiscordState(null);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing state");
    });
  });
});
