export interface PushMessage {
  title: string;
  body: string;
  eventId: string;
  activityType: string;
}

export interface PushNotifier {
  send(tokens: readonly string[], message: PushMessage): Promise<{ invalidTokens: string[] }>;
}

export function createLogPushNotifier(): PushNotifier {
  return {
    async send(tokens) {
      console.log(`Se habría notificado a ${tokens.length} dispositivos`);
      return { invalidTokens: [] };
    },
  };
}
