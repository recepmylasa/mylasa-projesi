// FILE: src/hooks/useUserRoutes.js
// Profil “Rotalarım” sekmesi için rota listesi hook’u
// RouteCardMobile için standardize model (buildRouteCardModel).
// Grid’e PREVIEW veri bind edilecek (stopsPreview/cover/thumbnail). Gerekirse HYDRATE (lazy fetch).
//
// EMİR-1 notu (grid/read):
// - stopsPreview içinden "coverUrl" türetip modele yazma YOK (sadece gösterimde kullanılacak).
// - Yani coverUrl/thumbnailUrl yalnızca doc/model legacy alanlardan gelirse doldurulur.
// - Fallback (ilk durak görseli) UI tarafında pickCoverCandidate ile yapılır.
//
// EMİR 5 — permission-denied spam guard + UI lock mode (rules'a dokunmadan)

import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  buildRouteCardModel,
  getOwnerIdFromRaw,
  getVisibilityKey,
} from "../routes/routeCardModel";

// ✅ EMİR-6: optimistic cover event dinle + list patch
import {
  onRouteCoverUpdated,
  applyRouteCoverPatchToList,
} from "../utils/routeCoverEvents";

const __DEV__ = process.env.NODE_ENV !== "production";
const DEFAULT_PAGE_SIZE = 20;

// ✅ EMİR 5: dev log spam kırıcı (tek sefer)
const __permWarnOnce = new Set();
function warnPermOnce(key, msg, err) {
  if (!__DEV__) return;
  const k = String(key || "perm_once");
  if (__permWarnOnce.has(k)) return;
  __permWarnOnce.add(k);
  // eslint-disable-next-line no-console
  console.warn(msg, err || "");
}

function getErrCode(err) {
  const c = err?.code ? String(err.code) : "";
  return c || "";
}

function isPermissionDeniedError(err) {
  const code = getErrCode(err);
  if (code === "permission-denied") return true;

  const msg = err?.message ? String(err.message) : "";
  if (/missing or insufficient permissions/i.test(msg)) return true;
  if (/permission[- ]denied/i.test(msg)) return true;

  return false;
}

function isUnauthenticatedError(err) {
  const code = getErrCode(err);
  if (code === "unauthenticated") return true;
  const msg = err?.message ? String(err.message) : "";
  if (/unauthenticated/i.test(msg)) return true;
  return false;
}

