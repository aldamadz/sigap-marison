export const desktopIntegrationVisible = () => import.meta.env.DEV
  || window.location.hostname === "sigap.marison-testing.biz.id";

export async function desktopWebApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/desktop/${path}`, {
    credentials: "same-origin", cache: "no-store",
    ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Tidak dapat memuat perangkat.");
  return data as T;
}
