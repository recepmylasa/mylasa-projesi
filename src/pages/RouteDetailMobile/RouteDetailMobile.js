// src/pages/RouteDetailMobile/RouteDetailMobile.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./RouteDetailMobile.css";

import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";

import { setRouteRating, setStopRating } from "../../services/routeRatings";
import { watchRoute, watchStops } from "../../services/routesRead";
import { buildGpx, downloadGpx } from "../../services/gpx";

import StarRatingV2 from "../../components/StarRatingV2/StarRatingV2";
import CommentsPanel from "../../components/CommentsPanel/CommentsPanel";
import { useGoogleMaps } from "../../hooks/useGoogleMaps";
import ShareSheetMobile from "../../components/ShareSheetMobile";
import { watchCommentsCount } from "../../commentsClient";

import Lightbox from "./components/Lightbox";
import StarBars from "./components/StarBars";

import {
  buildShareRoutePayload,
  buildStatsFromRoute,
  formatAvgSpeedFromStats,
  formatDateTimeTR,
  formatDistanceFromStats,
  formatDurationFromStats,
  formatStopsFromStats,
  getAudienceFromRoute,
  getOwnerHintFromUrl,
  getRouteRatingLabelSafe,
  getRouteTitleSafe,
  getValidLatLng,
  getVisibilityKeyFromRoute,
  resolveOwnerIdForLockedRoute,
} from "./routeDetailUtils";

// ✅ Backward export güvenliği için (named export yoksa bile build patlamasın)
import * as routeDetailUtilsNS from "./routeDetailUtils";

import { getRouteStarsAgg, getStopsStarsAgg } from "./routeDetailAgg";
import { listStopMediaInline, uploadStopMediaInline } from "./routeDetailMedia";

const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const MAP_ID = (process.env.REACT_APP_GMAPS_MAP_ID || "").trim();

/**
 * ✅ EMİR 2 — Harita fit mantığı (path+stops), tek nokta zoom fix, güçlü imza,
 * loading/error overlay + retry (hook’a dokunmadan remount)
 */
