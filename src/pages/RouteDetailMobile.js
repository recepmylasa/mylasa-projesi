// src/pages/RouteDetailMobile.js

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./RouteDetailMobile.css";
import { auth, db, storage } from "../firebase";

import {
  doc,
  collection,
  query,
  orderBy,
  limit as qlimit,
  getDocs,
  addDoc,
  serverTimestamp,
  where,
  getDoc,
} from "firebase/firestore";

import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

import { setRouteRating, setStopRating } from "../services/routeRatings";
import { watchRoute, watchStops } from "../services/routesRead";
import { buildGpx, downloadGpx } from "../services/gpx";

import StarRatingV2 from "../components/StarRatingV2/StarRatingV2";
import CommentsPanel from "../components/CommentsPanel/CommentsPanel";
import { useGoogleMaps } from "../hooks/useGoogleMaps";
import ShareSheetMobile from "../components/ShareSheetMobile";
import { watchCommentsCount } from "../commentsClient";

const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const MAP_ID = (process.env.REACT_APP_GMAPS_MAP_ID || "").trim();

function fmtKm(m) {
  const km = (Number(m) || 0) / 1000;
  if (km < 1) return `${km.toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}
function fmtDur(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h <= 0) return `${m} dk`;
  return `${h} sa ${m} dk`;
}
function calcAvg(sum, count) {
  return (Number(count) || 0) > 0
    ? (Number(sum || 0) / Number(count)).toFixed(1)
    : "—";
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function toFiniteNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
function getValidLatLng(lat, lng) {
  const la = toFiniteNumber(lat);
  const ln = toFiniteNumber(lng);
  if (la == null || ln == null) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { lat: la, lng: ln };
}

function buildStatsFromRoute(raw = {}) {
  let distanceMeters = null;
  if (isFiniteNumber(raw.totalDistanceM) && raw.totalDistanceM > 0) {
    distanceMeters = raw.totalDistanceM;
  } else if (isFiniteNumber(raw.distanceMeters) && raw.distanceMeters > 0) {
    distanceMeters = raw.distanceMeters;
  } else if (isFiniteNumber(raw.distance) && raw.distance > 0) {
    distanceMeters = raw.distance;
  } else if (
    isFiniteNumber(raw.stats?.distanceMeters) &&
    raw.stats.distanceMeters > 0
  ) {
    distanceMeters = raw.stats.distanceMeters;
  }

  let durationSeconds = null;
  if (isFiniteNumber(raw.durationSeconds) && raw.durationSeconds > 0) {
    durationSeconds = raw.durationSeconds;
  } else if (isFiniteNumber(raw.durationMs) && raw.durationMs > 0) {
    durationSeconds = Math.round(raw.durationMs / 1000);
  } else if (isFiniteNumber(raw.duration) && raw.duration > 0) {
    durationSeconds = raw.duration;
  } else if (isFiniteNumber(raw.durationMinutes) && raw.durationMinutes > 0) {
    durationSeconds = Math.round(raw.durationMinutes * 60);
  } else if (
    isFiniteNumber(raw.stats?.durationSeconds) &&
    raw.stats.durationSeconds > 0
  ) {
    durationSeconds = raw.stats.durationSeconds;
  }

  let stopCount = null;
  if (isFiniteNumber(raw.stopCount) && raw.stopCount > 0) {
    stopCount = raw.stopCount;
  } else if (Array.isArray(raw.stops)) {
    stopCount = raw.stops.length;
  } else if (Array.isArray(raw.waypoints)) {
    stopCount = raw.waypoints.length;
  } else if (isFiniteNumber(raw.stats?.stopCount) && raw.stats.stopCount > 0) {
    stopCount = raw.stats.stopCount;
  }

  let avgSpeedKmh = null;
  if (
    isFiniteNumber(distanceMeters) &&
    isFiniteNumber(durationSeconds) &&
    durationSeconds > 0
  ) {
    const km = distanceMeters / 1000;
    const hours = durationSeconds / 3600;
    if (hours > 0) {
      avgSpeedKmh = Math.round((km / hours) * 10) / 10;
    }
  }

  return {
    distanceMeters: isFiniteNumber(distanceMeters) ? distanceMeters : null,
    durationSeconds: isFiniteNumber(durationSeconds) ? durationSeconds : null,
    stopCount: isFiniteNumber(stopCount) ? stopCount : null,
    avgSpeedKmh: isFiniteNumber(avgSpeedKmh) ? avgSpeedKmh : null,
  };
}

function getVisibilityKeyFromRoute(raw = {}) {
  const source =
    raw.visibility ?? raw.audience ?? raw.routeVisibility ?? raw.privacy ?? "";
  const v = source.toString().toLowerCase();

  if (!v || v === "public" || v === "everyone") return "public";
  if (
    v === "followers" ||
    v === "followers_only" ||
    v === "followers-only" ||
    v === "friends" ||
    v.includes("follower")
  ) {
    return "followers";
  }
  if (v === "private" || v === "only_me") return "private";
  return "unknown";
}

function getAudienceFromRoute(raw = {}) {
  const key = getVisibilityKeyFromRoute(raw);
  if (key === "public") return { key, label: "Herkese açık" };
  if (key === "followers") return { key, label: "Takipçilere açık" };
  if (key === "private") return { key, label: "Özel" };
  return { key: "unknown", label: "Sınırlı" };
}

function toDateSafe(dt) {
  if (!dt) return null;
  try {
    if (dt instanceof Date) return dt;
    if (typeof dt.toDate === "function") return dt.toDate();
    if (typeof dt.seconds === "number") return new Date(dt.seconds * 1000);
    if (typeof dt === "number") return new Date(dt);
    return new Date(dt);
  } catch {
    return null;
  }
}

function formatDateTimeTR(dt) {
  const d = toDateSafe(dt);
  if (!d) return "";
  try {
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDistanceFromStats(stats) {
  if (!stats) return "";
  const m = stats.distanceMeters;
  if (!isFiniteNumber(m) || m <= 0) return "";
  const km = m / 1000;
  const fixed = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${fixed} km`;
}
function formatDurationFromStats(stats) {
  if (!stats) return "";
  const s = stats.durationSeconds;
  if (!isFiniteNumber(s) || s <= 0) return "";
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}
function formatStopsFromStats(stats) {
  if (!stats) return "";
  const c = stats.stopCount;
  if (!isFiniteNumber(c) || c <= 0) return "";
  if (c === 1) return "1 durak";
  return `${c} durak`;
}
function formatAvgSpeedFromStats(stats) {
  if (!stats) return "";
  const v = stats.avgSpeedKmh;
  if (!isFiniteNumber(v) || v <= 0) return "";
  return `${v} km/sa`;
}

