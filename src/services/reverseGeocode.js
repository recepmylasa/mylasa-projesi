// src/services/reverseGeocode.js
// Reverse geocode (kısa adres) — hatada kalıcı kapatma + konsol sessiz
// Ek olarak getCityCountry & formatCityCountry export eder (Adım 7 ihtiyacı).

let _geocoder = null;
let _disabled = false;           // Bu oturumda kill-switch
let _inflight = null;            // Aynı noktaya paralel istekleri engelle
let _inflightKey = null;

const PERSIST_KEY = "revgeo_disabled_v1"; // Yeniden yüklemede de kapalı başlatmak için
// Ortam değişkeni ile tamamen kapatmak istersen: REACT_APP_DISABLE_REVGEOCODE=true
const ENV_DISABLE =
  String(process.env.REACT_APP_DISABLE_REVGEOCODE || "").toLowerCase() === "true";

try {
  if (ENV_DISABLE || localStorage.getItem(PERSIST_KEY) === "1") {
    _disabled = true;
  }
} catch {}

/* ------------ Dev ortamında gürültüyü sustur (sadece ilgili mesajlar) ------------ */
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const swallow = (msg) =>
    /Geocoding Service: This API key is not authorized/i.test(msg) ||
    /REQUEST_DENIED|OVER_DAILY_LIMIT|API_KEY_INVALID/i.test(msg);

  const _warn = console.warn, _error = console.error;
  console.warn = (...args) => {
    const first = args?.[0] ? String(args[0]) : "";
    if (swallow(first)) return;
    _warn(...args);
  };
  console.error = (...args) => {
    const first = args?.[0] ? String(args[0]) : "";
    if (swallow(first)) return;
    _error(...args);
  };
}

/* --------------------------------- Cache --------------------------------- */
const _cache = new Map(); // key -> { v, t }
const TTL_MS = 30 * 60 * 1000; // 30 dk

function _key(lat, lng) {
  // 5 ondalık ~1m — cache çarpışmasını azaltır
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function _pickShort(results) {
  if (!Array.isArray(results) || results.length === 0) return "";

  const prefer = [
    "sublocality",
    "sublocality_level_1",
    "neighborhood",
    "locality",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ];

  let comps = null;
  for (const t of prefer) {
    const r = results.find((x) => Array.isArray(x.types) && x.types.includes(t));
    if (r) { comps = r.address_components; break; }
  }
  if (!comps) comps = results[0]?.address_components;
  if (!comps) return "";

  const get = (type) =>
    (comps.find((c) => Array.isArray(c.types) && c.types.includes(type))?.short_name) || "";

  const part1 =
    get("neighborhood") ||
    get("sublocality") ||
    get("sublocality_level_1") ||
    get("route") ||
    "";

  const part2 =
    get("locality") ||
    get("administrative_area_level_2") ||
    get("administrative_area_level_1") ||
    "";

  return [part1, part2].filter(Boolean).join(", ");
}

/* ---------------------------- Ana yardımcı fonksiyon ---------------------------- */
/**
 * lat,lng -> kısa adres stringi
 * Yetki/limit hatasında bu oturumda reverse geocode tamamen kapanır, "" döner.
 * Konsol gürültüsü bastırılır. Cache/TTL mevcut.
 */
export async function reverseGeocode(lat, lng) {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
    if (_disabled) return "";

    // Google Maps JS yüklenmediyse sessizce boş dön
    const G = window.google?.maps;
    if (!G?.Geocoder) return "";

    const k = _key(lat, lng);

    // Cache
    const c = _cache.get(k);
    const now = Date.now();
    if (c && now - c.t < TTL_MS) return c.v;

    // Aynı key için paralel istek varsa bekle
    if (_inflight && _inflightKey === k) {
      return (await _inflight) || "";
    }

    if (!_geocoder) _geocoder = new G.Geocoder();

    _inflightKey = k;
    _inflight = _geocoder.geocode({ location: { lat, lng } })
      .then((resp) => resp)
      .catch(() => null);

    const resp = await _inflight;
    _inflight = null;
    _inflightKey = null;

    const status = resp?.status || "ERROR";
    const results = resp?.results || [];

    // Yetki/limit hatası → kalıcı kapatma
    if (status !== "OK") {
      if (
        status === "REQUEST_DENIED" ||
        status === "OVER_DAILY_LIMIT" ||
        status === "API_KEY_INVALID" ||
        status === "UNKNOWN_ERROR"
      ) {
        _disabled = true;
        try { localStorage.setItem(PERSIST_KEY, "1"); } catch {}
      }
      return "";
    }

    const short = _pickShort(results);
    _cache.set(k, { v: short, t: now });

    // Cache çok büyürse yarısını temizle
    if (_cache.size > 512) {
      const half = Math.floor(_cache.size / 2);
      let i = 0;
      for (const key of _cache.keys()) { _cache.delete(key); if (++i >= half) break; }
    }

    return short || "";
  } catch {
    return "";
  }
}

/* ------------------- Ek: şehir/ülke çıkarımı + format ------------------- */
export async function getCityCountry(lat, lng) {
  try {
    const G = window.google?.maps;
    if (!G?.Geocoder || _disabled) {
      return { city: "", admin1: "", country: "", countryCode: "" };
    }
    if (!_geocoder) _geocoder = new G.Geocoder();
    const resp = await _geocoder.geocode({ location: { lat, lng } }).catch(() => null);
    const comps = (resp?.results?.[0]?.address_components) || [];
    const find = (type) => comps.find(c => Array.isArray(c.types) && c.types.includes(type));
    const city =
      find("locality")?.long_name ||
      find("sublocality")?.long_name ||
      find("administrative_area_level_2")?.long_name ||
      "";
    const admin1 = find("administrative_area_level_1")?.long_name || "";
    const country = find("country")?.long_name || "";
    const countryCode = find("country")?.short_name || "";
    return { city, admin1, country, countryCode };
  } catch {
    return { city: "", admin1: "", country: "", countryCode: "" };
  }
}

export function formatCityCountry(areas) {
  if (!areas) return "";
  return [areas.city, areas.country].filter(Boolean).join(", ");
}
