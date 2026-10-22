import { createRequire } from "node:module";
import type { FirebaseServiceAccount } from "../../shared/config/env.js";
import { createFcmPushNotifier, type FcmMessaging } from "./fcm.push.notifier.js";
import { createLogPushNotifier, type PushNotifier } from "./push.notifier.js";

const require = createRequire(import.meta.url);

interface FirebaseAppModule {
  cert(serviceAccount: FirebaseServiceAccount): unknown;
  getApps(): unknown[];
  initializeApp(options: { credential: unknown }): unknown;
}

interface FirebaseMessagingModule {
  getMessaging(app?: unknown): FcmMessaging;
}

export function createConfiguredPushNotifier(
  serviceAccount: FirebaseServiceAccount | null,
): PushNotifier {
  if (!serviceAccount) {
    return createLogPushNotifier();
  }

  const firebaseApp = require("firebase-admin/app") as FirebaseAppModule;
  const firebaseMessaging = require("firebase-admin/messaging") as FirebaseMessagingModule;
  const app =
    firebaseApp.getApps()[0] ??
    firebaseApp.initializeApp({ credential: firebaseApp.cert(serviceAccount) });

  return createFcmPushNotifier({ messaging: firebaseMessaging.getMessaging(app) });
}
