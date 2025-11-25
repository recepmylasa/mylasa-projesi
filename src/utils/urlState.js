// src/utils/urlState.js
// URL query + localStorage yardımcıları

/**
 * Belirtilen query parametresini okur.
 * Değer yoksa veya boşsa fallback döner.
 */
export function readParam(name, fallback = null) {
  if (typeof window === "undefined") return fallback;
  try {
    const url = new URL(window.location.href);
    const val = url.searchParams.get(name);
    if (val === null || val === "") return fallback;
    return val;
  } catch {
    return fallback;
  }
}

/**
 * Verilen patch objesindeki key’leri URL query’de günceller.
 * value null/undefined/"" ise parametre silinir.
 *
 * Örnek:
 *   pushParams({ sort: "near", group: "city" })
 *
 * history.replaceState kullanır; back stack’i şişirmez.
 */
export function pushParams(patch) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const sp = url.searchParams;

    Object.entries(patch || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        sp.delete(key);
      } else {
        sp.set(key, String(value));
      }
    });

    url.search = sp.toString();
    window.history.replaceState({}, "", url.toString());
  } catch {
    // no-op
  }
}

/**
 * localStorage üzerinde JSON okuma helper’ı.
 * Parse hatasında veya erişilemezse fallback döner.
 */
export function readJSON(key, fallback = null) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * localStorage üzerinde JSON yazma helper’ı.
 * val null/undefined ise key silinir.
 */
export function writeJSON(key, val) {
  if (typeof window === "undefined") return;
  try {
    if (val === undefined || val === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(val));
    }
  } catch {
    // no-op
  }
}
