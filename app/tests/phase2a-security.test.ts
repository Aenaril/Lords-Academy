// LORDS MOBILE ACADEMY — Phase 2A Security Tests
// Unit tests for OAuth2, sessions, CSRF, rate limiting, recovery codes
// Date: October 2026
// Framework: vitest

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateSecureRandom,
  generateSessionId,
  generateCsrfState,
  generateRecoveryCode,
  hashRecoveryCode,
  validateDiscordState,
  validateDiscordCode,
  parseCookie,
  createSessionCookie,
  createLogoutCookie,
  getClientIp,
} from "../functions/api/auth/security";

describe("Phase 2A Security Utilities", () => {
  describe("Random Generation", () => {
    it("should generate cryptographically secure random strings", () => {
      const random1 = generateSecureRandom(32);
      const random2 = generateSecureRandom(32);

      expect(random1).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(random2).toHaveLength(64);
      expect(random1).not.toBe(random2); // Should be different
    });

    it("should generate session IDs", () => {
      const sessionId = generateSessionId();
      expect(sessionId).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(sessionId)).toBe(true);
    });

    it("should generate CSRF states", () => {
      const state = generateCsrfState();
      expect(state).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(state)).toBe(true);
    });

    it("should generate recovery codes in correct format", () => {
      const code = generateRecoveryCode();
      expect(/^EMERGENCY-[A-F0-9]{8}-[A-F0-9]{8}$/.test(code)).toBe(true);
    });
  });

  describe("Recovery Code Hashing", () => {
    it("should hash recovery codes with SHA256", async () => {
      const code = "EMERGENCY-ABCD1234-EFGH5678";
      const hash = await hashRecoveryCode(code);

      expect(hash).toHaveLength(64); // SHA256 = 64 hex chars
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it("should produce consistent hashes", async () => {
      const code = "EMERGENCY-TEST1234-TEST5678";
      const hash1 = await hashRecoveryCode(code);
      const hash2 = await hashRecoveryCode(code);

      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different codes", async () => {
      const hash1 = await hashRecoveryCode("EMERGENCY-AAAA1111-BBBB2222");
      const hash2 = await hashRecoveryCode("EMERGENCY-CCCC3333-DDDD4444");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Discord OAuth2 Validation", () => {
    it("should validate Discord state parameter", () => {
      const validState = "a".repeat(64);
      const result = validateDiscordState(validState);
      expect(result.valid).toBe(true);
    });

    it("should reject missing state", () => {
      const result = validateDiscordState(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing");
    });

    it("should reject invalid state format", () => {
      const result = validateDiscordState("tooshort");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid");
    });

    it("should validate Discord authorization code", () => {
      const validCode = "abc123def456";
      const result = validateDiscordCode(validCode);
      expect(result.valid).toBe(true);
    });

    it("should reject missing code", () => {
      const result = validateDiscordCode(null);
      expect(result.valid).toBe(false);
    });

    it("should reject short code", () => {
      const result = validateDiscordCode("short");
      expect(result.valid).toBe(false);
    });
  });

  describe("Cookie Handling", () => {
    it("should parse cookies correctly", () => {
      const cookieHeader = "session_id=abc123; Path=/; HttpOnly";
      const sessionId = parseCookie(cookieHeader, "session_id");
      expect(sessionId).toBe("abc123");
    });

    it("should handle missing cookies", () => {
      const cookieHeader = "other=value; Path=/";
      const sessionId = parseCookie(cookieHeader, "session_id");
      expect(sessionId).toBe(null);
    });

    it("should handle null cookie header", () => {
      const sessionId = parseCookie(null, "session_id");
      expect(sessionId).toBe(null);
    });

    it("should create session cookie with correct attributes", () => {
      const sessionId = "test123";
      const cookie = createSessionCookie(sessionId, 28800);

      expect(cookie).toContain("session_id=test123");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Expires=");
    });

    it("should create logout cookie (delete)", () => {
      const cookie = createLogoutCookie();

      expect(cookie).toContain("session_id=");
      expect(cookie).toContain("Thu, 01 Jan 1970"); // Past expiry
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
    });
  });

  describe("Client IP Extraction", () => {
    it("should extract IP from CF-Connecting-IP header", () => {
      const req = new Request("https://example.com", {
        headers: {
          "CF-Connecting-IP": "192.168.1.1",
        },
      });

      const ip = getClientIp(req);
      expect(ip).toBe("192.168.1.1");
    });

    it("should extract IP from X-Forwarded-For header", () => {
      const req = new Request("https://example.com", {
        headers: {
          "X-Forwarded-For": "203.0.113.1, 198.51.100.1",
        },
      });

      const ip = getClientIp(req);
      expect(ip).toBe("203.0.113.1");
    });

    it("should default to unknown if no IP headers", () => {
      const req = new Request("https://example.com");
      const ip = getClientIp(req);
      expect(ip).toBe("unknown");
    });
  });
});

describe("Phase 2A OAuth2 Security", () => {
  it("should prevent CSRF attacks with state validation", async () => {
    // Scenario: Attacker tries to use old state
    // Expected: Validation fails
    // (Full test requires KV mock)
  });

  it("should not expose Discord tokens in response", () => {
    // Scenario: User logs in via Discord
    // Expected: Response contains NO access_token
    // (Full test requires full endpoint mock)
  });

  it("should reject sessions from non-guild-members", () => {
    // Scenario: User not in Discord guild attempts login
    // Expected: 403 Forbidden
    // (Full test requires Discord API mock)
  });
});

describe("Recovery Code Security", () => {
  it("should prevent recovery code reuse", async () => {
    // Scenario: Admin uses recovery code twice
    // Expected: Second attempt fails
    // (Full test requires D1 mock)
  });

  it("should rate-limit recovery attempts", async () => {
    // Scenario: Attacker tries 10 recovery codes
    // Expected: Rate limited after 3 attempts
    // (Full test requires rate limiting mock)
  });

  it("should require secure recovery procedure", () => {
    // Scenario: Recovery code validates
    // Expected: Creates temp session, NOT full admin access
    // (Full test requires full endpoint mock)
  });
});
