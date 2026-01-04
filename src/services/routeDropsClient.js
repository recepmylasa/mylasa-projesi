// src/services/routeDropsClient.js
// Route Drops Client (Callable)
// EMİR 07: Region fix (europe-west3) + fail-graceful

import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

const FUNCTIONS_REGION = "europe-west3";

function getFn() {
  // SSR / init safety: app hazır değilse crash etmesin
  try {
    const app = getApp();
    return getFunctions(app, FUNCTIONS_REGION);
  } catch {
    return null;
  }
}

/**
 * claimRouteDrop(routeId)
 * - Callable: claimRouteDrop (Functions region: europe-west3)
 * - Fail-graceful: throw etmez, { ok:false, error } döner
 * @param {string} routeId
 * @returns {Promise<{ok:boolean, alreadyClaimed?:boolean, error?:{code?:string, message?:string}}>}
 */
export async function claimRouteDrop(routeId) {
  try {
    const rid = String(routeId || "").trim();
    if (!rid) {
      return { ok: false, error: { code: "invalid-argument", message: "routeId required" } };
    }

    const fn = getFn();
    if (!fn) {
      return {
        ok: false,
        error: { code: "unavailable", message: "Functions not initialized" },
      };
    }

    const call = httpsCallable(fn, "claimRouteDrop");
    const res = await call({ routeId: rid });

    const data = res?.data || {};
    if (typeof data?.ok === "boolean") return data;

    // Beklenmeyen payload ama crash yok
    return { ok: true, ...data };
  } catch (e) {
    const code = e?.code || e?.name || "unknown";
    const message = e?.message || String(e);
    return { ok: false, error: { code, message } };
  }
}

export default claimRouteDrop;
