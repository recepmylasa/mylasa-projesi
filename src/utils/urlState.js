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

let _pendingUrl = null;
let _pendingMode = "replace";
let _pushTimer = null;

function applyUrlChange(targetUrl, mode) {
  if (typeof window === "undefined") return;
  try {
    if (mode === "push") {
      window.history.pushState({}, "", targetUrl);
    } else {
      window.history.replaceState({}, "", targetUrl);
    }
  } catch {
    // no-op
  }
}

/**
 * Verilen patch objesindeki key’leri URL query’de günceller.
 * value null/undefined/"" ise parametre silinir.
 *
 * Örnek:
 *   pushParams({ sort: "near", group: "city" })
 *
 * Varsayılan olarak debounced history.replaceState kullanır;
 * aynı query tekrar tekrar yazılmaz, back stack şişmez.
 *
 * options:
 *   - mode: "replace" | "push" (varsayılan: "replace")
 *   - debounce: boolean (varsayılan: true)
 *   - delay: debounce süresi (ms, min 300)
 */
export function pushParams(patch, options = {}) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const currentSearch = url.searchParams.toString();

    const nextSearchParams = new URLSearchParams(currentSearch);
    Object.entries(patch || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        nextSearchParams.delete(key);
      } else {
        nextSearchParams.set(key, String(value));
      }
    });

    const nextSearch = nextSearchParams.toString();

    // Query değişmiyorsa history API çağrısı yapma
    if (nextSearch === currentSearch) {
      return;
    }

    url.search = nextSearch;
    const targetUrl = url.toString();

    const mode = options.mode === "push" ? "push" : "replace";
    const shouldDebounce =
      options.debounce === undefined ? true : !!options.debounce;
    const delayRaw =
      typeof options.delay === "number" ? options.delay : 300;
    const delay = Math.max(300, delayRaw);

    if (!shouldDebounce) {
      _pendingUrl = targetUrl;
      _pendingMode = mode;
      applyUrlChange(targetUrl, mode);
      return;
    }

    _pendingUrl = targetUrl;
    _pendingMode = mode;

    if (_pushTimer) {
      clearTimeout(_pushTimer);
      _pushTimer = null;
    }

    _pushTimer = window.setTimeout(() => {
      if (!_pendingUrl) return;
      applyUrlChange(_pendingUrl, _pendingMode);
      _pushTimer = null;
    }, delay);
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
