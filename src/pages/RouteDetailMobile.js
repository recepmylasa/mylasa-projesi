// src/pages/RouteDetailMobile.js
// Mobil Rota Detayı (Duraklar | Galeri | Rapor | Görsel Paylaş)
// Mevcut takip/puanlama/paylaş davranışlarına DOKUNMAZ, yalnız sekmeler + medya + rapor + “Görsel Paylaş” ekler.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth, db, storage } from "../firebase";

// Firestore
import {
  doc, onSnapshot, collection, query, orderBy, limit as qlimit,
  getDocs, addDoc, serverTimestamp, where, getDoc
} from "firebase/firestore";

// Storage
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

// Puan servisleri (projede mevcut sayıyoruz)
import { setRouteRating, setStopRating } from "../services/routeRatings";

// Okuma servisleri (projede mevcut sayıyoruz)
import { watchRoute, watchStops } from "../services/routesRead";

// GPX servisleri (projede mevcut sayıyoruz)
import { buildGpx, downloadGpx } from "../services/gpx";

// Yıldız bileşeni (projede mevcut)
import StarRatingV2 from "../components/StarRatingV2/StarRatingV2";

// Google Maps hook’u (projede mevcut)
import { useGoogleMaps } from "../hooks/useGoogleMaps";

// Görsel paylaşım sheet’i (projede mevcut)
import ShareSheetMobile from "../components/ShareSheetMobile";

// Ufak yardımcılar
const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const MAP_ID  = (process.env.REACT_APP_GMAPS_MAP_ID || "").trim();

