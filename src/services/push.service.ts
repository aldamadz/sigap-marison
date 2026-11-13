import { AttentionRequestError, attentionService } from "@/services/attention.service";

export type PushActivationStage = "permission" | "public_key" | "register" | "ready" | "lookup" | "unsubscribe" | "subscribe" | "persist";
const errorCodes = ["AbortError", "NotAllowedError", "InvalidStateError", "SecurityError", "NotSupportedError",
  "TypeError", "NetworkError", "TimeoutError", "InvalidCharacterError", "Error"] as const;
type PushActivationCode = typeof errorCodes[number] | "HttpError" | "UnknownError";
export type PushActivationDetails = {
  stage: PushActivationStage;
  code: PushActivationCode;
  httpStatus?: number;
  requestId?: string;
  serverCode?: 'push_provider_unsupported' | 'push_keys_missing';
};
export type PushActivationResult = { enabled: true } | {
  enabled: false;
  reason: "unsupported" | "permission_not_granted" | "server_not_configured" | "worker_not_ready"
    | "provider_unavailable" | "activation_failed" | "not_subscribed" | "permission_denied" | "subscription_outdated";
  details?: PushActivationDetails;
};

const safeErrorCode = (error: unknown): PushActivationCode => {
  if (error instanceof AttentionRequestError) return "HttpError";
  try {
    const name = error && typeof error === "object" && "name" in error ? error.name : undefined;
    return errorCodes.find((code) => code === name) ?? "UnknownError";
  } catch {
    return "UnknownError";
  }
};

const serviceWorkerPath = "/sigap-sw.js?v=202611050620";

const activationFailure = (error: unknown, stage: PushActivationStage): PushActivationResult => {
  const code = safeErrorCode(error);
  const details: PushActivationDetails = { stage, code };
  if (error instanceof AttentionRequestError) {
    if (error.httpStatus !== undefined) details.httpStatus = error.httpStatus;
    if (error.requestId !== undefined) details.requestId = error.requestId;
    if (error.code !== undefined) details.serverCode = error.code;
  }
  return { enabled: false, reason: stage === "subscribe" && code === "AbortError"
    ? "provider_unavailable" : "activation_failed", details };
};

const waitForActiveWorker = async () => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 15_000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

const matchesApplicationKey = (subscription: PushSubscription, expected: Uint8Array) => {
  const stored = subscription.options?.applicationServerKey;
  if (!stored) return false;
  const actual = new Uint8Array(stored);
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
};

let activationInFlight: Promise<PushActivationResult> | null = null;
const withSubscriptionLock = async <T>(action: () => Promise<T>): Promise<T> => {
  if (!navigator.locks?.request) return action();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    return await navigator.locks.request('sigap-push-subscription', { signal: controller.signal }, () => {
      clearTimeout(timer);
      return action();
    });
  } finally { clearTimeout(timer); }
};

export const pushService = {
  isSupported() {
    return typeof window !== "undefined"
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window;
  },

  async getSubscriptionStatus(): Promise<PushActivationResult> {
    if (!this.isSupported()) return { enabled: false, reason: "unsupported" };
    if (Notification.permission !== "granted") return { enabled: false,
      reason: Notification.permission === 'denied' ? 'permission_denied' : 'permission_not_granted' };
    let stage: PushActivationStage = "lookup";
    try {
      if (activationInFlight) return await activationInFlight;
      return await withSubscriptionLock(async (): Promise<PushActivationResult> => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = registration?.active ? await registration.pushManager.getSubscription() : null;
      if (!subscription) return { enabled: false, reason: "not_subscribed" };
      stage = "public_key";
      const key = await attentionService.getPushPublicKey();
      if (!key.enabled || !key.publicKey) return { enabled: false, reason: "server_not_configured" };
      if (!matchesApplicationKey(subscription, urlBase64ToUint8Array(key.publicKey))) {
        return { enabled: false, reason: 'subscription_outdated' };
      }
      stage = "persist";
      await attentionService.savePushSubscription(subscription);
      return { enabled: true };
      });
    } catch (error) { return activationFailure(error, stage); }
  },

  async testPopup(): Promise<{ requested: boolean; reason?: string }> {
    if (!['https://sigap.marison-testing.biz.id', 'https://sigap.marison-testing.biz.id/']
      .includes(import.meta.env.VITE_APP_PUBLIC_URL)) return { requested: false, reason: 'staging_only' };
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return { requested: false, reason: 'unsupported' };
    }
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') return { requested: false, reason: 'permission_not_granted' };
      await navigator.serviceWorker.register(serviceWorkerPath);
      const registration = await waitForActiveWorker();
      if (!registration) return { requested: false, reason: 'worker_not_ready' };
      const options: NotificationOptions & { renotify: boolean } = {
        body: 'Jika Anda melihat pesan ini, popup browser di perangkat ini berfungsi.',
        tag: 'sigap-staging-popup-test', renotify: true,
        icon: '/marison-sigap-logo-v2.png', data: { link: '/dashboard' },
      };
      await registration.showNotification('Tes popup SIGAP', options);
      return { requested: true };
    } catch { return { requested: false, reason: 'popup_failed' }; }
  },

  async ensureSubscription({ requestPermission = false } = {}): Promise<PushActivationResult> {
    const result = await (async (): Promise<PushActivationResult> => {
    if (!this.isSupported()) return { enabled: false, reason: "unsupported" as const };

    let stage: PushActivationStage = "permission";
    try {
      let permission = Notification.permission;
      if (permission === "default" && requestPermission) {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") return { enabled: false, reason: "permission_not_granted" };

      if (activationInFlight) return await activationInFlight;
      const activate = async (): Promise<PushActivationResult> => {
      stage = "public_key";
      const key = await attentionService.getPushPublicKey();
      if (!key.enabled || !key.publicKey) return { enabled: false, reason: "server_not_configured" };
      const applicationServerKey = urlBase64ToUint8Array(key.publicKey);

      stage = "register";
      await navigator.serviceWorker.register(serviceWorkerPath);
      stage = "ready";
      const registration = await waitForActiveWorker();
      if (!registration) return {
        enabled: false, reason: "worker_not_ready", details: { stage, code: "TimeoutError" },
      };
      stage = "lookup";
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !matchesApplicationKey(subscription, applicationServerKey)) {
        stage = 'unsubscribe';
        await attentionService.removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
        // Another tab may already have replaced this registration.
        subscription = await registration.pushManager.getSubscription();
        if (subscription && !matchesApplicationKey(subscription, applicationServerKey)) {
          throw new DOMException('Subscription replacement incomplete', 'InvalidStateError');
        }
      }
      if (!subscription) {
        stage = "subscribe";
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }
      if (!matchesApplicationKey(subscription, applicationServerKey)) {
        stage = 'subscribe';
        throw new DOMException('Subscription key mismatch', 'InvalidStateError');
      }
      stage = "persist";
      await attentionService.savePushSubscription(subscription);
      return { enabled: true };
      };
      activationInFlight = withSubscriptionLock(activate)
        .catch(error => activationFailure(error, stage))
        .finally(() => { activationInFlight = null; });
      return await activationInFlight;
    } catch (error) {
      return activationFailure(error, stage);
    }
    })();
    // The automatic provider and all activation controls share the latest result.
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sigap:push-activation', { detail: result }));
    return result;
  },
};