function getRouteTitleSafe(model) {
  const m = model || {};
  const t =
    (m.title && String(m.title).trim()) ||
    (m.name && String(m.name).trim()) ||
    (m.raw?.title && String(m.raw.title).trim()) ||
    (m.raw?.name && String(m.raw.name).trim()) ||
    "Rota";
  return t || "Rota";
}

function getRouteRatingLabelSafe(model) {
  const m = model || {};
  if (m.ratingSum != null && m.ratingCount != null) {
    const avg = calcAvg(m.ratingSum, m.ratingCount);
    const cnt = Number(m.ratingCount) || 0;
    return `${avg} ★ (${cnt})`;
  }
  const avg =
    (typeof m.ratingAvg === "number" &&
      Number.isFinite(m.ratingAvg) &&
      m.ratingAvg) ||
    (typeof m.avgRating === "number" &&
      Number.isFinite(m.avgRating) &&
      m.avgRating) ||
    (typeof m.raw?.ratingAvg === "number" &&
      Number.isFinite(m.raw.ratingAvg) &&
      m.raw.ratingAvg) ||
    null;

  const cnt =
    (typeof m.ratingCount === "number" &&
      Number.isFinite(m.ratingCount) &&
      m.ratingCount) ||
    (typeof m.raw?.ratingCount === "number" &&
      Number.isFinite(m.raw.ratingCount) &&
      m.raw.ratingCount) ||
    null;

  if (typeof avg === "number") {
    const avgText = Number(avg).toFixed(1);
    if (typeof cnt === "number") return `${avgText} ★ (${Number(cnt) || 0})`;
    return `${avgText} ★`;
  }
  return "—";
}

function buildShareRoutePayload(routeDoc, ownerDoc, routeId) {
  const r = { ...(routeDoc || {}), id: routeId };
  if (ownerDoc) {
    r.ownerUsername =
      ownerDoc.username ||
      ownerDoc.userName ||
      ownerDoc.handle ||
      ownerDoc.name ||
      r.ownerUsername ||
      r.ownerName;
    r.ownerName = ownerDoc.name || ownerDoc.fullName || r.ownerName || r.ownerUsername;
    r.ownerAvatar =
      ownerDoc.photoURL || ownerDoc.profilFoto || ownerDoc.avatar || r.ownerAvatar;
  }
  return r;
}

function Lightbox({ items = [], index = 0, onClose = () => {} }) {
  const clamp = useCallback(
    (v) => {
      const max = Math.max(0, items.length - 1);
      return Math.min(Math.max(0, Number(v) || 0), max);
    },
    [items.length]
  );

  const [i, setI] = useState(() => clamp(index));

  // index/state senkronu (açılışta + sonradan prop değişiminde garanti)
  useEffect(() => {
    setI(clamp(index));
  }, [index, clamp]);

  const goPrev = useCallback(() => setI((p) => Math.max(0, p - 1)), []);
  const goNext = useCallback(
    () => setI((p) => Math.min(items.length - 1, p + 1)),
    [items.length]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, onClose]);

  if (!items.length) return null;
  const cur = items[i];

  const overlay = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.85)",
    zIndex: 3000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const navBtn = (side) => ({
    position: "absolute",
    top: "50%",
    [side]: 10,
    transform: "translateY(-50%)",
    background: "rgba(0,0,0,.4)",
    color: "#fff",
    border: "0",
    borderRadius: 999,
    width: 44,
    height: 44,
    fontSize: 20,
    cursor: "pointer",
  });
  const closeBtnStyle = {
    position: "absolute",
    top: 10,
    right: 10,
    background: "rgba(0,0,0,.4)",
    color: "#fff",
    border: "0",
    borderRadius: 999,
    width: 40,
    height: 40,
    fontSize: 18,
    cursor: "pointer",
  };

  return (
    <div style={overlay} onMouseDown={onClose}>
      <button
        style={closeBtnStyle}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ✕
      </button>
      {i > 0 && (
        <button
          style={navBtn("left")}
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
        >
          ‹
        </button>
      )}
      {i < items.length - 1 && (
        <button
          style={navBtn("right")}
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
        >
          ›
        </button>
      )}
      <div onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "86vh" }}>
        {cur.type === "video" ? (
          <video src={cur.url} controls style={{ maxWidth: "92vw", maxHeight: "86vh" }} />
        ) : (
          <img
            src={cur.url}
            alt={cur.title || "media"}
            style={{ maxWidth: "92vw", maxHeight: "86vh", objectFit: "contain" }}
          />
        )}
      </div>
    </div>
  );
}