function RouteDetailMapPreview({ routeId, path = [], stops = [], stopsLoaded = false, onRetry = () => {} }) {
  const { gmapsStatus, mapDivRef, mapRef } = useGoogleMaps({ API_KEY, MAP_ID });

  const polylineRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const lastFitSigRef = useRef(null);
  const rafRef = useRef(0);

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

    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    rafRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      clearMapArtifacts();
    };
  }, [clearMapArtifacts]);

  // ✅ Polyline + stop markers güncelle (kamera fit burada yok)
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
      (path || []).forEach((p) => {
        const ll = getValidLatLng(p?.lat, p?.lng);
        if (!ll) return;
        pts.push(new window.google.maps.LatLng(ll.lat, ll.lng));
      });
      polylineRef.current.setPath(pts);

      // markers
      stopMarkersRef.current.forEach((m) => {
        try {
          m.setMap(null);
        } catch {}
      });
      stopMarkersRef.current = [];

      (stops || []).forEach((s) => {
        const ll = getValidLatLng(s?.lat, s?.lng);
        if (!ll) return;
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
  }, [gmapsStatus, mapRef, path, stops]);

  // ✅ Fit imzası (routeId | pathLen | stopsLen | bbox | sample)
  const buildFitSignature = useCallback(() => {
    const pathPts = [];
    (path || []).forEach((p) => {
      const ll = getValidLatLng(p?.lat, p?.lng);
      if (ll) pathPts.push(ll);
    });

    const stopPts = [];
    (stops || []).forEach((s) => {
      const ll = getValidLatLng(s?.lat, s?.lng);
      if (ll) stopPts.push(ll);
    });

    const all = [...pathPts, ...stopPts];

    // uniq (stabil)
    const seen = new Set();
    const uniq = [];
    all.forEach((ll) => {
      const k = `${Number(ll.lat).toFixed(6)},${Number(ll.lng).toFixed(6)}`;
      if (seen.has(k)) return;
      seen.add(k);
      uniq.push(ll);
    });

    if (!uniq.length) {
      return { uniq, sig: `${routeId || ""}|p${pathPts.length}|s${stopPts.length}|empty` };
    }

    let minLat = uniq[0].lat,
      minLng = uniq[0].lng,
      maxLat = uniq[0].lat,
      maxLng = uniq[0].lng;

    uniq.forEach((ll) => {
      minLat = Math.min(minLat, ll.lat);
      minLng = Math.min(minLng, ll.lng);
      maxLat = Math.max(maxLat, ll.lat);
      maxLng = Math.max(maxLng, ll.lng);
    });

    const mid = uniq[Math.floor(uniq.length / 2)];
    const bboxStr = `${minLat.toFixed(5)},${minLng.toFixed(5)},${maxLat.toFixed(5)},${maxLng.toFixed(5)}`;
    const midStr = mid ? `${Number(mid.lat).toFixed(5)},${Number(mid.lng).toFixed(5)}` : "0,0";

    const sig = `${routeId || ""}|p${pathPts.length}|s${stopPts.length}|bb${bboxStr}|m${midStr}`;
    return { uniq, sig };
  }, [routeId, path, stops]);

  // ✅ Kamera fit: SADECE routeId+imza değişince (tab/rating/comments etkisiz)
  useEffect(() => {
    if (gmapsStatus !== "ready" || !mapRef.current) return;
    if (!routeId) return;

    // ✅ stops snapshot gelmeden ilk fit atma (path-only -> sonra stops gelince zıplamasın)
    if (!stopsLoaded) return;

    const map = mapRef.current;
    const { uniq, sig } = buildFitSignature();

    if (!uniq.length) return;
    if (lastFitSigRef.current === sig) return;
    lastFitSigRef.current = sig;

    try {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    } catch {}
    rafRef.current = requestAnimationFrame(() => {
      try {
        if (!mapRef.current) return;
        if (uniq.length === 1) {
          map.setCenter({ lat: uniq[0].lat, lng: uniq[0].lng });
          map.setZoom(15); // ✅ tek nokta fix (direkt)
          return;
        }

        const b = new window.google.maps.LatLngBounds();
        uniq.forEach((ll) => b.extend(new window.google.maps.LatLng(ll.lat, ll.lng)));

        try {
          map.fitBounds(b, 40);
        } catch {
          map.fitBounds(b);
        }
      } catch {}
    });
  }, [gmapsStatus, mapRef, routeId, stopsLoaded, buildFitSignature]);

  const overlayWrap = {
    position: "absolute",
    inset: 0,
    zIndex: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    background: "linear-gradient(180deg, rgba(255,255,255,.96), rgba(255,255,255,.92))",
    backdropFilter: "blur(2px)",
  };

  const card = {
    width: "min(340px, 92%)",
    borderRadius: 16,
    border: "1px solid #eee",
    background: "#fff",
    boxShadow: "0 10px 28px rgba(0,0,0,.10)",
    padding: 14,
  };

  const btn = {
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    padding: "10px 12px",
    fontWeight: 900,
    cursor: "pointer",
    width: "100%",
  };

  const subtleBtn = {
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "#fff",
    color: "#111",
    padding: "10px 12px",
    fontWeight: 900,
    cursor: "pointer",
    width: "100%",
  };

  const showLoading = gmapsStatus !== "ready" && gmapsStatus !== "error";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <style>{`@keyframes mylasaSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      <div ref={mapDivRef} className="route-detail-map-inner" />

      {showLoading && (
        <div style={overlayWrap}>
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border: "2px solid #e5e7eb",
                  borderTopColor: "#111",
                  animation: "mylasaSpin .9s linear infinite",
                }}
              />
              <div style={{ fontWeight: 900, fontSize: 14, color: "#111" }}>Harita yükleniyor…</div>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <div style={{ height: 10, borderRadius: 999, background: "#f3f4f6" }} />
              <div style={{ height: 10, borderRadius: 999, background: "#f3f4f6", width: "78%" }} />
              <div style={{ height: 10, borderRadius: 999, background: "#f3f4f6", width: "64%" }} />
            </div>

            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.65 }}>Bağlantın yavaşsa birkaç saniye sürebilir.</div>
          </div>
        </div>
      )}

      {gmapsStatus === "error" && (
        <div style={overlayWrap}>
          <div style={card}>
            <div style={{ fontWeight: 950, fontSize: 14, color: "#111" }}>Harita yüklenemedi</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>Bağlantını kontrol edip tekrar deneyebilirsin.</div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <button type="button" style={btn} onClick={onRetry}>
                Tekrar dene
              </button>
              <button
                type="button"
                style={subtleBtn}
                onClick={() => {
                  try {
                    // küçük bir “yumuşak” fallback: aynı component içinde bir şey yapmadan da tıklama hissi
                  } catch {}
                }}
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RouteDetailMobile({
  routeId,
  initialRoute = null,
  source = null,
  followInitially = false, // ?follow=1 ipucu
  ownerFromLink = null, // ?owner=... (doc okunamasa bile CTA çalışsın)
  onClose = () => {
    try {
      window.history.back();
    } catch {}
  },
}) {
  const readTabFromUrl = () => {
    if (typeof window === "undefined") return "stops";
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t === "gallery" || t === "report" || t === "comments" || t === "stops") return t;
    } catch {}
    return "stops";
  };

  // ✅ Portal hedefi (fixed + transform problemlerini kökten çözer)
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const withPortal = useCallback((node) => (portalTarget ? createPortal(node, portalTarget) : node), [portalTarget]);

  // ✅ Modal açıkken body scroll’u kilitle (arka sayfa “kaymasın”)
  useEffect(() => {
    if (!portalTarget) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [portalTarget]);

  const [tab, setTab] = useState(() => readTabFromUrl());

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
  const [stopsLoaded, setStopsLoaded] = useState(false);
  const [owner, setOwner] = useState(null);
  const [permError, setPermError] = useState(null); // null | "forbidden" | "private" | "not-found"

  const [permCheckTick, setPermCheckTick] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);

  // ✅ Map-based cache (EMİR 42 uyumlu) + EMİR 43 reset’te temizlenecek
  const mediaCacheRef = useRef(new Map());
  const [mediaTick, setMediaTick] = useState(0);

  // ✅ mediaTick rAF throttle (premium performans)
  const mediaTickRafRef = useRef(0);
  const bumpMediaTick = useCallback(() => {
    if (mediaTickRafRef.current) return;
    mediaTickRafRef.current = requestAnimationFrame(() => {
      mediaTickRafRef.current = 0;
      setMediaTick((x) => x + 1);
    });
  }, []);

  // ✅ Gallery batching state/refs (EMİR 6)
  const [galleryState, setGalleryState] = useState({ loading: false, done: false, errorCount: 0 });
  const galleryInFlightRef = useRef(false);
  const galleryJobIdRef = useRef(0);
  const galleryCursorRef = useRef(0);
  const gallerySentinelRef = useRef(null);
  const routeBodyRef = useRef(null);

  const [lightboxItems, setLightboxItems] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [showShareSheet, setShowShareSheet] = useState(false);

  const [routeAgg, setRouteAgg] = useState(null);
  const [stopAgg, setStopAgg] = useState(null);
  const [uploadState, setUploadState] = useState({});

  // ✅ EMİR 2 — retry: map’i remount et (hook’a dokunmadan)
  const [mapsRetryTick, setMapsRetryTick] = useState(0);
  const retryMap = useCallback(() => setMapsRetryTick((x) => x + 1), []);

  const routeModel = routeDoc || initialRoute;

  const ownerHint = useMemo(() => {
    if (ownerFromLink) return String(ownerFromLink);
    const fromUrl = getOwnerHintFromUrl();
    if (fromUrl) return fromUrl;
    const fromInitial = initialRoute?.ownerId || initialRoute?.owner || null;
    return fromInitial ? String(fromInitial) : null;
  }, [ownerFromLink, initialRoute]);

  const [lockedOwnerId, setLockedOwnerId] = useState(null);
  const [lockedOwnerDoc, setLockedOwnerDoc] = useState(null);

  // === Medya tip normalizasyonu (EMİR 6/C) ===
  const normalizeMediaType = useCallback((it) => {
    try {
      const t = String(it?.type || it?.mime || it?.contentType || "").toLowerCase();
      const u = String(it?.url || "").toLowerCase();

      if (t.includes("video")) return "video";
      if (t.includes("image") || t.includes("photo") || t.includes("img")) return "image";

      if (u.match(/\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i)) return "video";
      return "image";
    } catch {
      return "image";
    }
  }, []);

  const buildLightboxItems = useCallback(
    (arr) => {
      const out = [];
      (arr || []).forEach((x) => {
        const url = x?.url ? String(x.url) : "";
        if (!url) return;
        out.push({
          url,
          type: normalizeMediaType(x),
          title: x?.title || x?.name || "",
        });
      });
      return out;
    },
    [normalizeMediaType]
  );

  // =========================
  // ✅ EMİR 43 — routeId değişince TAM RESET (+ EMİR 6/A3 ref resetleri)
  // =========================
  useEffect(() => {
    // 1) temel veri/state
    setRouteDoc(null);
    setStops([]);
    setStopsLoaded(false);
    setOwner(null);

    // 2) izin + sayaçlar
    setPermError(null);
    setCommentsCount(null);

    // 3) rapor/galeri
    setRouteAgg(null);
    setStopAgg(null);
    setGalleryState({ loading: false, done: false, errorCount: 0 });

    // 4) overlay/UI
    setShowShareSheet(false);
    setLightboxItems(null);
    setLightboxIndex(0);

    // 5) locked owner
    setLockedOwnerId(null);
    setLockedOwnerDoc(null);

    // 6) upload’ları abort et + state sıfırla
    setUploadState((prev) => {
      try {
        Object.values(prev || {}).forEach((v) => {
          try {
            v?.abort?.abort?.();
          } catch {}
        });
      } catch {}
      return {};
    });

    // 7) media cache sıfırla
    mediaCacheRef.current = new Map();
    bumpMediaTick();

    // 8) tab’i URL’den tekrar oku (ya da default “stops”)
    setTab(readTabFromUrl());

    // 9) map retry tick reset (yeni rota = temiz init)
    setMapsRetryTick(0);

    // ✅ EMİR 6/A3: gallery refs reset
    galleryJobIdRef.current += 1;
    galleryCursorRef.current = 0;
    galleryInFlightRef.current = false;

    try {
      if (mediaTickRafRef.current) cancelAnimationFrame(mediaTickRafRef.current);
    } catch {}
    mediaTickRafRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const openProfile = useCallback((userId) => {
    if (!userId) return;
    try {
      window.dispatchEvent(new CustomEvent("open-profile-modal", { detail: { userId } }));
    } catch {}
  }, []);

  // İzin / 404 kontrolü
  useEffect(() => {
    if (!routeId) {
      setPermError("not-found");
      setRouteDoc(null);
      setOwner(null);
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
        if (code.includes("permission") || code.includes("denied")) setPermError("forbidden");
        else setPermError(null);
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

  // Locked (forbidden/private/not-found) durumunda ownerId resolve et (owner param yoksa)
  useEffect(() => {
    if (!routeId) return;
    if (!(permError === "forbidden" || permError === "private" || permError === "not-found")) return;

    let alive = true;
    (async () => {
      const direct = ownerHint || routeModel?.ownerId || routeModel?.owner || owner?.id || null;
      const baseOwnerId = direct ? String(direct) : null;

      if (baseOwnerId) {
        if (!alive) return;
        setLockedOwnerId(baseOwnerId);

        try {
          const u = await getDoc(doc(db, "users", baseOwnerId));
          if (!alive) return;
          if (u.exists()) setLockedOwnerDoc({ id: u.id, ...u.data() });
        } catch {
          if (!alive) return;
          setLockedOwnerDoc(null);
        }
        return;
      }

      const oid = await resolveOwnerIdForLockedRoute(routeId);
      if (!alive) return;

      if (oid) {
        setLockedOwnerId(oid);
        try {
          const u = await getDoc(doc(db, "users", oid));
          if (!alive) return;
          if (u.exists()) setLockedOwnerDoc({ id: u.id, ...u.data() });
        } catch {
          if (!alive) return;
          setLockedOwnerDoc(null);
        }
      } else {
        setLockedOwnerId(null);
        setLockedOwnerDoc(null);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, permError, ownerHint]);

  // Route okunabiliyorsa ama visibility “private” ise UI’da da kilitle (tek standart)
  useEffect(() => {
    if (!routeId) return;
    if (!routeModel) return;

    const vis = getVisibilityKeyFromRoute(routeModel);
    if (vis !== "private") {
      if (permError === "private") setPermError(null);
      return;
    }

    const uid = auth.currentUser?.uid ? String(auth.currentUser.uid) : "";
    const oid = routeModel?.ownerId ? String(routeModel.ownerId) : "";
    const mine = uid && oid && uid === oid;

    if (!mine) setPermError("private");
    else if (permError === "private") setPermError(null);
  }, [routeId, routeModel, permError]);

  const ownerIdForProfile = useMemo(() => {
    const fromRoute = routeDoc?.ownerId || initialRoute?.ownerId || initialRoute?.owner || null;
    return (
      (fromRoute ? String(fromRoute) : null) ||
      (owner?.id ? String(owner.id) : null) ||
      (lockedOwnerId ? String(lockedOwnerId) : null) ||
      (ownerHint ? String(ownerHint) : null) ||
      null
    );
  }, [routeDoc?.ownerId, initialRoute, owner?.id, lockedOwnerId, ownerHint]);

  const accessSheet = useCallback(
    (kind) => {
      const loggedIn = !!auth.currentUser;

      let headerTitle = "Rota";
      let desc = "Bu rota şu anda görüntülenemiyor.";
      if (kind === "not-found") {
        headerTitle = "Rota bulunamadı";
        desc = "Bağlantı hatalı olabilir veya rota kaldırılmış olabilir.";
      } else if (kind === "private") {
        headerTitle = "Bu rota özel";
        desc = "Bu rota yalnızca sahibi tarafından görüntülenebilir.";
      } else if (kind === "forbidden") {
        headerTitle = "Bu rota sınırlı";
        desc = followInitially
          ? "Rotayı görüntülemek için rota sahibini takip etmen gerekebilir."
          : "Rotayı görüntülemek için izin gerekiyor (rota özel veya takipçilere açık olabilir).";
      }

      const loginNote = loggedIn ? null : "Devam etmek için giriş yapman gerekebilir.";

      const btnRow = { marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" };

      const primaryBtn = {
        flex: "1 1 160px",
        borderRadius: 12,
        border: "1px solid #111",
        background: "#111",
        color: "#fff",
        padding: followInitially ? "14px 12px" : "12px 12px",
        fontWeight: 900,
        cursor: ownerIdForProfile ? "pointer" : "not-allowed",
        opacity: ownerIdForProfile ? 1 : 0.55,
      };

      const secondaryBtn = {
        flex: "1 1 160px",
        borderRadius: 12,
        border: "1px solid #ddd",
        background: "#fff",
        color: "#111",
        padding: "12px 12px",
        fontWeight: 900,
        cursor: "pointer",
      };

      const userPreview = lockedOwnerDoc || owner;

      return (
        <div className="route-detail-backdrop" onClick={onClose}>
          <div className="route-detail-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="route-detail-grab" />
            <div className="route-detail-header">
              <div className="route-detail-header-top">
                <div className="route-detail-header-main">
                  <div className="route-detail-title">{headerTitle}</div>
                </div>
              </div>
            </div>

            <div className="route-detail-body">
              <div className="route-detail-tabpanel">
                <div style={{ fontSize: 14, padding: "6px 4px", fontWeight: 800 }}>{desc}</div>
                {loginNote && <div style={{ fontSize: 12, padding: "4px 4px 0", opacity: 0.75 }}>{loginNote}</div>}

                {userPreview && (
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 10px",
                      border: "1px solid #eee",
                      borderRadius: 12,
                      background: "#fff",
                    }}
                  >
                    {userPreview.photoURL || userPreview.profilFoto || userPreview.avatar ? (
                      <img
                        src={userPreview.photoURL || userPreview.profilFoto || userPreview.avatar}
                        alt=""
                        style={{ width: 34, height: 34, borderRadius: 999, objectFit: "cover" }}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div style={{ width: 34, height: 34, borderRadius: 999, background: "#eee" }} />
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 13, color: "#111" }}>
                        {userPreview.username || userPreview.userName || userPreview.handle || userPreview.name || "Profil"}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {ownerIdForProfile ? `ID: ${ownerIdForProfile}` : "Profil bilgisi bulunamadı"}
                      </div>
                    </div>
                  </div>
                )}

                <div style={btnRow}>
                  <button
                    type="button"
                    style={primaryBtn}
                    onClick={() => {
                      if (!ownerIdForProfile) return;
                      openProfile(ownerIdForProfile);
                    }}
                  >
                    Profili aç
                  </button>

                  {(kind === "forbidden" || kind === "private") && (
                    <button type="button" style={secondaryBtn} onClick={retryPermCheck}>
                      Yeniden dene
                    </button>
                  )}

                  <button type="button" style={secondaryBtn} onClick={onClose}>
                    Kapat
                  </button>
                </div>
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
    },
    [followInitially, lockedOwnerDoc, onClose, openProfile, owner, ownerIdForProfile, retryPermCheck]
  );

  // Comments count (forbidden/private/not-found iken izleme yapma)
  useEffect(() => {
    if (!routeId) return;
    if (permError === "forbidden" || permError === "private" || permError === "not-found") return;

    let unsubscribe;
    try {
      unsubscribe = watchCommentsCount({ targetType: "route", targetId: routeId }, (cnt) =>
        setCommentsCount(typeof cnt === "number" ? cnt : 0)
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
  }, [routeId, reloadTick, permError]);

  // Route + Stops watchers (forbidden/private/not-found iken subscribe etme)
  useEffect(() => {
    if (!routeId) return;
    if (permError === "forbidden" || permError === "private" || permError === "not-found") return;

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
      setStopsLoaded(true);
    });

    return () => {
      try {
        offRoute();
      } catch {}
      try {
        offStops();
      } catch {}
    };
  }, [routeId, reloadTick, permError]);

  // ✅ EMİR 6/A2: listStopMediaInline throw-safe + cache flags (thumbs)
  const ensureStopThumbs = useCallback(
    async (stopId) => {
      if (!routeId || !stopId) return;

      const existing = mediaCacheRef.current.get(stopId) || {};
      if (existing.__loadedThumbs || existing.__thumbsAttempted) return;

      let items = [];
      let error = null;

      try {
        const res = await listStopMediaInline({ routeId, stopId, limit: 4 });
        items = res?.items || [];
        error = res?.error || null;
      } catch (e) {
        error = String(e?.code || e?.message || e || "unknown");
        items = [];
      }

      const prev = mediaCacheRef.current.get(stopId) || {};
      const nextItems = items && items.length ? items : prev.items || [];

      mediaCacheRef.current.set(stopId, {
        ...prev,
        items: nextItems,
        __loadedThumbs: true,
        __thumbsAttempted: true,
        ...(error ? { __error: error } : { __error: null }),
      });

      if (error && !prev.__error) {
        setGalleryState((s) => ({ ...s, errorCount: (Number(s?.errorCount) || 0) + 1 }));
      }

      bumpMediaTick();
    },
    [routeId, bumpMediaTick]
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

  const galleryItems = useMemo(() => {
    const arr = [];
    try {
      for (const [sid, val] of mediaCacheRef.current.entries()) {
        const items = val?.items || [];
        items.forEach((it) => arr.push({ ...it, stopId: sid }));
      }
    } catch {}
    return arr.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [mediaTick]);

  // ✅ EMİR 6/A1+A2: Gallery batch loader (inFlight try/finally + throw-safe)
  const loadNextGalleryBatch = useCallback(async () => {
    if (!routeId) return;
    if (galleryInFlightRef.current) return;

    const jobId = galleryJobIdRef.current;
    galleryInFlightRef.current = true;

    setGalleryState((s) => ({ ...s, loading: true }));

    try {
      const batchSize = 4;
      const list = stops || [];
      const start = Math.max(0, Number(galleryCursorRef.current) || 0);

      const slice = list.slice(start, start + batchSize);
      if (!slice.length) {
        if (galleryJobIdRef.current === jobId) {
          setGalleryState((s) => ({ ...s, loading: false, done: true }));
        }
        return;
      }

      let newErrors = 0;

      await Promise.all(
        slice.map(async (s) => {
          const stopId = s?.id;
          if (!stopId) return;

          const prev = mediaCacheRef.current.get(stopId) || {};
          if (prev.__loadedGalleryAttempted) return;

          let items = null;
          let error = null;

          try {
            const res = await listStopMediaInline({ routeId, stopId, limit: 50 });
            items = res?.items || [];
            error = res?.error || null;
          } catch (e) {
            items = null;
            error = String(e?.code || e?.message || e || "unknown");
          }

          const before = mediaCacheRef.current.get(stopId) || {};
          const nextItems = Array.isArray(items) && items.length ? items : before.items || [];

          mediaCacheRef.current.set(stopId, {
            ...before,
            items: nextItems,
            __loadedGalleryAttempted: true, // ✅ aynı stop’a sonsuz deneme olmasın
            __loadedThumbs: true,
            ...(error ? { __error: error } : { __error: null }),
          });

          if (error && !before.__error) newErrors += 1;
        })
      );

      // job değiştiyse state yazma (ama finally inFlight bırakacak)
      if (galleryJobIdRef.current !== jobId) return;

      galleryCursorRef.current = start + slice.length;
      const done = galleryCursorRef.current >= (stops || []).length;

      setGalleryState((s) => ({
        ...s,
        loading: false,
        done,
        errorCount: (Number(s?.errorCount) || 0) + newErrors,
      }));

      bumpMediaTick();
    } catch (e) {
      if (galleryJobIdRef.current === jobId) {
        setGalleryState((s) => ({
          ...s,
          loading: false, // ✅ UI “yükleniyor…”da kalmasın
          errorCount: (Number(s?.errorCount) || 0) + 1,
        }));
      }
    } finally {
      // ✅ EMİR 6/A1: inFlight kesin bırak
      galleryInFlightRef.current = false;
    }
  }, [routeId, stops, bumpMediaTick]);

  // Gallery auto-load sentinel (scroll ile)
  useEffect(() => {
    if (tab !== "gallery") return;

    // ilk batch
    loadNextGalleryBatch();

    const rootEl = routeBodyRef.current;
    const sentinel = gallerySentinelRef.current;

    if (!rootEl || !sentinel || typeof IntersectionObserver === "undefined") return;

    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!alive) return;
        const e = entries?.[0];
        if (!e?.isIntersecting) return;
        if (galleryInFlightRef.current) return;
        if (galleryState?.done) return;
        loadNextGalleryBatch();
      },
      { root: rootEl, threshold: 0.08 }
    );

    try {
      io.observe(sentinel);
    } catch {}

    return () => {
      alive = false;
      try {
        io.disconnect();
      } catch {}
    };
  }, [tab, loadNextGalleryBatch, galleryState?.done]);

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
              onProgress: (p) => setUploadState((s) => ({ ...s, [stopId]: { ...(s[stopId] || {}), p } })),
              signal: ac.signal,
            });

            const cur = mediaCacheRef.current.get(stopId)?.items || [];
            mediaCacheRef.current.set(stopId, {
              items: [res, ...cur],
              __loadedThumbs: true,
              __error: null,
            });
            bumpMediaTick();
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
    [routeId, routeDoc, bumpMediaTick]
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
    const ownerUid = routeDoc?.ownerId || initialRoute?.ownerId || owner?.id || ownerHint || lockedOwnerId || null;

    const params = new URLSearchParams();
    params.set("follow", "1");
    params.set("from", "share");
    if (ownerUid) params.set("owner", String(ownerUid));

    const url = `${window.location.origin}/r/${encodeURIComponent(routeId)}?${params.toString()}`;
    const title = getRouteTitleSafe(routeDoc || initialRoute);

    try {
      if (navigator.share) await navigator.share({ url, title, text: title });
      else {
        await navigator.clipboard.writeText(url);
        alert("Bağlantı kopyalandı");
      }
    } catch {}
  }, [routeId, routeDoc, initialRoute, owner, ownerHint, lockedOwnerId]);

  const onExportGpx = useCallback(async () => {
    try {
      const xml = buildGpx({ route: routeDoc, stops, path: routeDoc?.path || [] });
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
    if (tab === "report") loadReportAgg();
  }, [tab, loadReportAgg]);

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

  const isOwner = auth.currentUser && routeDoc && auth.currentUser.uid === routeDoc.ownerId;

  const ratingAvgLabel = useMemo(() => getRouteRatingLabelSafe(routeModel), [routeModel]);
  const stats = useMemo(() => (routeModel ? buildStatsFromRoute(routeModel) : null), [routeModel]);

  const { key: audienceKey, label: audienceLabel } = useMemo(() => getAudienceFromRoute(routeModel || {}), [routeModel]);

  const dateText = useMemo(() => formatDateTimeTR(routeModel?.finishedAt || routeModel?.createdAt), [routeModel]);

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
    { label: "Ort. hız", value: stats && stats.avgSpeedKmh ? `${stats.avgSpeedKmh} km/sa` : "—" },
    { label: "Durak", value: stopsText || ((stops || []).length ? `${(stops || []).length} durak` : "—") },
  ];

  let topStops = [];
  if (stopAgg && stops && stops.length) {
    topStops = stops
      .map((s) => {
        const agg = stopAgg[s.id] || { total: 0, avg: 0 };
        const mediaCount = mediaCacheRef.current.get(s.id)?.items?.length || 0;
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
                  <span className={"route-detail-chip" + (audienceKey ? ` route-detail-chip--${audienceKey}` : "")}>
                    {audienceLabel}
                  </span>
                )}
              </div>
              <div className="route-detail-header-rating">{ratingAvgLabel}</div>
            </div>
            {metaLine && <div className="route-detail-meta">{metaLine}</div>}
            <div className="route-detail-header-actions">
              <button type="button" className="route-detail-close-icon" onClick={onClose} title="Kapat">
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

  // === Tek standart erişim sheet’leri ===
  if (!routeId) return withPortal(accessSheet("not-found"));
  if (permError === "forbidden") return withPortal(accessSheet("forbidden"));
  if (permError === "private") return withPortal(accessSheet("private"));
  if (permError === "not-found") return withPortal(accessSheet("not-found"));

  if (!routeDoc && initialRoute) return withPortal(renderPrefillSheet());
  if (!routeDoc) return withPortal(accessSheet("forbidden"));

  const title = getRouteTitleSafe(routeModel);

  const content = (
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
                <span className={"route-detail-chip" + (audienceKey ? ` route-detail-chip--${audienceKey}` : "")}>
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
            <button type="button" className="route-detail-pill-btn" onClick={() => setShowShareSheet(true)}>
              Görsel Paylaş
            </button>
            <button type="button" className="route-detail-pill-btn" onClick={onExportGpx}>
              GPX
            </button>
            <button type="button" className="route-detail-close-icon" onClick={onClose} title="Kapat">
              ✕
            </button>
          </div>
        </div>

        <div className="route-detail-body" ref={routeBodyRef}>
          <div className="route-detail-map" style={{ position: "relative" }}>
            <RouteDetailMapPreview
              key={mapsRetryTick}
              routeId={routeId}
              path={routeDoc?.path || []}
              stops={stops || []}
              stopsLoaded={stopsLoaded}
              onRetry={retryMap}
            />
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
              else if (key === "comments")
                label = commentsCount && commentsCount > 0 ? `Yorumlar (${commentsCount})` : "Yorumlar";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onTabChange(key)}
                  className={"route-detail-tab-button" + (tab === key ? " route-detail-tab-button--active" : "")}
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
                  const cache = mediaCacheRef.current.get(s.id) || {};
                  const media = cache.items || [];
                  const up = uploadState[s.id];
                  const hadPermErr = cache.__error && String(cache.__error).includes("permission");

                  return (
                    <div key={s.id} style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
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
                          {s.note && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{s.note}</div>}
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
                        style={{ display: "flex", gap: 6, padding: "8px 10px", overflowX: "auto" }}
                      >
                        {media.slice(0, 4).map((m, idx) => {
                          const isVideo = normalizeMediaType(m) === "video";
                          return (
                            <div
                              key={m.id}
                              className="route-detail-media-tile"
                              onClick={() => {
                                setLightboxIndex(idx);
                                setLightboxItems(buildLightboxItems(media)); // ✅ type normalize
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
                              {isVideo && (
                                <div className="route-detail-video-badge" aria-hidden="true">
                                  ▶︎
                                </div>
                              )}

                              {isVideo ? (
                                <video
                                  src={m.url}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  disablePictureInPicture
                                  controlsList="nodownload noplaybackrate"
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                <img
                                  src={m.url}
                                  alt="media"
                                  loading="lazy"
                                  decoding="async"
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              )}
                            </div>
                          );
                        })}

                        {media.length === 0 && (
                          <div style={{ fontSize: 12, opacity: 0.7 }}>{hadPermErr ? "Medya erişimi kısıtlı." : "Medya yok"}</div>
                        )}
                      </div>

                      {up && (
                        <div style={{ padding: "0 10px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1, height: 8, background: "#eee", borderRadius: 999, overflow: "hidden" }}>
                              <div style={{ width: `${up.p || 0}%`, height: "100%", background: "#1a73e8" }} />
                            </div>
                            <div style={{ fontSize: 12, width: 36, textAlign: "right" }}>{up.p || 0}%</div>
                            <button
                              type="button"
                              onClick={() => cancelUpload(s.id)}
                              style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer" }}
                            >
                              İptal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {(stops || []).length === 0 && <div style={{ padding: "10px 4px", fontSize: 13, opacity: 0.7 }}>Bu rotada durak yok.</div>}
              </div>
            )}

            {tab === "gallery" && (
              <div>
                {galleryState.errorCount > 0 && (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #ffe2e2",
                      background: "#fff6f6",
                      color: "#8b1a1a",
                      fontSize: 12,
                      fontWeight: 800,
                      marginBottom: 10,
                    }}
                  >
                    Bazı medyalar yüklenemedi.
                  </div>
                )}

                {galleryState.loading && galleryItems.length === 0 && (
                  <div style={{ padding: "8px 4px", fontSize: 13, opacity: 0.75 }}>Galeri yükleniyor…</div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  {galleryItems.map((m, idx) => {
                    const isVideo = normalizeMediaType(m) === "video";
                    return (
                      <div
                        key={`${m.stopId}_${m.id}`}
                        className="route-detail-media-tile"
                        onClick={() => {
                          setLightboxIndex(idx);
                          setLightboxItems(buildLightboxItems(galleryItems)); // ✅ type normalize
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
                        {isVideo && (
                          <div className="route-detail-video-badge" aria-hidden="true">
                            ▶︎
                          </div>
                        )}

                        {isVideo ? (
                          <video
                            src={m.url}
                            muted
                            playsInline
                            preload="metadata"
                            disablePictureInPicture
                            controlsList="nodownload noplaybackrate"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <img
                            src={m.url}
                            alt="media"
                            loading="lazy"
                            decoding="async"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {galleryItems.length === 0 && !galleryState.loading && (
                  <div style={{ padding: "10px 4px", fontSize: 13, opacity: 0.7 }}>Gösterilecek medya yok.</div>
                )}

                {!galleryState.done && (
                  <div style={{ padding: "12px 0", display: "flex", justifyContent: "center" }}>
                    <button
                      type="button"
                      onClick={() => loadNextGalleryBatch()}
                      disabled={galleryState.loading}
                      style={{
                        height: 38,
                        padding: "0 14px",
                        borderRadius: 999,
                        border: "1px solid #e3e3e3",
                        background: "#fff",
                        fontWeight: 900,
                        cursor: galleryState.loading ? "not-allowed" : "pointer",
                        opacity: galleryState.loading ? 0.6 : 1,
                      }}
                    >
                      {galleryState.loading ? "Yükleniyor…" : "Daha fazla yükle"}
                    </button>
                  </div>
                )}

                {/* sentinel: scroll ile otomatik batch */}
                <div ref={gallerySentinelRef} style={{ height: 1 }} />
              </div>
            )}

            {tab === "report" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {kpis.map((k) => (
                    <div key={k.label} style={{ border: "1px solid #eee", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{k.label}</div>
                      <div style={{ fontWeight: 800, fontSize: 16, marginTop: 2 }}>{k.value}</div>
                    </div>
                  ))}

                  <div style={{ border: "1px solid #eee", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Medya</div>
                    <div style={{ fontWeight: 800, fontSize: 16, marginTop: 2 }}>
                      {Array.from(mediaCacheRef.current.values()).reduce((acc, v) => acc + ((v?.items || []).length || 0), 0)}
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

                <div style={{ fontSize: 12, opacity: 0.6 }}>Not: Dağılımlar client’ta hesaplanır; çok büyük veride sınırlı gösterim yapılır (≈).</div>
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

      {lightboxItems && <Lightbox items={lightboxItems} index={lightboxIndex} onClose={() => setLightboxItems(null)} />}
    </div>
  );

  return withPortal(content);
}

// ✅ Backward compatibility: eski import’lar kırılmasın (utils’te yoksa fallback)
// Not: named re-export yerine güvenli export (build patlamasın)
const _coerceDate = (v) => {
  if (!v) return null;
  try {
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    if (typeof v === "number") return new Date(v);
    if (v instanceof Date) return v;
    const d = new Date(v);
    // eslint-disable-next-line no-restricted-globals
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

export const formatTimeAgo =
  routeDetailUtilsNS.formatTimeAgo ||
  ((v) => {
    const d = _coerceDate(v);
    if (!d) return "";
    const diff = Date.now() - d.getTime();
    const s = Math.max(0, Math.floor(diff / 1000));
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const day = Math.floor(h / 24);
    if (s < 20) return "az önce";
    if (m < 60) return `${m} dk`;
    if (h < 24) return `${h} sa`;
    if (day < 7) return `${day} g`;
    const wk = Math.floor(day / 7);
    if (wk < 5) return `${wk} hf`;
    const mo = Math.floor(day / 30);
    return `${Math.max(1, mo)} ay`;
  });

export const formatCount =
  routeDetailUtilsNS.formatCount ||
  ((n) => {
    const x = Number(n) || 0;
    if (x < 1000) return String(x);
    if (x < 1_000_000) return `${(x / 1000).toFixed(x < 10_000 ? 1 : 0)}K`.replace(".0K", "K");
    if (x < 1_000_000_000) return `${(x / 1_000_000).toFixed(x < 10_000_000 ? 1 : 0)}M`.replace(".0M", "M");
    return `${(x / 1_000_000_000).toFixed(1)}B`.replace(".0B", "B");
  });

export const formatDateTR =
  routeDetailUtilsNS.formatDateTR ||
  ((v) => {
    const d = _coerceDate(v);
    if (!d) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}.${mm}.${yy}`;
  });
