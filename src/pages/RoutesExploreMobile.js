// src/pages/RoutesExploreMobile.js
// Mobil "Rotalar" sekmesi: Hepsi/Takip + Yakınımda/En yeni/En çok oy/En yüksek puan
// Harita (Yakınımda) + viewport tabanlı liste + URL/localStorage senkronu

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { auth } from "../firebase";

import { useGoogleMaps } from "../hooks/useGoogleMaps";
import fetchViewportRoutes from "../services/viewportRoutes";
import { fetchPublicRoutes } from "../services/routeSearch";
import { getFollowingUids } from "../services/follows";

import NearbyPromptMobile from "../components/NearbyPromptMobile";
import RouteCardMobile from "../components/RouteCardMobile";
import RouteFilterSheet from "../components/RouteFilterSheet";

import {
  readParam,
  pushParams,
  readJSON,
  writeJSON,
} from "../utils/urlState";
import { getRatingAvg } from "../utils/rating";

const DEFAULT_AUDIENCE = "all"; // "all" | "following"
const DEFAULT_SORT = "new"; // "near" | "new" | "likes" | "rating"
const DEFAULT_GROUP = "none"; // "none" | "city" | "country"

const PAGE_SIZE = 20;
const NEAR_LIMIT = 200;

const LS_AUDIENCE = "routes.v1.audience";
const LS_SORT = "routes.v1.sort";
const LS_GROUP = "routes.v1.group";
const LS_NEAR = "routes.v1.near";
const LS_RADIUS = "routes.v1.radius";

function normalizeAudience(raw) {
  if (!raw) return DEFAULT_AUDIENCE;
  const v = String(raw).toLowerCase();
  if (v === "following" || v === "takip") return "following";
  return "all";
}

function normalizeSort(raw) {
  const v = String(raw || "").toLowerCase();
  if (v === "near" || v === "yakın" || v === "nearby") return "near";
  if (v === "likes" || v === "most_rated" || v === "popular") return "likes";
  if (v === "rating" || v === "top" || v === "top_rated") return "rating";
  if (v === "new" || v === "en_yeni") return "new";
  return DEFAULT_SORT;
}

function normalizeGroup(raw) {
  const v = String(raw || "").toLowerCase();
  if (v === "city" || v === "şehir") return "city";
  if (v === "country" || v === "ülke") return "country";
  return DEFAULT_GROUP;
}

function getCreatedAtSec(route) {
  if (!route) return 0;
  if (typeof route._createdAtSec === "number") return route._createdAtSec;
  const ts = route.createdAt;
  if (!ts) return 0;
  if (typeof ts.seconds === "number") return ts.seconds;
  if (typeof ts.toMillis === "function") {
    return Math.floor(ts.toMillis() / 1000);
  }
  const n = Number(ts);
  return Number.isFinite(n) ? Math.floor(n / 1000) : 0;
}

function getRouteCity(route) {
  return (route?.areas?.city || "").toString().trim();
}

function getRouteCountryLabel(route) {
  const a = route?.areas || {};
  return (
    a.countryName ||
    a.country ||
    a.countryCode ||
    a.cc ||
    ""
  )
    .toString()
    .trim();
}

