/**
 * LORDS MOBILE ACADEMY — Phase C Web Push Notifications Worker (V5 - Final)
 * 
 * Production-ready Web Push implementation:
 * - RFC 8291: Message Encryption for Web Push (aes128gcm via pushforge)
 * - RFC 8292: VAPID identification (via pushforge)
 * - Phase B subscription format (sub-<UUID>)
 * - CMS-driven scheduling from GitHub
 * - Cron scheduling (1h frequency, ≤60min tolerance)
 * - Test endpoint: targeted by subscriptionId (not broadcast)
 * - KV pagination for large subscription lists
 * - Dedup with expiration
 * 
 * Dependencies:
 * - @pushforge/builder: RFC 8291/8292 compliant, zero-dep, Cloudflare Workers compatible
 */

import { buildPushHTTPRequest } from '@pushforge/builder';

// ============================================================================
// TYPES
// ============================================================================

/** Phase B subscription format stored in KV */
interface PhaseB_Subscription {
  id: string;                    // sub-<UUID>
  endpoint: string;              // Push service URL
  p256dh: string;                // Base64-encoded public key
  auth: string;                  // Base64-encoded auth secret
  revocationSecretHash: string;  // Hash for revocation
  createdAt: number;             // Timestamp
  updatedAt: number;             // Last updated timestamp
  userAgent?: string;            // Optional browser identifier
}

/** CMS notification schedule from GitHub (corrected field names) */
interface CMSNotificationSchedule {
  id: string;
  enabled: boolean;
  title: string;
  message: string;               // ✅ Correct field (not "body")
  imageUrl?: string;
  tutorialId?: string;
  absoluteTime: number;          // ✅ Correct field (not "startTime") - when to send
  relativeReminders?: RelativeReminder[];  // ✅ Correct field (not "reminders")
  createdAt?: number;
  modifiedAt?: number;
}

/** Relative reminder (time offset before/after main notification) */
interface RelativeReminder {
  id: string;
  enabled: boolean;
  relativeDelay: string;         // ✅ Correct field (not "minuteOffset") - e.g., "-24h", "+2h"
  status?: 'pending' | 'sent' | 'failed';
}

/** CMS format from GitHub */
interface CMSNotificationsData {
  schedules: CMSNotificationSchedule[];
  publishedAt: number;
}

