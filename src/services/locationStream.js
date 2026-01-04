// src/services/locationStream.js
// ✅ Backward compatible + EMİR 02/04 start/stop/subscribe API eklendi.
// Mevcut startLocationStream (Firestore yazan) ve subscribeFriendLocations (MapMobile) KORUNDU.

import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

/**
 * @typedef {Object} LocationPoint
 * @property {string} uid
 * @property {number} lat
 * @property {number} lng
 * @property {number=} timestamp
 * @property {number=} heading
 * @property {number=} battery
 */

/* =========================================================
   EMİR 02/04 — Single geolocation stream (NO Firestore write)
   API: start(options), stop(), subscribe(cb)
   ========================================================= */

let _running = false;
let _watchId = null;
let _lastEmitAt = 0;
let _lastPayload = null;
/** @type {Set<(payload:any)=>void>} */
const _subs = new Set();

function _safeNow() {
  const t = Date.now();
  return Number.isFinite(t) ? t : 0;
}

function _emit(payload) {
  _lastPayload = payload;
  _subs.forEach((cb) => {
    try {
      cb(payload);
    } catch {
      // subscriber hatası app'i düşürmesin
    }
  });
}

export function start(options = {}) {
  const opts = {
    highAccuracy: options?.highAccuracy !== false,
    minIntervalMs: Number.isFinite(options?.minIntervalMs) ? Math.max(0, options.minIntervalMs) : 1200,
    maximumAgeMs: Number.isFinite(options?.maximumAgeMs) ? Math.max(0, options.maximumAgeMs) : 1500,
    timeoutMs: Number.isFinite(options?.timeoutMs) ? Math.max(0, options.timeoutMs) : 15000,
  };

  // idempotent
  if (_running) return;

  // SSR-safe
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    _running = false;
    _watchId = null;
    _emit({
      lat: null,
      lng: null,
      accuracy: null,
      speedMps: null,
      heading: null,
      ts: _safeNow(),
      error: { code: "GEO_UNAVAILABLE", message: "Geolocation desteklenmiyor." },
    });
    return;
  }

  _running = true;
  _lastEmitAt = 0;

  const geoOpts = {
    enableHighAccuracy: !!opts.highAccuracy,
    maximumAge: opts.maximumAgeMs,
    timeout: opts.timeoutMs,
  };

  const shouldEmit = () => {
    const now = _safeNow();
    if (opts.minIntervalMs === 0) return true;
    return now - _lastEmitAt >= opts.minIntervalMs;
  };

  try {
    _watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = _safeNow();
        if (!shouldEmit()) return;
        _lastEmitAt = now;

        const lat = Number(pos?.coords?.latitude);
        const lng = Number(pos?.coords?.longitude);

        const payload = {
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          accuracy: Number.isFinite(pos?.coords?.accuracy) ? pos.coords.accuracy : null,
          speedMps: Number.isFinite(pos?.coords?.speed) ? pos.coords.speed : null,
          heading: Number.isFinite(pos?.coords?.heading) ? pos.coords.heading : null,
          ts: now,
          error: null,
        };

        _emit(payload);
      },
      (err) => {
        const now = _safeNow();
        if (!shouldEmit()) return;
        _lastEmitAt = now;

        _emit({
          lat: null,
          lng: null,
          accuracy: null,
          speedMps: null,
          heading: null,
          ts: now,
          error: { code: err?.code ?? "GEO_ERROR", message: err?.message || "Konum alınamadı." },
        });
      },
      geoOpts
    );
  } catch (e) {
    _running = false;
    _watchId = null;
    _emit({
      lat: null,
      lng: null,
      accuracy: null,
      speedMps: null,
      heading: null,
      ts: _safeNow(),
      error: { code: "GEO_START_FAILED", message: e?.message || "watchPosition başlatılamadı." },
    });
  }
}

export function stop() {
  try {
    if (typeof navigator !== "undefined" && navigator.geolocation && _watchId != null) {
      try {
        navigator.geolocation.clearWatch(_watchId);
      } catch {}
    }
  } finally {
    _watchId = null;
    _running = false;
    _lastEmitAt = 0;
    _lastPayload = null;
  }
}

export function subscribe(cb) {
  if (typeof cb !== "function") return () => {};
  _subs.add(cb);

  // (opsiyonel) son payload varsa anında ver
  if (_lastPayload) {
    try {
      cb(_lastPayload);
    } catch {}
  }

  return () => {
    try {
      _subs.delete(cb);
    } catch {}
  };
}

// Backward compat aliases (eğer bir yerde startLocationStream/stopLocationStream bekleniyorsa)
export const startLocationStreamCore = start;
export const stopLocationStreamCore = stop;

/* =========================================================
   ✅ CANLI arkadaş konumlarını dinler (MapMobile bunu import ediyor) — KORUNDU
   ========================================================= */

/**
 * @param {string[]} friendsUids
 * @param {(points: LocationPoint[])=>void} onChange
 * @param {{ throttleMs?: number }=} options
 * @returns {() => void} unsubscribe
 */
