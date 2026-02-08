// FILE: src/services/reverseGeocode.js
// Reverse geocode (kısa adres) — hata/spam kırıcı + oturum kill-switch
// Ek olarak getCityCountry & formatCityCountry export eder.

let _geocoder = null;
let _disabled = false; // Bu oturumda kill-switch
let _inflight = null; // Aynı noktaya paralel istekleri engelle
let _inflightKey = null;

const PERSIST_KEY = "revgeo_disabled_v1"; // yeniden yüklemede de kapalı başlatmak için
const ENV_DISABLE = String(process.env.REACT_APP_DISABLE_REVGEOCODE || "").toLowerCase() === "true";

// ✅ Global rate-limit (harita scroll vs. spam kırıcı)
const MIN_INTERVAL_MS = 900;
let _lastReqAt = 0;

// ✅ fail-streak ile session disable
let _failStreak = 0;
let _lastFailAt = 0;
const FAIL_STREAK_WINDOW_MS = 60 * 1000;
const FAIL_STREAK_LIMIT = 4;

// Dev warnOnce
const __DEV__ = process.env.NODE_ENV !== "production";
const __warnOnce = new Set();
function warnOnce(key, ...args) {
  if (!__DEV__) return;
  if (__warnOnce.has(key)) return;
  __warnOnce.add(key);
  // eslint-disable-next-line no-console
  console.warn(...args);
}

try {
  if (ENV_DISABLE || localStorage.getItem(PERSIST_KEY) === "1") {
    _disabled = true;
  }
} catch {}

const _cache = new Map(); // key -> { v, t, meta, status }
const TTL_MS = 30 * 60 * 1000; // 30 dk

function _key(lat, lng) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}
function _now() {
  return Date.now();
}
function _isFiniteNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}
function _toNum(x) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function _disablePermanently(reason) {
  _disabled = true;
  try {
    localStorage.setItem(PERSIST_KEY, "1");
  } catch {}
  warnOnce("revgeo_perm_off", "[reverseGeocode] Kalıcı devre dışı (fatal):", reason || "");
}

function _disableSession(reason) {
  _disabled = true;
  warnOnce("revgeo_sess_off", "[reverseGeocode] Oturumda devre dışı (spam kırıcı):", reason || "");
}

function _noteFail(status) {
  const now = _now();
  if (now - _lastFailAt > FAIL_STREAK_WINDOW_MS) _failStreak = 0;
  _failStreak += 1;
  _lastFailAt = now;
  if (_failStreak >= FAIL_STREAK_LIMIT) {
    _disableSession(`fail_streak:${status || "UNKNOWN"}`);
  }
}

function _noteSuccess() {
  _failStreak = 0;
  _lastFailAt = 0;
}

function _ensureGeocoder() {
  if (_disabled) return null;
  if (_geocoder) return _geocoder;

  const g = typeof window !== "undefined" ? window.google : null;
  if (!g || !g.maps || !g.maps.Geocoder) return null;

  try {
    _geocoder = new g.maps.Geocoder();
    return _geocoder;
  } catch {
    return null;
  }
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
    if (r) {
      comps = r.address_components;
      break;
    }
  }
  if (!comps) comps = results[0]?.address_components;
  if (!comps) return "";

  const get = (type) =>
    comps.find((c) => Array.isArray(c.types) && c.types.includes(type))?.short_name || "";

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

export function getCityCountry(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { city: "", country: "", countryCode: "" };
  }

  const comps =
    results.find((x) => Array.isArray(x.address_components) && x.address_components.length)?.address_components ||
    results[0]?.address_components ||
    [];

  const getLong = (type) =>
    comps.find((c) => Array.isArray(c.types) && c.types.includes(type))?.long_name || "";

  const getShort = (type) =>
    comps.find((c) => Array.isArray(c.types) && c.types.includes(type))?.short_name || "";

  const city =
    getLong("locality") ||
    getLong("administrative_area_level_2") ||
    getLong("administrative_area_level_1") ||
    "";

  const country = getLong("country") || "";
  const countryCode = getShort("country") || "";

  return { city, country, countryCode };
}

export function formatCityCountry(arg1, arg2) {
  let city = "";
  let country = "";

  if (arg1 && typeof arg1 === "object") {
    city = (arg1.city || "").toString().trim();
    country = (arg1.country || "").toString().trim();
  } else {
    city = (arg1 || "").toString().trim();
    country = (arg2 || "").toString().trim();
  }

  if (city && country) return `${city}, ${country}`;
  return city || country || "";
}

function _isFatalStatus(status) {
  const s = String(status || "").toUpperCase();
  return (
    s === "REQUEST_DENIED" ||
    s === "INVALID_REQUEST" ||
    s === "OVER_DAILY_LIMIT" ||
    s === "OVER_QUERY_LIMIT" ||
    s === "API_KEY_INVALID"
  );
}

