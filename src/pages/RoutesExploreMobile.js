// src/pages/RoutesExploreMobile.js
// ADIM 30: Keşif ekranı – Hepsi/Takip, sıralama çipleri, arama (q + debounce 300ms) ve URL/localStorage senkronu.
// ADIM 32: m/a/s/q URL param’ları + localStorage(r_audience) + arama modunda varsayılan "En yeni" sıralama.
// Mobil "Rotalar" sekmesi: Hepsi/Takip + Yakınımda/En yeni/En çok oy/En yüksek puan
// Harita (Yakınımda) + viewport tabanlı liste + URL/localStorage senkronu
// ADIM 33: Harita pin/cluster, kart↔pin senkronu, "Bu alanda ara" CTA, sel=<routeId> URL/LS durumu.
// DIM 34: Arama UX – 300ms debounce + iptal edilebilir istek + son aramalar + eşleşme vurgulama.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { auth } from "../firebase";

import { useGoogleMaps } from "../hooks/useGoogleMaps";
import fetchViewportRoutes, {
  searchRoutes,
} from "../services/viewportRoutes";
import { fetchPublicRoutes } from "../services/routeSearch";
import { getFollowingUids } from "../services/follows";

import NearbyPromptMobile from "../components/NearbyPromptMobile";
import RouteFilterSheet from "../components/RouteFilterSheet";

import {
  readParam,
  pushParams,
  writeJSON,
} from "../utils/urlState";
import { getRatingAvg } from "../utils/rating";

import {
  DEFAULT_AUDIENCE,
  DEFAULT_SORT,
  DEFAULT_GROUP,
  LS_AUDIENCE,
  LS_AUDIENCE_LEGACY,
  LS_SORT_NEW,
  LS_SORT,
  LS_GROUP,
  LS_NEAR,
  LS_RADIUS,
  LS_QUERY,
  LS_SELECTED,
  normalizeAudience,
  normalizeSort,
  normalizeGroup,
  getInitialRouteUiState,
  getInitialRouteFilters,
} from "./RoutesExploreMobile/utils/stateInit";

import {
  getInitialRecentQueries,
  bumpRecentQuery as bumpRecentQueryLS,
  clearRecentQueries as clearRecentQueriesLS,
} from "./RoutesExploreMobile/utils/recentSearches";

import {
  createCluster,
  syncPins,
  clearPins,
} from "./RoutesExploreMobile/utils/nearMapPins";

import {
  getCreatedAtSec,
  distanceMeters,
} from "./RoutesExploreMobile/utils/routeFormatters";

import { mapSortToOrder } from "./RoutesExploreMobile/utils/sortMap";

import ExploreToolbarMobile from "./RoutesExploreMobile/components/ExploreToolbarMobile";
import ChipRowMobile from "./RoutesExploreMobile/components/ChipRowMobile";
import ResultsMeta from "./RoutesExploreMobile/components/ResultsMeta";
import GroupsList from "./RoutesExploreMobile/components/GroupsList";
import ToastMini from "./RoutesExploreMobile/components/ToastMini";

const PAGE_SIZE = 20;
const NEAR_LIMIT = 200;

// DIM 34: son aramalar
const LS_RECENT_Q = "r_recentq";