function StarBars({
  counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  total = 0,
  compact = false,
  showNumbers = true,
  height = 10,
}) {
  const rows = [5, 4, 3, 2, 1];
  const maxCount = Math.max(...rows.map((r) => counts[r] || 0), 1);
  const barStyle = (r) => ({
    height,
    width: total
      ? `${Math.max(4, Math.round(((counts[r] || 0) / maxCount) * 100))}%`
      : "4%",
    background: "#1a73e8",
    borderRadius: 999,
    transition: "width .25s ease",
  });
  const wrap = {
    display: "grid",
    gridTemplateColumns: compact ? "1fr" : "24px 1fr 48px",
    gap: 8,
    width: "100%",
  };
  const rowCss = { display: "contents" };
  return (
    <div style={{ width: "100%" }}>
      <div style={wrap}>
        {rows.map((r) => (
          <div key={r} style={rowCss}>
            {!compact && <div style={{ fontSize: 12, opacity: 0.7 }}>{r}★</div>}
            <div style={{ background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
              <div style={barStyle(r)} />
            </div>
            {!compact && showNumbers && (
              <div style={{ fontSize: 12, textAlign: "right", opacity: 0.8 }}>
                {counts[r] || 0}
              </div>
            )}
          </div>
        ))}
      </div>
      {!compact && (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>Toplam: {total}</div>
      )}
    </div>
  );
}

async function getRouteStarsAgg(routeId, max = 1000) {
  const col = collection(db, "route_ratings");
  const q = query(col, where("routeId", "==", routeId), qlimit(Math.max(1, max)));
  const snap = await getDocs(q);
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0,
    sum = 0;
  snap.forEach((d) => {
    const v = Number(d.data()?.value);
    if (v >= 1 && v <= 5) {
      counts[v] = (counts[v] || 0) + 1;
      sum += v;
      total += 1;
    }
  });
  const avg = total ? sum / total : 0;
  return { counts, total, avg };
}
async function getStopsStarsAgg(routeId, max = 1000) {
  const col = collection(db, "stop_ratings");
  const q = query(col, where("routeId", "==", routeId), qlimit(Math.max(1, max)));
  const snap = await getDocs(q);
  const map = {};
  snap.forEach((d) => {
    const data = d.data() || {};
    const sid = String(data.stopId || "");
    if (!sid) return;
    const v = Number(data.value);
    if (!(v >= 1 && v <= 5)) return;
    if (!map[sid])
      map[sid] = {
        counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        total: 0,
        avg: 0,
        __sum: 0,
      };
    map[sid].counts[v] += 1;
    map[sid].__sum += v;
    map[sid].total += 1;
  });
  Object.keys(map).forEach((sid) => {
    const it = map[sid];
    it.avg = it.total ? it.__sum / it.total : 0;
    delete it.__sum;
  });
  return map;
}

function sanitizeName(name = "") {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 120);
}
function readImageDims(fileOrBlob) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        URL.revokeObjectURL(url);
        resolve({ w, h });
      };
      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        resolve({ w: 0, h: 0 });
      };
      img.src = url;
    } catch {
      resolve({ w: 0, h: 0 });
    }
  });
}
function readVideoDims(fileOrBlob) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(fileOrBlob);
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.onloadedmetadata = () => {
        const w = Number(vid.videoWidth) || 0;
        const h = Number(vid.videoHeight) || 0;
        URL.revokeObjectURL(url);
        resolve({ w, h });
      };
      vid.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        resolve({ w: 0, h: 0 });
      };
      vid.src = url;
    } catch {
      resolve({ w: 0, h: 0 });
    }
  });
}