function _geocodePromise(geocoder, location, signal) {
  return new Promise((resolve, reject) => {
    if (!geocoder) return reject(new Error("geocoder_missing"));
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));

    let done = false;

    const onAbort = () => {
      if (done) return;
      done = true;
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (signal) {
      try {
        signal.addEventListener("abort", onAbort, { once: true });
      } catch {}
    }

    try {
      geocoder.geocode({ location }, (results, status) => {
        if (done) return;
        done = true;

        if (signal) {
          try {
            signal.removeEventListener("abort", onAbort);
          } catch {}
        }

        const st = String(status || "").toUpperCase();
        if (st === "OK") return resolve({ results: results || [], status: st });

        // fatal => kalıcı kapat
        if (_isFatalStatus(st)) {
          _disablePermanently(st);
        } else {
          _noteFail(st);
        }

        return resolve({ results: results || [], status: st });
      });
    } catch (e) {
      if (signal) {
        try {
          signal.removeEventListener("abort", onAbort);
        } catch {}
      }
      reject(e);
    }
  });
}

function _parseArgs(a, b, c) {
  // reverseGeocodeShort({lat,lng, signal}) veya reverseGeocodeShort(lat,lng,{signal})
  if (a && typeof a === "object") {
    const lat = _toNum(a.lat ?? a.latitude);
    const lng = _toNum(a.lng ?? a.lon ?? a.longitude);
    const signal = a.signal || b?.signal || null;
    return { lat, lng, signal };
  }
  const lat = _toNum(a);
  const lng = _toNum(b);
  const signal = c?.signal || null;
  return { lat, lng, signal };
}

function _rateLimitGate() {
  const now = _now();
  if (now - _lastReqAt < MIN_INTERVAL_MS) return false;
  _lastReqAt = now;
  return true;
}

/**
 * reverseGeocodeShort(...) -> string (kısa adres)
 * - cache + inflight dedupe
 * - fatal hatada kalıcı disable
 * - fail-streak ile session disable
 * - rate-limit ile spam kırıcı
 * - ZERO_RESULTS -> cache boş (TTL) yazar
 */
export async function reverseGeocodeShort(a, b, c) {
  const { lat, lng, signal } = _parseArgs(a, b, c);

  if (!_isFiniteNum(lat) || !_isFiniteNum(lng)) return "";
  if (_disabled) return "";

  const geocoder = _ensureGeocoder();
  if (!geocoder) return "";

  const k = _key(lat, lng);
  const cached = _cache.get(k);
  const now = _now();

  if (cached && now - cached.t < TTL_MS) {
    return cached.v || "";
  }

  // inflight dedupe: aynı key aynı anda 1 istek
  if (_inflight && _inflightKey === k) {
    try {
      const val = await _inflight;
      return val || "";
    } catch {
      return "";
    }
  }

  // ✅ global rate-limit (cache yoksa)
  if (!_rateLimitGate()) return "";

  _inflightKey = k;

  _inflight = (async () => {
    try {
      const { results, status } = await _geocodePromise(geocoder, { lat, lng }, signal);

      if (status === "ZERO_RESULTS") {
        _cache.set(k, { v: "", t: _now(), meta: { city: "", country: "", countryCode: "" }, status });
        return "";
      }

      if (status !== "OK") {
        return "";
      }

      _noteSuccess();
      const short = _pickShort(results);
      const meta = getCityCountry(results);

      _cache.set(k, { v: short || "", t: _now(), meta, status: "OK" });
      return short || "";
    } catch {
      _noteFail("ERROR");
      return "";
    } finally {
      _inflight = null;
      _inflightKey = null;
    }
  })();

  try {
    const val = await _inflight;
    return val || "";
  } catch {
    return "";
  }
}

/**
 * reverseGeocode(...) -> { short, city, country, countryCode, status }
 */
export async function reverseGeocode(a, b, c) {
  const { lat, lng, signal } = _parseArgs(a, b, c);

  if (!_isFiniteNum(lat) || !_isFiniteNum(lng)) {
    return { short: "", city: "", country: "", countryCode: "", status: "INVALID" };
  }
  if (_disabled) {
    return { short: "", city: "", country: "", countryCode: "", status: "DISABLED" };
  }

  const geocoder = _ensureGeocoder();
  if (!geocoder) {
    return { short: "", city: "", country: "", countryCode: "", status: "NO_GEOCODER" };
  }

  const k = _key(lat, lng);
  const cached = _cache.get(k);
  const now = _now();

  if (cached && now - cached.t < TTL_MS) {
    const meta = cached.meta || { city: "", country: "", countryCode: "" };
    return { short: cached.v || "", ...meta, status: cached.status || "CACHED" };
  }

  if (!_rateLimitGate()) {
    return { short: "", city: "", country: "", countryCode: "", status: "RATE_LIMIT" };
  }

  try {
    const { results, status } = await _geocodePromise(geocoder, { lat, lng }, signal);

    if (status === "ZERO_RESULTS") {
      const meta = { city: "", country: "", countryCode: "" };
      _cache.set(k, { v: "", t: _now(), meta, status });
      return { short: "", ...meta, status };
    }

    if (status !== "OK") {
      return { short: "", city: "", country: "", countryCode: "", status };
    }

    _noteSuccess();
    const short = _pickShort(results);
    const meta = getCityCountry(results);

    _cache.set(k, { v: short || "", t: _now(), meta, status: "OK" });
    return { short: short || "", ...meta, status: "OK" };
  } catch {
    _noteFail("ERROR");
    return { short: "", city: "", country: "", countryCode: "", status: "ERROR" };
  }
}

export default reverseGeocodeShort;
