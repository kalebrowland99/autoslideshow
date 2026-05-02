/** Browser session persistence for the main video generator (app picker, workspace, gallery). */

export const HOME_SESSION_KEY = "ts_home_session_v1";

const APP_IDS = new Set(["thrifty", "valcoin", "labely"]);

/**
 * @param {object} defaults - full default workspace (e.g. defaultConfig)
 * @param {(i: number) => object} emptySlotFn
 * @param {object} saved - partial persisted config
 */
export function mergePersistedConfig(defaults, emptySlotFn, saved) {
  if (!saved || typeof saved !== "object") return { ...defaults };
  const merged = { ...defaults, ...saved };
  if (Array.isArray(saved.slots)) {
    merged.slots = saved.slots.map((s, i) => ({ ...emptySlotFn(i), ...s }));
  }
  if (APP_IDS.has(saved.appId)) merged.appId = saved.appId;
  if (merged.appId === "valcoin" && !["standard", "appOnly"].includes(merged.outputFormat ?? "standard")) {
    merged.outputFormat = "standard";
  }
  if (merged.appId === "labely") {
    merged.captionText = "";
  }
  if (!Array.isArray(merged.poseReferenceImages)) merged.poseReferenceImages = [];
  return merged;
}

export function readHomeSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(HOME_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * @param {object} payload
 * @param {object} payload.config
 * @param {object[]} payload.savedSlideshows
 * @param {number | null} payload.activeShowIdx
 * @param {number} payload.currentSlide
 */
export function writeHomeSession(payload) {
  if (typeof window === "undefined") return;
  const body = { v: 1, ...payload };
  const trySet = (obj) => {
    localStorage.setItem(HOME_SESSION_KEY, JSON.stringify(obj));
  };
  try {
    trySet(body);
    return;
  } catch (e) {
    if (e?.name !== "QuotaExceededError" && e?.code !== 22) {
      console.warn("[homeSession] save failed", e);
      return;
    }
  }
  try {
    trySet({
      ...body,
      savedSlideshows: (body.savedSlideshows || []).map((s) => {
        const { previewScreenshot, ...rest } = s;
        return rest;
      }),
    });
    return;
  } catch (e) {
    if (e?.name !== "QuotaExceededError" && e?.code !== 22) {
      console.warn("[homeSession] slim save failed", e);
      return;
    }
  }
  try {
    trySet({
      v: 1,
      appId: body.config?.appId ?? "thrifty",
      currentSlide: body.currentSlide ?? 0,
      activeShowIdx: body.activeShowIdx ?? null,
      config: body.config,
      savedSlideshows: [],
    });
  } catch (e) {
    console.warn("[homeSession] could not persist gallery (quota).", e);
  }
}
