// FILE: src/pages/RouteDetailMobile/hooks/useRouteDetailData.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth, db } from "../../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged as onAuthStateChangedMod } from "firebase/auth";

import { watchRoute, watchStops } from "../../../services/routesRead";
import { watchCommentsCount } from "../../../commentsClient";

import {
  getOwnerHintFromUrl,
  getVisibilityKeyFromRoute,
  resolveOwnerIdForLockedRoute,
  normalizeStopsForPreview,
} from "../routeDetailUtils";

/**
 * GLOBAL OWNER CACHE (2. açılış hızlı gelsin)
 * - Hook unmount/remount olsa bile cache yaşar.
 * - TTL ile şişme engellenir.
 */
const OWNER_CACHE_TTL_MS = 10 * 60 * 1000; // 10dk
const OWNER_CACHE = new Map(); // ownerId -> { data, ts }
const OWNER_FETCH_BLOCK = new Map(); // ownerId -> { reason:"perm", at:ms }

export default function useRouteDetailData({
  routeId,
  initialRoute,
  followInitially,
  ownerFromLink,
}) {
  const [routeDoc, setRouteDoc] = useState(null);
  const [stops, setStops] = useState([]);
  const [stopsLoaded, setStopsLoaded] = useState(false);
  const [owner, setOwner] = useState(null);
  const [permError, setPermError] = useState(null);
  const [commentsCount, setCommentsCount] = useState(null);

  const [permCheckTick, setPermCheckTick] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);

  const [lockedOwnerId, setLockedOwnerId] = useState(null);
  const [lockedOwnerDoc, setLockedOwnerDoc] = useState(null);

  // ✅ permission check tamamlanmadan watcher başlatma
  const [permChecked, setPermChecked] = useState(false);

  // ✅ auth uid reactive
  const [authUid, setAuthUid] = useState(() => {
    try {
      return auth?.currentUser?.uid ? String(auth.currentUser.uid) : "";
    } catch {
      return "";
    }
  });

  const routeModel = routeDoc || initialRoute;

  const ownerHint = useMemo(() => {
    if (ownerFromLink) return String(ownerFromLink);
    const fromUrl = getOwnerHintFromUrl();
    if (fromUrl) return fromUrl;
    const fromInitial = initialRoute?.ownerId || initialRoute?.owner || null;
    return fromInitial ? String(fromInitial) : null;
  }, [ownerFromLink, initialRoute]);

  // ✅ in-flight kırıcı (aynı ownerId için aynı mount'ta paralel fetch başlatma)
  const ownerInFlightRef = useRef(new Map()); // ownerId -> true

  const now = () => {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  };

  const isPermDenied = useCallback((e) => {
    try {
      const code = String(e?.code || "").toLowerCase();
      const msg = String(e?.message || "").toLowerCase();
      const text = `${code} ${msg}`;
      return text.includes("permission") && text.includes("denied");
    } catch {
      return false;
    }
  }, []);

  const buildOwnerPreviewFromRoute = useCallback((d, ownerId) => {
    try {
      const m = d || {};
      const name =
        (m?.ownerName && String(m.ownerName).trim()) ||
        (m?.ownerUsername && String(m.ownerUsername).trim()) ||
        (m?.ownerDisplayName && String(m.ownerDisplayName).trim()) ||
        (m?.ownerHandle && String(m.ownerHandle).trim()) ||
        "";

      const photo =
        (m?.ownerAvatarUrl && String(m.ownerAvatarUrl).trim()) ||
        (m?.ownerAvatar && String(m.ownerAvatar).trim()) ||
        (m?.ownerPhotoURL && String(m.ownerPhotoURL).trim()) ||
        (m?.ownerPhotoUrl && String(m.ownerPhotoUrl).trim()) ||
        (m?.ownerPhoto && String(m.ownerPhoto).trim()) ||
        "";

      if (!name && !photo) return null;

      // lockedOwnerDoc shape’ini user doc’a benzetiyoruz
      const out = { id: ownerId };
      if (name) out.displayName = name;
      if (photo) out.photoURL = photo;
      return out;
    } catch {
      return null;
    }
  }, []);

  /**
   * ✅ Merge: "next" anlamlı alanlarla "prev" üstüne yazar.
   * - Böylece user doc (displayName) route preview'ü override edebilir.
   * - next boş/undefined ise prev korunur.
   */
  const mergeOwnerLike = useCallback((prev, next) => {
    if (!next) return prev || null;
    if (!prev) return next;

    try {
      const pid = prev?.id ? String(prev.id) : "";
      const nid = next?.id ? String(next.id) : "";
      if (pid && nid && pid !== nid) return next;

      const out = { ...prev };

      Object.entries(next || {}).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        if (typeof v === "string") {
          const t = String(v).trim();
          if (!t) return;
          out[k] = t;
          return;
        }
        out[k] = v;
      });

      if (!out.id) out.id = nid || pid || out.id;
      return out;
    } catch {
      return prev || next || null;
    }
  }, []);

  const getCachedOwner = useCallback((ownerId) => {
    try {
      const key = String(ownerId || "").trim();
      if (!key) return null;
      const hit = OWNER_CACHE.get(key) || null;
      if (!hit || !hit.data) return null;

      const age = now() - (Number(hit.ts) || 0);
      if (!Number.isFinite(age) || age < 0 || age > OWNER_CACHE_TTL_MS) {
        try {
          OWNER_CACHE.delete(key);
        } catch {}
        return null;
      }

      return hit.data || null;
    } catch {
      return null;
    }
  }, []);

  const setCacheOwner = useCallback((ownerId, data) => {
    try {
      const key = String(ownerId || "").trim();
      if (!key || !data) return;
      OWNER_CACHE.set(key, { data, ts: now() });
    } catch {}
  }, []);

  const blockOwnerFetchPerm = useCallback((ownerId) => {
    try {
      const key = String(ownerId || "").trim();
      if (!key) return;
      OWNER_FETCH_BLOCK.set(key, { reason: "perm", at: now() });
    } catch {}
  }, []);

  const isOwnerFetchBlocked = useCallback((ownerId) => {
    try {
      const key = String(ownerId || "").trim();
      if (!key) return false;
      const v = OWNER_FETCH_BLOCK.get(key);
      return !!(v && v.reason === "perm");
    } catch {
      return false;
    }
  }, []);

  // ✅ auth değişince permission değişebilir → perm-block reset (cache kalabilir)
  useEffect(() => {
    try {
      OWNER_FETCH_BLOCK.clear();
    } catch {}
  }, [authUid]);

  // ✅ auth değişimini dinle (modular + compat safe)
  useEffect(() => {
    let unsub = null;

    const setFromUser = (u) => {
      try {
        setAuthUid(u?.uid ? String(u.uid) : "");
      } catch {
        setAuthUid("");
      }
    };

    try {
      // compat
      if (auth && typeof auth.onAuthStateChanged === "function") {
        unsub = auth.onAuthStateChanged((u) => setFromUser(u));
      } else {
        // modular
        unsub = onAuthStateChangedMod(auth, (u) => setFromUser(u));
      }
    } catch {
      // no-op
    }

    // ilk değer
    try {
      setFromUser(auth?.currentUser || null);
    } catch {}

    return () => {
      if (typeof unsub === "function") {
        try {
          unsub();
        } catch {}
      }
    };
  }, []);

  // routeId değişince reset
  useEffect(() => {
    setRouteDoc(null);
    setStops([]);
    setStopsLoaded(false);
    setOwner(null);
    setPermError(null);
    setCommentsCount(null);
    setLockedOwnerId(null);
    setLockedOwnerDoc(null);
    setPermChecked(false);

    try {
      ownerInFlightRef.current = new Map();
    } catch {}
  }, [routeId]);

  // permission quick check
  useEffect(() => {
    if (!routeId) {
      setPermError("not-found");
      setPermChecked(true);
      return;
    }

    let alive = true;
    setPermChecked(false);

    (async () => {
      try {
        const s = await getDoc(doc(db, "routes", routeId));
        if (!alive) return;

        if (!s.exists()) setPermError("not-found");
        else setPermError(null);
      } catch (e) {
        const code = String(e?.code || e?.message || "");
        if (!alive) return;
        if (code.includes("permission") || code.includes("denied"))
          setPermError("forbidden");
        else setPermError(null);
      } finally {
        if (!alive) return;
        setPermChecked(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [routeId, permCheckTick]);

  // ✅ auth değişince forbidden/private için otomatik re-check
  useEffect(() => {
    if (!routeId) return;
    if (!(permError === "forbidden" || permError === "private")) return;

    setPermChecked(false);
    setPermCheckTick((x) => x + 1);
    setReloadTick((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUid]);

  // private check (routeModel geldikçe)
  useEffect(() => {
    if (!routeId) return;
    if (!routeModel) return;

    const vis = getVisibilityKeyFromRoute(routeModel);
    if (vis !== "private") {
      if (permError === "private") setPermError(null);
      return;
    }

    const uid = authUid ? String(authUid) : "";
    const oid = routeModel?.ownerId ? String(routeModel.ownerId) : "";
    const mine = uid && oid && uid === oid;

    if (!mine) setPermError("private");
    else if (permError === "private") setPermError(null);
  }, [routeId, routeModel, permError, authUid]);

  const retryPermCheck = useCallback(() => {
    setPermError(null);
    setPermChecked(false);
    setPermCheckTick((x) => x + 1);
    setReloadTick((x) => x + 1);
  }, []);

  // comments count watch
  useEffect(() => {
    if (!routeId) return;
    if (!permChecked) return;

    if (
      permError === "forbidden" ||
      permError === "private" ||
      permError === "not-found"
    )
      return;

    let unsubscribe;
    try {
      unsubscribe = watchCommentsCount(
        { targetType: "route", targetId: routeId },
        (cnt) => setCommentsCount(typeof cnt === "number" ? cnt : 0)
      );
    } catch {}
    return () => {
      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch {}
      }
    };
  }, [routeId, reloadTick, permError, permChecked]);

  /**
   * ✅ Owner fetch (soft timeout 1500ms)
   * - UI beklemez (route preview / fallback zaten gösterilir).
   * - getDoc geç gelse bile success olursa override eder.
   * - permission-denied olursa block + cache fallback.
   */
  const startOwnerFetch = useCallback(
    (ownerId, { setAsLockedOnly = false } = {}) => {
      try {
        const key = String(ownerId || "").trim();
        if (!key) return;

        if (isOwnerFetchBlocked(key)) {
          const cached = getCachedOwner(key);
          if (cached) {
            setLockedOwnerDoc((prev) => mergeOwnerLike(prev, cached));
            if (!setAsLockedOnly) setOwner((prev) => mergeOwnerLike(prev, cached));
          }
          return;
        }

        // in-flight kırıcı
        if (ownerInFlightRef.current.get(key)) return;
        ownerInFlightRef.current.set(key, true);

        let timedOut = false;
        const t = setTimeout(() => {
          timedOut = true;
          // UI zaten fallback gösteriyor. Burada ekstra state basmıyoruz.
        }, 1500);

        getDoc(doc(db, "users", key))
          .then((u) => {
            clearTimeout(t);
            if (!u || !u.exists()) {
              const cached = getCachedOwner(key);
              if (cached) {
                setLockedOwnerDoc((prev) => mergeOwnerLike(prev, cached));
                if (!setAsLockedOnly) setOwner((prev) => mergeOwnerLike(prev, cached));
              }
              return;
            }

            const data = { id: u.id, ...u.data() };
            setCacheOwner(key, data);

            // ✅ override: user doc geldi → displayName/username/photoURL vs güncellensin
            setLockedOwnerDoc((prev) => mergeOwnerLike(prev, data));
            if (!setAsLockedOnly) setOwner((prev) => mergeOwnerLike(prev, data));

            // timedOut olsa bile success override etmek serbest (mümkünse gerçek profil)
            void timedOut;
          })
          .catch((e) => {
            clearTimeout(t);

            if (isPermDenied(e)) {
              blockOwnerFetchPerm(key);
            }

            const cached = getCachedOwner(key);
            if (cached) {
              setLockedOwnerDoc((prev) => mergeOwnerLike(prev, cached));
              if (!setAsLockedOnly) setOwner((prev) => mergeOwnerLike(prev, cached));
            } else {
              // owner state'i null'a çekmek zorunda değiliz; hero fallback ownerId ile isim basacak
              if (!setAsLockedOnly) {
                setOwner((prev) => {
                  const pid = prev?.id ? String(prev.id) : "";
                  return pid === key ? prev : null;
                });
              }
            }
          })
          .finally(() => {
            try {
              ownerInFlightRef.current.delete(key);
            } catch {}
          });
      } catch {}
    },
    [
      isOwnerFetchBlocked,
      getCachedOwner,
      mergeOwnerLike,
      setCacheOwner,
      isPermDenied,
      blockOwnerFetchPerm,
    ]
  );

  // route/stops watch
  useEffect(() => {
    if (!routeId) return;
    if (!permChecked) return;

    if (
      permError === "forbidden" ||
      permError === "private" ||
      permError === "not-found"
    )
      return;

    let alive = true;
    let lastOwnerId = "";

    let offRoute = () => {};
    let offStops = () => {};

    try {
      offRoute = watchRoute(routeId, (d) => {
        if (!alive) return;

        setRouteDoc(d);

        const ownerId = d?.ownerId ? String(d.ownerId) : "";
        if (!ownerId) {
          lastOwnerId = "";
          setOwner(null);
          return;
        }

        lastOwnerId = ownerId;

        // ✅ 1) Route içinden owner preview üret (anon olsa bile)
        try {
          const preview = buildOwnerPreviewFromRoute(d, ownerId);
          if (preview) {
            setLockedOwnerDoc((prev) => mergeOwnerLike(prev, preview));
          }
        } catch {}

        // ✅ 2) perm-block ise tekrar deneme yok; cache varsa kullan
        if (isOwnerFetchBlocked(ownerId)) {
          const cached = getCachedOwner(ownerId);
          if (cached) {
            setOwner((prev) => {
              const pid = prev?.id ? String(prev.id) : "";
              if (pid === ownerId) return prev;
              return cached;
            });
            setLockedOwnerDoc((prev) => mergeOwnerLike(prev, cached));
          }
          return;
        }

        // ✅ 3) user doc fetch (soft-timeout 1500ms)
        // - UI beklemez, success gelirse override eder.
        try {
          startOwnerFetch(ownerId, { setAsLockedOnly: false });
        } catch {}

        // lastOwnerId koruması: ownerId değişirse eski fetch gelirse de mergeOwnerLike id check'iyle güvenli.
        void lastOwnerId;
      });
    } catch {}

    try {
      offStops = watchStops(routeId, (arr) => {
        if (!alive) return;

        const sorted = (arr || [])
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0));

        // ✅ stops canonical (lat/lng root garantisi)
        const norm = normalizeStopsForPreview(sorted);
        setStops(norm?.stops || sorted);
        setStopsLoaded(true);
      });
    } catch {}

    return () => {
      alive = false;
      try {
        offRoute();
      } catch {}
      try {
        offStops();
      } catch {}
    };
  }, [
    routeId,
    reloadTick,
    permError,
    permChecked,
    buildOwnerPreviewFromRoute,
    mergeOwnerLike,
    isOwnerFetchBlocked,
    getCachedOwner,
    startOwnerFetch,
  ]);

  // locked owner resolve (for forbidden/private/not-found)
  useEffect(() => {
    if (!routeId) return;
    if (
      !(
        permError === "forbidden" ||
        permError === "private" ||
        permError === "not-found"
      )
    )
      return;

    let alive = true;
    (async () => {
      const direct =
        ownerHint ||
        routeModel?.ownerId ||
        routeModel?.owner ||
        owner?.id ||
        null;
      const baseOwnerId = direct ? String(direct) : null;

      const fetchOwnerDocLocked = async (uid) => {
        const key = String(uid || "").trim();
        if (!key) return;

        // ✅ perm-block varsa doc fetch deneme, cached varsa kullan
        if (isOwnerFetchBlocked(key)) {
          const cached = getCachedOwner(key);
          if (cached) {
            setLockedOwnerDoc((prev) => mergeOwnerLike(prev, cached));
          } else {
            setLockedOwnerDoc((prev) => prev || null);
          }
          return;
        }

        // ✅ soft-timeout fetch (locked-only)
        startOwnerFetch(key, { setAsLockedOnly: true });
      };

      if (baseOwnerId) {
        if (!alive) return;
        setLockedOwnerId(baseOwnerId);
        await fetchOwnerDocLocked(baseOwnerId);
        return;
      }

      const oid = await resolveOwnerIdForLockedRoute(routeId);
      if (!alive) return;

      if (oid) {
        setLockedOwnerId(oid);
        await fetchOwnerDocLocked(oid);
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

  const ownerIdForProfile = useMemo(() => {
    const fromRoute =
      routeDoc?.ownerId || initialRoute?.ownerId || initialRoute?.owner || null;
    return (
      (fromRoute ? String(fromRoute) : null) ||
      (owner?.id ? String(owner.id) : null) ||
      (lockedOwnerId ? String(lockedOwnerId) : null) ||
      (ownerHint ? String(ownerHint) : null) ||
      null
    );
  }, [routeDoc?.ownerId, initialRoute, owner?.id, lockedOwnerId, ownerHint]);

  return {
    routeDoc,
    stops,
    stopsLoaded,
    owner,
    permError,
    commentsCount,
    ownerIdForProfile,
    lockedOwnerDoc,
    retryPermCheck,
    authUid, // ✅ reaktif auth
  };
}
