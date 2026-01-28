// FILE: src/pages/RouteDetailMobile/hooks/useRouteDetailData.js
import { useCallback, useEffect, useMemo, useState } from "react";
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
      // fallback: no-op
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
      offRoute = watchRoute(routeId, async (d) => {
        if (!alive) return;

        setRouteDoc(d);

        const ownerId = d?.ownerId ? String(d.ownerId) : "";
        if (!ownerId) {
          lastOwnerId = "";
          setOwner(null);
          return;
        }

        lastOwnerId = ownerId;
        try {
          const u = await getDoc(doc(db, "users", ownerId));
          if (!alive) return;
          if (lastOwnerId !== ownerId) return;

          if (u.exists()) setOwner({ id: u.id, ...u.data() });
          else setOwner(null);
        } catch {
          if (!alive) return;
          if (lastOwnerId !== ownerId) return;
          setOwner(null);
        }
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
  }, [routeId, reloadTick, permError, permChecked]);

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

      const fetchOwnerDoc = async (uid) => {
        try {
          const u = await getDoc(doc(db, "users", uid));
          if (!alive) return;
          if (u.exists()) setLockedOwnerDoc({ id: u.id, ...u.data() });
          else setLockedOwnerDoc(null);
        } catch {
          if (!alive) return;
          setLockedOwnerDoc(null);
        }
      };

      if (baseOwnerId) {
        if (!alive) return;
        setLockedOwnerId(baseOwnerId);
        await fetchOwnerDoc(baseOwnerId);
        return;
      }

      const oid = await resolveOwnerIdForLockedRoute(routeId);
      if (!alive) return;

      if (oid) {
        setLockedOwnerId(oid);
        await fetchOwnerDoc(oid);
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
    authUid, // ✅ eklendi: RouteDetailMobile üstünden reaktif auth için
  };
}