// Küçük merkez farklarını ölçmek için basit Haversine (m cinsinden)
function distanceMeters(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return Infinity;
  }
  const R = 6371000; // m
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(r1) * Math.cos(r2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function makeGroups(items, group) {
  if (group === "none") {
    return [
      {
        key: "all",
        label: "",
        items,
      },
    ];
  }

  const map = new Map();

  items.forEach((r) => {
    let key = "other";
    let label = "Diğer";

    if (group === "city") {
      const city = getRouteCity(r);
      if (city) {
        key = `city:${city.toLowerCase()}`;
        label = city;
      }
    } else if (group === "country") {
      const country = getRouteCountryLabel(r);
      if (country) {
        key = `country:${country.toLowerCase()}`;
        label = country;
      }
    }

    const existing = map.get(key);
    if (existing) {
      existing.items.push(r);
    } else {
      map.set(key, { key, label, items: [r] });
    }
  });

  const out = Array.from(map.values());
  out.sort((a, b) => {
    const la = (a.label || "").toLowerCase();
    const lb = (b.label || "").toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });
  return out;
}

function mapSortToOrder(sort) {
  if (sort === "new") return "new";
  if (sort === "rating") return "top"; // en yüksek puan
  if (sort === "likes") return "trending"; // en çok oy
  return "new";
}

function getInitialRouteUiState() {
  if (typeof window === "undefined") {
    return {
      audience: DEFAULT_AUDIENCE,
      sort: DEFAULT_SORT,
      group: DEFAULT_GROUP,
      near: null,
      radius: 5,
    };
  }

  let audience = normalizeAudience(readParam("aud", null));
  let sort = normalizeSort(readParam("sort", null));
  const urlGroupRaw =
    readParam("groupBy", null) ?? readParam("group", null);
  let group = normalizeGroup(urlGroupRaw);

  const lsAud = readJSON(LS_AUDIENCE, null);
  const lsSort = readJSON(LS_SORT, null);
  const lsGroup = readJSON(LS_GROUP, null);
  const lsNear = readJSON(LS_NEAR, null);
  const lsRadius = readJSON(LS_RADIUS, null);

  if (!audience && lsAud) audience = normalizeAudience(lsAud);
  if (!sort && lsSort) sort = normalizeSort(lsSort);
  if (!group && lsGroup) group = normalizeGroup(lsGroup);

  if (!audience) audience = DEFAULT_AUDIENCE;
  if (!sort) sort = DEFAULT_SORT;
  if (!group) group = DEFAULT_GROUP;

  let near = null;
  if (lsNear && typeof lsNear === "object") {
    const lat = Number(lsNear.lat);
    const lng = Number(lsNear.lng);
    const zoom = Number(lsNear.zoom);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      near = {
        lat,
        lng,
        zoom: Number.isFinite(zoom) ? zoom : 13,
      };
    }
  }

  let radius = Number(lsRadius);
  if (!Number.isFinite(radius) || radius <= 0) radius = 5;

  return { audience, sort, group, near, radius };
}