function RoutesExploreMobile() {
  const initialRef = useRef(null);
  if (!initialRef.current) {
    initialRef.current = {
      ui: getInitialRouteUiState(),
      filters: getInitialRouteFilters(),
    };
  }

  const [audience, setAudience] = useState(initialRef.current.ui.audience);
  const [sort, setSort] = useState(initialRef.current.ui.sort);
  const [group, setGroup] = useState(initialRef.current.ui.group);
  const [near, setNear] = useState(initialRef.current.ui.near);
  const [radius, setRadius] = useState(initialRef.current.ui.radius);

  const [searchText, setSearchText] = useState(
    initialRef.current.ui.query || ""
  );
  const [debouncedQuery, setDebouncedQuery] = useState(
    (initialRef.current.ui.query || "").trim()
  );

  // DIM 34: Arama yükleme durumu + son aramalar + focus
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [recentQueries, setRecentQueries] = useState(() =>
    getInitialRecentQueries()
  );
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const [filters, setFilters] = useState(initialRef.current.filters);

  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [isEnd, setIsEnd] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const [locationStatus, setLocationStatus] = useState("unknown"); // unknown | asking | granted | denied
  const [userLocation, setUserLocation] = useState(null);
  const [followingUids, setFollowingUids] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // ADIM 33: seçili rota + kart/pin senkronu
  const [selectedRouteId, setSelectedRouteId] = useState(
    initialRef.current.ui.selectedId || null
  );
  const [showSearchAreaButton, setShowSearchAreaButton] = useState(false);
  const [searchAreaTick, setSearchAreaTick] = useState(0);

  const isMountedRef = useRef(true);
  const sentinelRef = useRef(null);
  const nearViewportRef = useRef(null);
  const nearDebounceRef = useRef(null);
  // DIM 34: arama debounce + abort + requestId
  const searchDebounceRef = useRef(null);
  const searchAbortRef = useRef(null);
  const searchReqIdRef = useRef(0);

  const markersRef = useRef({});
  const clusterRef = useRef(null);

  const nearPersistRef = useRef({
    lastCenter: null,
    lastZoom: null,
    timeoutId: null,
  });
  const toastTimerRef = useRef(null);
  const wasSearchingRef = useRef(false);
  const recentBlurTimerRef = useRef(null);

  const {
    gmapsStatus,
    errorMsg,
    mapDivRef,
    mapRef,
    attemptLoad,
  } = useGoogleMaps({
    API_KEY: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    MAP_ID: process.env.REACT_APP_GOOGLE_MAPS_MAP_ID,
  });

  const hasSearch =
    !!debouncedQuery && debouncedQuery.trim().length > 0;

  const handleSelectAll = useCallback(() => {
    setAudience("all");
  }, []);

  const handleSelectFollowing = useCallback(() => {
    if (!auth?.currentUser?.uid) {
      setAudience("all");
      const msg =
        "Takip ettiğin kullanıcıların rotalarını görmek için giriş yapmalısın.";
      setToastMessage(msg);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        setToastMessage("");
      }, 2600);
      return;
    }
    setAudience("following");
  }, []);

  const handleOpenFilter = useCallback(() => {
    setFilterSheetOpen(true);
  }, []);

  const handleChangeSort = useCallback((nextSort) => {
    setSort(nextSort);
  }, []);

  // ---- Son aramalar & arama yardımcıları (DIM 34) ----
  const bumpRecentQuery = useCallback((raw) => {
    const q = (raw || "").toString().trim();
    if (!q) return;
    setRecentQueries((prev) =>
      bumpRecentQueryLS(prev, q, (next) => {
        try {
          writeJSON(LS_RECENT_Q, next);
        } catch {
          // no-op
        }
      })
    );
  }, []);

  const clearRecentQueries = useCallback(() => {
    setRecentQueries(
      clearRecentQueriesLS((next) => {
        try {
          writeJSON(LS_RECENT_Q, next);
        } catch {
          // no-op
        }
      })
    );
  }, []);

  const triggerImmediateSearch = useCallback(
    (value) => {
      const raw =
        typeof value === "string" ? value : searchText;
      const q = (raw || "").toString();
      const trimmed = q.trim();

      if (typeof value === "string") {
        setSearchText(q);
      }

      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }

      // Yeni bir arama dalgası: önceki sonuçlar stale olsun
      searchReqIdRef.current += 1;

      if (!trimmed) {
        if (searchAbortRef.current) {
          searchAbortRef.current.abort();
          searchAbortRef.current = null;
        }
        setDebouncedQuery("");
        setLoadingSearch(false);
        return;
      }

      setDebouncedQuery(trimmed);
    },
    [searchText]
  );

  const clearSearch = useCallback(() => {
    searchReqIdRef.current += 1;
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setSearchText("");
    setDebouncedQuery("");
    setLoadingSearch(false);
  }, []);

  const handleSearchFocus = useCallback(() => {
    if (recentBlurTimerRef.current) {
      clearTimeout(recentBlurTimerRef.current);
      recentBlurTimerRef.current = null;
    }
    setIsSearchFocused(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    if (recentBlurTimerRef.current) {
      clearTimeout(recentBlurTimerRef.current);
    }
    // Biraz geciktir, item tıklamaları bozulmasın
    recentBlurTimerRef.current = window.setTimeout(() => {
      setIsSearchFocused(false);
      recentBlurTimerRef.current = null;
    }, 120);
  }, []);

  const handleSearchKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        // Enter: debounce'ı atla, hemen ara
        triggerImmediateSearch();
      } else if (e.key === "Escape") {
        e.preventDefault();
        // ESC: aramayı temizle ve near moduna dön (sort etkisi aşağıdaki effect'te)
        clearSearch();
      }
    },
    [triggerImmediateSearch, clearSearch]
  );

  const handleRecentClick = useCallback(
    (q) => {
      if (!q) return;
      triggerImmediateSearch(q);
    },
    [triggerImmediateSearch]
  );

  const handleRecentClearClick = useCallback(
    (e) => {
      e.preventDefault();
      clearRecentQueries();
    },
    [clearRecentQueries]
  );

  // ---- open-route-modal event ----
  const openRoute = useCallback((routeId) => {
    if (!routeId) return;
    try {
      window.dispatchEvent(
        new CustomEvent("open-route-modal", {
          detail: { routeId },
        })
      );
    } catch {
      // no-op
    }
  }, []);

  // ---- mount/unmount ----
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;

      // Yakınımda marker/cluster temizliği (unmount)
      clearPins({
        cluster: clusterRef.current,
        markersMap: markersRef.current,
      });
      clusterRef.current = null;
      markersRef.current = {};

      if (nearPersistRef.current.timeoutId) {
        clearTimeout(nearPersistRef.current.timeoutId);
        nearPersistRef.current.timeoutId = null;
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      if (recentBlurTimerRef.current) {
        clearTimeout(recentBlurTimerRef.current);
        recentBlurTimerRef.current = null;
      }
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
    };
  }, []);

  // ADIM 33: modal kapandığında seçim temizlensin (yaklaşık dinleyici)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRouteClose = () => {
      setSelectedRouteId(null);
    };
    window.addEventListener("close-route-modal", handleRouteClose);
    window.addEventListener("route-modal-closed", handleRouteClose);
    return () => {
      window.removeEventListener("close-route-modal", handleRouteClose);
      window.removeEventListener(
        "route-modal-closed",
        handleRouteClose
      );
    };
  }, []);

  // ---- Arama inputu debounce (ADIM 30: q paramı, 300ms debounce) ----
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    const raw = searchText || "";
    const handle = window.setTimeout(() => {
      searchDebounceRef.current = null;
      setDebouncedQuery(raw.trim());
    }, 300);
    searchDebounceRef.current = handle;
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [searchText]);

  // ---- Audience: Hepsi / Takip → takip edilenler ----
  useEffect(() => {
    if (audience !== "following") {
      setFollowingUids([]);
      return;
    }
    const viewerId = auth?.currentUser?.uid;
    if (!viewerId) {
      setFollowingUids([]);
      return;
    }

    let alive = true;
    getFollowingUids(viewerId)
      .then((uids) => {
        if (!alive) return;
        setFollowingUids(Array.isArray(uids) ? uids : []);
      })
      .catch(() => {
        if (!alive) return;
        setFollowingUids([]);
      });

    return () => {
      alive = false;
    };
  }, [audience]);

  // ---- URL & localStorage senkronu (audience/sort/group + filtreler + q + sel, ADIM 32 + 33) ----
  useEffect(() => {
    writeJSON(LS_AUDIENCE, audience);
    writeJSON(LS_AUDIENCE_LEGACY, audience); // legacy anahtar da güncel kalsın
    writeJSON(LS_SORT_NEW, sort);
    writeJSON(LS_SORT, sort);
    writeJSON(LS_GROUP, group);
    writeJSON(LS_QUERY, searchText || "");
    writeJSON(LS_SELECTED, selectedRouteId || null);
    // Yakınımda near/radius kayıtları ayrı bir throttled effect’te ele alınıyor.

    const audParam =
      audience === DEFAULT_AUDIENCE
        ? null
        : audience === "following"
        ? "following"
        : "all";

    const hasText = !!(searchText && searchText.trim());
    const modeParam = hasText ? "search" : "near";

    let sortParam;
    if (modeParam === "search" && sort === "near") {
      // ADIM 32: arama modunda "near" yerine new param’ı yaz
      sortParam = "new";
    } else if (sort === "near") {
      sortParam = "near";
    } else if (sort === "likes") {
      sortParam = "votes";
    } else if (sort === "rating") {
      sortParam = "rating";
    } else {
      sortParam = "new";
    }

    const groupParam = group === DEFAULT_GROUP ? null : group;

    const cityParam = filters.city ? filters.city : null;
    const countryParam = filters.country ? filters.country : null;
    const tagsParam =
      filters.tags && filters.tags.length
        ? filters.tags.join(",")
        : null;

    const qParam = hasText ? searchText.trim() : null;
    const selParam =
      selectedRouteId && String(selectedRouteId).trim().length
        ? String(selectedRouteId).trim()
        : null;

    // ADIM 32: m (mode), a (audience), s (sort), q (query) + ADIM 33: sel
    pushParams({
      m: modeParam,
      a: audParam,
      s: sortParam,
      groupBy: groupParam,
      city: cityParam,
      country: countryParam,
      tags: tagsParam,
      q: qParam,
      sel: selParam,
    });
  }, [audience, sort, group, filters, searchText, selectedRouteId]);

  // ---- Yakınımda: near/radius localStorage kaydı (throttle + eşik) ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sort !== "near") return;
    if (
      !near ||
      typeof near.lat !== "number" ||
      typeof near.lng !== "number"
    ) {
      return;
    }

    const center = { lat: near.lat, lng: near.lng };
    const zoom = Number(near.zoom || 13);
    const lastCenter = nearPersistRef.current.lastCenter;
    const lastZoom = nearPersistRef.current.lastZoom;

    let shouldSchedule = false;

    if (!lastCenter || !Number.isFinite(lastZoom)) {
      shouldSchedule = true;
    } else {
      const dist = distanceMeters(lastCenter, center);
      const zoomDiff = Math.abs(zoom - lastZoom);
      if (dist > 30 || zoomDiff >= 1) {
        shouldSchedule = true;
      }
    }

    if (!shouldSchedule) return;

    if (nearPersistRef.current.timeoutId) {
      clearTimeout(nearPersistRef.current.timeoutId);
      nearPersistRef.current.timeoutId = null;
    }

    const timeoutId = window.setTimeout(() => {
      writeJSON(LS_NEAR, {
        lat: center.lat,
        lng: center.lng,
        zoom,
      });
      if (Number.isFinite(radius) && radius > 0) {
        writeJSON(LS_RADIUS, radius);
      } else {
        writeJSON(LS_RADIUS, null);
      }
      nearPersistRef.current.lastCenter = center;
      nearPersistRef.current.lastZoom = zoom;
      nearPersistRef.current.timeoutId = null;
    }, 1200); // ~1–1.5 sn throttle

    nearPersistRef.current.timeoutId = timeoutId;
  }, [sort, near, radius]);

  // ---- popstate → URL'den geri yükle (ADIM 32 + 33: m/a/s/q/sel destekli) ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      const audRaw = readParam("a", null) ?? readParam("aud", null);
      let aud = normalizeAudience(audRaw);
      const srtRaw =
        readParam("s", null) ?? readParam("sort", null);
      let srt = normalizeSort(srtRaw);
      const grp = normalizeGroup(
        readParam("groupBy", null) ?? readParam("group", null)
      );

      const city = (readParam("city", "") || "").toString();
      const country = (readParam("country", "") || "").toString();
      const tagsRaw = readParam("tags", null);
      const qVal = (readParam("q", "") || "").toString();
      const modeRaw = readParam("m", null);
      const selRaw = readParam("sel", null);

      let tags = [];
      if (typeof tagsRaw === "string" && tagsRaw.trim()) {
        tags = tagsRaw
          .split(/[,\s]+/g)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 10);
      }

      const modeFromUrl =
        (modeRaw || "").toString().toLowerCase() === "search"
          ? "search"
          : "near";
      const isSearchLike =
        modeFromUrl === "search" ||
        (qVal && qVal.toString().trim().length > 0);

      if (!aud) aud = DEFAULT_AUDIENCE;
      if (!srt) {
        srt = isSearchLike ? "new" : DEFAULT_SORT;
      }

      setAudience(aud);
      setSort(srt);
      setGroup(grp);
      setFilters((prev) => ({
        ...prev,
        city,
        country,
        tags,
      }));
      setSearchText(qVal);

      const sel =
        typeof selRaw === "string" && selRaw.trim()
          ? selRaw.trim()
          : null;
      setSelectedRouteId(sel);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // ---- Arama kutusu değişimi: ADIM 32 — aramaya girince "En yeni", temizlenince "Yakınımda" ----
  useEffect(() => {
    const hasText = !!searchText.trim();
    if (hasText) {
      if (!wasSearchingRef.current && sort === "near") {
        // İlk kez aramaya girerken varsayılanı "En yeni" yap
        setSort("new");
      }
      wasSearchingRef.current = true;
      return;
    }
    if (!hasText && wasSearchingRef.current) {
      if (sort !== "near") {
        setSort("near");
      }
      wasSearchingRef.current = false;
    }
  }, [searchText, sort]);

  // ---- Harita yükleme (Yakınımda) ----
  useEffect(() => {
    if (sort !== "near" || hasSearch) return;
    if (gmapsStatus === "idle") {
      attemptLoad();
    }
  }, [sort, hasSearch, gmapsStatus, attemptLoad]);

  useEffect(() => {
    if (gmapsStatus === "ready" && mapRef.current && !mapReady) {
      setMapReady(true);
    }
  }, [gmapsStatus, mapRef, mapReady]);

  // ---- Konum alma ----
  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("denied");
      return;
    }
    setLocationStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLocation(coords);
        setLocationStatus("granted");
      },
      () => {
        if (!isMountedRef.current) return;
        setLocationStatus("denied");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, []);

  // sort near olduğunda, önceden near yoksa otomatik konum iste
  useEffect(() => {
    if (sort !== "near") return;
    if (
      near &&
      typeof near.lat === "number" &&
      typeof near.lng === "number"
    ) {
      return;
    }
    if (locationStatus !== "unknown") return;
    requestLocation();
  }, [sort, near, locationStatus, requestLocation]);

  // ---- Harita merkezini oturt (Yakınımda) ----
  useEffect(() => {
    if (!mapReady || sort !== "near" || !mapRef.current) return;

    if (
      near &&
      typeof near.lat === "number" &&
      typeof near.lng === "number"
    ) {
      mapRef.current.setCenter({ lat: near.lat, lng: near.lng });
      if (near.zoom && Number.isFinite(near.zoom)) {
        mapRef.current.setZoom(near.zoom);
      }
    } else if (userLocation) {
      mapRef.current.setCenter(userLocation);
      mapRef.current.setZoom(14);
    }
  }, [mapReady, sort, near, userLocation, mapRef]);

  // ---- Harita idle → viewport & near kaydet ----
  const handleMapIdle = useCallback(() => {
    if (sort !== "near") return;
    if (!mapRef.current || typeof window === "undefined") return;
    const g = mapRef.current.getBounds();
    if (!g) return;
    const ne = g.getNorthEast();
    const sw = g.getSouthWest();
    const bounds = {
      n: ne.lat(),
      s: sw.lat(),
      e: ne.lng(),
      w: sw.lng(),
    };
    nearViewportRef.current = bounds;

    const center = mapRef.current.getCenter();
    const zoom = mapRef.current.getZoom();
    if (center) {
      const lat = center.lat();
      const lng = center.lng();
      setNear({
        lat,
        lng,
        zoom: zoom || 13,
      });
    }

    // Yaklaşık radius (km) → sadece meta için
    try {
      const dx = Math.abs(bounds.n - bounds.s);
      const dy = Math.abs(bounds.e - bounds.w);
      const approx = Math.sqrt(dx * dx + dy * dy) * 111;
      const r = approx / 2;
      if (Number.isFinite(r) && r > 0) {
        setRadius(r);
      }
    } catch {
      // no-op
    }
  }, [sort, mapRef]);

  useEffect(() => {
    if (!mapReady || sort !== "near" || hasSearch || !mapRef.current)
      return;
    const listener = mapRef.current.addListener(
      "idle",
      handleMapIdle
    );
    return () => {
      if (listener && typeof listener.remove === "function") {
        listener.remove();
      }
    };
  }, [mapReady, sort, hasSearch, handleMapIdle, mapRef]);

  // ADIM 33: harita hareket ettiğinde "Bu alanda ara" butonunu göster
  useEffect(() => {
    if (!mapReady || sort !== "near" || hasSearch || !mapRef.current)
      return;

    const map = mapRef.current;
    const handleInteraction = () => {
      setShowSearchAreaButton(true);
    };

    const dragListener = map.addListener(
      "dragend",
      handleInteraction
    );
    const zoomListener = map.addListener(
      "zoom_changed",
      handleInteraction
    );

    return () => {
      if (dragListener && typeof dragListener.remove === "function") {
        dragListener.remove();
      }
      if (zoomListener && typeof zoomListener.remove === "function") {
        zoomListener.remove();
      }
    };
  }, [mapReady, sort, hasSearch, mapRef]);

  // sort veya arama modu değişince CTA’yi gizle
  useEffect(() => {
    if (sort !== "near" || hasSearch) {
      setShowSearchAreaButton(false);
    }
  }, [sort, hasSearch]);

  const handleSearchInThisArea = useCallback(() => {
    setShowSearchAreaButton(false);
    setSearchAreaTick((tick) => tick + 1);
  }, []);

  // ---- Yakınımda: viewport değiştikçe (debounce 300ms) rota çek ----
  useEffect(() => {
    if (sort !== "near" || hasSearch) return;
    const bounds = nearViewportRef.current;
    if (!bounds) return;

    if (nearDebounceRef.current) {
      clearTimeout(nearDebounceRef.current);
      nearDebounceRef.current = null;
    }

    let cancelled = false;

    nearDebounceRef.current = setTimeout(() => {
      setLoading(true);
      setInitialized(true);

      (async () => {
        try {
          const { routes } = await fetchViewportRoutes({
            bounds,
            limit: NEAR_LIMIT,
            userLocation:
              userLocation ||
              (near &&
              typeof near.lat === "number" &&
              typeof near.lng === "number"
                ? { lat: near.lat, lng: near.lng }
                : null),
            filters: {
              city: filters.city,
              cc: filters.country,
              minDur: filters.dur ? filters.dur[0] : 0,
              maxDur: filters.dur ? filters.dur[1] : 0,
              sort: "distance",
            },
            sort: "distance",
            audience: audience === "following" ? "following" : "all",
            followingUids:
              audience === "following" ? followingUids : undefined,
          });

          if (cancelled) return;

          let list = (routes || []).map((r) => ({
            ...r,
            ratingAvg: getRatingAvg(r),
          }));

          // Etiket filtresi
          if (filters.tags && filters.tags.length) {
            const wanted = filters.tags.map((t) =>
              String(t).toLowerCase()
            );
            list = list.filter((r) => {
              const rTags = (Array.isArray(r.tags) ? r.tags : []).map(
                (t) => String(t).toLowerCase()
              );
              return wanted.every((tag) => rTags.includes(tag));
            });
          }

          // Mesafe filtresi (km)
          if (
            filters.dist &&
            (filters.dist[0] > 0 || filters.dist[1] > 0)
          ) {
            const [minKm, maxKm] = filters.dist;
            list = list.filter((r) => {
              if (typeof r.distanceKm !== "number") return true;
              if (minKm && r.distanceKm < minKm) return false;
              if (maxKm && r.distanceKm > maxKm) return false;
              return true;
            });
          }

          // Yakınımda sıralama: distance → ratingAvg → createdAt desc
          list.sort((a, b) => {
            const da =
              typeof a.distanceKm === "number"
                ? a.distanceKm
                : Number.POSITIVE_INFINITY;
            const db =
              typeof b.distanceKm === "number"
                ? b.distanceKm
                : Number.POSITIVE_INFINITY;
            if (da !== db) return da - db;
            const ra = getRatingAvg(a);
            const rb = getRatingAvg(b);
            if (rb !== ra) return rb - ra;
            return getCreatedAtSec(b) - getCreatedAtSec(a);
          });

          setItems(list);
          setCursor(null);
          setIsEnd(true);
          setVisibleCount(
            list.length > 0 ? Math.min(list.length, PAGE_SIZE) : 0
          );
        } catch {
          if (cancelled) return;
          setItems([]);
          setCursor(null);
          setIsEnd(true);
          setVisibleCount(0);
        } finally {
          if (cancelled) return;
          setLoading(false);
          setShowSearchAreaButton(false);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      if (nearDebounceRef.current) {
        clearTimeout(nearDebounceRef.current);
        nearDebounceRef.current = null;
      }
    };
  }, [
    sort,
    hasSearch,
    audience,
    followingUids,
    filters,
    userLocation,
    near,
    searchAreaTick,
  ]);

  // ADIM 33: kart seçili olduğunda haritayı merkeze al
  useEffect(() => {
    if (!selectedRouteId) return;
    const selId = String(selectedRouteId);
    const target = items.find((r) => String(r.id) === selId);
    if (!target) return;

    // Yakınımda modunda harita merkezini rota merkezine kaydır
    if (
      sort === "near" &&
      mapReady &&
      mapRef.current &&
      target?.routeGeo?.center &&
      Number.isFinite(target.routeGeo.center.lat) &&
      Number.isFinite(target.routeGeo.center.lng)
    ) {
      try {
        mapRef.current.panTo({
          lat: target.routeGeo.center.lat,
          lng: target.routeGeo.center.lng,
        });
      } catch {
        // no-op
      }
    }
  }, [selectedRouteId, items, sort, mapReady, mapRef]);

  // ---- Yakınımda: marker + cluster (nearMapPins utils, kart↔pin senkronu) ----
  useEffect(() => {
    if (sort !== "near" || hasSearch) return;
    if (!mapReady || !mapRef.current || typeof window === "undefined")
      return;

    const map = mapRef.current;

    if (!clusterRef.current) {
      clusterRef.current = createCluster(map);
    }

    const onSelect = (routeId) => {
      if (!routeId) return;
      setSelectedRouteId(routeId);
    };

    const result = syncPins({
      map,
      cluster: clusterRef.current,
      items,
      selectedId: selectedRouteId ? String(selectedRouteId) : null,
      markersMap: markersRef.current,
      onSelect,
    });

    if (result && result.markersMap) {
      markersRef.current = result.markersMap;
    }

    return () => {
      // Bu effect cleanup’ında ekstra işlem gerekmiyor; genel temizlik
      // near-modundan çıkış effect’inde ve unmount’ta yapılıyor.
    };
  }, [
    items,
    sort,
    hasSearch,
    mapReady,
    mapRef,
    selectedRouteId,
  ]);

  // Yakınımda modundan çıkarken veya arama moduna girerken marker/cluster temizliği
  useEffect(() => {
    if (sort === "near" && !hasSearch) return;

    clearPins({
      cluster: clusterRef.current,
      markersMap: markersRef.current,
    });
    clusterRef.current = null;
    markersRef.current = {};
  }, [sort, hasSearch]);

  // ---- Yakınımda dışı (En yeni / En çok oy / En yüksek puan) → sayfalı sorgu ----
  const loadFirstNonNear = useCallback(
    async () => {
      setLoading(true);
      setInitialized(false);

      try {
        const { items: page, nextCursor } = await fetchPublicRoutes({
          order: mapSortToOrder(sort),
          limit: PAGE_SIZE,
          city: filters.city || "",
          countryCode: filters.country || "",
        });

        let list = (page || []).map((r) => ({
          ...r,
          ratingAvg: getRatingAvg(r),
        }));

        if (audience === "following") {
          if (followingUids.length) {
            const followSet = new Set(
              followingUids.map((id) => String(id))
            );
            list = list.filter((r) => {
              const owner =
                r.ownerId ||
                r.userId ||
                r.uid ||
                r.ownerUID ||
                r.ownerUid ||
                r.userUID;
              if (!owner) return false;
              return followSet.has(String(owner));
            });
          } else {
            list = [];
          }
        }

        setItems(list);
        setCursor(nextCursor || null);
        setIsEnd(!nextCursor || !list.length);
        setVisibleCount(
          list.length ? Math.min(list.length, PAGE_SIZE) : 0
        );
        setInitialized(true);
      } catch {
        setItems([]);
        setCursor(null);
        setIsEnd(true);
        setVisibleCount(0);
        setInitialized(true);
      } finally {
        setLoading(false);
      }
    },
    [sort, filters.city, filters.country, audience, followingUids]
  );

  const loadMoreNonNear = useCallback(
    async () => {
      if (sort === "near") return;
      if (loading || isEnd || !cursor) return;

      setLoading(true);
      try {
        const { items: page, nextCursor } = await fetchPublicRoutes({
          order: mapSortToOrder(sort),
          limit: PAGE_SIZE,
          city: filters.city || "",
          countryCode: filters.country || "",
          cursor,
        });

        let list = (page || []).map((r) => ({
          ...r,
          ratingAvg: getRatingAvg(r),
        }));

        if (audience === "following") {
          if (followingUids.length) {
            const followSet = new Set(
              followingUids.map((id) => String(id))
            );
            list = list.filter((r) => {
              const owner =
                r.ownerId ||
                r.userId ||
                r.uid ||
                r.ownerUID ||
                r.ownerUid ||
                r.userUID;
              if (!owner) return false;
              return followSet.has(String(owner));
            });
          } else {
            list = [];
          }
        }

        setItems((prev) => prev.concat(list));
        setCursor(nextCursor || null);
        setIsEnd(!nextCursor || !list.length);
      } catch {
        setIsEnd(true);
      } finally {
        setLoading(false);
      }
    },
    [
      sort,
      filters.city,
      filters.country,
      audience,
      followingUids,
      loading,
      isEnd,
      cursor,
    ]
  );

  // sort veya audience değişince non-near akışını resetle
  useEffect(() => {
    if (sort === "near" || hasSearch) return;

    setItems([]);
    setCursor(null);
    setIsEnd(false);
    setVisibleCount(0);

    loadFirstNonNear();
  }, [
    sort,
    audience,
    filters.city,
    filters.country,
    followingUids,
    loadFirstNonNear,
    hasSearch,
  ]);

  // ---- Arama modu (q paramı) → searchRoutes (DIM 34: Abort + requestId + loadingSearch) ----
  useEffect(() => {
    if (!hasSearch) {
      // Arama modundan çıkarken varsa aktif istekleri iptal et
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
      setLoadingSearch(false);
      return;
    }

    const trimmed = (debouncedQuery || "").trim();
    if (!trimmed) {
      setLoadingSearch(false);
      return;
    }

    const currentReqId = searchReqIdRef.current + 1;
    searchReqIdRef.current = currentReqId;

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    // Son aramalar listesine ekle
    bumpRecentQuery(trimmed);

    setLoading(true);
    setLoadingSearch(true);
    setInitialized(false);
    setItems([]);
    setCursor(null);
    setIsEnd(true);
    setVisibleCount(0);

    const filtersSnapshot = { ...filters };

    (async () => {
      try {
        const { routes } = await searchRoutes({
          query: trimmed,
          limit: PAGE_SIZE * 3,
          audience,
          followingUids:
            audience === "following" ? followingUids : undefined,
          sort,
          signal: controller.signal,
        });

        if (
          !isMountedRef.current ||
          controller.signal.aborted ||
          currentReqId !== searchReqIdRef.current
        ) {
          return;
        }

        let list = (routes || []).map((r) => ({
          ...r,
          ratingAvg: getRatingAvg(r),
        }));

        // City/ülke filtresi (arama modunda da uygula)
        if (filtersSnapshot.city) {
          const lcCity = filtersSnapshot.city.toLowerCase();
          list = list.filter(
            (r) =>
              (r?.areas?.city || "")
                .toString()
                .toLowerCase() === lcCity
          );
        }

        if (filtersSnapshot.country) {
          const lcCountry = filtersSnapshot.country.toLowerCase();
          list = list.filter((r) => {
            const cc =
              (r?.areas?.countryName ||
                r?.areas?.country ||
                r?.areas?.countryCode ||
                r?.areas?.cc ||
                "")
                .toString()
                .toLowerCase();
            return cc.includes(lcCountry);
          });
        }

        // Etiket filtresi
        if (filtersSnapshot.tags && filtersSnapshot.tags.length) {
          const wanted = filtersSnapshot.tags.map((t) =>
            String(t).toLowerCase()
          );
          list = list.filter((r) => {
            const rTags = (Array.isArray(r.tags) ? r.tags : []).map(
              (t) => String(t).toLowerCase()
            );
            return wanted.every((tag) => rTags.includes(tag));
          });
        }

        // Mesafe filtresi (search sonuçlarında distanceKm yoksa atla)
        if (
          filtersSnapshot.dist &&
          (filtersSnapshot.dist[0] > 0 ||
            filtersSnapshot.dist[1] > 0)
        ) {
          const [minKm, maxKm] = filtersSnapshot.dist;
          list = list.filter((r) => {
            if (typeof r.distanceKm !== "number") return true;
            if (minKm && r.distanceKm < minKm) return false;
            if (maxKm && r.distanceKm > maxKm) return false;
            return true;
          });
        }

        // Süre filtresi (dk)
        if (
          filtersSnapshot.dur &&
          (filtersSnapshot.dur[0] > 0 ||
            filtersSnapshot.dur[1] > 0)
        ) {
          const [minDur, maxDur] = filtersSnapshot.dur;
          const minMs = minDur > 0 ? minDur * 60000 : 0;
          const maxMs = maxDur > 0 ? maxDur * 60000 : 0;
          list = list.filter((r) => {
            const dur = Number(r.durationMs || 0);
            if (minMs && (!dur || dur < minMs)) return false;
            if (maxMs && dur > maxMs) return false;
            return true;
          });
        }

        setItems(list);
        setVisibleCount(
          list.length > 0 ? Math.min(list.length, PAGE_SIZE) : 0
        );
        setIsEnd(true);
        setInitialized(true);
      } catch (err) {
        if (
          controller.signal.aborted ||
          err?.name === "AbortError" ||
          !isMountedRef.current ||
          currentReqId !== searchReqIdRef.current
        ) {
          return;
        }
        setItems([]);
        setVisibleCount(0);
        setIsEnd(true);
        setInitialized(true);
      } finally {
        if (
          !isMountedRef.current ||
          controller.signal.aborted ||
          currentReqId !== searchReqIdRef.current
        ) {
          return;
        }
        setLoading(false);
        setLoadingSearch(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    hasSearch,
    debouncedQuery,
    audience,
    followingUids,
    sort,
    filters,
    bumpRecentQuery,
  ]);

  // ---- Sonsuz kaydırma (her modda) ----
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting) return;

        setVisibleCount((prev) => {
          const next = Math.min(items.length, prev + PAGE_SIZE);
          if (next > prev) {
            return next;
          }
          if (!hasSearch && sort !== "near") {
            // Gösterilecek kalmadıysa ve non-near moddaysak yeni sayfa çek
            loadMoreNonNear();
          }
          return prev;
        });
      },
      {
        rootMargin: "800px 0px 800px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [items.length, sort, hasSearch, loadMoreNonNear]);

  // ---- FilterSheet apply ----
  const handleFilterApply = useCallback((payload) => {
    setFilters({
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      city: payload.city || "",
      country: payload.country || "",
      dist: payload.dist || [0, 50],
      dur: payload.dur || [0, 300],
    });

    if (payload.groupBy) {
      setGroup(normalizeGroup(payload.groupBy));
    }

    if (payload.sort) {
      const nextSort = normalizeSort(payload.sort);
      setSort(nextSort);
    }
  }, []);

  // ---- Filtreleri temizle ----
  const handleResetAll = useCallback(() => {
    setFilters({
      tags: [],
      city: "",
      country: "",
      dist: [0, 50],
      dur: [0, 300],
    });
    setGroup(DEFAULT_GROUP);
    setAudience(DEFAULT_AUDIENCE);
    setSort(DEFAULT_SORT);
    setNear(null);
    setRadius(5);
    setSearchText("");
    setSelectedRouteId(null);
  }, []);

  // ADIM 33: kart tıklama → seçim + pin vurgusu + harita pan + modal aç
  const handleRouteCardClick = useCallback(
    (route) => {
      if (!route || !route.id) return;
      const id = String(route.id);
      setSelectedRouteId(id);

      if (
        sort === "near" &&
        mapReady &&
        mapRef.current &&
        route?.routeGeo?.center &&
        Number.isFinite(route.routeGeo.center.lat) &&
        Number.isFinite(route.routeGeo.center.lng)
      ) {
        try {
          mapRef.current.panTo({
            lat: route.routeGeo.center.lat,
            lng: route.routeGeo.center.lng,
          });
        } catch {
          // no-op
        }
      }

      openRoute(id);
    },
    [sort, mapReady, mapRef, openRoute]
  );

  // ---- Aktif filtre chipleri ----
  const hasActiveFilters =
    !!filters.city ||
    !!filters.country ||
    (filters.tags && filters.tags.length > 0);

  const visibleItems =
    visibleCount > 0 ? items.slice(0, visibleCount) : items;
  const totalCount = items.length;

  const showNearbyPrompt =
    sort === "near" &&
    !hasSearch &&
    !near &&
    locationStatus === "denied" &&
    !userLocation;

  const groupLabel =
    group === "city" ? "Şehir" : group === "country" ? "Ülke" : "";

  const nearMetaText =
    sort === "near" && !hasSearch && initialized
      ? `${totalCount} rota${
          Number.isFinite(radius) && radius > 0
            ? ` • yaklaşık ${radius.toFixed(1)} km`
            : ""
        }`
      : "";

  const showFollowingNearEmptyBadge =
    sort === "near" &&
    !hasSearch &&
    audience === "following" &&
    initialized &&
    !loading &&
    totalCount === 0 &&
    !showNearbyPrompt;

  const emptyMessage =
    audience === "following"
      ? hasSearch
        ? "Takip ettiklerinden bu arama için rota bulunamadı."
        : sort === "near"
        ? "Takip ettiklerinden yakında rota yok."
        : "Takip ettiklerinden uygun rota bulunamadı."
      : hasSearch
      ? "Aramana uygun rota bulunamadı."
      : "Hiç rota bulunamadı.";

  // DIM 34: Son aramalar kutusu görünürlüğü
  const showRecentList =
    isSearchFocused &&
    !searchText.trim() &&
    recentQueries.length > 0;

  return (
    <div
      className="RoutesExploreMobile"
      style={{
        padding: "0 0 80px",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      {/* Katman 1 — Sticky toolbar */}
      <ExploreToolbarMobile
        audience={audience}
        onSelectAll={handleSelectAll}
        onSelectFollowing={handleSelectFollowing}
        onOpenFilter={handleOpenFilter}
      />

      {/* Katman 1.5 — Arama kutusu (ADIM 30 + DIM 34) */}
      <div
        className="routes-search-row"
        style={{
          padding: "4px 10px 6px",
          background: "#ffffff",
        }}
      >
        <div className="routes-search-input-wrap">
          <input
            type="search"
            className="search-input"
            placeholder="Rota ara (başlık, açıklama, şehir...)"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            onKeyDown={handleSearchKeyDown}
            autoComplete="off"
            enterKeyHint="search"
            style={{
              fontSize: 14,
            }}
          />
          {loadingSearch && (
            <span
              className="routes-explore-search-spinner"
              aria-hidden="true"
            />
          )}
          <button
            type="button"
            className="routes-search-clear"
            onClick={clearSearch}
            disabled={!searchText}
            aria-label="Aramayı temizle"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Son aramalar (DIM 34) */}
      {showRecentList && (
        <div className="routes-explore-recent">
          <div className="routes-explore-recent-inner">
            <div className="routes-explore-recent-header">
              <span>Son aramalar</span>
              <button
                type="button"
                className="routes-explore-recent-clear"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleRecentClearClick}
              >
                <span>Temizle</span>
                <span aria-hidden="true">🗑</span>
              </button>
            </div>
            <div className="routes-explore-recent-list">
              {recentQueries.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="routes-explore-recent-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleRecentClick(q)}
                >
                  <span className="routes-explore-recent-text">
                    {q}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Katman 2 — Tek satır chip şeridi (yatay kaydırma) */}
      <ChipRowMobile
        sort={sort}
        groupLabel={groupLabel}
        onChangeSort={handleChangeSort}
        onOpenFilter={handleOpenFilter}
      />

      {/* Takip + Yakınımda + 0 sonuç bilgisi */}
      {showFollowingNearEmptyBadge && (
        <div
          className="routes-info-row"
          style={{
            padding: "4px 10px 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "#4b5563",
          }}
        >
          <span className="routes-badge">
            Takip ettiklerinden yakında rota yok.
          </span>
          <button
            type="button"
            className="routes-info-link"
            onClick={() => setAudience("all")}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              marginLeft: "auto",
              fontSize: 11,
              fontWeight: 500,
              color: "#1d4ed8",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Hepsi&rsquo;ne geç
          </button>
        </div>
      )}

      {/* Yakınımda: konum izni reddedildiyse prompt (bar sabit, içerikte göster) */}
      {showNearbyPrompt && (
        <NearbyPromptMobile
          onAllow={requestLocation}
          onCancel={() => setSort("new")}
        />
      )}

      {/* Yakınımda: meta + harita alanı */}
      {sort === "near" && !hasSearch && !showNearbyPrompt && (
        <>
          {nearMetaText && (
            <div
              style={{
                padding: "4px 10px 0",
                fontSize: 11,
                color: "#6b7280",
              }}
            >
              {nearMetaText}
            </div>
          )}

          <div
            className="near-mapWrap"
            style={{
              height: 300,
              borderRadius: 12,
              overflow: "hidden",
              background: "#f1f3f4",
              margin: "4px 10px 8px",
              position: "relative",
            }}
          >
            <div
              ref={mapDivRef}
              style={{ width: "100%", height: "100%" }}
              aria-label="Yakındaki rotalar haritası"
            />
            {gmapsStatus === "loading" && (
              <div
                className="near-skel"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 37%,#f3f4f6 63%)",
                  animation: "near-skel-pulse 1.4s ease infinite",
                }}
              />
            )}

            {/* ADIM 33: "Bu alanda ara" butonu — Konumum butonuyla çakışmasın diye sol-alt */}
            {showSearchAreaButton && (
              <button
                type="button"
                className="near-search-area-btn"
                onClick={handleSearchInThisArea}
              >
                Bu alanda ara
              </button>
            )}
          </div>

          {(gmapsStatus === "error" ||
            gmapsStatus === "no-key") && (
            <div
              className="near-map-error"
              style={{
                padding: "0 10px 6px",
                fontSize: 11,
                color: "#7a7a7a",
              }}
            >
              Harita yüklenemedi: {errorMsg}
            </div>
          )}

          {hasActiveFilters && (
            <div
              className="near-filters-row"
              style={{
                padding: "0 10px 8px",
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {filters.city && (
                <span className="chip chip--filter">
                  Şehir: {filters.city}
                </span>
              )}
              {filters.country && (
                <span className="chip chip--filter">
                  Ülke: {filters.country}
                </span>
              )}
              {filters.tags &&
                filters.tags.map((t) => (
                  <span key={t} className="chip chip--filter">
                    #{t}
                  </span>
                ))}
            </div>
          )}
        </>
      )}

      {/* Arama modu için sonuç meta bilgisi (DIM 34) */}
      {hasSearch && initialized && (
        <ResultsMeta totalCount={totalCount} />
      )}

      {/* Liste alanı */}
      <div
        aria-busy={loading && !initialized}
        style={{ paddingTop: 4, paddingInline: 10 }}
      >
        {!initialized && !loading && (
          <div style={{ padding: "20px 4px" }}>Yükleniyor…</div>
        )}

        {initialized && !visibleItems.length && !loading && (
          <div
            style={{
              padding: "14px 4px",
              opacity: 0.8,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{emptyMessage}</span>
            <button
              type="button"
              onClick={handleResetAll}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                fontSize: 12,
                fontWeight: 500,
                color: "#1d4ed8",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Filtreleri temizle
            </button>
          </div>
        )}

        {/* Near modunda ilk yükleme sırasında skeleton kartlar */}
        {sort === "near" &&
          !hasSearch &&
          loading &&
          !visibleItems.length && (
            <div style={{ padding: "8px 2px" }}>
              <div
                className="near-skel"
                style={{
                  height: 80,
                  marginBottom: 8,
                  borderRadius: 12,
                  background: "#f3f4f6",
                }}
              />
              <div
                className="near-skel"
                style={{
                  height: 80,
                  marginBottom: 8,
                  borderRadius: 12,
                  background: "#f3f4f6",
                }}
              />
              <div
                className="near-skel"
                style={{
                  height: 80,
                  marginBottom: 8,
                  borderRadius: 12,
                  background: "#f3f4f6",
                }}
              />
            </div>
          )}

        <GroupsList
          items={visibleItems}
          group={group}
          selectedRouteId={selectedRouteId}
          onRouteClick={handleRouteCardClick}
          highlightQuery={hasSearch ? debouncedQuery : ""}
        />

        {/* Sonsuz kaydırma sentinel */}
        <div ref={sentinelRef} style={{ height: 1 }} />

        {/* Alt yükleme durumu */}
        {loading && sort !== "near" && visibleItems.length > 0 && (
          <div
            style={{
              padding: 12,
              textAlign: "center",
              opacity: 0.65,
              fontSize: 13,
            }}
          >
            Yükleniyor…
          </div>
        )}
        {isEnd && !loading && items.length > 0 && (
          <div
            style={{
              padding: 12,
              textAlign: "center",
              opacity: 0.6,
              fontSize: 12,
            }}
          >
            Hepsi bu kadar.
          </div>
        )}
      </div>

      {/* Alt çekmece filtre sheet */}
      <RouteFilterSheet
        open={filterSheetOpen}
        initial={{
          tagsText: (filters.tags || []).join(" "),
          city: filters.city,
          country: filters.country,
          dist: filters.dist,
          dur: filters.dur,
          sort,
          groupBy: group,
        }}
        onApply={handleFilterApply}
        onClose={() => setFilterSheetOpen(false)}
      />

      {/* Giriş yapılmadan Takip’e geçme denemesi için küçük toast (ADIM 30) */}
      <ToastMini message={toastMessage} />
    </div>
  );
}

export default RoutesExploreMobile;

/*
====================================================
HIZLI TEST REHBERI — ROUTES EXPLORE MOBILE (ADIM 30–34)
====================================================

[ ] 1) Uygulama açılışında "Rotalar" sekmesi sorunsuz açılıyor, hata/log yok.
[ ] 2) Hepsi / Takip segmentine tıklayınca:
    - "Hepsi" → tüm rotalar,
    - "Takip" (giriş yoksa) → toast çıkıyor ve state tekrar "Hepsi" oluyor.
[ ] 3) Arama kutusuna yazarken:
    - 300ms debounce ile istek atılıyor,
    - Son aramalar listesi doluyor,
    - "Temizle" çalışıyor, ESC ile arama sıfırlanıyor, near moda geri dönüyor.
[ ] 4) Arama modunda:
    - URL’de m=search, q=<arama> ve sort=new yazılıyor,
    - Sonuç sayacı ("X sonuç") doğru totalCount’a göre gösteriliyor.
[ ] 5) Yakınımda modunda:
    - Konum izni soruluyor, reddedilirse NearbyPrompt çıkıyor,
    - Harita yükleniyor; viewport değişince liste güncelleniyor.
[ ] 6) Haritada sürükle/zoom sonrası:
    - Sol altta "Bu alanda ara" butonu çıkıyor,
    - Butona basınca yeni viewport’a göre near sorgusu atılıyor.
[ ] 7) Kart ↔ pin senkronu:
    - Pin’e tıklayınca ilgili kart vurgulanıyor,
    - Kart’a tıklayınca modal açılıyor ve Yakınımda modunda harita o rotaya pan ediyor.
[ ] 8) Sıralama çipleri:
    - Yakınımda / En yeni / En çok oy / En yüksek puan arasında geçişte,
    - URL s paramı (near/new/votes/rating) doğru değişiyor,
    - Liste sıralaması beklenen şekilde değişiyor.
[ ] 9) Filtreler:
    - Şehir/ülke/etiket/distance/duration filtreleri RouteFilterSheet ile uygulanıyor,
    - Aktif filtre chip’leri listede görünüyor,
    - "Filtreleri temizle" her şeyi varsayılana sıfırlıyor.
[ ] 10) Sonsuz kaydırma:
    - Non-near modda (En yeni / En çok oy / En yüksek puan) aşağı inince yeni sayfa çekiliyor,
    - Son sayfada "Hepsi bu kadar." mesajı görünüyor.
[ ] 11) Arama + Near/Non-near geçişleri:
    - Arama başlarken sort near ise otomatik "new" oluyor,
    - Arama temizlenince sort tekrar "near" moduna dönüyor,
    - URL/LS (m,a,s,q,sel,groupBy,city,country,tags) bütün akış boyunca tutarlı.
[ ] 12) Build & ESLint:
    - npm run build / npm run lint çıktısında RoutesExploreMobile ile ilgili uyarı/hata yok,
    - Yeni hook/komponent dosyalarında da no-unused-vars/similar uyarısı yok.

--------------------
GERI ALMA NOTU
--------------------
Bu refaktörü geri almak istersen:

1) Bu dosyanın (RoutesExploreMobile.js) mevcut halini bir kenara kaydet.
2) Önceki monolit sürüme dönmek için git geçmişinden ya da elindeki yedekten
   eski RoutesExploreMobile implementasyonunu geri koy.
3) Eğer bu proje için alt klasör yapısı (src/pages/RoutesExploreMobile/...)
   oluşturduysan ve artık kullanmak istemiyorsan:
   - Bu klasördeki yalnızca bu ek refaktör için eklenen hook/komponent dosyalarını sil,
   - Üst seviyedeki re-export yapısını (export { default } from "./RoutesExploreMobile/RoutesExploreMobile";)
     gerekiyorsa eski haline çevir.
4) Tekrar npm run build al; hata varsa git history üzerinden tam revert yap.
*/
