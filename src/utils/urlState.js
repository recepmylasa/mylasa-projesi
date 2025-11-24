// URL arama parametreleri için küçük yardımcılar

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
 * pushParams({ sort: "near", group: "city" })
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
    window.history.pushState({}, "", url.toString());
  } catch {
    // no-op
  }
}
