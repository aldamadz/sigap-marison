import { attentionService } from "@/services/attention.service";

const serviceWorkerPath = "/sigap-sw.js?v=202611050620";

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

export const pushService = {
  isSupported() {
    return typeof window !== "undefined"
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window;
  },

  async ensureSubscription({ requestPermission = false } = {}) {
    if (!this.isSupported()) return { enabled: false, reason: "unsupported" as const };

    let permission = Notification.permission;
    if (permission === "default" && requestPermission) {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return { enabled: false, reason: "permission_not_granted" as const };

    const key = await attentionService.getPushPublicKey();
    if (!key.enabled || !key.publicKey) return { enabled: false, reason: "server_not_configured" as const };

    await navigator.serviceWorker.register(serviceWorkerPath);
    const registration = await waitForActiveWorker();
    if (!registration) return { enabled: false, reason: "worker_not_ready" as const };
    const existing = await registration.pushManager.getSubscription();
    let subscription = existing;
    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key.publicKey),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return { enabled: false, reason: "provider_unavailable" as const };
        }
        throw error;
      }
    }
    await attentionService.savePushSubscription(subscription);
    return { enabled: true as const };
  },
};