async function uploadStopMediaInline({ routeId, stopId, file, onProgress, signal }) {
  if (!routeId || !stopId || !file) throw new Error("Eksik parametre");
  const u = auth.currentUser;
  if (!u?.uid) throw new Error("Kullanıcı yok");

  const isImage = /^image\//i.test(file.type);
  const isVideo = /^video\//i.test(file.type);
  if (!isImage && !isVideo) throw new Error("Sadece image/* veya video/*");

  let toUpload = file;
  let dims = { w: 0, h: 0 };

  if (isImage) {
    try {
      const mod = await import("browser-image-compression");
      toUpload = await mod.default(file, {
        maxWidthOrHeight: 1920,
        initialQuality: 0.85,
        maxSizeMB: 8,
        useWebWorker: true,
      });
    } catch {}
    dims = await readImageDims(toUpload);
  } else {
    dims = await readVideoDims(toUpload);
  }

  const ts = Date.now();
  const path = `route_media/${routeId}/${stopId}/${ts}-${sanitizeName(
    file.name || (isImage ? "image.jpg" : "video.mp4")
  )}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, toUpload, {
    contentType: toUpload.type || file.type,
  });

  if (signal) {
    const onAbort = () => {
      try {
        task.cancel();
      } catch {}
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const url = await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        const p = snap.totalBytes
          ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
          : 0;
        if (onProgress) onProgress(p);
      },
      (err) => reject(err),
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (e) {
          reject(e);
        }
      }
    );
  });

  const mediaCol = collection(db, "routes", routeId, "stops", stopId, "media");
  const payload = {
    type: isImage ? "image" : "video",
    url,
    w: Number(dims.w) || 0,
    h: Number(dims.h) || 0,
    size: Number(toUpload.size || file.size) || 0,
    ownerId: u.uid,
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(mediaCol, payload);
  return { id: docRef.id, ...payload, url };
}

async function listStopMediaInline({ routeId, stopId, limit = 50 }) {
  const mediaCol = collection(db, "routes", routeId, "stops", stopId, "media");
  const q = query(
    mediaCol,
    orderBy("createdAt", "desc"),
    qlimit(Math.max(1, Math.min(limit, 200)))
  );
  try {
    const snap = await getDocs(q);
    const out = [];
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
    return { items: out, error: null };
  } catch (e) {
    const code = String(e?.code || e?.message || "");
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[media:list] hata:", code);
    }
    return { items: [], error: code || "unknown" };
  }
}

export default function RouteDetailMobile({
  routeId,
  initialRoute = null,
  source = null,
  followInitially = false, // EMİR 2: ?follow=1 ipucu
  onClose = () => {},
}) {
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "stops";
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t === "gallery" || t === "report" || t === "comments" || t === "stops") return t;
    } catch {}
    return "stops";
  });

  const onTabChange = useCallback((nextTab) => {
    setTab(nextTab);
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (!nextTab || nextTab === "stops") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {}
  }, []);

  const [commentsCount, setCommentsCount] = useState(null);

  const [routeDoc, setRouteDoc] = useState(null);
  const [stops, setStops] = useState([]);
  const [owner, setOwner] = useState(null);
  const [permError, setPermError] = useState(null);

  const [permCheckTick, setPermCheckTick] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);

  const mediaCacheRef = useRef({});
  const [mediaTick, setMediaTick] = useState(0);

  const [lightboxItems, setLightboxItems] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [showShareSheet, setShowShareSheet] = useState(false);

  const [routeAgg, setRouteAgg] = useState(null);
  const [stopAgg, setStopAgg] = useState(null);
  const [uploadState, setUploadState] = useState({});

  const { gmapsStatus, mapDivRef, mapRef } = useGoogleMaps({ API_KEY, MAP_ID });
  const polylineRef = useRef(null);
  const stopMarkersRef = useRef([]);

  const clearMapArtifacts = useCallback(() => {
    try {
      stopMarkersRef.current.forEach((m) => {
        try {
          m.setMap(null);
        } catch {}
      });
    } catch {}
    stopMarkersRef.current = [];

    try {
      if (polylineRef.current) {
        try {
          polylineRef.current.setMap(null);
        } catch {}
      }
    } catch {}
    polylineRef.current = null;
  }, []);

  // route değişiminde / unmount'ta harita objelerini temizle
  useEffect(() => {
    return () => {
      clearMapArtifacts();
    };
  }, [routeId, clearMapArtifacts]);

  // İzin / 404 kontrolü (UI RouteDetailMobile’da)
  useEffect(() => {
    if (!routeId) {
      setPermError(null);
      setRouteDoc(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const s = await getDoc(doc(db, "routes", routeId));
        if (!alive) return;
        if (!s.exists()) setPermError("not-found");
        else setPermError(null);
      } catch (e) {
        const code = String(e?.code || e?.message || "");
        if (!alive) return;
        if (code.includes("permission") || code.includes("denied")) {
          setPermError("forbidden");
        } else {
          setPermError(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [routeId, permCheckTick]);

  const retryPermCheck = useCallback(() => {
    setPermError(null);
    setPermCheckTick((x) => x + 1);
    setReloadTick((x) => x + 1);
  }, []);

  useEffect(() => {
    if (!routeId) return;
    let unsubscribe;
    try {
      unsubscribe = watchCommentsCount(
        { targetType: "route", targetId: routeId },
        (cnt) => setCommentsCount(typeof cnt === "number" ? cnt : 0)
      );
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[RouteDetailMobile] yorum sayaç izleme hatası:", e);
      }
    }
    return () => {
      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch {}
      }
    };
  }, [routeId, reloadTick]);

  useEffect(() => {
    if (!routeId) return;
    let offRoute = () => {};
    let offStops = () => {};

    offRoute = watchRoute(routeId, async (d) => {
      setRouteDoc(d);
      if (d?.ownerId) {
        try {
          const u = await getDoc(doc(db, "users", d.ownerId));
          if (u.exists()) setOwner({ id: u.id, ...u.data() });
        } catch {}
      }
    });

    offStops = watchStops(routeId, (arr) => {
      const sorted = (arr || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      setStops(sorted);
    });

    return () => {
      try {
        offRoute();
      } catch {}
      try {
        offStops();
      } catch {}
    };
  }, [routeId, reloadTick]);

  useEffect(() => {
    if (gmapsStatus !== "ready" || !mapRef.current) return;
    const map = mapRef.current;

    try {
      if (!polylineRef.current) {
        polylineRef.current = new window.google.maps.Polyline({
          map,
          clickable: false,
          geodesic: true,
          strokeColor: "#1a73e8",
          strokeOpacity: 0.95,
          strokeWeight: 4,
        });
      }

      const pts = [];
      (routeDoc?.path || []).forEach((p) => {
        const ll = getValidLatLng(p?.lat, p?.lng);
        if (!ll) return;
        pts.push(new window.google.maps.LatLng(ll.lat, ll.lng));
      });

      polylineRef.current.setPath(pts);

      if (pts.length) {
        const b = new window.google.maps.LatLngBounds();
        pts.forEach((pt) => b.extend(pt));
        map.fitBounds(b, 40);
      }

      stopMarkersRef.current.forEach((m) => {
        try {
          m.setMap(null);
        } catch {}
      });
      stopMarkersRef.current = [];

      (stops || []).forEach((s) => {
        const ll = getValidLatLng(s?.lat, s?.lng);
        if (!ll) return; // lat/lng bozuksa marker üretme
        try {
          const mk = new window.google.maps.Marker({
            position: { lat: ll.lat, lng: ll.lng },
            map,
            title: s.title || `Durak ${s.order || ""}`,
          });
          stopMarkersRef.current.push(mk);
        } catch {}
      });
    } catch {}
  }, [gmapsStatus, mapRef, routeDoc?.path, stops]);

  const ensureStopThumbs = useCallback(
    async (stopId) => {
      if (!routeId || !stopId) return;
      if (mediaCacheRef.current[stopId]?.__loadedThumbs) return;

      const { items, error } = await listStopMediaInline({
        routeId,
        stopId,
        limit: 4,
      });

      mediaCacheRef.current[stopId] = {
        ...(mediaCacheRef.current[stopId] || {}),
        items,
        __loadedThumbs: !error,
        ...(error ? { __error: error } : { __error: null }),
      };
      setMediaTick((x) => x + 1);
    },
    [routeId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pre = (stops || []).slice(0, 6);
      for (const s of pre) {
        if (cancelled) break;
        await ensureStopThumbs(s.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stops, ensureStopThumbs]);

  const [galleryLoaded, setGalleryLoaded] = useState(false);
  const galleryItems = useMemo(() => {
    const arr = [];
    Object.keys(mediaCacheRef.current).forEach((sid) => {
      const items = mediaCacheRef.current[sid]?.items || [];
      items.forEach((it) => arr.push({ ...it, stopId: sid }));
    });
    return arr.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [mediaTick, galleryLoaded]);

  const loadAllGallery = useCallback(async () => {
    if (galleryLoaded) return;
    for (const s of stops || []) {
      const { items } = await listStopMediaInline({
        routeId,
        stopId: s.id,
        limit: 20,
      });
      mediaCacheRef.current[s.id] = {
        items,
        __loadedThumbs: true,
        __error: null,
      };
    }
    setGalleryLoaded(true);
    setMediaTick((x) => x + 1);
  }, [galleryLoaded, routeId, stops]);

  const [reportLoaded, setReportLoaded] = useState(false);
  const loadReportAgg = useCallback(async () => {
    if (reportLoaded || !routeId) return;
    const [rAgg, sAgg] = await Promise.all([
      getRouteStarsAgg(routeId, 1000).catch(() => null),
      getStopsStarsAgg(routeId, 1000).catch(() => null),
    ]);
    setRouteAgg(rAgg);
    setStopAgg(sAgg);
    setReportLoaded(true);
  }, [reportLoaded, routeId]);

  const onPickMedia = useCallback(
    async (stopId) => {
      if (!auth.currentUser || !routeDoc) return;
      if (auth.currentUser.uid !== routeDoc.ownerId) return;

      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,video/*";
      input.multiple = true;
      input.onchange = async () => {
        const files = Array.from(input.files || []).slice(0, 8);
        for (const f of files) {
          const ac = new AbortController();
          setUploadState((s) => ({ ...s, [stopId]: { p: 0, abort: ac } }));
          try {
            const res = await uploadStopMediaInline({
              routeId,
              stopId,
              file: f,
              onProgress: (p) =>
                setUploadState((s) => ({
                  ...s,
                  [stopId]: { ...(s[stopId] || {}), p },
                })),
              signal: ac.signal,
            });
            const cur = mediaCacheRef.current[stopId]?.items || [];
            mediaCacheRef.current[stopId] = {
              items: [res, ...cur],
              __loadedThumbs: true,
              __error: null,
            };
            setMediaTick((x) => x + 1);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("upload hata:", e?.message || e);
          } finally {
            setUploadState((s) => {
              const ns = { ...s };
              delete ns[stopId];
              return ns;
            });
          }
        }
      };
      input.click();
    },
    [routeId, routeDoc]
  );

  const cancelUpload = useCallback(
    (stopId) => {
      const us = uploadState[stopId];
      try {
        us?.abort?.abort();
      } catch {}
      setUploadState((s) => {
        const ns = { ...s };
        delete ns[stopId];
        return ns;
      });
    },
    [uploadState]
  );

  const onShare = useCallback(async () => {
    const url = `${window.location.origin}/s/r/${routeId}`;
    const title = getRouteTitleSafe(routeDoc || initialRoute);
    try {
      if (navigator.share) await navigator.share({ url, title, text: title });
      else {
        await navigator.clipboard.writeText(url);
        alert("Bağlantı kopyalandı");
      }
    } catch {}
  }, [routeId, routeDoc, initialRoute]);

  const onExportGpx = useCallback(async () => {
    try {
      const xml = buildGpx({
        route: routeDoc,
        stops,
        path: routeDoc?.path || [],
      });
      const slug = (getRouteTitleSafe(routeDoc) || "rota")
        .toLowerCase()
        .replace(/[^\w-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const y = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      downloadGpx(xml, `route-${slug || "route"}-${y}.gpx`);
    } catch {
      alert("GPX oluşturulamadı");
    }
  }, [routeDoc, stops]);

  const canRateRoute = auth.currentUser && routeDoc && auth.currentUser.uid !== routeDoc.ownerId;

  const onRouteRate = useCallback(
    async (v) => {
      if (!canRateRoute) return;
      try {
        await setRouteRating(routeId, v);
      } catch {}
    },
    [canRateRoute, routeId]
  );

  const onStopRate = useCallback(
    async (stopId, v) => {
      if (!auth.currentUser || !routeDoc) return;
      if (auth.currentUser.uid === routeDoc.ownerId) return;
      try {
        await setStopRating(stopId, routeId, v);
      } catch {}
    },
    [routeId, routeDoc]
  );

  useEffect(() => {
    if (tab === "gallery") loadAllGallery();
    if (tab === "report") loadReportAgg();
  }, [tab, loadAllGallery, loadReportAgg]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (lightboxItems) {
          setLightboxItems(null);
          return;
        }
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, lightboxItems]);

  const routeModel = routeDoc || initialRoute;

  const isOwner = auth.currentUser && routeDoc && auth.currentUser.uid === routeDoc.ownerId;

  const ratingAvgLabel = useMemo(() => getRouteRatingLabelSafe(routeModel), [routeDoc, initialRoute]);

  const stats = useMemo(() => (routeModel ? buildStatsFromRoute(routeModel) : null), [routeDoc, initialRoute]);

  const { key: audienceKey, label: audienceLabel } = useMemo(
    () => getAudienceFromRoute(routeModel || {}),
    [routeDoc, initialRoute]
  );

  const dateText = useMemo(
    () => formatDateTimeTR(routeModel?.finishedAt || routeModel?.createdAt),
    [routeDoc, initialRoute]
  );

  const distanceText = formatDistanceFromStats(stats);
  const durationText = formatDurationFromStats(stats);
  const stopsText = formatStopsFromStats(stats);
  const avgSpeedText = formatAvgSpeedFromStats(stats);

  const metaBits = [];
  if (dateText) metaBits.push(dateText);
  if (distanceText) metaBits.push(distanceText);
  if (durationText) metaBits.push(durationText);
  if (stopsText) metaBits.push(stopsText);
  if (avgSpeedText) metaBits.push(avgSpeedText);
  const metaLine = metaBits.join(" · ");

  const kpis = [
    { label: "Mesafe", value: distanceText || "—" },
    { label: "Süre", value: durationText || "—" },
    {
      label: "Ort. hız",
      value: stats && stats.avgSpeedKmh ? `${stats.avgSpeedKmh} km/sa` : "—",
    },
    {
      label: "Durak",
      value: stopsText || ((stops || []).length ? `${(stops || []).length} durak` : "—"),
    },
  ];

  let topStops = [];
  if (stopAgg && stops && stops.length) {
    topStops = stops
      .map((s) => {
        const agg = stopAgg[s.id] || { total: 0, avg: 0 };
        const mediaCount = mediaCacheRef.current[s.id]?.items?.length || 0;
        return { stop: s, total: agg.total, avg: agg.avg, mediaCount };
      })
      .sort((a, b) => {
        if ((b.avg || 0) !== (a.avg || 0)) return (b.avg || 0) - (a.avg || 0);
        if ((b.total || 0) !== (a.total || 0)) return (b.total || 0) - (a.total || 0);
        return (b.mediaCount || 0) - (a.mediaCount || 0);
      })
      .slice(0, 3);
  }

  const handleBackdropClick = useCallback(() => onClose(), [onClose]);

  const renderSimpleSheet = (message, extraBody = null) => (
    <div className="route-detail-backdrop" onClick={handleBackdropClick}>
      <div className="route-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="route-detail-grab" />
        <div className="route-detail-header">
          <div className="route-detail-header-top">
            <div className="route-detail-header-main">
              <div className="route-detail-title">Rota</div>
            </div>
          </div>
        </div>
        <div className="route-detail-body">
          <div className="route-detail-tabpanel">
            <div style={{ fontSize: 14, padding: "8px 4px" }}>{message}</div>
            {extraBody}
          </div>
        </div>
        <div className="route-detail-footer">
          <button type="button" className="route-detail-close-btn" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );

  // EMİR 2 + EMİR 4: Forbidden sheet → “Profili aç” + “Yeniden dene”
  const renderForbiddenSheet = () => {
    const ownerId = routeDoc?.ownerId || initialRoute?.ownerId || null;
    const msg = followInitially
      ? "Bu rota takipçilere açık veya özel. Profili açıp takip etmeyi deneyebilirsin."
      : "Bu rota yalnızca takipçilere açık veya özeldir.";

    const cta = (
      <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
        {ownerId ? (
          <button
            type="button"
            onClick={() => {
              try {
                window.dispatchEvent(
                  new CustomEvent("open-profile-modal", { detail: { userId: ownerId } })
                );
              } catch {}
            }}
            style={{
              flex: 1,
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              padding: "12px 12px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Profili aç
          </button>
        ) : null}

        <button
          type="button"
          onClick={retryPermCheck}
          style={{
            flex: 1,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            padding: "12px 12px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Yeniden dene
        </button>

        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            padding: "12px 12px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Kapat
        </button>
      </div>
    );

    return renderSimpleSheet(msg, cta);
  };

  const renderPrefillSheet = () => {
    const title = getRouteTitleSafe(routeModel);
    return (
      <div className="route-detail-backdrop" onClick={handleBackdropClick}>
        <div className="route-detail-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="route-detail-grab" />
          <div className="route-detail-header">
            <div className="route-detail-header-top">
              <div className="route-detail-header-main">
                <div className="route-detail-title" title={title || "Rota"}>
                  {title || "Rota"}
                </div>
                {audienceLabel && (
                  <span
                    className={
                      "route-detail-chip" + (audienceKey ? ` route-detail-chip--${audienceKey}` : "")
                    }
                  >
                    {audienceLabel}
                  </span>
                )}
              </div>
              <div className="route-detail-header-rating">{ratingAvgLabel}</div>
            </div>
            {metaLine && <div className="route-detail-meta">{metaLine}</div>}
            <div className="route-detail-header-actions">
              <button
                type="button"
                className="route-detail-close-icon"
                onClick={onClose}
                title="Kapat"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="route-detail-body">
            <div className="route-detail-tabpanel">
              <div style={{ fontSize: 14, padding: "8px 4px" }}>Rota yükleniyor…</div>
            </div>
          </div>
          <div className="route-detail-footer">
            <button type="button" className="route-detail-close-btn" onClick={onClose}>
              Kapat
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!routeId) return renderSimpleSheet("Rota bulunamadı.");
  if (permError === "forbidden") return renderForbiddenSheet();
  if (permError === "not-found") return renderSimpleSheet("Rota bulunamadı.");
  if (!routeDoc && initialRoute) return renderPrefillSheet();
  if (!routeDoc) return renderSimpleSheet("Rota yükleniyor…");

  const title = getRouteTitleSafe(routeModel);

  return (
    <div className="route-detail-backdrop" onClick={handleBackdropClick}>
      <div className="route-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="route-detail-grab" />

        <div className="route-detail-header">
          <div className="route-detail-header-top">
            <div className="route-detail-header-main">
              <div className="route-detail-title" title={title || "Rota"}>
                {title || "Rota"}
              </div>
              {audienceLabel && (
                <span
                  className={
                    "route-detail-chip" + (audienceKey ? ` route-detail-chip--${audienceKey}` : "")
                  }
                >
                  {audienceLabel}
                </span>
              )}
            </div>
            <div className="route-detail-header-rating">{ratingAvgLabel}</div>
          </div>

          {metaLine && <div className="route-detail-meta">{metaLine}</div>}

          <div className="route-detail-header-actions">
            <button type="button" className="route-detail-pill-btn" onClick={onShare}>
              Paylaş
            </button>
            <button
              type="button"
              className="route-detail-pill-btn"
              onClick={() => setShowShareSheet(true)}
            >
              Görsel Paylaş
            </button>
            <button type="button" className="route-detail-pill-btn" onClick={onExportGpx}>
              GPX
            </button>
            <button
              type="button"
              className="route-detail-close-icon"
              onClick={onClose}
              title="Kapat"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="route-detail-body">
          <div className="route-detail-map">
            <div ref={mapDivRef} className="route-detail-map-inner" />
            {gmapsStatus === "error" && <div className="route-detail-map-error">Harita yüklenemedi</div>}
          </div>
          <div className="route-detail-map-note">Harita önizlemesi bir sonraki adımda geliştirilecek.</div>

          <div className="route-detail-rate-row">
            <div className="route-detail-rate-label">Puanla:</div>
            <StarRatingV2 onRated={(v) => onRouteRate(v)} size={32} disabled={!canRateRoute} />
          </div>

          <div className="route-detail-tabs">
            {["stops", "gallery", "report", "comments"].map((key) => {
              let label;
              if (key === "stops") label = "Duraklar";
              else if (key === "gallery") label = "Galeri";
              else if (key === "report") label = "Rapor";
              else if (key === "comments") {
                label = commentsCount && commentsCount > 0 ? `Yorumlar (${commentsCount})` : "Yorumlar";
              }
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onTabChange(key)}
                  className={
                    "route-detail-tab-button" + (tab === key ? " route-detail-tab-button--active" : "")
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="route-detail-tabpanel">
            {tab === "stops" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(stops || []).map((s) => {
                  const cache = mediaCacheRef.current[s.id] || {};
                  const media = cache.items || [];
                  const up = uploadState[s.id];
                  const hadPermErr = cache.__error && cache.__error.includes("permission");

                  return (
                    <div
                      key={s.id}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 12,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "10px 12px",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            {s.order ? `${s.order}. ` : ""}
                            {s.title || `Durak ${s.order || ""}`}
                          </div>
                          {s.note && (
                            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{s.note}</div>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {stopAgg && stopAgg[s.id] && (
                            <div style={{ minWidth: 120 }}>
                              <StarBars
                                counts={stopAgg[s.id].counts}
                                total={stopAgg[s.id].total}
                                compact
                                height={8}
                                showNumbers={false}
                              />
                            </div>
                          )}

                          <StarRatingV2 onRated={(v) => onStopRate(s.id, v)} size={22} disabled={isOwner} />

                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => onPickMedia(s.id)}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: "1px solid #ddd",
                                background: "#fff",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Medya Ekle
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        onMouseEnter={() => ensureStopThumbs(s.id)}
                        onTouchStart={() => ensureStopThumbs(s.id)}
                        style={{
                          display: "flex",
                          gap: 6,
                          padding: "8px 10px",
                          overflowX: "auto",
                        }}
                      >
                        {media.slice(0, 4).map((m, idx) => (
                          <div
                            key={m.id}
                            onClick={() => {
                              setLightboxIndex(idx);
                              setLightboxItems(media.map((x) => ({ url: x.url, type: x.type })));
                            }}
                            style={{
                              width: 76,
                              height: 76,
                              borderRadius: 8,
                              overflow: "hidden",
                              background: "#f3f4f6",
                              flex: "0 0 auto",
                              cursor: "pointer",
                            }}
                            title={m.type}
                          >
                            {m.type === "video" ? (
                              <video
                                src={m.url}
                                muted
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <img
                                src={m.url}
                                alt="media"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            )}
                          </div>
                        ))}
                        {media.length === 0 && (
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {hadPermErr ? "Medya erişimi kısıtlı." : "Medya yok"}
                          </div>
                        )}
                      </div>

                      {up && (
                        <div style={{ padding: "0 10px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                flex: 1,
                                height: 8,
                                background: "#eee",
                                borderRadius: 999,
                                overflow: "hidden",
                              }}
                            >
                              <div style={{ width: `${up.p || 0}%`, height: "100%", background: "#1a73e8" }} />
                            </div>
                            <div style={{ fontSize: 12, width: 36, textAlign: "right" }}>{up.p || 0}%</div>
                            <button
                              type="button"
                              onClick={() => cancelUpload(s.id)}
                              style={{
                                fontSize: 12,
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                              }}
                            >
                              İptal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {(stops || []).length === 0 && (
                  <div style={{ padding: "10px 4px", fontSize: 13, opacity: 0.7 }}>
                    Bu rotada durak yok.
                  </div>
                )}
              </div>
            )}

            {tab === "gallery" && (
              <div>
                {!galleryLoaded && (
                  <div style={{ padding: "8px 4px", fontSize: 13, opacity: 0.75 }}>
                    Galeri yükleniyor…
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  {galleryItems.map((m, idx) => (
                    <div
                      key={`${m.stopId}_${m.id}`}
                      onClick={() => {
                        setLightboxIndex(idx);
                        setLightboxItems(galleryItems.map((x) => ({ url: x.url, type: x.type })));
                      }}
                      style={{
                        width: "100%",
                        aspectRatio: "1/1",
                        background: "#f3f4f6",
                        borderRadius: 8,
                        overflow: "hidden",
                        cursor: "pointer",
                      }}
                    >
                      {m.type === "video" ? (
                        <video src={m.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <img src={m.url} alt="media" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                    </div>
                  ))}
                </div>
                {galleryItems.length === 0 && (
                  <div style={{ padding: "10px 4px", fontSize: 13, opacity: 0.7 }}>
                    Gösterilecek medya yok.
                  </div>
                )}
              </div>
            )}

            {tab === "report" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {kpis.map((k) => (
                    <div
                      key={k.label}
                      style={{ border: "1px solid #eee", borderRadius: 10, padding: "10px 12px" }}
                    >
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{k.label}</div>
                      <div style={{ fontWeight: 800, fontSize: 16, marginTop: 2 }}>{k.value}</div>
                    </div>
                  ))}
                  <div style={{ border: "1px solid #eee", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Medya</div>
                    <div style={{ fontWeight: 800, fontSize: 16, marginTop: 2 }}>
                      {Object.values(mediaCacheRef.current).reduce(
                        (acc, v) => acc + ((v?.items || []).length || 0),
                        0
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ border: "1px solid #eee", borderRadius: 10, padding: "12px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontWeight: 800 }}>Yıldız dağılımı (rota)</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Ort: {routeAgg ? routeAgg.avg.toFixed(1) : "—"} • Oy: {routeAgg ? routeAgg.total : "—"}
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <StarBars counts={routeAgg?.counts || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }} total={routeAgg?.total || 0} />
                  </div>
                </div>

                <div style={{ border: "1px solid #eee", borderRadius: 10, padding: "12px 12px" }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>En çok beğenilen 3 durak</div>
                  {topStops.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>Veri yok.</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {topStops.map((it, i) => (
                      <div
                        key={it.stop.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          border: "1px solid #f2f2f2",
                          padding: "10px",
                          borderRadius: 8,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {i + 1}. {it.stop.title || `Durak ${it.stop.order || ""}`}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          Ort: {it.avg.toFixed(1)} • Oy: {it.total} • Medya: {it.mediaCount}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  Not: Dağılımlar client’ta hesaplanır; çok büyük veride sınırlı gösterim yapılır (≈).
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="route-detail-footer">
          <button type="button" className="route-detail-close-btn" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>

      {showShareSheet && (
        <div className="route-detail-share-overlay">
          <ShareSheetMobile
            route={buildShareRoutePayload(routeDoc || initialRoute, owner, routeId)}
            stops={stops}
            onClose={() => setShowShareSheet(false)}
          />
        </div>
      )}

      <CommentsPanel
        open={tab === "comments"}
        targetType="route"
        targetId={routeId}
        placeholder="Bu rota hakkında ne düşünüyorsun?"
        onClose={() => onTabChange("stops")}
      />

      {lightboxItems && (
        <Lightbox items={lightboxItems} index={lightboxIndex} onClose={() => setLightboxItems(null)} />
      )}
    </div>
  );
}