function fmtKm(m) {
  const km = (Number(m) || 0) / 1000;
  if (km < 1) return `${(km).toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}
function fmtDur(ms) {
  const total = Math.max(0, Math.round((Number(ms)||0)/1000));
  const h = Math.floor(total/3600);
  const m = Math.floor((total%3600)/60);
  if (h <= 0) return `${m} dk`;
  return `${h} sa ${m} dk`;
}
function calcAvg(sum, count) {
  return (Number(count)||0) > 0 ? (Number(sum||0)/Number(count)).toFixed(1) : "—";
}

// Paylaşım için rota payload’unu zenginleştir
function buildShareRoutePayload(routeDoc, ownerDoc, routeId) {
  const r = { ...(routeDoc || {}), id: routeId };
  if (ownerDoc) {
    r.ownerUsername =
      ownerDoc.username || ownerDoc.userName || ownerDoc.handle || ownerDoc.name ||
      r.ownerUsername || r.ownerName;
    r.ownerName =
      ownerDoc.name || ownerDoc.fullName || r.ownerName || r.ownerUsername;
    r.ownerAvatar =
      ownerDoc.photoURL || ownerDoc.profilFoto || ownerDoc.avatar || r.ownerAvatar;
  }
  return r;
}

/* ======================= Lightbox (inline) ======================= */
function Lightbox({ items = [], index = 0, onClose = () => {} }) {
  const [i, setI] = useState(Math.min(Math.max(0, index), Math.max(0, items.length - 1)));
  const goPrev = useCallback(() => setI((p) => Math.max(0, p - 1)), []);
  const goNext = useCallback(() => setI((p) => Math.min(items.length - 1, p + 1)), [items.length]);
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
    position: "fixed", inset: 0, background: "rgba(0,0,0,.85)",
    zIndex: 3000, display:"flex", alignItems:"center", justifyContent:"center"
  };
  const navBtn = (side) => ({
    position:"absolute", top:"50%", [side]: 10, transform:"translateY(-50%)",
    background:"rgba(0,0,0,.4)", color:"#fff", border:"0", borderRadius:999,
    width:44, height:44, fontSize:20, cursor:"pointer"
  });
  const closeBtn = {
    position:"absolute", top:10, right:10, background:"rgba(0,0,0,.4)",
    color:"#fff", border:"0", borderRadius:999, width:40, height:40, fontSize:18, cursor:"pointer"
  };
  return (
    <div style={overlay} onMouseDown={onClose}>
      <button style={closeBtn} onClick={(e)=>{e.stopPropagation(); onClose();}}>✕</button>
      {i>0 && <button style={navBtn("left")} onClick={(e)=>{e.stopPropagation(); goPrev();}}>‹</button>}
      {i<items.length-1 && <button style={navBtn("right")} onClick={(e)=>{e.stopPropagation(); goNext();}}>›</button>}
      <div onMouseDown={(e)=>e.stopPropagation()} style={{maxWidth:"92vw", maxHeight:"86vh"}}>
        {cur.type === "video" ? (
          <video src={cur.url} controls style={{maxWidth:"92vw", maxHeight:"86vh"}} />
        ) : (
          <img src={cur.url} alt={cur.title || "media"} style={{maxWidth:"92vw", maxHeight:"86vh", objectFit:"contain"}} />
        )}
      </div>
    </div>
  );
}

/* ======================= StarBars (inline) ======================= */
function StarBars({ counts = {1:0,2:0,3:0,4:0,5:0}, total = 0, compact = false, showNumbers = true, height = 10 }) {
  const rows = [5,4,3,2,1];
  const maxCount = Math.max(...rows.map(r => counts[r] || 0), 1);
  const barStyle = (r) => ({
    height,
    width: total ? `${Math.max(4, Math.round(((counts[r] || 0) / maxCount) * 100))}%` : "4%",
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
            {!compact && <div style={{fontSize:12,opacity:.7}}>{r}★</div>}
            <div style={{background:"#e5e7eb", borderRadius:999, overflow:"hidden"}}>
              <div style={barStyle(r)} />
            </div>
            {!compact && showNumbers && (
              <div style={{fontSize:12, textAlign:"right", opacity:.8}}>{counts[r] || 0}</div>
            )}
          </div>
        ))}
      </div>
      {!compact && <div style={{marginTop:6, fontSize:12, opacity:.7}}>Toplam: {total}</div>}
    </div>
  );
}

/* ======================= Ratings Aggregation (inline) ======================= */
async function getRouteStarsAgg(routeId, max = 1000) {
  const col = collection(db, "route_ratings");
  const q = query(col, where("routeId", "==", routeId), qlimit(Math.max(1, max)));
  const snap = await getDocs(q);
  const counts = {1:0,2:0,3:0,4:0,5:0};
  let total = 0, sum = 0;
  snap.forEach((d) => {
    const v = Number(d.data()?.value);
    if (v >= 1 && v <= 5) {
      counts[v] = (counts[v] || 0) + 1;
      sum += v; total += 1;
    }
  });
  const avg = total ? (sum / total) : 0;
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
    if (!map[sid]) map[sid] = { counts: {1:0,2:0,3:0,4:0,5:0}, total: 0, avg: 0, __sum:0 };
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

/* ======================= Media Upload/List (inline) ======================= */
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
      img.onerror = () => { try { URL.revokeObjectURL(url); } catch {} ; resolve({ w:0, h:0 }); };
      img.src = url;
    } catch { resolve({ w:0, h:0 }); }
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
      vid.onerror = () => { try { URL.revokeObjectURL(url); } catch {} ; resolve({ w:0, h:0 }); };
      vid.src = url;
    } catch { resolve({ w:0, h:0 }); }
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

  // compress (opsiyonel)
  if (isImage) {
    try {
      const mod = await import("browser-image-compression");
      toUpload = await mod.default(file, { maxWidthOrHeight: 1920, initialQuality: 0.85, maxSizeMB: 8, useWebWorker: true });
    } catch { /* yoksa orijinali yükleriz */ }
    dims = await readImageDims(toUpload);
  } else {
    dims = await readVideoDims(toUpload);
  }

  const ts = Date.now();
  const path = `route_media/${routeId}/${stopId}/${ts}-${sanitizeName(file.name || (isImage ? "image.jpg" : "video.mp4"))}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, toUpload, { contentType: toUpload.type || file.type });

  if (signal) {
    const onAbort = () => { try { task.cancel(); } catch {} };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const url = await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        const p = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
        if (onProgress) onProgress(p);
      },
      (err) => reject(err),
      async () => {
        try { resolve(await getDownloadURL(task.snapshot.ref)); }
        catch (e) { reject(e); }
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

// 🔧 DÜZELTME: Listelemede hata yutma yok; izin/indeks hatasını UI’ya yansıtacağız
async function listStopMediaInline({ routeId, stopId, limit = 50 }) {
  const mediaCol = collection(db, "routes", routeId, "stops", stopId, "media");
  const q = query(mediaCol, orderBy("createdAt", "desc"), qlimit(Math.max(1, Math.min(limit, 200))));
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

/* ======================= ANA BİLEŞEN ======================= */
export default function RouteDetailMobile({ routeId, onClose = () => {} }) {
  // Sekmeler: "stops" | "gallery" | "report"
  const [tab, setTab] = useState("stops");

  const [routeDoc, setRouteDoc] = useState(null);
  const [stops, setStops] = useState([]); // [{id, order, title, note, lat,lng,t}]
  const [owner, setOwner] = useState(null);
  const [permError, setPermError] = useState(null); // followers/private → 403 mesajı için

  // Medya cache: { stopId: { items:[], __loadedThumbs:boolean, __error?:string } }
  const mediaCacheRef = useRef({});
  const [, forceRerender] = useState(0);

  // Lightbox state (galeri)
  const [lightboxItems, setLightboxItems] = useState(null); // [{url,type}]
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Görsel paylaşım sheet görünürlüğü
  const [showShareSheet, setShowShareSheet] = useState(false);

  // Rating dağılımı (rapor sekmesinde lazy)
  const [routeAgg, setRouteAgg] = useState(null); // {counts,total,avg}
  const [stopAgg, setStopAgg] = useState(null);   // {stopId:{counts,total,avg}}

  // Upload progress (stopId: {p:0-100, abort:AbortController})
  const [uploadState, setUploadState] = useState({});

  // Google Maps
  const { gmapsStatus, mapDivRef, mapRef } = useGoogleMaps({ API_KEY, MAP_ID });

  // Haritaya polyline & durak markerları
  const polylineRef = useRef(null);
  const stopMarkersRef = useRef([]);

  /* ========== İzin (403) kontrolü ========== */
  useEffect(() => {
    if (!routeId) return;
    let alive = true;
    (async () => {
      try {
        const s = await getDoc(doc(db, "routes", routeId));
        if (!alive) return;
        if (!s.exists()) {
          setPermError("not-found");
        } else {
          setPermError(null);
        }
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
    return () => { alive = false; };
  }, [routeId]);

  /* ========== Veri izleme ========== */
  useEffect(() => {
    if (!routeId) return;
    let offRoute = () => {};
    let offStops = () => {};

    offRoute = watchRoute(routeId, async (d) => {
      setRouteDoc(d);
      // owner cache
      if (d?.ownerId) {
        try {
          const u = await getDoc(doc(db, "users", d.ownerId));
          if (u.exists()) setOwner({ id: u.id, ...u.data() });
        } catch { /* noop */ }
      }
    });

    offStops = watchStops(routeId, (arr) => {
      const sorted = (arr || []).slice().sort((a,b) => (a.order||0) - (b.order||0));
      setStops(sorted);
    });

    return () => { try { offRoute(); } catch {}; try { offStops(); } catch {} };
  }, [routeId]);

  /* ========== Haritayı çiz ========== */
  useEffect(() => {
    if (gmapsStatus !== "ready" || !mapRef.current) return;
    const map = mapRef.current;

    try {
      if (!polylineRef.current) {
        polylineRef.current = new window.google.maps.Polyline({
          map, clickable: false, geodesic: true,
          strokeColor: "#1a73e8", strokeOpacity: 0.95, strokeWeight: 4,
        });
      }
      const path = (routeDoc?.path || []).map(p => new window.google.maps.LatLng(p.lat, p.lng));
      polylineRef.current.setPath(path);

      if (path.length) {
        const b = new window.google.maps.LatLngBounds();
        path.forEach(pt => b.extend(pt));
        map.fitBounds(b, 40);
      }

      stopMarkersRef.current.forEach(m => { try { m.setMap(null); } catch {} });
      stopMarkersRef.current = [];

      (stops || []).forEach((s) => {
        try {
          const mk = new window.google.maps.Marker({
            position: { lat: s.lat, lng: s.lng },
            map,
            title: s.title || `Durak ${s.order || ""}`,
          });
          stopMarkersRef.current.push(mk);
        } catch {}
      });
    } catch { /* noop */ }
  }, [gmapsStatus, mapRef, routeDoc?.path, stops]);

  /* ========== Medya küçük şeridi için 4'lü liste (lazy) ========== */
  const ensureStopThumbs = useCallback(async (stopId) => {
    if (!routeId || !stopId) return;
    // Hata yaşanmışsa tekrar denemeye izin ver (loaded flag'i hatada set etmiyoruz)
    if (mediaCacheRef.current[stopId]?.__loadedThumbs) return;
    const { items, error } = await listStopMediaInline({ routeId, stopId, limit: 4 });
    mediaCacheRef.current[stopId] = {
      ...(mediaCacheRef.current[stopId]||{}),
      items,
      __loadedThumbs: !error, // yalnız başarıda lockla
      ...(error ? { __error: error } : { __error: null }),
    };
    forceRerender((x)=>x+1);
  }, [routeId]);

  /* 🔧 DÜZELTME: İlk yüklemede (yenile sonrası) 6 durağa kadar otomatik preload */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pre = (stops || []).slice(0, 6);
      for (const s of pre) {
        if (cancelled) break;
        await ensureStopThumbs(s.id);
      }
    })();
    return () => { cancelled = true; };
  }, [stops, ensureStopThumbs]);

  /* ========== Galeri sekmesi için tüm medyayı topla (lazy) ========== */
  const [galleryLoaded, setGalleryLoaded] = useState(false);
  const galleryItems = useMemo(() => {
    const arr = [];
    Object.keys(mediaCacheRef.current).forEach((sid) => {
      const items = mediaCacheRef.current[sid]?.items || [];
      items.forEach(it => arr.push({ ...it, stopId: sid }));
    });
    return arr.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [mediaCacheRef.current, galleryLoaded]);

  const loadAllGallery = useCallback(async () => {
    if (galleryLoaded) return;
    for (const s of (stops || [])) {
      const { items } = await listStopMediaInline({ routeId, stopId: s.id, limit: 20 });
      mediaCacheRef.current[s.id] = { items, __loadedThumbs: true, __error: null };
    }
    setGalleryLoaded(true);
    forceRerender((x)=>x+1);
  }, [galleryLoaded, routeId, stops]);

  /* ========== Rapor sekmesi verileri (lazy) ========== */
  const [reportLoaded, setReportLoaded] = useState(false);
  const loadReportAgg = useCallback(async () => {
    if (reportLoaded || !routeId) return;
    const [rAgg, sAgg] = await Promise.all([
      getRouteStarsAgg(routeId, 1000).catch(()=>null),
      getStopsStarsAgg(routeId, 1000).catch(()=>null),
    ]);
    setRouteAgg(rAgg);
    setStopAgg(sAgg);
    setReportLoaded(true);
  }, [reportLoaded, routeId]);

  /* ========== Medya Ekle ========== */
  const onPickMedia = useCallback(async (stopId) => {
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
            routeId, stopId, file: f,
            onProgress: (p) => setUploadState((s)=>({ ...s, [stopId]: { ...(s[stopId]||{}), p } })),
            signal: ac.signal
          });
          const cur = mediaCacheRef.current[stopId]?.items || [];
          mediaCacheRef.current[stopId] = { items: [res, ...cur], __loadedThumbs: true, __error: null };
          forceRerender((x)=>x+1);
        } catch (e) {
          console.warn("upload hata:", e?.message || e);
        } finally {
          setUploadState((s)=>{ const ns = { ...s }; delete ns[stopId]; return ns; });
        }
      }
    };
    input.click();
  }, [routeId, routeDoc]);

  const cancelUpload = useCallback((stopId) => {
    const us = uploadState[stopId];
    try { us?.abort?.abort(); } catch {}
    setUploadState((s)=>{ const ns = { ...s }; delete ns[stopId]; return ns; });
  }, [uploadState]);

  /* ========== Link Paylaşımı ========== */
  const onShare = useCallback(async () => {
    const url = `${window.location.origin}/r/${routeId}`;
    const title = routeDoc?.title || "Rota";
    try {
      if (navigator.share) await navigator.share({ url, title, text: title });
      else {
        await navigator.clipboard.writeText(url);
        alert("Bağlantı kopyalandı");
      }
    } catch {}
  }, [routeId, routeDoc?.title]);

  /* ========== Görsel Paylaşımı ========== */
  const onShareVisual = useCallback(() => {
    setShowShareSheet(true);
  }, []);

  /* ========== GPX ========== */
  const onExportGpx = useCallback(async () => {
    try {
      const xml = buildGpx({ route: routeDoc, stops, path: routeDoc?.path || [] });
      const slug = (routeDoc?.title || "rota").toLowerCase().replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g,"");
      const y = new Date().toISOString().slice(0,10).replace(/-/g,"");
      downloadGpx(xml, `route-${slug || "route"}-${y}.gpx`);
    } catch (e) {
      alert("GPX oluşturulamadı");
    }
  }, [routeDoc, stops]);

  /* ========== Rating handlers ========== */
  const canRateRoute = auth.currentUser && routeDoc && auth.currentUser.uid !== routeDoc.ownerId;
  const onRouteRate = useCallback(async (v) => {
    if (!canRateRoute) return;
    try { await setRouteRating(routeId, v); } catch {}
  }, [canRateRoute, routeId]);

  const onStopRate = useCallback(async (stopId, v) => {
    if (!auth.currentUser || !routeDoc) return;
    if (auth.currentUser.uid === routeDoc.ownerId) return; // sahibi oy veremez
    try { await setStopRating(stopId, routeId, v); } catch {}
  }, [routeId, routeDoc]);

  /* ========== Sekme Lazy yüklemeleri ========== */
  useEffect(() => {
    if (tab === "gallery") loadAllGallery();
    if (tab === "report")  loadReportAgg();
  }, [tab, loadAllGallery, loadReportAgg]);

  /* ========== UI ========== */
  const isOwner = auth.currentUser && routeDoc && auth.currentUser.uid === routeDoc.ownerId;
  const ratingAvgLabel = useMemo(() => {
    if (routeDoc?.ratingSum != null && routeDoc?.ratingCount != null) {
      const avg = calcAvg(routeDoc.ratingSum, routeDoc.ratingCount);
      const cnt = routeDoc.ratingCount || 0;
      return `${avg} ★ (${cnt})`;
    }
    return "—";
  }, [routeDoc?.ratingSum, routeDoc?.ratingCount]);

  // İzin reddi: followers/private ve kullanıcı takip etmiyor → 403 uyarısı
  if (permError === "forbidden") {
    return (
      <div style={wrapModal()}>
        <div style={card()}>
          <div style={header()}>
            <div style={titleCss()}>Rota</div>
            <button style={closeBtn()} onClick={onClose}>✕</button>
          </div>
          <div style={{padding:"14px", fontSize:14}}>
            Bu rota <b>yalnızca takipçilere</b> açık veya özeldir.
          </div>
        </div>
      </div>
    );
  }

  if (!routeDoc) {
    return (
      <div style={wrapModal()}>
        <div style={card()}>
          <div style={header()}>
            <div style={titleCss()}>Rota</div>
            <button style={closeBtn()} onClick={onClose}>✕</button>
          </div>
          <div style={{padding:"14px"}}>Yükleniyor…</div>
        </div>
      </div>
    );
  }

  const kpis = [
    { label: "Mesafe", value: fmtKm(routeDoc.totalDistanceM || 0) },
    { label: "Süre",   value: fmtDur(routeDoc.durationMs || 0) },
    { label: "Ort. hız", value: (() => {
      const m = (routeDoc.totalDistanceM || 0) / 1000; // km
      const h = (routeDoc.durationMs || 0) / (1000*3600);
      if (!m || !h) return "—";
      return `${(m/h).toFixed(1)} km/sa`;
    })() },
    { label: "Durak", value: String((stops || []).length) },
  ];

  // Rapor sekmesi: top 3 durak
  let topStops = [];
  if (stopAgg && stops && stops.length) {
    topStops = stops.map(s => {
      const agg = stopAgg[s.id] || { total:0, avg:0 };
      const mediaCount = mediaCacheRef.current[s.id]?.items?.length || 0;
      return { stop: s, total: agg.total, avg: agg.avg, mediaCount };
    }).sort((a,b) => {
      if ((b.avg||0) !== (a.avg||0)) return (b.avg||0) - (a.avg||0);
      if ((b.total||0) !== (a.total||0)) return (b.total||0) - (a.total||0);
      return (b.mediaCount||0) - (a.mediaCount||0);
    }).slice(0, 3);
  }

  return (
    <div style={wrapModal()}>
      <div style={card()}>
        {/* Başlık */}
        <div style={header()}>
          <div style={{display:"flex", alignItems:"center", gap:8, minWidth:0}}>
            <div style={titleCss()} title={routeDoc.title || "Rota"}>
              {routeDoc.title || "Rota"}
            </div>
            <div style={{fontSize:12, opacity:.75, whiteSpace:"nowrap"}}>{ratingAvgLabel}</div>
          </div>
          <div style={{display:"flex", gap:8}}>
            <button style={pillBtn()} onClick={onShare}>Paylaş</button>
            <button style={pillBtn()} onClick={onShareVisual}>Görsel Paylaş</button>
            <button style={pillBtn()} onClick={onExportGpx}>GPX</button>
            <button style={closeBtn()} onClick={onClose} title="Kapat">✕</button>
          </div>
        </div>

        {/* HARİTA */}
        <div style={{ width:"100%", height: 280, background:"#f1f5f9", position:"relative" }}>
          <div ref={mapDivRef} style={{ width:"100%", height:"100%" }} />
          {gmapsStatus === "error" && (
            <div style={{position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#555"}}>
              Harita yüklenemedi
            </div>
          )}
        </div>

        {/* Rota genel rating */}
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderBottom:"1px solid #eee" }}>
          <div style={{fontWeight:700}}>Puanla:</div>
          <StarRatingV2
            // bu versiyonda onRated kullanılıyor
            onRated={(v)=>onRouteRate(v)}
            size={32}
            disabled={!canRateRoute}
          />
        </div>

        {/* Sekmeler */}
        <div style={{ display:"flex", gap:6, padding:"8px 8px 0" }}>
          {["stops","gallery","report"].map(key => (
            <button
              key={key}
              onClick={()=>setTab(key)}
              style={{
                padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb",
                background: tab===key ? "#111" : "#fff",
                color: tab===key ? "#fff" : "#111", fontWeight:700, cursor:"pointer"
              }}
            >
              {key === "stops" ? "Duraklar" : key === "gallery" ? "Galeri" : "Rapor"}
            </button>
          ))}
        </div>

        {/* İçerik */}
        <div style={{ padding:"10px 8px 14px" }}>
          {tab === "stops" && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {(stops || []).map((s) => {
                const cache = mediaCacheRef.current[s.id] || {};
                const media = cache.items || [];
                const up = uploadState[s.id];
                const hadPermErr = cache.__error && cache.__error.includes("permission");
                return (
                  <div key={s.id} style={{ border:"1px solid #eee", borderRadius:12, overflow:"hidden" }}>
                    <div style={{ padding:"10px 12px", display:"flex", alignItems:"center", gap:8, justifyContent:"space-between" }}>
                      <div>
                        <div style={{fontWeight:700, fontSize:14}}>{s.order ? `${s.order}. ` : ""}{s.title || `Durak ${s.order||""}`}</div>
                        {s.note && <div style={{fontSize:12, opacity:.8, marginTop:2}}>{s.note}</div>}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        {stopAgg && stopAgg[s.id] && (
                          <div style={{minWidth:120}}>
                            <StarBars counts={stopAgg[s.id].counts} total={stopAgg[s.id].total} compact height={8} showNumbers={false} />
                          </div>
                        )}
                        <StarRatingV2
                          onRated={(v)=>onStopRate(s.id, v)}
                          size={22}
                          disabled={isOwner}
                        />
                        {isOwner && (
                          <button
                            onClick={() => onPickMedia(s.id)}
                            style={{ padding:"8px 10px", borderRadius:8, border:"1px solid #ddd", background:"#fff", fontWeight:700, cursor:"pointer" }}
                          >
                            Medya Ekle
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Medya şeridi (ilk 4) */}
                    <div
                      onMouseEnter={() => ensureStopThumbs(s.id)}
                      onTouchStart={() => ensureStopThumbs(s.id)}
                      style={{ display:"flex", gap:6, padding:"8px 10px", overflowX:"auto" }}
                    >
                      {media.slice(0,4).map((m, idx) => (
                        <div key={m.id}
                          onClick={() => { setLightboxItems(media.map(x=>({url:x.url,type:x.type}))); setLightboxIndex(idx); }}
                          style={{ width:76, height:76, borderRadius:8, overflow:"hidden", background:"#f3f4f6", flex:"0 0 auto", cursor:"pointer" }}
                          title={m.type}
                        >
                          {m.type === "video" ? (
                            <video src={m.url} muted style={{width:"100%", height:"100%", objectFit:"cover"}} />
                          ) : (
                            <img src={m.url} alt="media" style={{width:"100%", height:"100%", objectFit:"cover"}} />
                          )}
                        </div>
                      ))}
                      {media.length === 0 && (
                        <div style={{ fontSize:12, opacity:.7 }}>
                          {hadPermErr ? "Medya erişimi kısıtlı." : "Medya yok"}
                        </div>
                      )}
                    </div>

                    {/* Upload progress */}
                    {up && (
                      <div style={{ padding:"0 10px 10px" }}>
                        <div style={{display:"flex", alignItems:"center", gap:10}}>
                          <div style={{flex:1, height:8, background:"#eee", borderRadius:999, overflow:"hidden"}}>
                            <div style={{width:`${up.p||0}%`, height:"100%", background:"#1a73e8"}} />
                          </div>
                          <div style={{fontSize:12, width:36, textAlign:"right"}}>{up.p||0}%</div>
                          <button onClick={()=>cancelUpload(s.id)} style={{fontSize:12, background:"none", border:"none", cursor:"pointer"}}>İptal</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {(stops || []).length === 0 && (
                <div style={{ padding:"10px 4px", fontSize:13, opacity:.7 }}>Bu rotada durak yok.</div>
              )}
            </div>
          )}

          {tab === "gallery" && (
            <div>
              {!galleryLoaded && (
                <div style={{ padding:"8px 4px", fontSize:13, opacity:.75 }}>
                  Galeri yükleniyor…
                </div>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:6 }}>
                {galleryItems.map((m, idx) => (
                  <div key={`${m.stopId}_${m.id}`}
                    onClick={() => { setLightboxItems(galleryItems.map(x=>({url:x.url, type:x.type}))); setLightboxIndex(idx); }}
                    style={{ width:"100%", aspectRatio:"1/1", background:"#f3f4f6", borderRadius:8, overflow:"hidden", cursor:"pointer" }}
                  >
                    {m.type === "video" ? (
                      <video src={m.url} muted style={{width:"100%", height:"100%", objectFit:"cover"}} />
                    ) : (
                      <img src={m.url} alt="media" style={{width:"100%", height:"100%", objectFit:"cover"}} />
                    )}
                  </div>
                ))}
              </div>
              {galleryItems.length === 0 && (
                <div style={{ padding:"10px 4px", fontSize:13, opacity:.7 }}>Gösterilecek medya yok.</div>
              )}
            </div>
          )}

          {tab === "report" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {/* KPI Şeridi */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:8 }}>
                {kpis.map((k) => (
                  <div key={k.label} style={{ border:"1px solid #eee", borderRadius:10, padding:"10px 12px" }}>
                    <div style={{ fontSize:12, opacity:.7 }}>{k.label}</div>
                    <div style={{ fontWeight:800, fontSize:16, marginTop:2 }}>{k.value}</div>
                  </div>
                ))}
                {/* Medya KPI: toplam medya sayısı */}
                <div style={{ border:"1px solid #eee", borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:12, opacity:.7 }}>Medya</div>
                  <div style={{ fontWeight:800, fontSize:16, marginTop:2 }}>
                    {Object.values(mediaCacheRef.current).reduce((acc, v)=>acc + ((v?.items||[]).length), 0)}
                  </div>
                </div>
              </div>

              {/* Rota yıldız dağılımı */}
              <div style={{ border:"1px solid #eee", borderRadius:10, padding:"12px 12px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                  <div style={{ fontWeight:800 }}>Yıldız dağılımı (rota)</div>
                  <div style={{ fontSize:12, opacity:.75 }}>
                    Ort: {routeAgg ? routeAgg.avg.toFixed(1) : "—"} • Oy: {routeAgg ? routeAgg.total : "—"}
                  </div>
                </div>
                <div style={{ marginTop:10 }}>
                  <StarBars counts={routeAgg?.counts || {1:0,2:0,3:0,4:0,5:0}} total={routeAgg?.total || 0} />
                </div>
              </div>

              {/* En çok beğenilen 3 durak */}
              <div style={{ border:"1px solid #eee", borderRadius:10, padding:"12px 12px" }}>
                <div style={{ fontWeight:800, marginBottom:8 }}>En çok beğenilen 3 durak</div>
                {topStops.length === 0 && (
                  <div style={{ fontSize:13, opacity:.7 }}>Veri yok.</div>
                )}
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {topStops.map((it, i) => (
                    <div key={it.stop.id} style={{ display:"flex", justifyContent:"space-between", border:"1px solid #f2f2f2", padding:"10px", borderRadius:8 }}>
                      <div style={{ fontWeight:700 }}>{i+1}. {it.stop.title || `Durak ${it.stop.order||""}`}</div>
                      <div style={{ fontSize:12, opacity:.8 }}>
                        Ort: {it.avg.toFixed(1)} • Oy: {it.total} • Medya: {it.mediaCount}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ fontSize:12, opacity:.6 }}>
                Not: Dağılımlar client’ta hesaplanır; çok büyük veride sınırlı gösterim yapılır (≈).
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Görsel Paylaşım Sheet (overlay) */}
      {showShareSheet && (
        <div style={shareOverlay()}>
          <ShareSheetMobile
            route={buildShareRoutePayload(routeDoc, owner, routeId)}
            stops={stops}
            onClose={() => setShowShareSheet(false)}
          />
        </div>
      )}

      {/* Lightbox */}
      {lightboxItems && (
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxItems(null)}
        />
      )}
    </div>
  );
}

/* ======================= Stil yardımcıları ======================= */
function wrapModal() {
  return {
    position:"fixed", inset:0, zIndex:2000,
    display:"flex", alignItems:"center", justifyContent:"center",
    background:"rgba(0,0,0,.65)"
  };
}
function card() {
  const isMobile = window.innerWidth <= 768;
  return {
    width: isMobile ? "100%" : 720,
    maxWidth: "100%",
    maxHeight: "96vh",
    margin: isMobile ? "0" : "12px",
    background:"#fff",
    borderRadius: isMobile ? "12px 12px 0 0" : 16,
    overflow:"hidden",
    display:"flex",
    flexDirection:"column"
  };
}
function header() {
  return {
    display:"flex", alignItems:"center", justifyContent:"space-between",
    padding:"10px 12px", borderBottom:"1px solid #eee", gap:8
  };
}
function titleCss() {
  return {
    fontWeight:800, fontSize:16, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"56vw"
  };
}
function pillBtn() {
  return { padding:"8px 12px", borderRadius:10, border:"1px solid #ddd", background:"#fff", fontWeight:700, cursor:"pointer" };
}
function closeBtn() {
  return { border:"none", background:"#111", color:"#fff", borderRadius:10, padding:"8px 12px", fontWeight:800, cursor:"pointer" };
}
function shareOverlay() {
  return {
    position:"fixed", inset:0, zIndex:2500,
    display:"flex", alignItems:"center", justifyContent:"center",
    background:"rgba(0,0,0,.45)", padding:"12px"
  };
}