// ---------- helpers (preview binding + hydrate) ----------
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function stripQueryAndHash(v) {
  const s = (v || "").toString().trim();
  if (!s) return "";
  return s.split(/[?#]/)[0];
}

// ✅ placeholder cover say (mylasa-logo.* + route-default-cover.*)
function isKnownAppLogoUrl(v) {
  const base = stripQueryAndHash(v).toLowerCase();
  if (!base) return false;
  const file = base.split("/").pop();
  return (
    file === "mylasa-logo.png" ||
    file === "mylasa-logo.svg" ||
    file === "route-default-cover.jpg" ||
    file === "route-default-cover.png"
  );
}

function normalizeCoverUrl(v) {
  if (!isNonEmptyString(v)) return "";
  const s = String(v).trim();
  return isKnownAppLogoUrl(s) ? "" : s;
}

function isVideoUrl(url) {
  const u = (url || "").toString().toLowerCase();
  return (
    u.includes(".mp4") ||
    u.includes(".webm") ||
    u.includes(".mov") ||
    u.includes(".m4v") ||
    u.includes("video/")
  );
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function pickFirst(obj, paths) {
  for (const p of paths || []) {
    const v = p.includes(".") ? getByPath(obj, p) : obj?.[p];
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      if (isNonEmptyString(v)) return v.trim();
      continue;
    }
    return v;
  }
  return undefined;
}

// ✅ cover objesinden (sadece cover objesi içinden) url seç — stopPreview türetme YOK
function pickCoverUrlFromCoverObj(coverObj) {
  if (!coverObj || typeof coverObj !== "object") return { url: "", sourceField: "" };

  const pairs = [
    ["cover.url", coverObj.url],
    ["cover.downloadUrl", coverObj.downloadUrl],
    ["cover.downloadURL", coverObj.downloadURL],
    ["cover.httpsUrl", coverObj.httpsUrl],
    ["cover.publicUrl", coverObj.publicUrl],

    // geriye uyum: bazı eski cover objeleri url yerine path tutabilir
    ["cover.storagePath", coverObj.storagePath],
    ["cover.fullPath", coverObj.fullPath],
    ["cover.path", coverObj.path],
    ["cover.gsUrl", coverObj.gsUrl],
    ["cover.gsURL", coverObj.gsURL],
  ];

  for (const [src, v] of pairs) {
    if (!isNonEmptyString(v)) continue;
    const u = normalizeCoverUrl(String(v).trim());
    if (!u) continue;
    if (isVideoUrl(u)) continue;
    return { url: u, sourceField: src };
  }

  return { url: "", sourceField: "" };
}

function normalizeStopTitle(s) {
  if (!s) return "";
  if (typeof s === "string") return s;
  const candidates = [
    "title",
    "name",
    "label",
    "place.mainText",
    "place.name",
    "place.title",
    "place.formattedAddress",
    "place.formatted",
    "poi.name",
    "poi.title",
  ];
  const v = pickFirst(s, candidates);
  return typeof v === "string" ? v : "";
}

// ✅ patch: lat/lng yakalama alanlarını genişlet (GeoPoint / position / coordinates)
function extractStopLatLng(s) {
  if (!s || typeof s !== "object") return { lat: null, lng: null };

  const lat =
    pickFirst(s, [
      "lat",
      "latitude",
      "location.lat",
      "location.latitude",
      "position.lat",
      "position.latitude",
      "coords.lat",
      "coords.latitude",
      "coordinates.lat",
      "coordinates.latitude",
    ]) ?? null;

  const lng =
    pickFirst(s, [
      "lng",
      "lon",
      "longitude",
      "location.lng",
      "location.longitude",
      "position.lng",
      "position.longitude",
      "coords.lng",
      "coords.longitude",
      "coordinates.lng",
      "coordinates.longitude",
    ]) ?? null;

  const nlat = typeof lat === "number" ? lat : Number(lat);
  const nlng = typeof lng === "number" ? lng : Number(lng);

  return {
    lat: Number.isFinite(nlat) ? nlat : null,
    lng: Number.isFinite(nlng) ? nlng : null,
  };
}

function isGoodImageCandidate(u) {
  if (!isNonEmptyString(u)) return false;
  const s = String(u).trim();
  if (!s) return false;
  if (isKnownAppLogoUrl(s)) return false;
  if (isVideoUrl(s)) return false;
  return true;
}

// ✅ FIX: stop içindeki medya url alanlarını “image/poster önce” + “video ise poster’a düş” şeklinde seç
function extractStopMediaUrl(s) {
  if (!s) return "";

  // 1) Önce image/poster/thumbnail gibi alanlar
  const imageFirstKeys = [
    "imageUrl",
    "imageURL",
    "photoUrl",
    "photoURL",
    "thumbnailUrl",
    "thumbUrl",
    "thumbURL",
    "previewUrl",
    "previewURL",
    "posterUrl",
    "poster",
    "coverUrl",
    "coverURL",
    "downloadUrl",
    "downloadURL",
    "signedUrl",
    "publicUrl",
    "fileUrl",
    "uri",
    "path",
    "fullPath",
    "storagePath",
    "gsUrl",
    "gsURL",
    "url",
    "src",
  ];

  for (const k of imageFirstKeys) {
    const v = k.includes(".") ? getByPath(s, k) : s?.[k];
    if (!isNonEmptyString(v)) continue;
    const u = String(v).trim();
    if (isGoodImageCandidate(u)) return u;
  }

  // 2) Sonra “genel medya” alanları (ama video ise kabul etme)
  const mediaKeys = ["mediaUrl", "mediaURL"];
  for (const k of mediaKeys) {
    const v = k.includes(".") ? getByPath(s, k) : s?.[k];
    if (!isNonEmptyString(v)) continue;
    const u = String(v).trim();
    if (isGoodImageCandidate(u)) return u;

    // video çıktıysa poster araması
    if (isVideoUrl(u)) {
      const posterTry = pickFirst(s, [
        "posterUrl",
        "poster",
        "thumbnailUrl",
        "thumbUrl",
        "previewUrl",
        "imageUrl",
        "photoUrl",
        "downloadUrl",
        "downloadURL",
      ]);
      if (isNonEmptyString(posterTry) && isGoodImageCandidate(posterTry)) {
        return String(posterTry).trim();
      }
    }
  }

  // 3) Array/packs
  const arr =
    pickFirst(s, [
      "media",
      "medias",
      "gallery",
      "items",
      "photos",
      "images",
      "imageUrls",
      "photoUrls",
      "mediaItems",
      "attachments",
      "files",
    ]) || null;

  if (Array.isArray(arr) && arr.length) {
    for (const it of arr) {
      if (!it) continue;

      if (typeof it === "string") {
        const u = it.trim();
        if (isGoodImageCandidate(u)) return u;
        continue;
      }

      if (typeof it === "object") {
        const typeRaw = (it.type || it.mediaType || it.kind || it.mime || "")
          .toString()
          .toLowerCase();

        const url =
          (isNonEmptyString(it.url) ? it.url : "") ||
          (isNonEmptyString(it.src) ? it.src : "") ||
          (isNonEmptyString(it.imageUrl) ? it.imageUrl : "") ||
          (isNonEmptyString(it.photoUrl) ? it.photoUrl : "") ||
          (isNonEmptyString(it.mediaUrl) ? it.mediaUrl : "") ||
          (isNonEmptyString(it.fileUrl) ? it.fileUrl : "") ||
          (isNonEmptyString(it.videoUrl) ? it.videoUrl : "") ||
          (isNonEmptyString(it.uri) ? it.uri : "") ||
          (isNonEmptyString(it.path) ? it.path : "");

        const poster =
          (isNonEmptyString(it.posterUrl) ? it.posterUrl : "") ||
          (isNonEmptyString(it.poster) ? it.poster : "") ||
          (isNonEmptyString(it.thumbnailUrl) ? it.thumbnailUrl : "") ||
          (isNonEmptyString(it.thumbUrl) ? it.thumbUrl : "") ||
          (isNonEmptyString(it.previewUrl) ? it.previewUrl : "");

        const urlStr = isNonEmptyString(url) ? String(url).trim() : "";
        const posterStr = isNonEmptyString(poster) ? String(poster).trim() : "";

        const isVid =
          typeRaw.includes("video") ||
          typeRaw.includes("mp4") ||
          typeRaw.includes("webm") ||
          (urlStr ? isVideoUrl(urlStr) : false);

        if (isVid) {
          if (isGoodImageCandidate(posterStr)) return posterStr;

          const nestedPoster = pickFirst(it, [
            "file.url",
            "file.downloadUrl",
            "file.downloadURL",
            "asset.url",
            "asset.downloadUrl",
            "asset.downloadURL",
          ]);
          if (isNonEmptyString(nestedPoster) && isGoodImageCandidate(nestedPoster)) {
            return String(nestedPoster).trim();
          }
          continue;
        }

        if (isGoodImageCandidate(urlStr)) return urlStr;
        if (isGoodImageCandidate(posterStr)) return posterStr;

        const nested = pickFirst(it, [
          "file.url",
          "file.downloadUrl",
          "file.downloadURL",
          "file.path",
          "asset.url",
          "asset.downloadUrl",
          "asset.downloadURL",
        ]);
        if (isNonEmptyString(nested) && isGoodImageCandidate(nested)) {
          return String(nested).trim();
        }
      }
    }
  }

  return "";
}

function normalizeStopsPreviewValue(v) {
  if (!v) return [];
  let arr = [];
  if (Array.isArray(v)) arr = v.slice();
  else if (typeof v === "object") {
    const inner = pickFirst(v, ["items", "stops", "preview", "list"]);
    if (Array.isArray(inner)) arr = inner.slice();
  }

  const cleaned = arr
    .map((s) => {
      if (!s) return null;
      if (typeof s === "string") {
        const t = s.trim();
        if (!t) return null;
        return { title: t };
      }
      if (typeof s === "object") {
        const title = normalizeStopTitle(s);
        const { lat, lng } = extractStopLatLng(s);
        const mediaUrl = extractStopMediaUrl(s);

        const out = {};
        if (isNonEmptyString(title)) out.title = title;
        if (lat !== null) out.lat = lat;
        if (lng !== null) out.lng = lng;
        if (isNonEmptyString(mediaUrl)) out.mediaUrl = mediaUrl;
        if (s.id) out.id = s.id;
        if (s.order !== undefined) out.order = s.order;
        if (s.idx !== undefined && out.order === undefined) out.order = s.idx;
        return Object.keys(out).length ? out : null;
      }
      return null;
    })
    .filter(Boolean);

  const sorted = cleaned.slice().sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : Number(a.order);
    const bo = typeof b.order === "number" ? b.order : Number(b.order);
    const na = Number.isFinite(ao) ? ao : 0;
    const nb = Number.isFinite(bo) ? bo : 0;
    return na - nb;
  });

  if (sorted.length > 2) return [sorted[0], sorted[sorted.length - 1]];
  return sorted;
}

