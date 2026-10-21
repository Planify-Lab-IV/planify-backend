import type { PushNotifier } from "./push.notifier.js";

const MAX_MULTICAST_TOKENS = 500;
const invalidTokenCodes = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export interface FcmSendResponse {
  success: boolean;
  error?: { code?: string };
}

export interface FcmMessaging {
  sendEachForMulticast(message: {
    tokens: readonly string[];
    notification: { title: string; body: string };
    data: { eventId: string; activityType: string };
    android: { priority: "high" };
  }): Promise<{ responses: readonly FcmSendResponse[] }>;
}

export function createFcmPushNotifier({ messaging }: { messaging: FcmMessaging }): PushNotifier {
  return {
    async send(tokens, message) {
      const invalidTokens: string[] = [];

      for (let start = 0; start < tokens.length; start += MAX_MULTICAST_TOKENS) {
        const batch = tokens.slice(start, start + MAX_MULTICAST_TOKENS);

        try {
          const result = await messaging.sendEachForMulticast({
            tokens: batch,
            notification: { title: message.title, body: message.body },
            data: { eventId: message.eventId, activityType: message.activityType },
            android: { priority: "high" },
          });

          result.responses.forEach((response, index) => {
            const token = batch[index];
            if (token && !response.success && invalidTokenCodes.has(response.error?.code ?? "")) {
              invalidTokens.push(token);
            }
          });
        } catch {
          console.error("No se pudo enviar un lote de notificaciones push");
        }
      }

      return { invalidTokens };
    },
  };
}