function getInitialRouteFilters() {
  if (typeof window === "undefined") {
    return {
      tags: [],
      city: "",
      country: "",
      dist: [0, 50], // km
      dur: [0, 300], // dk
    };
  }

  const city = (readParam("city", "") || "").toString();
  const country = (readParam("country", "") || "").toString();
  const tagsRaw = readParam("tags", null);
  let tags = [];

  if (typeof tagsRaw === "string" && tagsRaw.trim()) {
    tags = tagsRaw
      .split(/[,\s]+/g)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 10);
  }

  return {
    tags,
    city,
    country,
    dist: [0, 50],
    dur: [0, 300],
  };
}

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

  const isMountedRef = useRef(true);
  const sentinelRef = useRef(null);
  const nearViewportRef = useRef(null);
  const nearDebounceRef = useRef(null);

  const markersRef = useRef({});
  const clusterRef = useRef(null);
  const nearPersistRef = useRef({
    lastCenter: null,
    lastZoom: null,
    timeoutId: null,
  });

  const {
    gmapsStatus,
    errorMsg,
    mapDivRef,
    mapRef,
    attemptLoad,
  } = useGoogleMaps({
    API_KEY: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
    MAP_ID: process.env.REACT_APP_GMAPS_MAP_ID,
  });

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
      const existingMarkers = markersRef.current;
      if (existingMarkers && Object.keys(existingMarkers).length) {
        Object.values(existingMarkers).forEach((m) => {
          if (m && typeof m.setMap === "function") {
            m.setMap(null);
          }
        });
        markersRef.current = {};
      }
      if (clusterRef.current) {
        clusterRef.current.clearMarkers();
        clusterRef.current = null;
      }
      if (nearPersistRef.current.timeoutId) {
        clearTimeout(nearPersistRef.current.timeoutId);
        nearPersistRef.current.timeoutId = null;
      }
    };
  }, []);

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

  // ---- URL & localStorage senkronu (audience/sort/group + filtreler) ----
  useEffect(() => {
    writeJSON(LS_AUDIENCE, audience);
    writeJSON(LS_SORT, sort);
    writeJSON(LS_GROUP, group);
    // Yakınımda near/radius kayıtları ayrı bir throttled effect’te ele alınıyor.

    const audParam =
      audience === DEFAULT_AUDIENCE
        ? null
        : audience === "following"
        ? "following"
        : "all";
    const sortParam = sort === DEFAULT_SORT ? null : sort;
    const groupParam = group === DEFAULT_GROUP ? null : group;

    const cityParam = filters.city ? filters.city : null;
    const countryParam = filters.country ? filters.country : null;
    const tagsParam =
      filters.tags && filters.tags.length
        ? filters.tags.join(",")
        : null;

    // urlState: debounced replaceState (gereksiz history spam’ini engeller)
    pushParams({
      aud: audParam,
      sort: sortParam,
      groupBy: groupParam,
      city: cityParam,
      country: countryParam,
      tags: tagsParam,
    });
  }, [audience, sort, group, filters]);

  // ---- Yakınımda: near/radius localStorage kaydı (throttle + eşik) ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sort !== "near") return;
    if (!near || typeof near.lat !== "number" || typeof near.lng !== "number") {
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

  // ---- popstate → URL'den geri yükle ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      const aud = normalizeAudience(readParam("aud", null));
      const srt = normalizeSort(readParam("sort", null));
      const grp = normalizeGroup(
        readParam("groupBy", null) ?? readParam("group", null)
      );

      const city = (readParam("city", "") || "").toString();
      const country = (readParam("country", "") || "").toString();
      const tagsRaw = readParam("tags", null);
      let tags = [];
      if (typeof tagsRaw === "string" && tagsRaw.trim()) {
        tags = tagsRaw
          .split(/[,\s]+/g)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 10);
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
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // ---- Harita yükleme (Yakınımda) ----
  useEffect(() => {
    if (sort !== "near") return;
    if (gmapsStatus === "idle") {
      attemptLoad();
    }
  }, [sort, gmapsStatus, attemptLoad]);

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
    if (near && typeof near.lat === "number" && typeof near.lng === "number") {
      return;
    }
    if (locationStatus !== "unknown") return;
    requestLocation();
  }, [sort, near, locationStatus, requestLocation]);

  // ---- Harita merkezini oturt (Yakınımda) ----
  useEffect(() => {
    if (!mapReady || sort !== "near" || !mapRef.current) return;

    if (near && typeof near.lat === "number" && typeof near.lng === "number") {
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
    if (!mapReady || sort !== "near" || !mapRef.current) return;
    const listener = mapRef.current.addListener("idle", handleMapIdle);
    return () => {
      if (listener && typeof listener.remove === "function") {
        listener.remove();
      }
    };
  }, [mapReady, sort, handleMapIdle, mapRef]);

  // ---- Yakınımda: viewport değiştikçe (debounce 300ms) rota çek ----
  useEffect(() => {
    if (sort !== "near") return;
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
            followingUids: audience === "following" ? followingUids : undefined,
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
              const rTags = (Array.isArray(r.tags) ? r.tags : []).map((t) =>
                String(t).toLowerCase()
              );
              return wanted.every((tag) => rTags.includes(tag));
            });
          }

          // Mesafe filtresi (km)
          if (filters.dist && (filters.dist[0] > 0 || filters.dist[1] > 0)) {
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
  }, [sort, audience, followingUids, filters, userLocation, near]);

  // ---- Yakınımda: marker + cluster (diff tabanlı) ----
  useEffect(() => {
    if (sort !== "near") return;
    if (!mapReady || !mapRef.current || typeof window === "undefined") return;

    const gmaps = window.google.maps;
    if (!gmaps?.Marker) return;

    if (!clusterRef.current) {
      clusterRef.current = new MarkerClusterer({
        map: mapRef.current,
        markers: [],
      });
    }

    const currentMarkers = markersRef.current || {};
    const nextMarkers = { ...currentMarkers };
    const nextIds = new Set();

    items.forEach((r) => {
      const c = r?.routeGeo?.center;
      if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return;
      const id = r.id;
      if (!id) return;

      nextIds.add(id);

      if (currentMarkers[id]) {
        // Mevcut marker’ı yeniden kullan
        return;
      }

      const marker = new gmaps.Marker({
        position: { lat: c.lat, lng: c.lng },
        map: mapRef.current,
      });
      marker.addListener("click", () => openRoute(r.id));
      nextMarkers[id] = marker;
      if (clusterRef.current) {
        clusterRef.current.addMarker(marker);
      }
    });

    // Artık listede olmayan marker’ları kaldır
    Object.keys(currentMarkers).forEach((id) => {
      if (!nextIds.has(id)) {
        const marker = currentMarkers[id];
        if (marker) {
          if (clusterRef.current) {
            clusterRef.current.removeMarker(marker);
          }
          if (typeof marker.setMap === "function") {
            marker.setMap(null);
          }
        }
        delete nextMarkers[id];
      }
    });

    markersRef.current = nextMarkers;
  }, [items, sort, mapReady, mapRef, openRoute]);

  // Yakınımda modundan çıkarken marker/cluster temizliği
  useEffect(() => {
    if (sort === "near") return;

    const existingMarkers = markersRef.current;
    if (existingMarkers && Object.keys(existingMarkers).length) {
      Object.values(existingMarkers).forEach((m) => {
        if (m && typeof m.setMap === "function") {
          m.setMap(null);
        }
      });
      markersRef.current = {};
    }
    if (clusterRef.current) {
      clusterRef.current.clearMarkers();
      clusterRef.current = null;
    }
  }, [sort]);

  // ---- Yakınımda dışı (En yeni / En çok oy / En yüksek puan) → sayfalı sorgu ----
  const loadFirstNonNear = useCallback(async () => {
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
      setVisibleCount(list.length ? Math.min(list.length, PAGE_SIZE) : 0);
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
  }, [sort, filters.city, filters.country, audience, followingUids]);

  const loadMoreNonNear = useCallback(async () => {
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
  }, [
    sort,
    filters.city,
    filters.country,
    audience,
    followingUids,
    loading,
    isEnd,
    cursor,
  ]);

  // sort veya audience değişince non-near akışını resetle
  useEffect(() => {
    if (sort === "near") return;

    setItems([]);
    setCursor(null);
    setIsEnd(false);
    setVisibleCount(0);

    loadFirstNonNear();
  }, [sort, audience, filters.city, filters.country, followingUids, loadFirstNonNear]);

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
          if (sort !== "near") {
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
  }, [items.length, sort, loadMoreNonNear]);

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
  }, []);

  // ---- Aktif filtre chipleri ----
  const hasActiveFilters =
    !!filters.city ||
    !!filters.country ||
    (filters.tags && filters.tags.length > 0);

  const visibleItems =
    visibleCount > 0 ? items.slice(0, visibleCount) : items;
  const groups = makeGroups(visibleItems, group);
  const totalCount = items.length;

  const showNearbyPrompt =
    sort === "near" &&
    !near &&
    locationStatus === "denied" &&
    !userLocation;

  const groupLabel =
    group === "city" ? "Şehir" : group === "country" ? "Ülke" : "";

  const nearMetaText =
    sort === "near" && initialized
      ? `${totalCount} rota${
          Number.isFinite(radius) && radius > 0
            ? ` • yaklaşık ${radius.toFixed(1)} km`
            : ""
        }`
      : "";

  const showFollowingNearEmptyBadge =
    sort === "near" &&
    audience === "following" &&
    initialized &&
    !loading &&
    totalCount === 0 &&
    !showNearbyPrompt;

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
      <header
        className="routes-toolbar"
        role="region"
        aria-label="Rotalar araç çubuğu"
      >
        <div className="routes-toolbar-title">Rotalar</div>
        <div className="routes-toolbar-segment">
          <div className="routes-segment" aria-label="Kapsam">
            <button
              type="button"
              className={
                "routes-segment-btn" +
                (audience === "all" ? " routes-segment-btn--active" : "")
              }
              onClick={() => setAudience("all")}
              aria-pressed={audience === "all"}
            >
              Hepsi
            </button>
            <button
              type="button"
              className={
                "routes-segment-btn" +
                (audience === "following" ? " routes-segment-btn--active" : "")
              }
              onClick={() => setAudience("following")}
              aria-pressed={audience === "following"}
            >
              Takip
            </button>
          </div>
        </div>
        <button
          type="button"
          className="routes-filter-btn"
          onClick={() => setFilterSheetOpen(true)}
        >
          Filtrele
        </button>
      </header>

      {/* Katman 2 — Tek satır chip şeridi (yatay kaydırma) */}
      <div
        className="routes-chiprow"
        aria-label="Rota sıralama seçenekleri"
      >
        <button
          type="button"
          className={"chip" + (sort === "near" ? " chip--active" : "")}
          onClick={() => setSort("near")}
          aria-pressed={sort === "near"}
          aria-current={sort === "near" ? "true" : undefined}
        >
          Yakınımda
        </button>
        <button
          type="button"
          className={"chip" + (sort === "new" ? " chip--active" : "")}
          onClick={() => setSort("new")}
          aria-pressed={sort === "new"}
          aria-current={sort === "new" ? "true" : undefined}
        >
          En yeni
        </button>
        <button
          type="button"
          className={"chip" + (sort === "likes" ? " chip--active" : "")}
          onClick={() => setSort("likes")}
          aria-pressed={sort === "likes"}
          aria-current={sort === "likes" ? "true" : undefined}
        >
          En çok oy
        </button>
        <button
          type="button"
          className={"chip" + (sort === "rating" ? " chip--active" : "")}
          onClick={() => setSort("rating")}
          aria-pressed={sort === "rating"}
          aria-current={sort === "rating" ? "true" : undefined}
        >
          En yüksek puan
        </button>

        {groupLabel && (
          <button
            type="button"
            className="routes-badge"
            onClick={() => setFilterSheetOpen(true)}
          >
            Grup: {groupLabel}
          </button>
        )}
      </div>

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
      {sort === "near" && !showNearbyPrompt && (
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
          </div>

          {(gmapsStatus === "error" || gmapsStatus === "no-key") && (
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
            <span>Hiç rota bulunamadı.</span>
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

        {groups.map((g) => (
          <section
            key={g.key}
            className="ExploreGroup"
            style={{ marginBottom: 8 }}
          >
            {g.label && (
              <header
                className="ExploreGroupHeader"
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 5,
                  background: "#fff",
                  padding: "4px 2px 4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #eee",
                }}
              >
                <span
                  className="ExploreGroupHeaderTitle"
                  style={{ fontSize: 13, fontWeight: 700 }}
                >
                  {g.label}
                </span>
                <span
                  className="ExploreGroupHeaderBadge"
                  style={{
                    minWidth: 22,
                    padding: "2px 6px",
                    borderRadius: 999,
                    background: "#f3f4f6",
                    fontSize: 11,
                    textAlign: "center",
                  }}
                >
                  {g.items.length}
                </span>
              </header>
            )}
            <div
              className="ExploreGroupBody"
              style={{ paddingTop: g.label ? 6 : 0 }}
            >
              {g.items.map((r) => (
                <div key={r.id} style={{ marginBottom: 8 }}>
                  <RouteCardMobile
                    route={r}
                    onClick={() => openRoute(r.id)}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}

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
    </div>
  );
}

export default RoutesExploreMobile;
