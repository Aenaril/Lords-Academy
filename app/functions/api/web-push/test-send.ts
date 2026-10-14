/**
 * Pages Function: POST /api/web-push/test-send
 * 
 * Test endpoint for Phase C notifications
 * Sends a single test notification to a specific subscription
 * 
 * Requires:
 * - TEST_TOKEN environment variable (for authorization)
 * - VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
 * - NOTIFICATIONS_SUBSCRIPTIONS KV namespace binding
 * 
 * Request:
 *   POST /api/web-push/test-send
 *   Authorization: Bearer {TEST_TOKEN}
 *   Content-Type: application/json
 *   {
 *     "subscriptionId": "sub-...",
 *     "title": "Optional custom title",
 *     "message": "Optional custom message",
 *     "imageUrl": "Optional image URL",
 *     "tutorialId": "Optional tutorial ID"
 *   }
 */

// Phase C notification handler is imported and re-exported
// The actual implementation is in worker/src/notifications-phase-c.ts
// but Pages Functions loads it directly as TypeScript

import { buildPushHTTPRequest } from '@pushforge/builder';

// Types (duplicated for Pages Functions isolation)
interface PhaseB_Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  revocationSecretHash: string;
  createdAt: number;
  updatedAt: number;
  userAgent?: string;
}

interface VAPIDKeys {
  publicKey: string;
  privateKey: string;
}

// Constants
const NOTIF_SENT_PREFIX = 'notif-sent:';
const KV_TTL_DAYS = 7;
const KV_TTL_SECONDS = KV_TTL_DAYS * 24 * 60 * 60;

// Utilities (duplicated for Pages Functions isolation)
function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  const base64Padded = base64 + '='.repeat(padding);
  const binaryString = atob(base64Padded);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

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

function buildVAPIDPrivateKeyJWK(
  base64urlPrivateKey: string,
  base64urlPublicKey: string
): JsonWebKey {
  try {
    const privateKeyBytes = base64urlToUint8Array(base64urlPrivateKey);
    if (privateKeyBytes.length !== 32) {
      throw new Error(`Private key must be 32 bytes, got ${privateKeyBytes.length}`);
    }

    const publicKeyBytes = base64urlToUint8Array(base64urlPublicKey);
    if (publicKeyBytes.length !== 65) {
      throw new Error(`Public key must be 65 bytes, got ${publicKeyBytes.length}`);
    }

    if (publicKeyBytes[0] !== 0x04) {
      throw new Error(`Public key must start with 0x04, got 0x${publicKeyBytes[0].toString(16)}`);
    }

    const x_bytes = publicKeyBytes.slice(1, 33);
    const y_bytes = publicKeyBytes.slice(33, 65);

    const x_base64url = uint8ArrayToBase64url(x_bytes);
    const y_base64url = uint8ArrayToBase64url(y_bytes);
    const d_base64url = base64urlPrivateKey;

    const jwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      d: d_base64url,
      x: x_base64url,
      y: y_base64url,
    };

    console.log('[Phase C] VAPID JWK built successfully from Phase B keys');
    return jwk;
  } catch (error) {
    console.error('[Phase C] JWK build error:', error);
    throw error;
  }
}

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
    const dedupKey = `${NOTIF_SENT_PREFIX}${subscription.id}:${notification.scheduleId}:${notification.reminderId}`;
    const alreadySent = await env.NOTIFICATIONS_SUBSCRIPTIONS?.get(dedupKey, 'json');

    if (alreadySent) {
      console.log(`[Phase C] Notification already sent (dedup): ${dedupKey}`);
      return;
    }

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
            privateJWK = buildVAPIDPrivateKeyJWK(vapidKeys.privateKey, vapidKeys.publicKey);
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

    const notificationData: any = {
      scheduleId: notification.scheduleId,
      reminderId: notification.reminderId,
    };
    if (notification.tutorialId) {
      notificationData.tutorialId = notification.tutorialId;
    }

    const payloadData: any = {
      title: notification.title,
      body: notification.message,  // Changed from 'message' to 'body' for Service Worker compatibility
      tag: `lma-${notification.scheduleId}`,
      data: notificationData,
    };

    if (notification.imageUrl) {
      payloadData.icon = notification.imageUrl;
      payloadData.badge = notification.imageUrl;
    }

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
          ttl: 86400,
          urgency: 'high',
          topic: `lma-${notification.scheduleId}`,
        },
      },
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Push service error: ${response.status} ${response.statusText} - ${text}`);
    }

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

// Pages Function handler
export const onRequest: PagesFunction<{
  NOTIFICATIONS_SUBSCRIPTIONS: KVNamespace;
}> = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (!context.env.TEST_TOKEN) {
    console.warn('[Phase C] TEST_TOKEN not configured');
    return new Response(
      JSON.stringify({ error: 'Test mode not configured (TEST_TOKEN missing)' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const authHeader = context.request.headers.get('Authorization');
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
  if (token !== context.env.TEST_TOKEN) {
    return new Response(
      JSON.stringify({ error: 'Invalid Bearer token' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const body = await context.request.json() as any;

    if (!body.subscriptionId || typeof body.subscriptionId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid subscriptionId' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!context.env.NOTIFICATIONS_SUBSCRIPTIONS) {
      return new Response(
        JSON.stringify({ error: 'Subscriptions storage not configured' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const subscriptionData = await context.env.NOTIFICATIONS_SUBSCRIPTIONS.get(body.subscriptionId, 'json');
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

    // Generate unique identifiers for each test to bypass deduplication
    // This allows multiple test runs without waiting 7 days for TTL expiration
    const testRunId = crypto.randomUUID();

    const testNotification = {
      scheduleId: `test-event-${testRunId}`,  // Unique per test run
      reminderId: `test-${testRunId}`,        // Unique per test run
      title: body.title || 'Test Notification',
      message: body.message || 'This is a test notification from Lords Mobile Academy',
      imageUrl: body.imageUrl,
      tutorialId: body.tutorialId,
    };

    const vapidKeys: VAPIDKeys = {
      publicKey: context.env.VAPID_PUBLIC_KEY || '',
      privateKey: context.env.VAPID_PRIVATE_KEY || '',
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

    await sendNotification(testNotification, subscription, vapidKeys, context.env);

    return new Response(
      JSON.stringify({
        ok: true,
        message: `Test notification sent to ${body.subscriptionId}`,
        testRunId: testRunId,
        scheduleId: `test-event-${testRunId}`,
        reminderId: `test-${testRunId}`,
        note: 'Each test uses a unique ID to bypass deduplication for testing purposes',
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
};