export function subscribeFriendLocations(friendsUids, onChange, options = {}) {
  try {
    if (!Array.isArray(friendsUids) || friendsUids.length === 0) {
      try {
        onChange([]);
      } catch {}
      return () => {};
    }

    const throttleMs = Number.isFinite(options.throttleMs)
      ? Math.max(0, options.throttleMs)
      : 100;

    /** @type {Map<string, LocationPoint>} */
    const latest = new Map();
    /** @type {Map<string, () => void>} */
    const unsubMap = new Map();

    let timer = null;

    const flush = () => {
      timer = null;
      try {
        onChange(Array.from(latest.values()));
      } catch {}
    };

    const scheduleFlush = () => {
      if (timer != null) return;

      if (
        throttleMs === 0 &&
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        timer = -1;
        window.requestAnimationFrame(() => {
          timer = null;
          flush();
        });
      } else {
        timer = setTimeout(flush, throttleMs);
      }
    };

    const addListenerFor = (uid) => {
      if (!uid || unsubMap.has(uid)) return;

      try {
        const ref = doc(db, "locations", uid);
        const unsub = onSnapshot(
          ref,
          (snap) => {
            try {
              const d = snap.data();
              if (!d) {
                latest.delete(uid);
                scheduleFlush();
                return;
              }

              const lat =
                typeof d.latitude === "number"
                  ? d.latitude
                  : typeof d.lat === "number"
                  ? d.lat
                  : null;

              const lng =
                typeof d.longitude === "number"
                  ? d.longitude
                  : typeof d.lng === "number"
                  ? d.lng
                  : null;

              if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
                latest.delete(uid);
                scheduleFlush();
                return;
              }

              let ts = 0;
              try {
                if (d.timestamp?.toMillis) ts = d.timestamp.toMillis();
                else if (typeof d.timestamp === "number") ts = d.timestamp;
                else if (typeof d.timestamp === "string" || d.timestamp instanceof Date)
                  ts = new Date(d.timestamp).getTime();
                else ts = Date.now();
              } catch {
                ts = Date.now();
              }

              const point = /** @type {LocationPoint} */ ({
                uid,
                lat,
                lng,
                timestamp: Number.isFinite(ts) ? ts : Date.now(),
              });

              if (typeof d.heading === "number") point.heading = d.heading;
              if (typeof d.battery === "number") point.battery = d.battery;

              latest.set(uid, point);
              scheduleFlush();
            } catch {}
          },
          (err) => {
            console.warn?.("[locationStream] snapshot error for", uid, err?.message || err);
            latest.delete(uid);
            scheduleFlush();
          }
        );

        unsubMap.set(uid, unsub);
      } catch (e) {
        console.warn?.("[locationStream] listener attach failed for", uid, e?.message || e);
      }
    };

    friendsUids.forEach((u) => addListenerFor(String(u)));

    return () => {
      try {
        if (timer && timer !== -1) clearTimeout(timer);
      } catch {}

      unsubMap.forEach((u) => {
        try {
          u();
        } catch {}
      });
      unsubMap.clear();
      latest.clear();
    };
  } catch (e) {
    console.warn?.("[locationStream] subscribe failed", e?.message || e);
    try {
      onChange([]);
    } catch {}
    return () => {};
  }
}

/**
 * ✅ Backward compat: kendi konumunu Firestore'a yazan stream — KORUNDU
 * @param {{
 *  uid?: string,
 *  throttleMs?: number,
 *  geolocationOptions?: PositionOptions,
 *  enabled?: boolean,
 * }=} options
 * @returns {() => void} stop
 */
export function startLocationStream(options = {}) {
  const enabled = options?.enabled !== false;

  if (!enabled) return () => {};

  const uid = String(options?.uid || auth.currentUser?.uid || "");
  if (!uid) {
    console.warn?.("[locationStream] startLocationStream: uid yok");
    return () => {};
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    console.warn?.("[locationStream] geolocation yok");
    return () => {};
  }

  const throttleMs = Number.isFinite(options.throttleMs)
    ? Math.max(0, options.throttleMs)
    : 800;

  const geoOpts = options.geolocationOptions || {
    enableHighAccuracy: true,
    maximumAge: 1500,
    timeout: 12000,
  };

  let lastWriteAt = 0;
  let pending = null;
  let timer = null;
  let watchId = null;

  const writeNow = async (pos) => {
    try {
      const lat = Number(pos?.coords?.latitude);
      const lng = Number(pos?.coords?.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const heading =
        typeof pos?.coords?.heading === "number" && Number.isFinite(pos.coords.heading)
          ? pos.coords.heading
          : null;

      const payload = {
        latitude: lat,
        longitude: lng,
        ...(heading != null ? { heading } : {}),
        timestamp: serverTimestamp(),
      };

      await setDoc(doc(db, "locations", uid), payload, { merge: true });
    } catch (e) {
      console.warn?.("[locationStream] write failed", e?.message || e);
    }
  };

  const scheduleWrite = (pos) => {
    pending = pos;

    const now = Date.now();
    const elapsed = now - lastWriteAt;

    if (throttleMs === 0) {
      lastWriteAt = now;
      writeNow(pending);
      pending = null;
      return;
    }

    if (elapsed >= throttleMs) {
      lastWriteAt = now;
      writeNow(pending);
      pending = null;
      return;
    }

    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      lastWriteAt = Date.now();
      const p = pending;
      pending = null;
      if (p) writeNow(p);
    }, Math.max(0, throttleMs - elapsed));
  };

  try {
    watchId = navigator.geolocation.watchPosition(
      (pos) => scheduleWrite(pos),
      (err) => console.warn?.("[locationStream] geo error", err?.message || err),
      geoOpts
    );
  } catch (e) {
    console.warn?.("[locationStream] watchPosition failed", e?.message || e);
  }

  return () => {
    try {
      if (timer) clearTimeout(timer);
    } catch {}
    timer = null;
    pending = null;

    try {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    } catch {}
    watchId = null;
  };
}

// Default export: projede “default import” varsa bozulmasın diye KORUNDU
export default startLocationStream;