function extractPreviewFromRouteDoc(raw) {
  if (!raw || typeof raw !== "object") {
    return { stopsPreview: [], coverUrl: "", thumbnailUrl: "" };
  }

  const stopsPreviewRaw = pickFirst(raw, [
    "stopsPreview",
    "stops_preview",
    "previewStops",
    "stopsLite",
    "stopsLitePreview",
    "stopsShort",
    "preview.stops",
    "preview.stopsPreview",
    "preview.items",
    "stops",
  ]);

  const stopsPreview = normalizeStopsPreviewValue(stopsPreviewRaw);

  const coverUrlVal = pickFirst(raw, [
    "coverUrl",
    "coverURL",
    "coverPhotoUrl",
    "coverImageUrl",
    "previewUrl",
    "previewURL",
    "thumbnailUrl",
    "thumbUrl",
    "imageUrl",
    "photoUrl",
    "mediaUrl",
    "downloadUrl",
    "downloadURL",
    "preview.coverUrl",
    "preview.thumbnailUrl",
    "preview.url",
  ]);

  let coverUrl = normalizeCoverUrl(coverUrlVal);
  if (coverUrl && isVideoUrl(coverUrl)) coverUrl = "";

  const thumbVal = pickFirst(raw, [
    "thumbnailUrl",
    "thumbUrl",
    "thumbURL",
    "preview.thumbnailUrl",
    "preview.thumbUrl",
    "previewUrl",
    "coverUrl",
    "downloadUrl",
    "downloadURL",
  ]);
  let thumbnailUrl = normalizeCoverUrl(thumbVal);
  if (thumbnailUrl && isVideoUrl(thumbnailUrl)) thumbnailUrl = "";

  if (!isNonEmptyString(thumbnailUrl)) {
    thumbnailUrl = coverUrl || "";
  }

  return { stopsPreview, coverUrl, thumbnailUrl };
}

