/**
 * LORDS MOBILE ACADEMY — Phase C Cron Worker (Scheduled Notifications)
 * 
 * Exécution : Toutes les heures (0 * * * * UTC)
 * 
 * Responsabilités :
 * 1. Récupérer les notifications programmées du CMS
 * 2. Vérifier l'éligibilité (dueTime <= now, now - dueTime < 60min)
 * 3. Itérer indépendamment sur rappels (même si notification principale est future)
 * 4. Envoyer via @pushforge/builder + RFC 8291
 * 5. Éviter doublons (déduplication KV)
 * 
 * IMPORTANT : Ce code est PRÉPARATOIRE. Pas d'activation Cron.
 * Les tests simulent sans envoyer de véritables notifications.
 */

import { buildPushHTTPRequest } from '@pushforge/builder';

// ============================================================================
// TYPES
// ============================================================================

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

interface CMSNotificationSchedule {
  id: string;
  enabled: boolean;
  title: string;
  message: string;
  imageUrl?: string;
  tutorialId?: string;
  absoluteTime: number;
  relativeReminders?: RelativeReminder[];
  createdAt?: number;
  modifiedAt?: number;
}

interface RelativeReminder {
  id: string;
  enabled: boolean;
  relativeDelay: string;
  status?: 'pending' | 'sent' | 'failed';
}

interface CMSNotificationsData {
  schedules: CMSNotificationSchedule[];
  publishedAt: number;
}

interface VAPIDKeys {
  publicKey: string;
  privateKey: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/{owner}/{repo}/{branch}/app/public/cms/notifications.json';
const SUBSCRIPTION_PREFIX = 'sub-';
const NOTIF_SENT_PREFIX = 'notif-sent:';
const KV_TTL_DAYS = 7;
const KV_TTL_SECONDS = KV_TTL_DAYS * 24 * 60 * 60;
const KV_PAGE_SIZE = 1000;
const CRON_TOLERANCE_MS = 60 * 60 * 1000; // 60 minutes acceptable window

// ============================================================================
// UTILITIES (duplicated for isolation)
// ============================================================================

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

    return {
      kty: 'EC',
      crv: 'P-256',
      d: d_base64url,
      x: x_base64url,
      y: y_base64url,
    };
  } catch (error) {
    console.error('[Cron] JWK build error:', error);
    throw error;
  }
}

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
// FETCH FUNCTIONS
// ============================================================================

