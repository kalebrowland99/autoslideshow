/**
 * Client-side Numista image proxy (Service Worker). Avoids Vercel→Numista blocks and
 * CORS limits during export.
 */

const SW_URL = "/numista-image-proxy-sw.js";
const PROXY_PATH = "/numista-proxy";

let registerPromise = null;

export function isNumistaCatalogueUrl(url) {
  return /^https:\/\/([a-z]{2}\.)?numista\.com\//i.test(String(url || "").trim());
}

/** Same-origin URL the SW (or fallback route) serves with CORS. */
export function numistaImageProxyUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u || !isNumistaCatalogueUrl(u)) return "";
  return `${PROXY_PATH}?${new URLSearchParams({ url: u }).toString()}`;
}

/** Preview + export: proxy Numista URLs; leave data: and other hosts unchanged. */
export function toDisplayImageUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("data:")) return u;
  if (u.startsWith(PROXY_PATH)) return u;
  const proxied = numistaImageProxyUrl(u);
  return proxied || u;
}

export function registerNumistaImageProxySw() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(false);
  }
  if (registerPromise) return registerPromise;

  registerPromise = (async () => {
    try {
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
      await navigator.serviceWorker.ready;
      if (reg.active) return true;
      await new Promise((resolve) => {
        const sw = reg.installing || reg.waiting;
        if (!sw) {
          resolve();
          return;
        }
        sw.addEventListener("statechange", () => {
          if (sw.state === "activated") resolve();
        });
      });
      return true;
    } catch (e) {
      console.warn("[numista-proxy] Service worker registration failed", e);
      return false;
    }
  })();

  return registerPromise;
}

/** Wait until /numista-proxy is handled (SW controlling this tab). */
export async function waitForNumistaImageProxy(maxMs = 10000) {
  const registered = await registerNumistaImageProxySw();
  if (!registered) return false;

  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (navigator.serviceWorker.controller) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return Boolean(navigator.serviceWorker.controller);
}

async function blobToDataUrl(blob) {
  if (!blob?.type?.startsWith("image/")) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {string} remoteUrl
 * @returns {Promise<string>} data URL or ""
 */
export async function loadNumistaImageAsDataUrl(remoteUrl) {
  const u = String(remoteUrl || "").trim();
  if (!u) return "";
  if (u.startsWith("data:image/")) return u;

  await waitForNumistaImageProxy();

  const proxy = numistaImageProxyUrl(u);
  if (proxy) {
    try {
      const res = await fetch(proxy, { cache: "no-store" });
      if (res.ok) {
        const dataUrl = await blobToDataUrl(await res.blob());
        if (dataUrl.startsWith("data:image/")) return dataUrl;
      }
    } catch {
      /* fall through */
    }
  }

  // Dev / environments where server fetch works
  try {
    const res = await fetch(`/api/numista-image?${new URLSearchParams({ url: u })}`);
    const data = await res.json().catch(() => ({}));
    const dataUrl = typeof data?.imageDataUrl === "string" ? data.imageDataUrl.trim() : "";
    if (res.ok && dataUrl.startsWith("data:image/")) return dataUrl;
  } catch {
    /* ignore */
  }

  return "";
}
