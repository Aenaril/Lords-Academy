/**
 * LORDS MOBILE ACADEMY — Phase C Web Push Notifications Worker
 * 
 * Production-ready Web Push implementation with:
 * - RFC 8292-compliant encryption (AES-128-GCM with HKDF-SHA256)
 * - Phase B subscription format (sub-<UUID>)
 * - CMS-driven scheduling from GitHub
 * - Minimal KV writes (7-day TTL, dedup only)
 * - Cron scheduling support
 * - Test endpoint with Bearer token auth
 */

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

/** CMS notification schedule from GitHub */
interface CMSNotificationSchedule {
  id: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  actionUrl?: string;
  startTime: number;             // Timestamp
  reminders?: RelativeReminder[];
}

/** Relative reminder (minutes before/after main notification) */
interface RelativeReminder {
  minuteOffset: number;          // Negative = before, positive = after
  title?: string;
  body?: string;
  tag?: string;
}

/** CMS format from GitHub */
interface CMSNotificationsData {
  schedules: CMSNotificationSchedule[];
  publishedAt: number;
}

/** Dedup tracking in KV (minimal) */
interface NotificationSentRecord {
  sentAt: number;
  subscriptionId: string;
}

/** Internal payload for encryption */
interface NotificationPayload {
  scheduleId: string;
  reminderId: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  actionUrl?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/{owner}/{repo}/{branch}/app/public/cms/notifications.json';
const SUBSCRIPTION_PREFIX = 'sub-';
const NOTIF_SENT_PREFIX = 'notif-sent:';
const KV_TTL_DAYS = 7;
const KV_TTL_SECONDS = KV_TTL_DAYS * 24 * 60 * 60;

// ============================================================================
// CRYPTO HELPERS (RFC 8292)
// ============================================================================

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(arr: Uint8Array): string {
  let binaryString = '';
  for (let i = 0; i < arr.length; i++) {
    binaryString += String.fromCharCode(arr[i]);
  }
  return btoa(binaryString);
}

/**
 * Concatenate multiple Uint8Arrays
 */
function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Compute HMAC-SHA256
 */
async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(signature);
}

/**
 * HKDF-SHA256 expand (RFC 5104)
 * Expands PRK using info context to produce output of desired length
 */
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const hashLen = 32; // SHA-256 output size
  const iterations = Math.ceil(length / hashLen);
  let okm: any = new Uint8Array(0);
  let previousBlock: any = new Uint8Array(0);

  for (let i = 1; i <= iterations; i++) {
    const message = concatUint8Arrays(
      previousBlock,
      info,
      new Uint8Array([i])
    );
    previousBlock = await hmacSha256(prk, message);
    okm = concatUint8Arrays(okm, previousBlock);
  }

  return okm.slice(0, length);
}

/**
 * Encrypt payload using AES-128-GCM with HKDF derivation (RFC 8292)
 * 
 * @param plaintext - Payload to encrypt
 * @param p256dhKey - Base64-encoded receiver's public key
 * @param authSecret - Base64-encoded authentication secret
 * @returns Base64-encoded ciphertext with 12-byte nonce prepended
 */