async function fetchCMSNotifications(env: any): Promise<CMSNotificationSchedule[]> {
  try {
    // NEW: Fetch from secured API endpoint with Bearer token
    // This reads from the live CMS backend (Durable Objects/KV),
    // not the static GitHub Pages file
    const apiUrl = `${env.PAGES_URL || 'https://lords-academy.pages.dev'}/api/cms-storage/notifications/cron-read`;
    const cronToken = env.CRON_CMS_READ_TOKEN;

    if (!cronToken) {
      console.error('[Cron] CRON_CMS_READ_TOKEN not configured');
      return [];
    }

    console.log(`[Cron] Fetching CMS from secured endpoint: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${cronToken}`,
        'User-Agent': 'LMA-Cron-Phase-C',
      },
    });

    if (!response.ok) {
      throw new Error(
        `CMS API fetch failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as any;
    if (!data.ok || !Array.isArray(data.schedules)) {
      throw new Error('Invalid CMS API response format');
    }

    console.log(`[Cron] Fetched ${data.schedules.length} notification schedule(s)`);
    return data.schedules;
  } catch (error) {
    console.error('[Cron] CMS API fetch error:', error);
    // Return empty array on failure - do NOT send notifications if source is unreachable
    return [];
  }
}

async function fetchAllSubscriptionsWithPagination(env: any): Promise<PhaseB_Subscription[]> {
  if (!env.NOTIFICATIONS_SUBSCRIPTIONS) {
    console.warn('[Cron] No KV namespace available');
    return [];
  }

  try {
    const subs: PhaseB_Subscription[] = [];
    let cursor: string | undefined;

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
          console.warn(`[Cron] Error fetching subscription ${item.name}:`, err);
        }
      }

      cursor = list.cursor;
    } while (cursor);

    return subs;
  } catch (error) {
    console.error('[Cron] Subscription fetch error:', error);
    return [];
  }
}

// ============================================================================
// SEND NOTIFICATION
// ============================================================================

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
      console.log(`[Cron] Notification already sent (dedup): ${dedupKey}`);
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
            throw new Error('VAPID private key must be: JWK JSON, base64-encoded JWK, or base64url 32-byte raw key');
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
      body: notification.message,
      tag: `lma-${notification.scheduleId}`,
      data: notificationData,
    };

    // Ajouter image/badge seulement s'ils existent
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

    console.log(`[Cron] Notification sent successfully to ${subscription.id}`);
  } catch (error) {
    console.error(`[Cron] Send notification error:`, error);
    throw error;
  }
}

// ============================================================================
// MAIN CRON HANDLER
// ============================================================================

export async function handleScheduledNotifications(event: ScheduledEvent, env: any): Promise<void> {
  console.log('[Cron] Scheduled event triggered for notification processing');

  try {
    const now = Date.now();

    const schedules = await fetchCMSNotifications(env);
    console.log(`[Cron] Fetched ${schedules.length} CMS schedules`);

    const subscriptions = await fetchAllSubscriptionsWithPagination(env);
    console.log(`[Cron] Found ${subscriptions.length} active subscriptions`);

    if (subscriptions.length === 0) {
      console.log('[Cron] No subscriptions to send to');
      return;
    }

    for (const schedule of schedules) {
      if (!schedule.enabled) {
        console.log(`[Cron] Schedule ${schedule.id} is disabled`);
        continue;
      }

      try {
        // Check main notification eligibility
        const mainDueTime = schedule.absoluteTime;
        if (mainDueTime >= now - CRON_TOLERANCE_MS && mainDueTime <= now) {
          console.log(`[Cron] Sending main notification for ${schedule.id}`);
          const notification = {
            scheduleId: schedule.id,
            reminderId: 'main',
            title: schedule.title,
            message: schedule.message,
            imageUrl: schedule.imageUrl,
            tutorialId: schedule.tutorialId,
          };
          for (const subscription of subscriptions) {
            try {
              await sendNotification(notification, subscription, {
                publicKey: env.VAPID_PUBLIC_KEY || '',
                privateKey: env.VAPID_PRIVATE_KEY || '',
              }, env);
            } catch (error) {
              console.error(`[Cron] Failed to send main notification to ${subscription.id}:`, error);
            }
          }
        }

        // Check each reminder independently
        if (schedule.relativeReminders && schedule.relativeReminders.length > 0) {
          for (const reminder of schedule.relativeReminders) {
            if (!reminder.enabled) {
              console.log(`[Cron] Reminder ${reminder.id} for ${schedule.id} is disabled`);
              continue;
            }

            const reminderDueTime = schedule.absoluteTime + parseRelativeDelay(reminder.relativeDelay);

            if (reminderDueTime >= now - CRON_TOLERANCE_MS && reminderDueTime <= now) {
              console.log(`[Cron] Sending reminder ${reminder.id} for ${schedule.id}`);
              const reminderNotification = {
                scheduleId: schedule.id,
                reminderId: reminder.id,
                title: `Rappel: ${schedule.title}`,
                message: schedule.message,
                imageUrl: schedule.imageUrl,
                tutorialId: schedule.tutorialId,
              };
              for (const subscription of subscriptions) {
                try {
                  await sendNotification(reminderNotification, subscription, {
                    publicKey: env.VAPID_PUBLIC_KEY || '',
                    privateKey: env.VAPID_PRIVATE_KEY || '',
                  }, env);
                } catch (error) {
                  console.error(`[Cron] Failed to send reminder to ${subscription.id}:`, error);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`[Cron] Error processing schedule ${schedule.id}:`, error);
      }
    }

    console.log('[Cron] Scheduled notification processing complete');
  } catch (error) {
    console.error('[Cron] Handler error:', error);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const CronNotifications = {
  handleScheduledNotifications,
};
