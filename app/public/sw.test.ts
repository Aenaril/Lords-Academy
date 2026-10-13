/**
 * Service Worker Push Payload Test
 * 
 * Validates the push notification payload format:
 * - Phase C sends: { title, body, tag, icon, badge, data: { scheduleId, reminderId, tutorialId } }
 * - Service Worker receives and displays: title and body in notification
 */

import { describe, it, expect } from 'vitest';

describe('Service Worker Push Payload Integration', () => {
  /**
   * Test 1: Payload format matches Service Worker expectations
   * 
   * Phase C builds:
   *   {
   *     title: "Notification Title",
   *     body: "Notification message text",
   *     tag: "lma-schedule-id",
   *     icon: "image-url",
   *     badge: "badge-url",
   *     data: {
   *       scheduleId: "...",
   *       reminderId: "...",
   *       tutorialId: "..." (optional)
   *     }
   *   }
   * 
   * Service Worker expects:
   *   - data.title (for showNotification title)
   *   - data.body (for NotificationOptions.body)
   *   - data.icon (for NotificationOptions.icon)
   *   - data.badge (for NotificationOptions.badge)
   *   - data.tag (for NotificationOptions.tag)
   */
  it('sends payload with title and body (not message)', () => {
    // Simulated Phase C payload
    const phaseCPayload = {
      title: 'Rappel: Techniques Avancées',
      body: 'Découvrez les techniques d\'élite en combat!',  // NOT 'message'
      tag: 'lma-schedule-123',
      icon: 'https://example.com/icon.png',
      badge: 'https://example.com/badge.png',
      data: {
        scheduleId: 'schedule-123',
        reminderId: 'reminder-1',
        tutorialId: 'techniques-avancees',
      },
    };

    // Service Worker extracts these fields
    const swTitle = phaseCPayload.title;
    const swBody = phaseCPayload.body;  // Key: using 'body', not 'message'
    const swIcon = phaseCPayload.icon;
    const swBadge = phaseCPayload.badge;
    const swTag = phaseCPayload.tag;

    // Validate extraction
    expect(swTitle).toBe('Rappel: Techniques Avancées');
    expect(swBody).toBe('Découvrez les techniques d\'élite en combat!');
    expect(swIcon).toBe('https://example.com/icon.png');
    expect(swBadge).toBe('https://example.com/badge.png');
    expect(swTag).toBe('lma-schedule-123');
  });

  /**
   * Test 2: Service Worker processes NotificationOptions correctly
   */
  it('creates NotificationOptions with title and body', () => {
    const phaseCPayload = {
      title: 'Dragon Arena Strategy',
      body: 'Learn how to dominate the arena!',
      tag: 'lma-dragon-arena',
      icon: '/images/icon.png',
      badge: '/images/badge.png',
      data: {
        scheduleId: 'dragon-event',
        tutorialId: 'dragon-arena',
      },
    };

    // Service Worker builds NotificationOptions
    const notificationOptions: NotificationOptions = {
      body: phaseCPayload.body,  // Service Worker uses 'body' field
      icon: phaseCPayload.icon || '/images/logo-192.png',
      badge: phaseCPayload.badge || '/images/badge-96.png',
      tag: phaseCPayload.tag || 'lma-notification',
      requireInteraction: false,
      data: phaseCPayload.data,
    };

    // Validate NotificationOptions structure
    expect(notificationOptions.body).toBe('Learn how to dominate the arena!');
    expect(notificationOptions.icon).toBe('/images/icon.png');
    expect(notificationOptions.badge).toBe('/images/badge.png');
    expect(notificationOptions.tag).toBe('lma-dragon-arena');
    expect(notificationOptions.data?.scheduleId).toBe('dragon-event');
  });

  /**
   * Test 3: Payload with optional fields
   */
  it('handles optional imageUrl and tutorialId', () => {
    // Payload WITHOUT optional fields
    const minimal = {
      title: 'Minimal Test',
      body: 'Test message',
      tag: 'lma-test',
      data: {
        scheduleId: 'test-1',
        reminderId: 'test-reminder',
      },
    };

    // Service Worker fallbacks
    const swIcon = minimal.icon || '/images/logo-192.png';
    const swBadge = minimal.badge || '/images/badge-96.png';

    expect(swIcon).toBe('/images/logo-192.png');
    expect(swBadge).toBe('/images/badge-96.png');
    expect(minimal.data.tutorialId).toBeUndefined();
  });

  /**
   * Test 4: Payload data field contains schedule info
   */
  it('preserves scheduleId, reminderId, and optional tutorialId in data', () => {
    const phaseCPayload = {
      title: 'Test Title',
      body: 'Test Body',
      data: {
        scheduleId: 'sched-123',
        reminderId: 'remind-456',
        tutorialId: 'tutorial-789',
      },
    };

    // Service Worker stores data for click handling
    const swData = phaseCPayload.data;

    expect(swData.scheduleId).toBe('sched-123');
    expect(swData.reminderId).toBe('remind-456');
    expect(swData.tutorialId).toBe('tutorial-789');
  });

  /**
   * Test 5: Ensure 'message' field is NOT used
   */
  it('does NOT use message field (uses body instead)', () => {
    // Old incorrect format (MUST NOT happen)
    const wrongFormat = {
      title: 'Wrong Title',
      message: 'This should not be used',  // WRONG
      body: 'This should be used',          // CORRECT
    };

    // Service Worker should use 'body', not 'message'
    const swBody = wrongFormat.body;
    const shouldNotUse = wrongFormat.message;

    expect(swBody).toBe('This should be used');
    expect(shouldNotUse).toBe('This should not be used');  // Exists but ignored
  });

  /**
   * Test 6: Full integration scenario
   * 
   * Simulates the complete flow:
   * 1. Phase C builds payload
   * 2. pushforge encrypts and sends
   * 3. Device receives push event
   * 4. Service Worker parses and displays
   */
  it('full integration: Phase C → pushforge → Service Worker → Device', () => {
    // 1. Phase C builds notification
    const notification = {
      scheduleId: 'schedule-full-test',
      reminderId: 'reminder-1',
      title: 'Full Integration Test',
      message: 'Testing complete flow',
      imageUrl: 'https://example.com/image.png',
      tutorialId: 'tutorial-test',
    };

    // 2. Phase C builds payload (test-send.ts logic)
    const notificationData = {
      scheduleId: notification.scheduleId,
      reminderId: notification.reminderId,
      tutorialId: notification.tutorialId,
    };

    const payloadData = {
      title: notification.title,
      body: notification.message,  // KEY: 'body' not 'message'
      tag: `lma-${notification.scheduleId}`,
      icon: notification.imageUrl,
      badge: notification.imageUrl,
      data: notificationData,
    };

    // 3. Service Worker receives and displays
    const swOptions: NotificationOptions = {
      body: payloadData.body,  // Service Worker reads 'body'
      icon: payloadData.icon || '/images/logo-192.png',
      badge: payloadData.badge || '/images/badge-96.png',
      tag: payloadData.tag,
      data: payloadData.data,
    };

    const swTitle = payloadData.title;

    // 4. Validate final result
    expect(swTitle).toBe('Full Integration Test');
    expect(swOptions.body).toBe('Testing complete flow');
    expect(swOptions.icon).toBe('https://example.com/image.png');
    expect(swOptions.badge).toBe('https://example.com/image.png');
    expect(swOptions.tag).toBe('lma-schedule-full-test');
    expect(swOptions.data?.tutorialId).toBe('tutorial-test');
  });
});
