// src/Explore.js
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { db } from "./firebase";
import {
  collection,
  query,
  getDocs,
  where,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
import PostDetailModal from "./PostDetailModal";
import ProfilePostViewerMobile from "./ProfilePostViewerMobile";
import { ClipBadge, CommentIcon, StarIcon } from "./icons";
import "./Explore.css";

/* --- Google Maps hook + Marker Cluster --- */
import { useGoogleMaps } from "./hooks/useGoogleMaps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";

/* --- Yakınımda (mobil) servisleri + kart --- */
import fetchViewportRoutes from "./services/viewportRoutes";
import NearbyPromptMobile from "./components/NearbyPromptMobile";
import RouteCardMobile from "./components/RouteCardMobile";
import { getFollowingUids } from "./services/follows";

/* --- Formatlayıcılar (gruplama) --- */
import { fmtGroupKeyCity, fmtGroupKeyCountry } from "./utils/formatters";

/* ——— Ortak sabitler ——— */
const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const MAP_ID = (process.env.REACT_APP_GMAPS_MAP_ID || "").trim();

/* ——— Filtre sabitleri ——— */
const FILTER_STORAGE_KEY = "explore.filters.v1";
const AUDIENCE_STORAGE_KEY = "explore.audience.v1";
const GROUP_STORAGE_KEY = "explore.group.v1";

const DEFAULT_FILTERS = {
  city: "",
  cc: "",
  minRating: 0,
  minVotes: 0,
  minDur: 0,
  maxDur: 0,
  sort: "distance", // distance | rating | votes | new
};

/* ——— Yardımcılar ——— */
const isVideoExt = (url) => !!url && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
const mediaUrlOf = (it) =>
  it?.mediaUrl ||
  it?.videoUrl ||
  it?.imageUrl ||
  it?.gorselUrl ||
  it?.photoUrl ||
  it?.resimUrl ||
  it?.fileUrl ||
  it?.url ||
  it?.thumbUrl ||
  "";
const thumbUrlOf = (it) =>
  it?.thumbUrl || it?.thumbnail || it?.coverUrl || it?.poster || "";
const isClipItem = (it) => {
  const t = (it?.type || it?.format || it?.kind || "").toString().toLowerCase();
  const mt = (it?.mediaType || it?.mime || it?.mimeType || "").toString().toLowerCase();
  const url = mediaUrlOf(it);
  return (
    it?.isClip === true ||
    it?.isVideo === true ||
    t === "clip" ||
    t === "video" ||
    t === "reel" ||
    t === "reels" ||
    mt.startsWith("video/") ||
    isVideoExt(url)
  );
};
const likeCountOf = (it) =>
  typeof it?.starsCount === "number"
    ? it.starsCount
    : typeof it?.likes === "number"
    ? it.likes
    : Array.isArray(it?.begenenler)
    ? it.begenenler.length
    : 0;
const commentCountOf = (it) =>
  typeof it?.commentsCount === "number"
    ? it.commentsCount
    : Array.isArray(it?.yorumlar)
    ? it.yorumlar.length
    : 0;

/* --- Konum alma (tek sefer) --- */
const askLocationOnce = () =>
  new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Konum desteği yok"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

/* --- Bounds key (viewport değişimi kontrolü) --- */
function boundsKey(bounds) {
  if (!bounds) return "";
  const { n, s, e, w } = bounds;
  return [n, s, e, w]
    .map((v) => (typeof v === "number" && !Number.isNaN(v) ? v.toFixed(4) : "x"))
    .join("|");
}

/* --- Filtre yardımcıları --- */
function normalizeFilters(raw) {
  const base = { ...DEFAULT_FILTERS };
  if (!raw) return base;

  const toPosNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  let sort = (raw.sort || base.sort || "").toString();
  if (!["rating", "votes", "new", "distance"].includes(sort)) {
    sort = base.sort;
  }

  return {
    city: (raw.city || "").toString().trim(),
    cc: (raw.cc || raw.countryCode || "").toString().trim().toUpperCase(),
    minRating: toPosNum(raw.minRating),
    minVotes: toPosNum(raw.minVotes),
    minDur: toPosNum(raw.minDur),
    maxDur: toPosNum(raw.maxDur),
    sort,
  };
}

function hasAnyFilterParam(searchParams) {
  const keys = ["city", "cc", "minRating", "minVotes", "minDur", "maxDur", "sort"];
  return keys.some((k) => searchParams.has(k));
}

function applyFiltersToSearchParams(filters, searchParams) {
  const f = normalizeFilters(filters);

  const setOrDelete = (key, val, keepZero = false) => {
    if (
      val === undefined ||
      val === null ||
      (!keepZero && (val === 0 || val === "")) ||
      (typeof val === "string" && !val.trim())
    ) {
      searchParams.delete(key);
    } else {
      searchParams.set(key, String(val));
    }
  };

  setOrDelete("city", f.city);
  setOrDelete("cc", f.cc);
  setOrDelete("minRating", f.minRating);
  setOrDelete("minVotes", f.minVotes);
  setOrDelete("minDur", f.minDur);
  setOrDelete("maxDur", f.maxDur);
  setOrDelete("sort", f.sort || "distance", true);
}

function Explore({ aktifKullaniciId, onUserClick }) {
  /* Arama */
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  /* Grid (gönderiler) */
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [isEnd, setIsEnd] = useState(false);

  /* Detay & Viewer */
  const [selectedPost, setSelectedPost] = useState(null);
  const [viewer, setViewer] = useState(null);

  const sentinelRef = useRef(null);

  /* Görünüm kitlesi: Hepsi / Takip */
  const [audience, setAudience] = useState("all"); // "all" | "following"
  const [groupMode, setGroupMode] = useState("none"); // "none" | "city" | "country"
  const [followingUids, setFollowingUids] = useState([]);

  /* === YAKINIMDA MODU (Yalnız MOBİL) === */
  const isMobile =
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 768px)").matches
      : true;

  const [nearOn, setNearOn] = useState(false);
  const [nearCenter, setNearCenter] = useState(null); // Kullanıcının seçili/algılanan merkezi
  const [radiusKm, setRadiusKm] = useState(20);
  const [nearItems, setNearItems] = useState([]);
  const [nearLoading, setNearLoading] = useState(false);
  const [nearError, setNearError] = useState("");
  const [nearStats, setNearStats] = useState(null);

  // Filtreler
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterDraft, setFilterDraft] = useState(DEFAULT_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Google Maps hook (mobil harita)
  const { gmapsStatus, mapDivRef, mapRef } = useGoogleMaps({ API_KEY, MAP_ID });

  // Marker clustering
  const markersByIdRef = useRef(new Map());
  const clusterRef = useRef(null);

  // Viewport istekleri için kontrol
  const viewportReqIdRef = useRef(0);
  const viewportDebounceRef = useRef(null);
  const lastBoundsKeyRef = useRef(null);

  /* --- Audience: URL + localStorage ile başlat --- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    let initial = "all";
    let fromUrl = false;

    try {
      const url = new URL(window.location.href);
      const sp = url.searchParams;
      const rawAud = (sp.get("aud") || "").toLowerCase();
      if (rawAud === "all" || rawAud === "following") {
        initial = rawAud;
        fromUrl = true;
      }
    } catch {
      // no-op
    }

    if (!fromUrl) {
      try {
        const stored = window.localStorage.getItem(AUDIENCE_STORAGE_KEY);
        if (stored === "all" || stored === "following") {
          initial = stored;
        }
      } catch {
        // no-op
      }
    }

    // Kullanıcı yokken "Takip" mantıksız, güvenli şekilde "Hepsi"ne çek
    if (!aktifKullaniciId && initial === "following") {
      initial = "all";
    }

    setAudience(initial);
  }, [aktifKullaniciId]);

  /* --- Grup modu: URL + localStorage ile başlat --- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    let initial = "none";
    let fromUrl = false;

    try {
      const url = new URL(window.location.href);
      const sp = url.searchParams;
      const rawGroup = (sp.get("group") || "").toLowerCase();
      if (rawGroup === "city" || rawGroup === "country" || rawGroup === "none") {
        initial = rawGroup;
        fromUrl = true;
      }
    } catch {
      // no-op
    }

    if (!fromUrl) {
      try {
        const stored = window.localStorage.getItem(GROUP_STORAGE_KEY);
        if (stored === "city" || stored === "country" || stored === "none") {
          initial = stored;
        }
      } catch {
        // no-op
      }
    }

    setGroupMode(initial);
  }, []);

  /* --- Filtreleri URL + localStorage ile başlat --- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    let initial = DEFAULT_FILTERS;
    let fromUrl = false;

    try {
      const url = new URL(window.location.href);
      const sp = url.searchParams;
      if (hasAnyFilterParam(sp)) {
        const raw = {
          city: sp.get("city") || "",
          cc: sp.get("cc") || "",
          minRating: sp.get("minRating"),
          minVotes: sp.get("minVotes"),
          minDur: sp.get("minDur"),
          maxDur: sp.get("maxDur"),
          sort: sp.get("sort") || undefined,
        };
        initial = normalizeFilters(raw);
        fromUrl = true;
      }
    } catch {
      // no-op
    }

    if (!fromUrl) {
      try {
        const rawStr = window.localStorage.getItem(FILTER_STORAGE_KEY);
        if (rawStr) {
          const parsed = JSON.parse(rawStr);
          initial = normalizeFilters(parsed);
        }
      } catch {
        // no-op
      }
    }

    setFilters(initial);
    setFilterDraft(initial);
  }, []);

  /* --- Filtreleri senkronlayan helper --- */
  const syncFilters = useCallback((nextFilters) => {
    const normalized = normalizeFilters(nextFilters);
    setFilters(normalized);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // no-op
      }

      try {
        const url = new URL(window.location.href);
        const sp = url.searchParams;
        applyFiltersToSearchParams(normalized, sp);
        url.search = sp.toString();
        window.history.pushState({}, "", url.toString());
      } catch {
        // no-op
      }
    }
  }, []);

  /* --- Audience senkronu (URL + localStorage) --- */
  const syncAudience = useCallback(
    (nextAud) => {
      const normalized = nextAud === "following" ? "following" : "all";

      // Mevcut kullanıcı yoksa "Takip"e geçmeye izin verme
      if (!aktifKullaniciId && normalized === "following") {
        return;
      }

      setAudience(normalized);

      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(AUDIENCE_STORAGE_KEY, normalized);
        } catch {
          // no-op
        }

        try {
          const url = new URL(window.location.href);
          const sp = url.searchParams;
          if (normalized === "all") {
            sp.delete("aud");
          } else {
            sp.set("aud", normalized);
          }
          url.search = sp.toString();
          window.history.pushState({}, "", url.toString());
        } catch {
          // no-op
        }
      }
    },
    [aktifKullaniciId]
  );

  /* --- Grup modu senkronu (URL + localStorage) --- */
  const syncGroupMode = useCallback((nextGroup) => {
    const normalized =
      nextGroup === "city" || nextGroup === "country" ? nextGroup : "none";

    setGroupMode(normalized);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(GROUP_STORAGE_KEY, normalized);
      } catch {
        // no-op
      }

      try {
        const url = new URL(window.location.href);
        const sp = url.searchParams;
        if (normalized === "none") {
          sp.delete("group");
        } else {
          sp.set("group", normalized);
        }
        url.search = sp.toString();
        window.history.pushState({}, "", url.toString());
      } catch {
        // no-op
      }

      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        // no-op
      }
    }
  }, []);

  /* --- Takip edilen kullanıcılar (hafif cache’li) --- */
  useEffect(() => {
    let alive = true;

    const loadFollowing = async () => {
      if (!aktifKullaniciId) {
        if (alive) setFollowingUids([]);
        return;
      }

      try {
        const uids = await getFollowingUids(aktifKullaniciId);
        if (alive) {
          setFollowingUids(Array.isArray(uids) ? uids : []);
        }
      } catch (e) {
        console.error("Takip listesi alınamadı:", e);
        if (alive) setFollowingUids([]);
      }
    };

    loadFollowing();

    return () => {
      alive = false;
    };
  }, [aktifKullaniciId]);

  /* --- Yakınımda: marker güncelleme (cluster ile) --- */
  const updateMarkers = useCallback(
    (routes) => {
      const map = mapRef.current;
      if (!map || !window.google || !window.google.maps) return;

      const markerMap = markersByIdRef.current;

      const existingIds = new Set(markerMap.keys());
      const nextIds = new Set();

      const run = () => {
        (routes || []).forEach((route) => {
          if (!route || !route.id) return;
          const id = route.id;
          const c = route?.routeGeo?.center;
          if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return;

          nextIds.add(id);

          let marker = markerMap.get(id);
          if (!marker) {
            marker = new window.google.maps.Marker({
              position: { lat: c.lat, lng: c.lng },
              map,
              title: route.title || "Rota",
            });
            markerMap.set(id, marker);
          } else {
            marker.setMap(map);
          }
        });

        // Eski marker’ları temizle
        existingIds.forEach((id) => {
          if (!nextIds.has(id)) {
            const m = markerMap.get(id);
            if (m) {
              m.setMap(null);
              markerMap.delete(id);
            }
          }
        });

        const markersArray = Array.from(markerMap.values());

        // Clusterer
        if (!clusterRef.current) {
          clusterRef.current = new MarkerClusterer({
            map,
            markers: markersArray,
          });
        } else {
          clusterRef.current.clearMarkers();
          if (markersArray.length) {
            clusterRef.current.addMarkers(markersArray);
          }
        }
      };

      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(run);
      } else {
        run();
      }
    },
    [mapRef]
  );

  // Yakınımda kapandığında marker/cluster temizliği
  useEffect(() => {
    if (nearOn) return;

    if (clusterRef.current) {
      try {
        clusterRef.current.clearMarkers();
      } catch {
        // no-op
      }
      clusterRef.current = null;
    }
    markersByIdRef.current.forEach((m) => {
      try {
        m.setMap(null);
      } catch {
        // no-op
      }
    });
    markersByIdRef.current.clear();
  }, [nearOn]);

  /* --- Konum alma (yakınımda için) --- */
  const ensureNearCenter = useCallback(
    async (centerArg = null) => {
      setNearError("");

      // URL’den gelen merkez varsa direkt kullan
      if (centerArg && Number.isFinite(centerArg.lat) && Number.isFinite(centerArg.lng)) {
        setNearCenter(centerArg);
        if (mapRef.current) {
          try {
            mapRef.current.setCenter(centerArg);
            if ((mapRef.current.getZoom?.() ?? 0) < 13) {
              mapRef.current.setZoom(14);
            }
          } catch {
            // no-op
          }
        }
        return centerArg;
      }

      // Zaten konum alındıysa tekrar isteme
      if (nearCenter) return nearCenter;

      setNearLoading(true);
      try {
        const c = await askLocationOnce();
        setNearCenter(c);
        if (mapRef.current) {
          try {
            mapRef.current.setCenter(c);
            if ((mapRef.current.getZoom?.() ?? 0) < 13) {
              mapRef.current.setZoom(14);
            }
          } catch {
            // no-op
          }
        }
        return c;
      } catch (e) {
        setNearError(
          e?.message?.includes("permission") || e?.code === 1
            ? "Konum izni reddedildi."
            : "Konum alınamadı."
        );
        setNearCenter(null);
        return null;
      } finally {
        setNearLoading(false);
      }
    },
    [mapRef, nearCenter]
  );

  /* --- Viewport tabanlı sorgu (debounce + son isteği koru) --- */
  const scheduleViewportFetch = useCallback(
    (bounds) => {
      if (!bounds || !nearOn) return;

      const key = boundsKey(bounds);
      const prevKey = lastBoundsKeyRef.current;
      lastBoundsKeyRef.current = key;
      const mergeWithPrev = prevKey === key;

      if (viewportDebounceRef.current) {
        clearTimeout(viewportDebounceRef.current);
      }

      // Takip filtresindeyiz ve takip yoksa: doğrudan boş durum
      if (audience === "following" && (!aktifKullaniciId || followingUids.length === 0)) {
        viewportReqIdRef.current += 1; // eski istekleri boşa düşür
        setNearLoading(false);
        setNearError("");
        setNearStats(null);
        setNearItems([]);
        updateMarkers([]);
        return;
      }

      viewportDebounceRef.current = window.setTimeout(async () => {
        const reqId = ++viewportReqIdRef.current;
        setNearLoading(true);
        setNearError("");

        try {
          const { routes, stats } = await fetchViewportRoutes({
            bounds,
            limit: 200,
            userLocation: nearCenter || null,
            filters,
            sort: filters.sort || "distance",
            audience,
            followingUids: audience === "following" ? followingUids : undefined,
          });

          // Ağ koruması: yalnız son istek UI’ya yazabilsin
          if (viewportReqIdRef.current !== reqId) return;

          setNearStats(stats || null);
          setNearItems((prev) => {
            const base = mergeWithPrev ? prev : [];
            const map = new Map(base.map((r) => [r.id, r]));
            (routes || []).forEach((r) => {
              if (r && r.id) map.set(r.id, r);
            });
            const arr = Array.from(map.values());
            updateMarkers(arr);
            return arr;
          });
        } catch (e) {
          if (viewportReqIdRef.current !== reqId) return;
          console.error("Viewport routes error:", e);
          setNearError("Rotalar yüklenemedi.");
          setNearItems([]);
          setNearStats(null);
          updateMarkers([]);
        } finally {
          if (viewportReqIdRef.current === reqId) {
            setNearLoading(false);
          }
        }
      }, 300);
    },
    [filters, nearCenter, nearOn, updateMarkers, audience, followingUids, aktifKullaniciId]
  );

  /* --- Yakınımda: map hazır olduğunda viewport dinleyicisi --- */
  useEffect(() => {
    if (!isMobile || !nearOn) return;
    if (gmapsStatus !== "ready" || !mapRef.current || !window.google?.maps) return;

    const map = mapRef.current;

    try {
      // İlk merkez: varsa nearCenter’a çek
      if (nearCenter) {
        const currentCenter = map.getCenter?.();
        const curLat = currentCenter?.lat?.();
        const curLng = currentCenter?.lng?.();
        if (
          !currentCenter ||
          Math.abs(curLat - nearCenter.lat) > 0.0005 ||
          Math.abs(curLng - nearCenter.lng) > 0.0005
        ) {
          map.setCenter(nearCenter);
          if ((map.getZoom?.() ?? 0) < 13) {
            map.setZoom(14);
          }
        }
      }
    } catch {
      // no-op
    }

    const idleListener = map.addListener("idle", () => {
      const bounds = map.getBounds?.();
      if (!bounds) return;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      if (!ne || !sw) return;
      const b = {
        n: ne.lat(),
        e: ne.lng(),
        s: sw.lat(),
        w: sw.lng(),
      };
      scheduleViewportFetch(b);
    });

    return () => {
      if (idleListener && idleListener.remove) idleListener.remove();
    };
  }, [gmapsStatus, isMobile, mapRef, nearOn, nearCenter, scheduleViewportFetch]);

  /* --- Filtreler değişince mevcut viewport için yeniden sorgu --- */
  useEffect(() => {
    if (!isMobile || !nearOn) return;
    if (gmapsStatus !== "ready" || !mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;
    const bounds = map.getBounds?.();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (!ne || !sw) return;
    const b = {
      n: ne.lat(),
      e: ne.lng(),
      s: sw.lat(),
      w: sw.lng(),
    };
    scheduleViewportFetch(b);
  }, [filters, isMobile, nearOn, gmapsStatus, mapRef, scheduleViewportFetch]);

  /* --- Yakınımda toggle --- */
  const toggleNear = async () => {
    if (!isMobile) return; // masaüstüne dokunma
    const next = !nearOn;
    setNearOn(next);
    if (next) {
      await ensureNearCenter();
    }
  };

  /* URL ile açma: ?near=1&lat=..&lng=..&r=20 */
  useEffect(() => {
    if (!isMobile) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("near") === "1") {
      const lat = parseFloat(sp.get("lat"));
      const lng = parseFloat(sp.get("lng"));
      const r = parseFloat(sp.get("r"));
      if (Number.isFinite(r)) setRadiusKm(Math.max(5, Math.min(50, r)));
      setNearOn(true);
      const c =
        Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      ensureNearCenter(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Radius artık sadece liste sıralama/etiket için kullanılıyor — sorgu alanını değiştirmez */

  /* Yakınımda liste görünümü (filtreler + radius’a göre filtre) */
  const sortedNearItems = useMemo(() => {
    if (!nearItems.length) return [];
    let arr = [...nearItems];

    const { city, cc, minRating, minVotes, minDur, maxDur } = filters;

    if (city && city.trim()) {
      const lc = city.trim().toLowerCase();
      arr = arr.filter((r) =>
        (r?.areas?.city || "").toString().toLowerCase() === lc
      );
    }

    if (cc && cc.trim()) {
      const ccUpper = cc.trim().toUpperCase();
      arr = arr.filter((r) => {
        const code =
          (r?.areas?.countryCode ||
            r?.areas?.cc ||
            r?.areas?.country ||
            "").toString().toUpperCase();
        return code === ccUpper;
      });
    }

    const minRatingVal = Number(minRating) || 0;
    const minVotesVal = Number(minVotes) || 0;
    const minDurMs = (Number(minDur) || 0) * 60000;
    const maxDurMs = (Number(maxDur) || 0) * 60000;

    if (minRatingVal > 0) {
      arr = arr.filter(
        (r) => Number(r.ratingAvg || 0) >= minRatingVal
      );
    }
    if (minVotesVal > 0) {
      arr = arr.filter(
        (r) => Number(r.ratingCount || 0) >= minVotesVal
      );
    }
    if (minDurMs || maxDurMs) {
      arr = arr.filter((r) => {
        const dur = Number(r.durationMs || 0);
        if (minDurMs && (!dur || dur < minDurMs)) return false;
        if (maxDurMs && dur > maxDurMs) return false;
        return true;
      });
    }

    if (nearCenter) {
      arr = arr.filter((r) => {
        if (typeof r.distanceKm !== "number") return true;
        return r.distanceKm <= radiusKm + 0.5;
      });
    }

    // Sıralama viewportRoutes içinde yapılıyor; burada ek sort yok
    return arr;
  }, [nearItems, filters, nearCenter, radiusKm]);

  /* Yakınımda: grup yapısı (none / city / country) */
  const groupedNear = useMemo(
    () => groupRoutesForDisplay(sortedNearItems, groupMode, true),
    [sortedNearItems, groupMode]
  );

  /* Filtre chip’leri (özet) */
  const filterChips = useMemo(() => {
    const chips = [];
    const f = filters;

    if (f.city) chips.push(f.city);
    if (f.cc) chips.push(f.cc);

    if (f.minRating) {
      chips.push(`≥ ${Number(f.minRating).toFixed(1)} ★`);
    }
    if (f.minVotes) {
      chips.push(`≥ ${f.minVotes} oy`);
    }

    if (f.minDur || f.maxDur) {
      if (f.minDur && f.maxDur) {
        chips.push(`${f.minDur}-${f.maxDur} dk`);
      } else if (f.minDur) {
        chips.push(`≥ ${f.minDur} dk`);
      } else if (f.maxDur) {
        chips.push(`≤ ${f.maxDur} dk`);
      }
    }

    const sortLabelMap = {
      distance: "En yakın",
      rating: "En yüksek puan",
      votes: "En çok oy",
      new: "En yeni",
    };
    if (f.sort && f.sort !== "distance") {
      chips.push(sortLabelMap[f.sort] || "");
    }

    return chips.filter(Boolean);
  }, [filters]);

  const activeFilterCount = filterChips.length;

  /* Filtre paneli için şehir / ülke seçenekleri (mevcut sonuçlardan) */
  const cityOptions = useMemo(() => {
    const set = new Set();
    nearItems.forEach((r) => {
      const c = (r?.areas?.city || "").toString().trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [nearItems]);

  const countryOptions = useMemo(() => {
    const set = new Set();
    nearItems.forEach((r) => {
      const cc =
        (r?.areas?.countryCode ||
          r?.areas?.cc ||
          r?.areas?.country ||
          "").toString().trim().toUpperCase();
      if (cc) set.add(cc);
    });
    const arr = Array.from(set);
    if (!arr.includes("TR")) arr.unshift("TR");
    return arr;
  }, [nearItems]);

  const openFilterSheet = () => {
    setFilterDraft(filters);
    setFilterSheetOpen(true);
  };

  const closeFilterSheet = () => {
    setFilterSheetOpen(false);
  };

  const handleDraftChange = (field, value) => {
    setFilterDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleApplyFilters = () => {
    syncFilters(filterDraft);
    setFilterSheetOpen(false);
  };

  const handleResetFilters = () => {
    const cleared = { ...DEFAULT_FILTERS };
    setFilterDraft(cleared);
    syncFilters(cleared);
    // Audience da sıfırlansın → Hepsi
    syncAudience("all");
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(FILTER_STORAGE_KEY);
      } catch {
        // no-op
      }
    }
    setFilterSheetOpen(false);
  };

  /* ——— Arama (debounce) ——— */
  useEffect(() => {
    let alive = true;

    const run = async () => {
      const term = searchTerm.trim();
      if (!term) {
        if (!alive) return;
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);

      try {
        const usersRef = collection(db, "users");
        const firstWord = term.split(" ")[0];
        const lw = firstWord.toLowerCase();
        const cap =
          firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();

        const map = new Map();

        // kullanıcı adı (kullaniciAdi / username)
        const q1 = query(
          usersRef,
          where("kullaniciAdi", ">=", lw),
          where("kullaniciAdi", "<=", lw + "\uf8ff"),
          limit(10)
        );
        const s1 = await getDocs(q1);
        s1.docs.forEach((d) => {
          const data = d.data();
          map.set(data.uid || d.id, { id: d.id, ...data });
        });

        const q1b = query(
          usersRef,
          where("username", ">=", lw),
          where("username", "<=", lw + "\uf8ff"),
          limit(10)
        );
        const s1b = await getDocs(q1b);
        s1b.docs.forEach((d) => {
          const data = d.data();
          map.set(data.uid || d.id, { id: d.id, ...data });
        });

        // ad soyad (adSoyad / displayName)
        const q2 = query(
          usersRef,
          where("adSoyad", ">=", cap),
          where("adSoyad", "<=", cap + "\uf8ff"),
          limit(10)
        );
        const s2 = await getDocs(q2);
        s2.docs.forEach((d) => {
          const data = d.data();
          map.set(data.uid || d.id, { id: d.id, ...data });
        });

        const q2b = query(
          usersRef,
          where("displayName", ">=", cap),
          where("displayName", "<=", cap + "\uf8ff"),
          limit(10)
        );
        const s2b = await getDocs(q2b);
        s2b.docs.forEach((d) => {
          const data = d.data();
          map.set(data.uid || d.id, { id: d.id, ...data });
        });

        if (!alive) return;
        setSearchResults(Array.from(map.values()));
      } catch (e) {
        if (!alive) return;
        console.error("Arama hatası:", e);
        setSearchResults([]);
      } finally {
        if (alive) setIsSearching(false);
      }
    };

    const t = setTimeout(run, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [searchTerm]);

  /* ——— Keşfet gönderileri: ilk sayfa ——— */
  const pageSize = 24;
  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    setIsEnd(false);
    setCursor(null);
    try {
      const postsRef = collection(db, "posts");
      const qy = query(postsRef, orderBy("tarih", "desc"), limit(pageSize));
      const snap = await getDocs(qy);
      const docs = snap.docs;
      const mapped = docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts(mapped);
      setCursor(docs.length > 0 ? docs[docs.length - 1] : null);
      setIsEnd(docs.length < pageSize);
    } catch (e) {
      console.error("Explore ilk sayfa hatası:", e);
      setPosts([]);
      setIsEnd(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  /* ——— Sonsuz kaydırma: sonraki sayfalar ——— */
  const fetchNext = useCallback(async () => {
    if (paging || isEnd || !cursor) return;
    setPaging(true);
    try {
      const postsRef = collection(db, "posts");
      const qy = query(
        postsRef,
        orderBy("tarih", "desc"),
        startAfter(cursor),
        limit(pageSize)
      );
      const snap = await getDocs(qy);
      const docs = snap.docs;
      const add = docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts((prev) => mergeUnique(prev, add));
      setCursor(docs.length > 0 ? docs[docs.length - 1] : cursor);
      setIsEnd(docs.length < pageSize);
    } catch (e) {
      console.error("Explore sayfalama hatası:", e);
      setIsEnd(true);
    } finally {
      setPaging(false);
    }
  }, [paging, isEnd, cursor]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const ent = entries[0];
        if (ent?.isIntersecting) fetchNext();
      },
      { rootMargin: "800px 0px 1200px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNext]);

  /* ——— Grid listesi + mozaik ——— */
  const gridList = useMemo(() => posts, [posts]);
  const isBig = (idx) => idx % 7 === 0; // 0,7,14,...

  /* ——— Kart aç ——— */
  const openCard = (idx) => {
    const isMb = window.matchMedia("(max-width: 768px)").matches;
    if (isMb) {
      const withTypes = gridList.map((p) =>
        p.type ? p : { ...p, type: isClipItem(p) ? "clip" : "post" }
      );
      setViewer({ items: withTypes, index: idx });
    } else {
      setSelectedPost(gridList[idx]);
    }
  };

  const closeViewer = () => setViewer(null);

  return (
    <>
      <div className="explore-container">
        {/* Arama */}
        <div className="search-bar-wrapper">
          <div className="search-bar-container">
            <input
              type="text"
              placeholder="Ara…"
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Kullanıcı ara"
            />
          </div>
        </div>

        {/* --- Audience + Yakınımda + Gruplama (yalnız mobil) --- */}
        {isMobile && (
          <div className="chipbar">
            <div className="chipbar-row">
              <div className="chip-group" aria-label="Görüntülenen rotalar">
                <button
                  type="button"
                  className={`chip${audience === "all" ? " active" : ""}`}
                  onClick={() => syncAudience("all")}
                  aria-pressed={audience === "all"}
                >
                  Hepsi
                </button>
                <button
                  type="button"
                  className={`chip${
                    audience === "following" ? " active" : ""
                  }${!aktifKullaniciId ? " disabled" : ""}`}
                  onClick={() => syncAudience("following")}
                  aria-pressed={audience === "following"}
                  disabled={!aktifKullaniciId}
                >
                  Takip
                </button>
              </div>

              <button
                type="button"
                className={`chip${nearOn ? " active" : ""}`}
                onClick={toggleNear}
                aria-pressed={nearOn}
              >
                Yakınımda
              </button>
            </div>

            <div
              className="chipbar-row chipbar-row-grouping"
              aria-label="Gruplama seçeneği"
            >
              <span className="chip-label">Grupla:</span>
              <button
                type="button"
                className={`chip${groupMode === "none" ? " active" : ""}`}
                onClick={() => syncGroupMode("none")}
                aria-pressed={groupMode === "none"}
              >
                Yok
              </button>
              <button
                type="button"
                className={`chip${groupMode === "city" ? " active" : ""}`}
                onClick={() => syncGroupMode("city")}
                aria-pressed={groupMode === "city"}
              >
                Şehir
              </button>
              <button
                type="button"
                className={`chip${groupMode === "country" ? " active" : ""}`}
                onClick={() => syncGroupMode("country")}
                aria-pressed={groupMode === "country"}
              >
                Ülke
              </button>
            </div>
          </div>
        )}

        {/* Yakınımda modu aktifse rota listesi + harita */}
        {isMobile && nearOn ? (
          <>
            {/* Üst rozet: Yakınımda (Viewport) + sağda meta + Filtrele */}
            <div className="near-header">
              <span className="near-badge">Yakınımda (Viewport)</span>
              <div className="near-header-right">
                {nearStats && (
                  <span className="near-meta">
                    {nearStats.deduped ?? 0} rota
                    {typeof nearStats.fetched === "number"
                      ? ` • ${nearStats.fetched} kayıt`
                      : ""}
                  </span>
                )}
                <button
                  type="button"
                  className="near-filter-btn"
                  onClick={openFilterSheet}
                >
                  Filtrele{activeFilterCount ? ` (${activeFilterCount})` : ""}
                </button>
              </div>
            </div>

            {/* Aktif filtre özetleri */}
            {filterChips.length > 0 && (
              <div className="near-chip-row">
                {filterChips.map((label) => (
                  <span key={label} className="near-chip">
                    {label}
                  </span>
                ))}
              </div>
            )}

            {/* Harita */}
            <div className="near-map-wrapper">
              <div
                ref={mapDivRef}
                className="near-map"
                aria-label="Yakınımdaki rotalar haritası"
              />
              {gmapsStatus === "error" && (
                <div className="near-map-error">Harita yüklenemedi.</div>
              )}
            </div>

            {/* Yarıçap: sadece liste odağı/etiketi için */}
            {nearCenter && (
              <div className="near-controls">
                <label htmlFor="near-radius">
                  Yarıçap (liste odağı): <b>{radiusKm} km</b>
                </label>
                <input
                  id="near-radius"
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                />
              </div>
            )}

            {nearError && (
              <div className="search-message">
                {nearError} (Şehir filtresini kullanabilirsiniz.)
              </div>
            )}

            {!nearError && !nearCenter && (
              <NearbyPromptMobile
                onAllow={() => ensureNearCenter()}
                onCancel={() => setNearOn(false)}
              />
            )}

            {!nearError && nearLoading && (
              <div className="near-list" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="near-skel" />
                ))}
              </div>
            )}

            {!nearError && !nearLoading && sortedNearItems.length > 0 && (
              <div className="near-list">
                {groupMode === "none" || !groupedNear.groups ? (
                  groupedNear.flat.map((route) => (
                    <RouteCardMobile
                      key={route.id}
                      route={route}
                      onClick={() => {
                        // Not: Projenin mevcut yönlendirme yapısına göre burada açılacak.
                        // window.location.href = `/routes/${route.id}`;
                      }}
                    />
                  ))
                ) : (
                  groupedNear.groups.map((group) => (
                    <section
                      key={group.key}
                      className="ExploreGroupSection"
                    >
                      <div
                        className="ExploreGroupHeader"
                        role="heading"
                        aria-level={2}
                      >
                        {groupMode === "city"
                          ? `Şehir: ${group.label || "Bilinmeyen"}`
                          : `Ülke: ${group.label || "Bilinmeyen"}`}
                        {groupMode === "country" && group.cc && (
                          <span className="ExploreGroupHeaderBadge">
                            {group.cc}
                          </span>
                        )}
                      </div>
                      {group.items.map((route) => (
                        <RouteCardMobile
                          key={route.id}
                          route={route}
                          onClick={() => {
                            // Not: Projenin mevcut yönlendirme yapısına göre burada açılacak.
                            // window.location.href = `/routes/${route.id}`;
                          }}
                        />
                      ))}
                    </section>
                  ))
                )}
              </div>
            )}

            {!nearError &&
              !nearLoading &&
              sortedNearItems.length === 0 &&
              nearCenter && (
                <div className="search-message">
                  {groupMode !== "none" ? (
                    <>
                      <div>Seçtiğin gruplamayla uygun rota bulunamadı.</div>
                      <button
                        type="button"
                        className="near-group-reset-btn"
                        onClick={() => syncGroupMode("none")}
                      >
                        Gruplamayı Kapat
                      </button>
                    </>
                  ) : audience === "following" ? (
                    followingUids.length === 0 ? (
                      "Takip ettiğin hesap yok."
                    ) : (
                      "Takip ettiklerinden uygun rota bulunamadı. Hepsi’ni dene."
                    )
                  ) : (
                    "Bu görünümde seçilen koşullara uyan rota bulunamadı. Filtreleri gevşetmeyi deneyebilirsiniz."
                  )}
                </div>
              )}

            {/* Filtre Sheet (yalnız mobil & nearOn) */}
            {filterSheetOpen && (
              <div
                className="near-filter-backdrop"
                role="dialog"
                aria-modal="true"
                onClick={closeFilterSheet}
              >
                <div
                  className="near-filter-sheet"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="near-filter-header">
                    <div className="near-filter-title">Filtrele</div>
                    <button
                      type="button"
                      className="near-filter-close"
                      onClick={closeFilterSheet}
                    >
                      Kapat
                    </button>
                  </div>

                  <div className="near-filter-section">
                    <label className="near-filter-label" htmlFor="filter-city">
                      Şehir
                    </label>
                    <input
                      id="filter-city"
                      className="near-filter-input"
                      type="text"
                      placeholder="Örn. Milas"
                      list="explore-city-suggestions"
                      value={filterDraft.city}
                      onChange={(e) =>
                        handleDraftChange("city", e.target.value)
                      }
                    />
                    <datalist id="explore-city-suggestions">
                      {cityOptions.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>

                  <div className="near-filter-section">
                    <label className="near-filter-label" htmlFor="filter-cc">
                      Ülke
                    </label>
                    <select
                      id="filter-cc"
                      className="near-filter-select"
                      value={filterDraft.cc}
                      onChange={(e) =>
                        handleDraftChange("cc", e.target.value)
                      }
                    >
                      <option value="">Tümü</option>
                      {countryOptions.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="near-filter-section">
                    <label
                      className="near-filter-label"
                      htmlFor="filter-minRating"
                    >
                      En az puan
                    </label>
                    <select
                      id="filter-minRating"
                      className="near-filter-select"
                      value={filterDraft.minRating || 0}
                      onChange={(e) =>
                        handleDraftChange(
                          "minRating",
                          Number(e.target.value) || 0
                        )
                      }
                    >
                      <option value={0}>Fark etmez</option>
                      <option value={1}>1.0+</option>
                      <option value={2}>2.0+</option>
                      <option value={3}>3.0+</option>
                      <option value={3.5}>3.5+</option>
                      <option value={4}>4.0+</option>
                      <option value={4.5}>4.5+</option>
                    </select>
                  </div>

                  <div className="near-filter-section">
                    <label
                      className="near-filter-label"
                      htmlFor="filter-minVotes"
                    >
                      En az oy
                    </label>
                    <select
                      id="filter-minVotes"
                      className="near-filter-select"
                      value={filterDraft.minVotes || 0}
                      onChange={(e) =>
                        handleDraftChange(
                          "minVotes",
                          Number(e.target.value) || 0
                        )
                      }
                    >
                      <option value={0}>Fark etmez</option>
                      <option value={10}>10+</option>
                      <option value={20}>20+</option>
                      <option value={50}>50+</option>
                    </select>
                  </div>

                  <div className="near-filter-section">
                    <label className="near-filter-label">Süre (dk)</label>
                    <div className="near-filter-row">
                      <input
                        className="near-filter-input"
                        type="number"
                        min="0"
                        max="600"
                        placeholder="min"
                        value={filterDraft.minDur || ""}
                        onChange={(e) =>
                          handleDraftChange(
                            "minDur",
                            e.target.value === ""
                              ? 0
                              : Math.max(0, Number(e.target.value) || 0)
                          )
                        }
                      />
                      <span>—</span>
                      <input
                        className="near-filter-input"
                        type="number"
                        min="0"
                        max="600"
                        placeholder="maks"
                        value={filterDraft.maxDur || ""}
                        onChange={(e) =>
                          handleDraftChange(
                            "maxDur",
                            e.target.value === ""
                              ? 0
                              : Math.max(0, Number(e.target.value) || 0)
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="near-filter-section">
                    <label className="near-filter-label" htmlFor="filter-sort">
                      Sıralama
                    </label>
                    <select
                      id="filter-sort"
                      className="near-filter-select"
                      value={filterDraft.sort || "distance"}
                      onChange={(e) =>
                        handleDraftChange("sort", e.target.value)
                      }
                    >
                      <option value="distance">En yakın</option>
                      <option value="rating">En yüksek puan</option>
                      <option value="votes">En çok oy</option>
                      <option value="new">En yeni</option>
                    </select>
                  </div>

                  <div className="near-filter-actions">
                    <button
                      type="button"
                      className="near-filter-reset"
                      onClick={handleResetFilters}
                    >
                      Sıfırla
                    </button>
                    <button
                      type="button"
                      className="near-filter-apply"
                      onClick={handleApplyFilters}
                    >
                      Uygula
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* --- Normal Explore (gönderi grid) --- */
          <>
            {searchTerm.trim() ? (
              <div className="search-results-container" role="list">
                {isSearching ? (
                  <p className="search-message">Aranıyor…</p>
                ) : searchResults.length > 0 ? (
                  searchResults.map((user) => {
                    const uid = user.uid || user.id;
                    const avatar =
                      user.profilFoto || user.photoURL || "/avatars/default.png";
                    const uname =
                      user.kullaniciAdi || user.username || "kullanıcı";
                    const fname = user.adSoyad || user.displayName || "";
                    return (
                      <button
                        key={uid}
                        className="search-result-item"
                        onClick={() => onUserClick(uid)}
                        role="listitem"
                        aria-label={`${uname} profiline git`}
                        type="button"
                      >
                        <img src={avatar} alt="" />
                        <div className="search-result-info">
                          <span className="username">{uname}</span>
                          <span className="fullname">{fname}</span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="search-message">Sonuç bulunamadı.</p>
                )}
              </div>
            ) : loading ? (
              <div className="explore-grid" aria-busy="true" aria-live="polite">
                {Array.from({ length: pageSize }).map((_, i) => (
                  <div
                    key={i}
                    className="explore-grid-item skeleton"
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : gridList.length > 0 ? (
              <div className="explore-grid" role="list">
                {gridList.map((post, idx) => {
                  const url = mediaUrlOf(post);
                  if (!url) return null;
                  const clip = isClipItem(post);
                  const poster = thumbUrlOf(post);
                  const big = isBig(idx);

                  return (
                    <button
                      key={post.id}
                      type="button"
                      className={`explore-grid-item${big ? " big" : ""}`}
                      onClick={() => openCard(idx)}
                      role="listitem"
                      aria-label={clip ? "Klipi aç" : "Gönderiyi aç"}
                    >
                      {clip ? (
                        <video
                          className="explore-grid-media"
                          src={url}
                          poster={poster || undefined}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={url}
                          alt={post?.aciklama || post?.caption || "gönderi"}
                          className="explore-grid-media"
                          loading="lazy"
                          decoding="async"
                        />
                      )}

                      {clip && (
                        <div
                          className="explore-clip-badge"
                          style={{ color: "#fff" }}
                        >
                          <ClipBadge size={16} />
                        </div>
                      )}

                      <div
                        className="explore-grid-overlay"
                        style={{ color: "#fff" }}
                      >
                        <div className="explore-overlay-stat">
                          <StarIcon size={18} />
                          <span>{likeCountOf(post)}</span>
                        </div>
                        <div className="explore-overlay-stat">
                          <CommentIcon size={18} />
                          <span>{commentCountOf(post)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Sonsuz kaydırma sentinel + skeleton append */}
                {!isEnd && (
                  <>
                    {Array.from({ length: Math.min(6, pageSize) }).map((_, i) => (
                      <div
                        key={`skel-${i}`}
                        className="explore-grid-item skeleton"
                        aria-hidden="true"
                      />
                    ))}
                    <div
                      ref={sentinelRef}
                      className="explore-sentinel"
                      aria-hidden="true"
                    />
                  </>
                )}
              </div>
            ) : (
              <p className="search-message">Keşfedecek yeni bir şey yok.</p>
            )}
          </>
        )}
      </div>

      {/* Desktop modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          aktifKullaniciId={aktifKullaniciId}
        />
      )}

      {/* Mobil tam ekran viewer */}
      {viewer && (
        <ProfilePostViewerMobile
          items={viewer.items}
          startIndex={viewer.index}
          onClose={closeViewer}
        />
      )}
    </>
  );
}

export default Explore;

/* ——— yardımcı ——— */
function mergeUnique(prev, add) {
  const map = new Map(prev.map((x) => [x.id, x]));
  for (const it of add) {
    if (!it || !it.id) continue;
    map.set(it.id, it);
  }
  return Array.from(map.values());
}

function createdAtSecForRoute(it) {
  const ts = it?.createdAt;
  if (ts && typeof ts.seconds === "number") return ts.seconds;
  if (typeof it?.createdAt === "number") return it.createdAt;
  return 0;
}

/**
 * Yakınımda liste için gruplama:
 * mode === "none" → flat
 * mode === "city" | "country" → başlıklı gruplar
 */
function groupRoutesForDisplay(routes, mode, isNear) {
  const result = { flat: [], groups: null };

  if (!Array.isArray(routes) || routes.length === 0) {
    return result;
  }

  if (mode !== "city" && mode !== "country") {
    result.flat = routes;
    return result;
  }

  const useCity = mode === "city";
  const groupsMap = new Map();

  for (const route of routes) {
    if (!route) continue;
    const areas = route.areas || {};
    const meta = useCity ? fmtGroupKeyCity(areas) : fmtGroupKeyCountry(areas);
    const key = meta.key || "__unknown__";

    let group = groupsMap.get(key);
    if (!group) {
      group = {
        key,
        label: meta.label || "Bilinmeyen",
        cc: meta.cc || null,
        items: [],
      };
      groupsMap.set(key, group);
    }
    group.items.push(route);
  }

  const groups = Array.from(groupsMap.values());

  // Grup sırası: alfabetik, "Bilinmeyen" en sonda
  groups.sort((a, b) => {
    const aUnknown = a.label === "Bilinmeyen";
    const bUnknown = b.label === "Bilinmeyen";
    if (aUnknown && !bUnknown) return 1;
    if (bUnknown && !aUnknown) return -1;
    return a.label.localeCompare(b.label, "tr");
  });

  // Grup içi sıralama:
  // Yakınımda: mesafe artan; aksi halde createdAt desc
  groups.forEach((g) => {
    g.items.sort((a, b) => {
      if (isNear) {
        const da =
          typeof a.distanceKm === "number"
            ? a.distanceKm
            : Number.POSITIVE_INFINITY;
        const db =
          typeof b.distanceKm === "number"
            ? b.distanceKm
            : Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
        return createdAtSecForRoute(b) - createdAtSecForRoute(a);
      }
      return createdAtSecForRoute(b) - createdAtSecForRoute(a);
    });
  });

  return { flat: [], groups };
}