function needsHydratePreview(route) {
  if (!route) return false;
  if (route.__previewHydrated) return false;

  const sp = route.stopsPreview;
  const hasStopsPreview = Array.isArray(sp) && sp.length >= 1;

  const coverFromCanonical = normalizeCoverUrl(route?.cover?.url);
  const coverLegacyRaw =
    route.coverUrl ||
    route.previewUrl ||
    route.thumbnailUrl ||
    route.thumbUrl ||
    route.imageUrl ||
    route.photoUrl ||
    route.mediaUrl ||
    "";

  const coverLegacy = normalizeCoverUrl(coverLegacyRaw);

  const hasCover = isNonEmptyString(coverFromCanonical) || isNonEmptyString(coverLegacy);

  return !hasStopsPreview || !hasCover;
}

// ✅ Create-index linkini GİZLEME: ama permission-denied spam yapma
function logFirestoreQueryError(tag, err) {
  const code = getErrCode(err) || "unknown";
  const message = err?.message ? String(err.message) : "";
  const stack = err?.stack ? String(err.stack) : "";

  if (isPermissionDeniedError(err) || isUnauthenticatedError(err)) {
    warnPermOnce(
      `perm_${tag}_${code}`,
      `[useUserRoutes] ${tag} — erişim yok (${code})`,
      __DEV__ ? err : null
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.groupCollapsed(`${tag} (${code})`);
  // eslint-disable-next-line no-console
  console.error(err);
  // eslint-disable-next-line no-console
  console.log("err.code:", code);
  // eslint-disable-next-line no-console
  console.log("err.message:", message);
  if (stack) {
    // eslint-disable-next-line no-console
    console.log("err.stack:", stack);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();

  if (message) {
    // eslint-disable-next-line no-console
    console.warn(`${tag} message:`, message);
  }
}

// ✅ EMİR 1/3 — DEV teşhis log helper (spam-guard)
function safeShortId(v) {
  try {
    const s = v == null ? "" : String(v);
    if (!s) return "";
    if (s.length <= 10) return s;
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
  } catch {
    return "";
  }
}

export default function useUserRoutes(ownerId, options = {}) {
  const {
    pageSize = DEFAULT_PAGE_SIZE,
    isSelf = false,
    isFollowing = false,
    viewerId = null,
  } = options;

  const [routes, setRoutes] = useState([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  // ✅ EMİR 5: erişim durumu
  const [accessStatus, setAccessStatus] = useState("idle"); // idle | loading | ready | login_required | forbidden | error
  const lockRef = useRef({ key: "", reason: "" }); // reason: login_required | forbidden

  const cursorRef = useRef(null);
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  // HYDRATE cache + job guard
  const hydrateCacheRef = useRef(new Map()); // routeId -> { status: "inflight"|"done" }
  const hydrateJobIdRef = useRef(0);

  // ✅ query mode: optimized(ownerId+status) vs legacy
  const queryModeRef = useRef("unknown"); // "unknown" | "optimized" | "legacy"

  // ✅ EMİR 1/3: DEV teşhis spam-guard
  const devDiagRef = useRef({ key: "", logged: false, phase: "" });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ✅ EMİR-6: event listener (mount/unmount) — UI hızlandırma (snapshot/refresh gerçek doğruluk)
  useEffect(() => {
    const unsub = onRouteCoverUpdated((payload) => {
      if (!payload?.routeId || !payload?.cover) return;
      setRoutes((prev) => applyRouteCoverPatchToList(prev, payload));
    });

    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, []);

  // owner değişince hydrate cache + query mode + lock sıfırla
  useEffect(() => {
    hydrateCacheRef.current = new Map();
    hydrateJobIdRef.current += 1;
    queryModeRef.current = "unknown";

    lockRef.current = { key: "", reason: "" };
    setAccessStatus("idle");
    setError(null);

    // ✅ EMİR 1/3: owner değişince teşhis log reset
    devDiagRef.current = { key: "", logged: false, phase: "" };
  }, [ownerId]);

  const runQueryPage = useCallback(
    async ({ ownerKey, localCursor, modeToUse }) => {
      const colRef = collection(db, "routes");

      const mkOptimized = () => {
        const constraints = [
          where("ownerId", "==", ownerKey),
          where("status", "==", "finished"),
          orderBy("createdAt", "desc"),
        ];
        if (localCursor) constraints.push(startAfter(localCursor));
        constraints.push(limit(pageSize + 1));
        return query(colRef, ...constraints);
      };

      const mkLegacy = () => {
        const constraints = [orderBy("createdAt", "desc")];
        if (localCursor) constraints.push(startAfter(localCursor));
        constraints.push(limit(pageSize + 1));
        return query(colRef, ...constraints);
      };

      if (modeToUse === "legacy") {
        const snap = await getDocs(mkLegacy());
        return { snap, used: "legacy" };
      }

      try {
        const snap = await getDocs(mkOptimized());
        return { snap, used: "optimized" };
      } catch (e) {
        // ✅ permission/unauthenticated ise gereksiz fallback deneme (spam ve ekstra istek yok)
        if (isPermissionDeniedError(e) || isUnauthenticatedError(e)) {
          throw e;
        }

        logFirestoreQueryError("[useUserRoutes] optimized query failed", e);

        try {
          const snap = await getDocs(mkLegacy());
          return { snap, used: "legacy" };
        } catch (e2) {
          logFirestoreQueryError("[useUserRoutes] legacy fallback failed", e2);
          throw e2;
        }
      }
    },
    [pageSize]
  );

  const loadPage = useCallback(
    async (mode = "reset") => {
      if (!ownerId || !db) {
        if (mode === "reset") {
          setRoutes([]);
          setHasMore(false);
          setError(null);
          setInitialLoading(false);
          setLoadingMore(false);
          setAccessStatus("idle");
        }
        return;
      }

      const ownerKey = String(ownerId);
      const lockKey = `${ownerKey}|${viewerId ? String(viewerId) : "anon"}`;

      // ✅ EMİR 1/3 — Teşhis: liste kaynağı + filtreleri DEV-only log (spam guard)
      if (__DEV__ && mode === "reset") {
        const diagKey = `${ownerKey}|${viewerId ? String(viewerId) : "anon"}|self:${
          isSelf ? "1" : "0"
        }|follow:${isFollowing ? "1" : "0"}|ps:${pageSize}`;

        if (devDiagRef.current.key !== diagKey) {
          devDiagRef.current.key = diagKey;
          devDiagRef.current.logged = false;
          devDiagRef.current.phase = "";
        }

        if (!devDiagRef.current.logged) {
          devDiagRef.current.logged = true;
          try {
            // eslint-disable-next-line no-console
            console.groupCollapsed("[RoutesDiag] useUserRoutes — source: collection('routes') query");
            // eslint-disable-next-line no-console
            console.log("ownerId:", safeShortId(ownerKey), "viewerId:", safeShortId(viewerId || "anon"), {
              isSelf,
              isFollowing,
              pageSize,
            });
            // eslint-disable-next-line no-console
            console.log("Query[optimized]: where(ownerId=='...') + where(status=='finished') + orderBy(createdAt desc) + limit(pageSize+1) + startAfter(cursor?)");
            // eslint-disable-next-line no-console
            console.log("Query[legacy fallback]: orderBy(createdAt desc) + limit(pageSize+1) + startAfter(cursor?)");
            // eslint-disable-next-line no-console
            console.log("Client-side filters:", {
              ownerIdMatch: "getOwnerIdFromRaw(raw, ownerKey) must equal ownerKey",
              deleted: "raw.deleted || raw.deletedAt || raw.isDeleted || raw.archivedAt -> filtered out",
              status: "if raw.status exists -> must be 'finished' (empty status passes client filter but NOT optimized query)",
              visibility: isSelf
                ? "self: no visibility gating"
                : "non-self: private filtered; followers filtered if !isFollowing; unknown filtered",
            });
            // eslint-disable-next-line no-console
            console.groupEnd();
          } catch {}
        }
      }

      // ✅ EMİR 5: login yoksa hiç sorgu başlatma → UI "giriş gerekli"
      if (!viewerId) {
        if (lockRef.current.key === lockKey && lockRef.current.reason === "login_required") return;

        lockRef.current = { key: lockKey, reason: "login_required" };
        setAccessStatus("login_required");
        setError(null);
        setRoutes([]);
        setHasMore(false);
        cursorRef.current = null;
        setInitialLoading(false);
        setLoadingMore(false);
        return;
      }

      // ✅ EMİR 5: aynı kullanıcı+profil için permission-denied kilidi varsa tekrar deneme (spam yok)
      if (lockRef.current.key === lockKey && lockRef.current.reason === "forbidden") {
        return;
      }

      const reqId = ++requestIdRef.current;

      if (mode === "reset") {
        setAccessStatus("loading");
        setInitialLoading(true);
        setLoadingMore(false);
        setError(null);
        cursorRef.current = null;
        setHasMore(false);
        setRoutes([]);

        hydrateCacheRef.current = new Map();
        hydrateJobIdRef.current += 1;

        queryModeRef.current = "unknown";
      } else {
        setLoadingMore(true);
      }

      const maxAutoPages = mode === "reset" ? 3 : 1;

      try {
        let localCursor = mode === "more" ? cursorRef.current : null;
        let collected = [];
        let localHasMore = false;
        let loops = 0;

        while (loops < maxAutoPages) {
          const currentMode =
            mode === "reset"
              ? queryModeRef.current === "unknown"
                ? "optimized"
                : queryModeRef.current
              : queryModeRef.current === "unknown"
              ? "legacy"
              : queryModeRef.current;

          const { snap, used } = await runQueryPage({
            ownerKey,
            localCursor,
            modeToUse: currentMode,
          });

          if (!isMountedRef.current || reqId !== requestIdRef.current) return;

          const docs = snap.docs || [];
          const pageDocs = docs.slice(0, pageSize);

          // ✅ EMİR 1/3 — DEV: hangi query kullanıldı + kaç doc döndü (tek sefer)
          if (__DEV__ && mode === "reset") {
            const phaseKey = `${devDiagRef.current.key}|used:${used}|loop:${loops}`;
            if (devDiagRef.current.phase !== phaseKey) {
              devDiagRef.current.phase = phaseKey;
              try {
                // eslint-disable-next-line no-console
                console.log("[RoutesDiag] query used:", used, {
                  totalDocs: docs.length,
                  pageDocs: pageDocs.length,
                  hasCursor: !!localCursor,
                  queryModeRef: queryModeRef.current,
                });
              } catch {}
            }
          }

          if (
            mode === "reset" &&
            queryModeRef.current === "unknown" &&
            used === "optimized" &&
            docs.length === 0
          ) {
            const legacyRes = await runQueryPage({
              ownerKey,
              localCursor: null,
              modeToUse: "legacy",
            });
            const legacyDocs = legacyRes.snap.docs || [];
            if (legacyDocs.length > 0) queryModeRef.current = "legacy";
          } else if (mode === "reset" && queryModeRef.current === "unknown") {
            queryModeRef.current = used;
          }

          const nextCursor = pageDocs.length ? pageDocs[pageDocs.length - 1] : null;
          localHasMore = docs.length > pageSize;

          const mapped = pageDocs
            .map((d) => {
              const raw = d.data() || {};

              const docOwnerId = getOwnerIdFromRaw(raw, ownerKey);
              const docOwnerKey = docOwnerId ? String(docOwnerId) : "";
              if (!docOwnerKey || docOwnerKey !== ownerKey) return null;

              const deleted =
                raw.deleted === true ||
                !!raw.deletedAt ||
                !!raw.isDeleted ||
                !!raw.archivedAt;
              if (deleted) return null;

              const status = (raw.status || "").toString().toLowerCase();
              if (status && status !== "finished") return null;

              const visibilityKey = getVisibilityKey(raw);

              if (!isSelf) {
                if (visibilityKey === "private") return null;
                if (!isFollowing && visibilityKey === "followers") return null;
                if (visibilityKey === "unknown") return null;
              }

              const model = buildRouteCardModel({
                id: d.id,
                raw,
                ownerIdFallback: docOwnerKey,
                viewerId,
              });

              const { stopsPreview, coverUrl, thumbnailUrl } = extractPreviewFromRouteDoc(raw);

              const modelCover = normalizeCoverUrl(model?.coverUrl);
              const modelPreview = normalizeCoverUrl(model?.previewUrl);
              const modelThumb = normalizeCoverUrl(model?.thumbnailUrl);
              const modelThumb2 = normalizeCoverUrl(model?.thumbUrl);
              const modelImage = normalizeCoverUrl(model?.imageUrl);
              const modelMedia = normalizeCoverUrl(model?.mediaUrl);

              const docCover = normalizeCoverUrl(coverUrl);
              const docThumb = normalizeCoverUrl(thumbnailUrl);

              const finalCoverRaw =
                modelCover || modelPreview || modelImage || modelMedia || docCover || "";
              const finalCover = finalCoverRaw && !isVideoUrl(finalCoverRaw) ? finalCoverRaw : "";

              const finalThumbRaw = modelThumb || modelThumb2 || docThumb || finalCover || "";
              const finalThumb = finalThumbRaw && !isVideoUrl(finalThumbRaw) ? finalThumbRaw : "";

              // ✅ CRITICAL: cover objesini modele taşı (model.cover yoksa raw.cover)
              const rawCoverObj = raw?.cover && typeof raw.cover === "object" ? raw.cover : null;
              const modelCoverObj = model?.cover && typeof model.cover === "object" ? model.cover : null;
              const baseCoverObj = modelCoverObj || rawCoverObj;

              let nextCoverObj = baseCoverObj;
              if (baseCoverObj && typeof baseCoverObj === "object") {
                const picked = pickCoverUrlFromCoverObj(baseCoverObj);
                const safeUrl = picked.url && !isVideoUrl(picked.url) ? picked.url : "";
                nextCoverObj = {
                  ...baseCoverObj,
                  url: safeUrl,
                  sourceField:
                    (isNonEmptyString(baseCoverObj.sourceField) && String(baseCoverObj.sourceField)) ||
                    picked.sourceField ||
                    "cover.url",
                };
              }

              const patched = {
                ...model,

                // ✅ canonical cover obj (UI pickCoverCandidate → route.cover.url)
                ...(nextCoverObj ? { cover: nextCoverObj } : {}),

                stopsPreview:
                  Array.isArray(model?.stopsPreview) && model.stopsPreview.length
                    ? model.stopsPreview
                    : stopsPreview,

                // legacy compat (doc/model varsa doldur)
                coverUrl: finalCover,
                thumbnailUrl: finalThumb,

                previewUrl: modelPreview || finalCover || "",
                thumbUrl: modelThumb2 || finalThumb || "",
                imageUrl: modelImage || finalCover || "",
                mediaUrl: modelMedia || finalCover || "",

                raw: model?.raw && typeof model.raw === "object" ? model.raw : raw,
              };

              return patched;
            })
            .filter(Boolean);

          collected = mode === "reset" ? collected.concat(mapped) : mapped;
          localCursor = nextCursor;

          if (mode === "reset") {
            if (collected.length > 0) break;
            if (!localHasMore || !localCursor) break;
            loops += 1;
            continue;
          }

          break;
        }

        if (!isMountedRef.current || reqId !== requestIdRef.current) return;

        // ✅ başarı → lock kaldır
        lockRef.current = { key: "", reason: "" };
        setAccessStatus("ready");
        setRoutes((prev) => (mode === "reset" ? collected : prev.concat(collected)));
        cursorRef.current = localCursor;
        setHasMore(!!(localHasMore && localCursor));
      } catch (err) {
        if (!isMountedRef.current || reqId !== requestIdRef.current) return;

        // ✅ EMİR 5: permission-denied / unauthenticated → UI lock, log spam yok
        if (isPermissionDeniedError(err)) {
          lockRef.current = { key: lockKey, reason: "forbidden" };
          setAccessStatus("forbidden");
          setError(null);
          setRoutes([]);
          setHasMore(false);
          cursorRef.current = null;

          warnPermOnce(
            `forbidden_${lockKey}`,
            "[useUserRoutes] permission-denied — UI locked (no spam).",
            __DEV__ ? err : null
          );
          return;
        }

        if (isUnauthenticatedError(err)) {
          lockRef.current = { key: lockKey, reason: "login_required" };
          setAccessStatus("login_required");
          setError(null);
          setRoutes([]);
          setHasMore(false);
          cursorRef.current = null;
          return;
        }

        // eslint-disable-next-line no-console
        console.warn("[useUserRoutes] load error", err);
        if (mode === "reset") setRoutes([]);
        setHasMore(false);
        setError(err || new Error("Rotalar yüklenirken bir hata oluştu."));
        setAccessStatus("error");
      } finally {
        if (!isMountedRef.current || reqId !== requestIdRef.current) return;
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [ownerId, pageSize, isSelf, isFollowing, viewerId, runQueryPage]
  );

  // ✅ Lazy HYDRATE: sadece start+end stop (2 query) + stopsPreview'u besle
  const hydrateOneRoutePreview = useCallback(async (routeId, jobId) => {
    if (!routeId || !db) return null;
    if (!isMountedRef.current) return null;
    if (hydrateJobIdRef.current !== jobId) return null;

    const rid = String(routeId);
    const cached = hydrateCacheRef.current.get(rid);
    if (cached?.status === "inflight" || cached?.status === "done") return null;

    hydrateCacheRef.current.set(rid, { status: "inflight" });

    const stopsCol = collection(db, "routes", rid, "stops");

    const fetchOne = async (field, dir) => {
      try {
        const snap = await getDocs(query(stopsCol, orderBy(field, dir), limit(1)));
        return snap.docs?.[0] || null;
      } catch {
        return null;
      }
    };

    try {
      let firstDoc = await fetchOne("order", "asc");
      let lastDoc = await fetchOne("order", "desc");

      if (!firstDoc || !lastDoc) {
        const f2 = await fetchOne("idx", "asc");
        const l2 = await fetchOne("idx", "desc");
        firstDoc = firstDoc || f2;
        lastDoc = lastDoc || l2;
      }

      if (!firstDoc && !lastDoc) {
        const snap = await getDocs(query(stopsCol, limit(2)));
        const docs = snap.docs || [];
        firstDoc = docs[0] || null;
        lastDoc = docs.length > 1 ? docs[docs.length - 1] : docs[0] || null;
      }

      if (!isMountedRef.current) return null;
      if (hydrateJobIdRef.current !== jobId) return null;

      const makeStop = (sd) => {
        if (!sd) return null;
        const s = { id: sd.id, ...(sd.data() || {}) };

        const title = normalizeStopTitle(s);
        const { lat, lng } = extractStopLatLng(s);
        const mediaUrl = extractStopMediaUrl(s);

        const out = { id: s.id };
        if (isNonEmptyString(title)) out.title = title;
        if (lat !== null) out.lat = lat;
        if (lng !== null) out.lng = lng;
        if (isNonEmptyString(mediaUrl)) out.mediaUrl = mediaUrl;
        if (s.order !== undefined) out.order = s.order;
        if (s.idx !== undefined && out.order === undefined) out.order = s.idx;

        return Object.keys(out).length > 1 ? out : null;
      };

      const firstStop = makeStop(firstDoc);
      const lastStop = makeStop(lastDoc);

      let stopsPreview = [];
      if (firstStop) stopsPreview.push(firstStop);
      if (lastStop && (!firstStop || String(lastStop.id) !== String(firstStop.id))) {
        stopsPreview.push(lastStop);
      }

      const result = {
        stopsPreview,
        coverUrl: "",
        thumbnailUrl: "",
      };

      hydrateCacheRef.current.set(rid, { status: "done" });
      return result;
    } catch {
      hydrateCacheRef.current.set(rid, { status: "done" });
      return null;
    }
  }, []);

  useEffect(() => {
    if (!ownerId) {
      setRoutes([]);
      setHasMore(false);
      setError(null);
      setInitialLoading(false);
      setLoadingMore(false);
      setAccessStatus("idle");
      return;
    }
    loadPage("reset");
  }, [ownerId, isSelf, isFollowing, viewerId, loadPage]);

  // ✅ Lazy hydrate runner (max 3 concurrent)
  useEffect(() => {
    if (!routes || routes.length === 0) return;
    const jobId = hydrateJobIdRef.current;

    const targets = routes.filter((r) => needsHydratePreview(r)).slice(0, 24);
    if (!targets.length) return;

    let cancelled = false;
    let idx = 0;
    let active = 0;
    const maxConc = 3;

    function canRun() {
      if (cancelled) return false;
      if (!isMountedRef.current) return false;
      if (hydrateJobIdRef.current !== jobId) return false;
      return true;
    }

    function applyPatchToRoute(rid, patch) {
      setRoutes((prev) => {
        const next = (prev || []).map((x) => {
          if (!x || String(x.id) !== rid) return x;

          const nextStopsPreview =
            Array.isArray(x.stopsPreview) && x.stopsPreview.length
              ? x.stopsPreview
              : Array.isArray(patch.stopsPreview)
              ? patch.stopsPreview
              : [];

          const changed =
            (!Array.isArray(x.stopsPreview) || x.stopsPreview.length === 0) &&
            nextStopsPreview.length > 0;

          if (!changed) return { ...x, __previewHydrated: true };

          return {
            ...x,
            stopsPreview: nextStopsPreview,
            __previewHydrated: true,
          };
        });
        return next;
      });
    }

    function pump() {
      if (!canRun()) return;

      while (active < maxConc && idx < targets.length) {
        const r = targets[idx++];
        const rid = r?.id ? String(r.id) : null;
        if (!rid) continue;

        const cached = hydrateCacheRef.current.get(rid);
        if (cached?.status === "inflight" || cached?.status === "done") continue;

        startTask(rid);
      }
    }

    function startTask(rid) {
      active += 1;

      hydrateOneRoutePreview(rid, jobId)
        .then((patch) => {
          if (!patch) return;
          if (!canRun()) return;
          applyPatchToRoute(rid, patch);
        })
        .catch(() => {
          // no-op
        })
        .finally(() => {
          active -= 1;
          if (canRun()) pump();
        });
    }

    pump();

    return () => {
      cancelled = true;
    };
  }, [routes, hydrateOneRoutePreview]);

  const loadMore = useCallback(() => {
    // ✅ kilit modunda loadMore yok
    if (accessStatus === "forbidden" || accessStatus === "login_required") return;
    if (loadingMore || !hasMore || initialLoading) return;
    loadPage("more");
  }, [hasMore, loadingMore, initialLoading, loadPage, accessStatus]);

  const isEmpty =
    accessStatus === "ready" && !initialLoading && routes.length === 0 && !hasMore;

  return {
    routes,
    loading: initialLoading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    isEmpty,

    // ✅ EMİR 5
    accessStatus,
  };
}