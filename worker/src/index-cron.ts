/**
 * Cloudflare Worker — Phase C Cron Entry Point
 * 
 * Gestionnaire pour les événements programmés (scheduled).
 * Invoqué automatiquement toutes les heures (voir wrangler-cron.toml).
 * 
 * IMPORTANT: Ce Worker est PRÉPARATOIRE et DÉSACTIVÉ.
 * À activer uniquement après validation utilisateur.
 */

import { handleScheduledNotifications } from './notifications-cron';

/**
 * Gestionnaire principal pour les événements Cloudflare scheduled
 */
export default {
  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext): Promise<void> {
    console.log('[Worker] Scheduled event received, delegating to Cron handler');
    
    try {
      await handleScheduledNotifications(event, env);
    } catch (error) {
      console.error('[Worker] Scheduled handler failed:', error);
      throw error;
    }
  },
};