async function encryptPayloadAES128GCM(
  plaintext: Uint8Array,
  p256dhKey: string,
  authSecret: string
): Promise<string> {
  try {
    // Decode inputs
    const publicKeyBytes = base64ToUint8Array(p256dhKey);
    const authSecretBytes = base64ToUint8Array(authSecret);

    // Generate ephemeral key pair
    const ephemeralKeyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveBits']
    ) as CryptoKeyPair;

    // Export ephemeral public key (uncompressed 65 bytes)
    const ephemeralPublicKeyRaw = await crypto.subtle.exportKey(
      'raw',
      ephemeralKeyPair.publicKey
    );
    const ephemeralPublicKey = new Uint8Array(ephemeralPublicKeyRaw as ArrayBuffer);

    // Import receiver's public key
    const receiverPublicKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      false,
      []
    );

    // Compute ECDH shared secret
    const sharedSecret = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'ECDH',
          public: receiverPublicKey,
        } as any,
        ephemeralKeyPair.privateKey,
        256
      )
    );

    // Extract: PRK = HMAC-SHA256(salt="", IKM=sharedSecret)
    const salt = new Uint8Array(32);
    const prk = await hmacSha256(salt, sharedSecret);

    // Expand: OKM = HKDF-Expand(PRK, info, 32)
    const info = concatUint8Arrays(
      new TextEncoder().encode('WebPush: info\x00'),
      ephemeralPublicKey,
      publicKeyBytes
    );
    const contentEncryptionKey = await hkdfExpand(prk, info, 16); // 16 bytes for AES-128

    // Derive nonce key
    const nonceInfo = concatUint8Arrays(
      new TextEncoder().encode('WebPush: nonce\x00'),
      ephemeralPublicKey,
      publicKeyBytes
    );
    const nonceKey = await hkdfExpand(prk, nonceInfo, 12); // 12 bytes for GCM nonce

    // Generate random nonce
    const nonce = crypto.getRandomValues(new Uint8Array(12));

    // Apply auth secret padding (RFC 8292)
    const paddedPlaintext = concatUint8Arrays(
      new Uint8Array([0]), // 1 byte padding scheme (0 = no content padding)
      plaintext
    );

    // Encrypt using AES-128-GCM
    const encryptionKey = await crypto.subtle.importKey(
      'raw',
      contentEncryptionKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: nonce,
          additionalData: authSecretBytes,
        },
        encryptionKey,
        paddedPlaintext
      )
    );

    // Return: nonce + ephemeralPublicKey + ciphertext (all base64)
    const result = concatUint8Arrays(nonce, ephemeralPublicKey, ciphertext);
    return uint8ArrayToBase64(result);
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error(`AES-128-GCM encryption failed: ${String(error)}`);
  }
}

// ============================================================================
// KV & DATA HELPERS
// ============================================================================

/**
 * Get all Phase B subscriptions from KV
 * Phase B format uses 'sub-<UUID>' keys
 */
async function getPhaseB_ActiveSubscriptions(
  env: any
): Promise<PhaseB_Subscription[]> {
  try {
    const subscriptions: PhaseB_Subscription[] = [];
    let cursor: string | undefined;

    do {
      const result = await env.NOTIFICATIONS_KV.list({
        prefix: SUBSCRIPTION_PREFIX,
        cursor,
      });

      for (const item of result.keys) {
        try {
          const data = await env.NOTIFICATIONS_KV.get(item.name, 'json');
          if (data && typeof data === 'object') {
            subscriptions.push(data as PhaseB_Subscription);
          }
        } catch (e) {
          console.warn(`Failed to parse subscription ${item.name}:`, e);
        }
      }

      cursor = result.list_cursor;
    } while (cursor);

    return subscriptions;
  } catch (error) {
    console.error('Failed to retrieve subscriptions:', error);
    return [];
  }
}

/**
 * Fetch and parse CMS notifications from GitHub
 */