/** VAPID keys (private as JWK, public as base64url) */
interface VAPIDKeys {
  publicKey: string;             // Base64url-encoded public key
  privateKey: string;            // JWK object (base64url-encoded JSON or raw JSON)
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/{owner}/{repo}/{branch}/app/public/cms/notifications.json';
const SUBSCRIPTION_PREFIX = 'sub-';
const NOTIF_SENT_PREFIX = 'notif-sent:';
const KV_TTL_DAYS = 7;
const KV_TTL_SECONDS = KV_TTL_DAYS * 24 * 60 * 60;
const KV_PAGE_SIZE = 1000;  // Pagination limit for KV list

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert VAPID private key (base64url 32-byte format) to JWK P-256 format
 * 
 * Input: 32-byte base64url string (raw private key d)
 * Output: JWK object with kty, crv, d, x, y
 * 
 * Derives x,y (public key) from private key using WebCrypto
 */
async function convertVAPIDPrivateKeyToJWK(base64urlPrivateKey: string): Promise<any> {
  try {
    // Decode base64url to bytes
    const d_bytes = base64urlToUint8Array(base64urlPrivateKey);

    if (d_bytes.length !== 32) {
      throw new Error(`Private key must be 32 bytes, got ${d_bytes.length}`);
    }

    // Import as raw P-256 private key
    const privateKey = await crypto.subtle.importKey(
      'raw',
      d_bytes,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,  // extractable
      []     // no operations needed, just extract
    );

    // Export as JWK to get x, y coordinates
    const exported = await crypto.subtle.exportKey('jwk', privateKey);
    const jwk = exported as JsonWebKey;

    // Ensure JWK has required fields
    if (!jwk.d || !jwk.x || !jwk.y) {
      throw new Error('Failed to derive JWK coordinates');
    }

    return jwk;
  } catch (error) {
    console.error('[Phase C] JWK conversion error:', error);
    throw error;
  }
}

/**
 * Decode base64url to Uint8Array
 */
function base64urlToUint8Array(base64url: string): Uint8Array {
  // Convert base64url to base64
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const padding = (4 - (base64.length % 4)) % 4;
  const base64Padded = base64 + '='.repeat(padding);
  // Decode
  const binaryString = atob(base64Padded);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode Uint8Array to base64url
 */
function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Parse relative delay string to milliseconds
 * @param delay e.g., "-24h", "+2h", "-30m"
 * @returns milliseconds
 */
function parseRelativeDelay(delay: string): number {
  const match = delay.match(/^([+-])(\d+)([hm])$/);
  if (!match) {
    console.warn(`Invalid relative delay format: ${delay}, defaulting to 0`);
    return 0;
  }

  const sign = match[1] === '+' ? 1 : -1;
  const amount = parseInt(match[2], 10);
  const unit = match[3];

  if (unit === 'h') {
    return sign * amount * 60 * 60 * 1000;
  } else if (unit === 'm') {
    return sign * amount * 60 * 1000;
  }

  return 0;
}

// ============================================================================
// MAIN CRON HANDLER
// ============================================================================

/**
 * Main handler for scheduled notifications (called by Cron)
 * 
 * Eligibility criteria (per notification or reminder):
 * - enabled === true
 * - dueTime <= now  (don't send before scheduled time)
 * - now - dueTime < 60 min  (tolerance window)
 * 
 * Main notification dueTime = absoluteTime
 * Reminder dueTime = absoluteTime + relativeDelay
 */
export async function handleCronNotifications(env: any): Promise<void> {
  console.log('[Phase C] Cron triggered for notification processing');

  try {
    const now = Date.now();
    const cronTolerance = 60 * 60 * 1000; // 60 min acceptable for Cron timing

    // Fetch CMS notifications from GitHub
    const schedules = await fetchCMSNotifications(env);
    console.log(`[Phase C] Fetched ${schedules.length} CMS schedules`);

    // Get all active subscriptions (with pagination)
    const subscriptions = await fetchAllSubscriptionsWithPagination(env);
    console.log(`[Phase C] Found ${subscriptions.length} active subscriptions`);

    if (subscriptions.length === 0) {
      console.log('[Phase C] No subscriptions to send to');
      return;
    }

    // ✅ BLOCAGE 2: Process each schedule and its reminders independently
    for (const schedule of schedules) {
      if (!schedule.enabled) continue;

      try {
        // Check main notification eligibility
        const mainDueTime = schedule.absoluteTime;
        if (mainDueTime >= now - cronTolerance && mainDueTime <= now) {
          console.log(`[Phase C] Sending main notification for ${schedule.id}`);
          await sendNotificationToAllSubscriptions(
            {
              scheduleId: schedule.id,
              reminderId: 'main',
              title: schedule.title,
              message: schedule.message,
              imageUrl: schedule.imageUrl,
              tutorialId: schedule.tutorialId,
            },
            subscriptions,
            env
          );
        }

        // Check each reminder independently (even if main is future)
        if (schedule.relativeReminders && schedule.relativeReminders.length > 0) {
          for (const reminder of schedule.relativeReminders) {
            if (!reminder.enabled) continue;

            const reminderDueTime = schedule.absoluteTime + parseRelativeDelay(reminder.relativeDelay);

            if (reminderDueTime >= now - cronTolerance && reminderDueTime <= now) {
              console.log(`[Phase C] Sending reminder ${reminder.id} for ${schedule.id}`);
              await sendNotificationToAllSubscriptions(
                {
                  scheduleId: schedule.id,
                  reminderId: reminder.id,
                  title: `Rappel: ${schedule.title}`,
                  message: schedule.message,
                  imageUrl: schedule.imageUrl,
                  tutorialId: schedule.tutorialId,
                },
                subscriptions,
                env
              );
            }
          }
        }
      } catch (error) {
        console.error(`[Phase C] Error processing schedule ${schedule.id}:`, error);
      }
    }

    console.log('[Phase C] Cron notification processing complete');
  } catch (error) {
    console.error('[Phase C] Cron handler error:', error);
    throw error;
  }
}

// ============================================================================
// FETCH & PARSE
// ============================================================================

/**
 * Fetch CMS notifications from GitHub raw content
 */
async function fetchCMSNotifications(env: any): Promise<CMSNotificationSchedule[]> {
  try {
    const url = GITHUB_RAW_URL
      .replace('{owner}', env.GITHUB_OWNER || 'Aenaril')
      .replace('{repo}', env.GITHUB_REPO || 'Lords-Academy')
      .replace('{branch}', env.GITHUB_BRANCH || 'main');

    console.log(`[Phase C] Fetching CMS from: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'LMA-Worker-Phase-C-V5',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
    }

    const data: CMSNotificationsData = await response.json();
    return data.schedules || [];
  } catch (error) {
    console.error('[Phase C] CMS fetch error:', error);
    return [];
  }
}

/**
 * Fetch all active subscriptions with pagination
 * ✅ BLOCAGE 5: Handles large KV lists
 */
async function fetchAllSubscriptionsWithPagination(env: any): Promise<PhaseB_Subscription[]> {
  if (!env.NOTIFICATIONS_SUBSCRIPTIONS) {
    console.warn('[Phase C] No KV namespace available');
    return [];
  }

  try {
    const subs: PhaseB_Subscription[] = [];
    let cursor: string | undefined;

    // Paginate through subscriptions
    do {
      const options: any = { prefix: SUBSCRIPTION_PREFIX, limit: KV_PAGE_SIZE };
      if (cursor) options.cursor = cursor;

      const list = await env.NOTIFICATIONS_SUBSCRIPTIONS.list(options);

      for (const item of list.keys) {
        try {
          const subData = await env.NOTIFICATIONS_SUBSCRIPTIONS.get(item.name, 'json');
          if (subData && subData.id && subData.endpoint && subData.p256dh && subData.auth) {
            subs.push(subData as PhaseB_Subscription);
          }
        } catch (err) {
          console.warn(`[Phase C] Error fetching subscription ${item.name}:`, err);
        }
      }

      cursor = list.cursor;
    } while (cursor);

    return subs;
  } catch (error) {
    console.error('[Phase C] Subscription fetch error:', error);
    return [];
  }
}

// ============================================================================
// NOTIFICATION PROCESSING
// ============================================================================

/**
 * Process a single schedule: send main notification + reminders
 */

/**
 * Send a notification to all subscriptions
 */
async function sendNotificationToAllSubscriptions(
  notification: {
    scheduleId: string;
    reminderId: string;
    title: string;
    message: string;
    imageUrl?: string;
    tutorialId?: string;
  },
  subscriptions: PhaseB_Subscription[],
  env: any
): Promise<void> {
  const vapidKeys: VAPIDKeys = {
    publicKey: env.VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
  };

  if (!vapidKeys.privateKey || !vapidKeys.publicKey) {
    console.error('[Phase C] VAPID keys not configured');
    throw new Error('VAPID keys not configured');
  }

  for (const subscription of subscriptions) {
    try {
      await sendNotification(notification, subscription, vapidKeys, env);
    } catch (error) {
      console.error(`[Phase C] Failed to send notification to ${subscription.id}:`, error);
    }
  }
}

/**
 * Send a single notification to one subscription
 * ✅ BLOCAGE 1 & 5: Uses @pushforge/builder for real RFC 8291 aes128gcm encryption
 */
async function sendNotification(
  notification: {
    scheduleId: string;
    reminderId: string;
    title: string;
    message: string;
    imageUrl?: string;
    tutorialId?: string;
  },
  subscription: PhaseB_Subscription,
  vapidKeys: VAPIDKeys,
  env: any
): Promise<void> {
  try {
    // Check dedup (prevent sending same notification twice)
    // ✅ BLOCAGE 5: Expire old dedup keys, prevent re-sending after KV expiration
    const dedupKey = `${NOTIF_SENT_PREFIX}${subscription.id}:${notification.scheduleId}:${notification.reminderId}`;
    const alreadySent = await env.NOTIFICATIONS_SUBSCRIPTIONS?.get(dedupKey, 'json');

    if (alreadySent) {
      console.log(`[Phase C] Notification already sent (dedup): ${dedupKey}`);
      return;
    }

    // Parse VAPID private key (may be JWK, base64url raw, or base64-encoded JWK)
    let privateJWK: any;
    if (typeof vapidKeys.privateKey === 'string') {
      try {
        // Try to parse as JSON first (already JWK)
        privateJWK = JSON.parse(vapidKeys.privateKey);
      } catch {
        try {
          // Try base64-decoded JSON (base64-encoded JWK)
          const decoded = atob(vapidKeys.privateKey);
          privateJWK = JSON.parse(decoded);
        } catch {
          // Try as raw 32-byte base64url private key
          if (vapidKeys.privateKey.length === 43 || vapidKeys.privateKey.length === 44) {
            // Looks like base64url 32-byte key
            privateJWK = await convertVAPIDPrivateKeyToJWK(vapidKeys.privateKey);
          } else {
            throw new Error(
              'VAPID private key must be: JWK JSON, base64-encoded JWK, or base64url 32-byte raw key'
            );
          }
        }
      }
    } else {
      privateJWK = vapidKeys.privateKey;
    }

    // Build notification payload (without undefined values)
    const notificationData: any = {
      scheduleId: notification.scheduleId,
      reminderId: notification.reminderId,
    };
    if (notification.tutorialId) {
      notificationData.tutorialId = notification.tutorialId;
    }

    const payloadData: any = {
      title: notification.title,
      message: notification.message,
      tag: `lma-${notification.scheduleId}`,
      data: notificationData,
    };

    if (notification.imageUrl) {
      payloadData.icon = notification.imageUrl;
      payloadData.badge = notification.imageUrl;
    }

    // Build push HTTP request with RFC 8291 encryption (aes128gcm)
    // ✅ BLOCAGE 1: Real encryption via pushforge
    const { endpoint, headers, body } = await buildPushHTTPRequest({
      privateJWK,
      subscription: {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      message: {
        payload: payloadData,
        adminContact: 'mailto:academy@lords-mobile-academy.local',
        options: {
          ttl: 86400,  // 24 hours
          urgency: 'high',
          topic: `lma-${notification.scheduleId}`,
        },
      },
    });

    // Send HTTP POST to push service
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Push service error: ${response.status} ${response.statusText} - ${text}`);
    }

    // Mark as sent (dedup)
    if (env.NOTIFICATIONS_SUBSCRIPTIONS) {
      await env.NOTIFICATIONS_SUBSCRIPTIONS.put(
        dedupKey,
        JSON.stringify({ sentAt: Date.now(), subscriptionId: subscription.id }),
        { expirationTtl: KV_TTL_SECONDS }
      );
    }

    console.log(`[Phase C] Notification sent successfully to ${subscription.id}`);
  } catch (error) {
    console.error(`[Phase C] Send notification error:`, error);
    throw error;
  }
}

// ============================================================================
// TEST ENDPOINT
// ============================================================================

/**
 * POST /test-send
 * Send a test notification to ONE specific subscription
 * ✅ BLOCAGE 4: Targeted by subscriptionId, not broadcast
 * ✅ BLOCAGE 4: Requires TEST_TOKEN
 * ✅ BLOCAGE 4: Rejects missing or unknown subscriptionId
 */
export async function handleTestNotification(request: Request, env: any): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ✅ BLOCAGE 4: Verify TEST_TOKEN is configured
  if (!env.TEST_TOKEN) {
    console.warn('[Phase C] TEST_TOKEN not configured');
    return new Response(
      JSON.stringify({ error: 'Test mode not configured (TEST_TOKEN missing)' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Verify Bearer token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid Authorization header' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const token = authHeader.substring(7);
  if (token !== env.TEST_TOKEN) {
    return new Response(
      JSON.stringify({ error: 'Invalid Bearer token' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const body = await request.json() as any;

    // ✅ BLOCAGE 4: Require subscriptionId in request body
    if (!body.subscriptionId || typeof body.subscriptionId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid subscriptionId' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch the specific subscription
    // ✅ BLOCAGE 4: Verify subscription exists
    if (!env.NOTIFICATIONS_SUBSCRIPTIONS) {
      return new Response(
        JSON.stringify({ error: 'Subscriptions storage not configured' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const subscriptionData = await env.NOTIFICATIONS_SUBSCRIPTIONS.get(body.subscriptionId, 'json');
    if (!subscriptionData) {
      return new Response(
        JSON.stringify({ error: 'Subscription not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const subscription = subscriptionData as PhaseB_Subscription;

    // Build test notification
    const testNotification = {
      scheduleId: 'test-event',
      reminderId: 'test',
      title: body.title || 'Test Notification',
      message: body.message || 'This is a test notification from Lords Mobile Academy',
      imageUrl: body.imageUrl,
      tutorialId: body.tutorialId,
    };

    // Get VAPID keys
    const vapidKeys: VAPIDKeys = {
      publicKey: env.VAPID_PUBLIC_KEY || '',
      privateKey: env.VAPID_PRIVATE_KEY || '',
    };

    if (!vapidKeys.privateKey || !vapidKeys.publicKey) {
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse VAPID private key
    let privateJWK: any;
    if (typeof vapidKeys.privateKey === 'string') {
      try {
        privateJWK = JSON.parse(vapidKeys.privateKey);
      } catch {
        try {
          const decoded = atob(vapidKeys.privateKey);
          privateJWK = JSON.parse(decoded);
        } catch {
          if (vapidKeys.privateKey.length === 43 || vapidKeys.privateKey.length === 44) {
            privateJWK = await convertVAPIDPrivateKeyToJWK(vapidKeys.privateKey);
          } else {
            throw new Error(
              'VAPID private key must be: JWK JSON, base64-encoded JWK, or base64url 32-byte raw key'
            );
          }
        }
      }
    } else {
      privateJWK = vapidKeys.privateKey;
    }

    // Send to ONE subscription only
    // ✅ BLOCAGE 4: Targeted send, not broadcast
    await sendNotification(testNotification, subscription, vapidKeys, env);

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Test notification sent to ${body.subscriptionId}`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Phase C] Test notification error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to send test notification', details: String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ============================================================================
// EXPORTS (for routing in index.ts)
// ============================================================================

export const PhaseCNotifications = {
  handleCronNotifications,
  handleTestNotification,
  parseRelativeDelay,
};
