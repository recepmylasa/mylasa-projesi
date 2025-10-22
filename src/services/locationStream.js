// src/services/locationStream.js — TAM DOSYA (YENİ)
// Amaç: Verilen friendsUids listesindeki kullanıcıların locations/{uid} dokümanlarını
// Firestore üzerinden CANLI dinlemek; güvenli parse + tekille + throttle edip tek callback ile döndürmek.

import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

/**
 * @typedef {Object} LocationPoint
 * @property {string} uid
 * @property {number} lat
 * @property {number} lng
 * @property {number=} timestamp
 * @property {number=} heading
 * @property {number=} battery
 */

/**
 * Canlı arkadaş konumlarını dinler.
 * @param {string[]} friendsUids
 * @param {(points: LocationPoint[])=>void} onChange
 * @param {{ throttleMs?: number }=} options
 * @returns {() => void} unsubscribe
 */
export function subscribeFriendLocations(friendsUids, onChange, options = {}) {
  try {
    if (!Array.isArray(friendsUids) || friendsUids.length === 0) {
      // Boş durumda hemen temiz bir dönüş yapalım (UI hata vermesin)
      try { onChange([]); } catch {}
      return () => {};
    }

    const throttleMs = Number.isFinite(options.throttleMs) ? Math.max(0, options.throttleMs) : 100;

    /** @type {Map<string, LocationPoint>} */
    const latest = new Map();
    /** @type {Map<string, () => void>} */
    const unsubMap = new Map();

    let timer = null;
    const flush = () => {
      timer = null;
      try {
        onChange(Array.from(latest.values()));
      } catch {
        // UI hiçbir zaman çökmemeli
      }
    };
    const scheduleFlush = () => {
      if (timer != null) return;
      if (throttleMs === 0 && typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        timer = -1; // sentinel
        window.requestAnimationFrame(() => {
          timer = null;
          flush();
        });
      } else {
        timer = setTimeout(flush, throttleMs);
      }
    };

    const addListenerFor = (uid) => {
      if (unsubMap.has(uid)) return;
      try {
        const ref = doc(db, "locations", uid);
        const unsub = onSnapshot(ref, (snap) => {
          try {
            const d = snap.data();
            if (!d) {
              latest.delete(uid);
              scheduleFlush();
              return;
            }
            // Alan adlarını esnek tut (latitude/longitude || lat/lng)
            const lat = typeof d.latitude === "number" ? d.latitude : (typeof d.lat === "number" ? d.lat : null);
            const lng = typeof d.longitude === "number" ? d.longitude : (typeof d.lng === "number" ? d.lng : null);
            if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
              // Bozuk/eksik veri — kaydı atla
              latest.delete(uid);
              scheduleFlush();
              return;
            }
            let ts = 0;
            try {
              if (d.timestamp?.toMillis) ts = d.timestamp.toMillis();
              else if (typeof d.timestamp === "string" || d.timestamp instanceof Date) ts = new Date(d.timestamp).getTime();
              else ts = Date.now();
            } catch { ts = Date.now(); }

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
          } catch {
            // Hata durumunda UI'ı koru
          }
        }, (err) => {
          // Yetki / ağ hatası — sessiz düş, boş gönder
          console.warn?.("[locationStream] snapshot error for", uid, err?.message || err);
          latest.delete(uid);
          scheduleFlush();
        });
        unsubMap.set(uid, unsub);
      } catch (e) {
        console.warn?.("[locationStream] listener attach failed for", uid, e?.message || e);
      }
    };

    // Dinleyicileri kur
    friendsUids.forEach(addListenerFor);

    // Unsubscribe: tüm dinleyicileri kapat
    return () => {
      try {
        if (timer && timer !== -1) clearTimeout(timer);
      } catch {}
      unsubMap.forEach((u) => {
        try { u(); } catch {}
      });
      unsubMap.clear();
      latest.clear();
    };
  } catch (e) {
    console.warn?.("[locationStream] subscribe failed", e?.message || e);
    try { onChange([]); } catch {}
    return () => {};
  }
}

export default subscribeFriendLocations;
