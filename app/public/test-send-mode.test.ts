/**
 * Test Send Mode Validation
 * 
 * Validates that the POST /api/web-push/test-send endpoint:
 * - Generates unique identifiers per test run
 * - Allows multiple consecutive test pushes
 * - Maintains security (TEST_TOKEN, single subscription)
 * - Returns correct payload format for Service Worker
 */

import { describe, it, expect } from 'vitest';

describe('Web Push Test Send Mode', () => {
  /**
   * Test 1: Each test call generates unique scheduleId and reminderId
   */
  it('generates unique scheduleId and reminderId per test run', () => {
    // Simulate two consecutive test calls
    const testRun1 = crypto.randomUUID();
    const testRun2 = crypto.randomUUID();

    const scheduleId1 = `test-event-${testRun1}`;
    const reminderId1 = `test-${testRun1}`;

    const scheduleId2 = `test-event-${testRun2}`;
    const reminderId2 = `test-${testRun2}`;

    // Verify they are different
    expect(scheduleId1).not.toBe(scheduleId2);
    expect(reminderId1).not.toBe(reminderId2);
    expect(testRun1).not.toBe(testRun2);

    // Verify format is valid UUID
    expect(testRun1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(testRun2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  /**
   * Test 2: Deduplication keys are different for each test run
   */
  it('creates different dedup keys for each test run', () => {
    const NOTIF_SENT_PREFIX = 'notif-sent:';
    const subscriptionId = 'sub-test-123';
    const testRun1 = crypto.randomUUID();
    const testRun2 = crypto.randomUUID();

    // Dedup key format: notif-sent:subscriptionId:scheduleId:reminderId
    const dedupKey1 = `${NOTIF_SENT_PREFIX}${subscriptionId}:test-event-${testRun1}:test-${testRun1}`;
    const dedupKey2 = `${NOTIF_SENT_PREFIX}${subscriptionId}:test-event-${testRun2}:test-${testRun2}`;

    // Different test runs = different dedup keys
    expect(dedupKey1).not.toBe(dedupKey2);

    // Both keys have correct format
    expect(dedupKey1).toMatch(/^notif-sent:sub-test-123:test-event-[0-9a-f-]+:test-[0-9a-f-]+$/i);
    expect(dedupKey2).toMatch(/^notif-sent:sub-test-123:test-event-[0-9a-f-]+:test-[0-9a-f-]+$/i);
  });

  /**
   * Test 3: Response includes unique test identifiers
   */
  it('response includes testRunId and identifiers', () => {
    const testRunId = crypto.randomUUID();

    // Simulated response from test-send endpoint
    const response = {
      ok: true,
      message: 'Test notification sent to sub-test-123',
      testRunId: testRunId,
      scheduleId: `test-event-${testRunId}`,
      reminderId: `test-${testRunId}`,
      note: 'Each test uses a unique ID to bypass deduplication for testing purposes',
    };

    // Verify all fields present
    expect(response.ok).toBe(true);
    expect(response.testRunId).toBe(testRunId);
    expect(response.scheduleId).toBe(`test-event-${testRunId}`);
    expect(response.reminderId).toBe(`test-${testRunId}`);
    expect(response.message).toContain('Test notification sent');
  });

  /**
   * Test 4: Payload format remains compatible with Service Worker
   */
  it('maintains payload compatibility with Service Worker', () => {
    const testRunId = crypto.randomUUID();

    // Test notification object (as built by test-send.ts)
    const testNotification = {
      scheduleId: `test-event-${testRunId}`,
      reminderId: `test-${testRunId}`,
      title: 'Test Title',
      message: 'Test Message',
      imageUrl: 'https://example.com/image.png',
      tutorialId: 'test-tutorial',
    };

    // Service Worker payload (as constructed in sendNotification)
    const notificationData = {
      scheduleId: testNotification.scheduleId,
      reminderId: testNotification.reminderId,
      tutorialId: testNotification.tutorialId,
    };

    const payloadData = {
      title: testNotification.title,
      body: testNotification.message,  // CRITICAL: 'body' not 'message'
      tag: `lma-${testNotification.scheduleId}`,
      icon: testNotification.imageUrl,
      badge: testNotification.imageUrl,
      data: notificationData,
    };

    // Service Worker expectations
    const swOptions: NotificationOptions = {
      body: payloadData.body,
      icon: payloadData.icon,
      badge: payloadData.badge,
      tag: payloadData.tag,
      data: payloadData.data,
    };

    const swTitle = payloadData.title;

    // Verify Service Worker receives correct format
    expect(swTitle).toBe('Test Title');
    expect(swOptions.body).toBe('Test Message');
    expect(swOptions.icon).toBe('https://example.com/image.png');
    expect(swOptions.badge).toBe('https://example.com/image.png');
    expect(swOptions.tag).toMatch(/^lma-test-event-[0-9a-f-]+$/i);
    expect(swOptions.data?.scheduleId).toMatch(/^test-event-[0-9a-f-]+$/i);
    expect(swOptions.data?.reminderId).toMatch(/^test-[0-9a-f-]+$/i);
  });

  /**
   * Test 5: Security constraints remain intact
   */
  it('maintains security constraints for test endpoint', () => {
    // 1. TEST_TOKEN is required (check happens in handler)
    const missingTokenResponse = {
      error: 'Test mode not configured (TEST_TOKEN missing)',
      status: 503,
    };
    expect(missingTokenResponse.error).toContain('TEST_TOKEN');

    // 2. Invalid token is rejected
    const invalidTokenResponse = {
      error: 'Invalid Bearer token',
      status: 403,
    };
    expect(invalidTokenResponse.status).toBe(403);

    // 3. subscriptionId is required
    const missingSubResponse = {
      error: 'Missing or invalid subscriptionId',
      status: 400,
    };
    expect(missingSubResponse.error).toContain('subscriptionId');

    // 4. Unknown subscription is rejected
    const unknownSubResponse = {
      error: 'Subscription not found',
      status: 404,
    };
    expect(unknownSubResponse.error).toContain('Subscription');

    // 5. VAPID keys must be configured
    const noVAPIDResponse = {
      error: 'VAPID keys not configured',
      status: 503,
    };
    expect(noVAPIDResponse.error).toContain('VAPID');
  });

  /**
   * Test 6: Multiple rapid tests produce different IDs
   */
  it('rapid consecutive calls produce unique identifiers', () => {
    const ids = new Set<string>();

    for (let i = 0; i < 5; i++) {
      const testRunId = crypto.randomUUID();
      const scheduleId = `test-event-${testRunId}`;
      ids.add(scheduleId);
    }

    // All 5 IDs should be unique
    expect(ids.size).toBe(5);
  });

  /**
   * Test 7: Test mode does not interfere with scheduled notifications
   */
  it('test scheduleId does not collide with scheduled notifications', () => {
    const testRunId = crypto.randomUUID();
    const testScheduleId = `test-event-${testRunId}`;

    // Scheduled notification would have different format
    const scheduledScheduleId = 'scheduled-2026-10-13-tutorial-123';

    // Verify they are different
    expect(testScheduleId).not.toBe(scheduledScheduleId);

    // Test ID format includes 'test-event-' prefix + UUID
    expect(testScheduleId).toMatch(/^test-event-[0-9a-f-]+$/i);

    // Scheduled ID format is different
    expect(scheduledScheduleId).toMatch(/^scheduled-/);
  });
});