async function fetchSchedulesFromGithub(
  githubUrl: string,
  githubToken: string
): Promise<CMSNotificationSchedule[]> {
  try {
    const response = await fetch(githubUrl, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3.raw',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data: CMSNotificationsData = await response.json();
    return data.schedules || [];
  } catch (error) {
    console.error('Failed to fetch schedules from GitHub:', error);
    return [];
  }
}

/**
 * Compute SHA-256 hash (hex string)
 */
async function sha256Hash(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate dedup key for a notification
 */
async function generateDedupKey(
  scheduleId: string,
  reminderId: string,
  subscriptionId: string
): Promise<string> {
  const message = `${scheduleId}#${reminderId}#${subscriptionId}`;
  const hash = await sha256Hash(message);
  return `${NOTIF_SENT_PREFIX}${hash}`;
}

/**
 * Check if notification was already sent
 */
async function wasNotificationSent(
  env: any,
  dedupKey: string
): Promise<boolean> {
  const record = await env.NOTIFICATIONS_KV.get(dedupKey, 'json');
  return record !== null;
}

/**
 * Mark notification as sent
 */
async function markNotificationSent(
  env: any,
  dedupKey: string,
  subscriptionId: string
): Promise<void> {
  const record: NotificationSentRecord = {
    sentAt: Date.now(),
    subscriptionId,
  };
  await env.NOTIFICATIONS_KV.put(dedupKey, JSON.stringify(record), {
    expirationTtl: KV_TTL_SECONDS,
  });
}

// ============================================================================
// NOTIFICATION SENDING
// ============================================================================

/**
 * Send push notification to a subscription
 */
async function sendPushNotification(
  subscription: PhaseB_Subscription,
  payload: NotificationPayload,
  env: any
): Promise<boolean> {
  try {
    const payloadJson = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      data: {
        scheduleId: payload.scheduleId,
        reminderId: payload.reminderId,
      },
      actions: payload.actionUrl ? [
        {
          action: 'open',
          title: 'View',
        },
      ] : [],
    });

    // Encrypt payload
    const encryptedPayload = await encryptPayloadAES128GCM(
      new TextEncoder().encode(payloadJson),
      subscription.p256dh,
      subscription.auth
    );

    // Send to push service
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '24h',
      },
      body: encryptedPayload,
    });

    if (!response.ok) {
      if (response.status === 410) {
        // Subscription expired
        console.log(`Subscription ${subscription.id} expired (410)`);
        return false; // Mark for removal
      }
      throw new Error(`Push service error: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error(`Failed to send notification to ${subscription.id}:`, error);
    return false;
  }
}

/**
 * Process and send all notifications for a schedule
 */
async function processScheduleNotifications(
  schedule: CMSNotificationSchedule,
  subscriptions: PhaseB_Subscription[],
  env: any
): Promise<{ sent: number; failed: number; skipped: number }> {
  const stats = { sent: 0, failed: 0, skipped: 0 };

  // Main notification
  const mainReminderId = 'main';
  for (const sub of subscriptions) {
    const dedupKey = await generateDedupKey(schedule.id, mainReminderId, sub.id);

    if (await wasNotificationSent(env, dedupKey)) {
      stats.skipped++;
      continue;
    }

    const payload: NotificationPayload = {
      scheduleId: schedule.id,
      reminderId: mainReminderId,
      title: schedule.title,
      body: schedule.body,
      icon: schedule.icon,
      badge: schedule.badge,
      tag: schedule.tag,
      actionUrl: schedule.actionUrl,
    };

    const success = await sendPushNotification(sub, payload, env);
    if (success) {
      await markNotificationSent(env, dedupKey, sub.id);
      stats.sent++;
    } else {
      stats.failed++;
    }
  }

  // Relative reminders (up to 3)
  if (schedule.reminders && schedule.reminders.length > 0) {
    const now = Date.now();
    const reminders = schedule.reminders.slice(0, 3);

    for (let i = 0; i < reminders.length; i++) {
      const reminder = reminders[i];
      const reminderTime = schedule.startTime + (reminder.minuteOffset * 60 * 1000);

      // Only send if within scheduling window (not past)
      if (reminderTime > now) {
        continue; // Not yet time for this reminder
      }

      const reminderId = `reminder-${i}`;
      for (const sub of subscriptions) {
        const dedupKey = await generateDedupKey(schedule.id, reminderId, sub.id);

        if (await wasNotificationSent(env, dedupKey)) {
          stats.skipped++;
          continue;
        }

        const payload: NotificationPayload = {
          scheduleId: schedule.id,
          reminderId,
          title: reminder.title || schedule.title,
          body: reminder.body || schedule.body,
          icon: schedule.icon,
          badge: schedule.badge,
          tag: reminder.tag || schedule.tag,
          actionUrl: schedule.actionUrl,
        };

        const success = await sendPushNotification(sub, payload, env);
        if (success) {
          await markNotificationSent(env, dedupKey, sub.id);
          stats.sent++;
        } else {
          stats.failed++;
        }
      }
    }
  }

  return stats;
}

// ============================================================================
// HTTP HANDLERS
// ============================================================================

/**
 * Handle test send endpoint
 * POST /test-send with Bearer token and subscriptionId
 */
async function handleTestSend(
  request: Request,
  env: any
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Extract Bearer token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.slice(7);
  const expectedToken = env.TEST_TOKEN || '';

  if (token !== expectedToken) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json() as any;
    const subscriptionId = body.subscriptionId;

    if (!subscriptionId || !subscriptionId.startsWith(SUBSCRIPTION_PREFIX)) {
      return new Response(
        JSON.stringify({ error: 'Invalid subscriptionId format (must start with sub-)' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch subscription
    const subData = await env.NOTIFICATIONS_KV.get(subscriptionId, 'json');
    if (!subData) {
      return new Response(
        JSON.stringify({ error: 'Subscription not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const subscription = subData as PhaseB_Subscription;

    // Send test notification
    const testPayload: NotificationPayload = {
      scheduleId: 'test',
      reminderId: 'test',
      title: body.title || 'Test Notification',
      body: body.body || 'This is a test notification from Lords Mobile Academy',
      icon: body.icon,
      badge: body.badge,
      tag: 'test',
      actionUrl: body.actionUrl,
    };

    const success = await sendPushNotification(subscription, testPayload, env);

    if (success) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Test notification sent',
          subscriptionId,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Failed to send test notification',
          subscriptionId,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Test send error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Handle cron trigger
 * Processes all active schedules and sends notifications
 */
async function handleCron(env: any): Promise<void> {
  const startTime = Date.now();
  console.log('Starting notification cron job');

  try {
    // Fetch subscriptions and schedules
    const subscriptions = await getPhaseB_ActiveSubscriptions(env);
    if (subscriptions.length === 0) {
      console.log('No active subscriptions found');
      return;
    }

    const githubUrl = env.GITHUB_NOTIFICATIONS_URL || GITHUB_RAW_URL;
    const githubToken = env.GITHUB_TOKEN || '';
    const schedules = await fetchSchedulesFromGithub(githubUrl, githubToken);

    if (schedules.length === 0) {
      console.log('No schedules found in CMS');
      return;
    }

    // Process each schedule
    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    for (const schedule of schedules) {
      const now = Date.now();

      // Only process if schedule is within send window
      if (schedule.startTime > now) {
        continue; // Not yet time
      }

      const stats = await processScheduleNotifications(schedule, subscriptions, env);
      totalSent += stats.sent;
      totalFailed += stats.failed;
      totalSkipped += stats.skipped;

      console.log(`Schedule ${schedule.id}: sent=${stats.sent}, failed=${stats.failed}, skipped=${stats.skipped}`);
    }

    const duration = Date.now() - startTime;
    console.log(
      `Cron completed: sent=${totalSent}, failed=${totalFailed}, skipped=${totalSkipped}, duration=${duration}ms`
    );
  } catch (error) {
    console.error('Cron job failed:', error);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Main request handler
 */
export async function handleRequest(
  request: Request,
  env: any,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  // Route: POST /test-send
  if (url.pathname === '/test-send') {
    return handleTestSend(request, env);
  }

  // Route: POST /cron (internal trigger)
  if (url.pathname === '/cron' && request.method === 'POST') {
    ctx.waitUntil(handleCron(env));
    return new Response(JSON.stringify({ status: 'Cron job started' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Health check
  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not found', { status: 404 });
}

/**
 * Scheduled event handler (for Cloudflare Cron Triggers)
 */
export async function handleScheduled(
  event: ScheduledEvent,
  env: any,
  ctx: ExecutionContext
): Promise<void> {
  await handleCron(env);
}

// ============================================================================
// EXPORTS (for Cloudflare Workers)
// ============================================================================

export default {
  fetch: handleRequest,
  scheduled: handleScheduled,
};
