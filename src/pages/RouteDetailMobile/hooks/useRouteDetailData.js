// src/pages/RouteDetailMobile/hooks/useRouteDetailData.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth, db } from "../../../firebase";
import { doc, getDoc } from "firebase/firestore";

import { watchRoute, watchStops } from "../../../services/routesRead";
import { watchCommentsCount } from "../../../commentsClient";

import {
  getOwnerHintFromUrl,
  getVisibilityKeyFromRoute,
  resolveOwnerIdForLockedRoute,
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

  const routeModel = routeDoc || initialRoute;

  const ownerHint = useMemo(() => {
    if (ownerFromLink) return String(ownerFromLink);
    const fromUrl = getOwnerHintFromUrl();
    if (fromUrl) return fromUrl;
    const fromInitial = initialRoute?.ownerId || initialRoute?.owner || null;
    return fromInitial ? String(fromInitial) : null;
  }, [ownerFromLink, initialRoute]);

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
  }, [routeId]);

  // permission quick check
  useEffect(() => {
    if (!routeId) {
      setPermError("not-found");
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
        if (code.includes("permission") || code.includes("denied"))
          setPermError("forbidden");
        else setPermError(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [routeId, permCheckTick]);

  // private check (routeModel geldikçe)
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

  const retryPermCheck = useCallback(() => {
    setPermError(null);
    setPermCheckTick((x) => x + 1);
    setReloadTick((x) => x + 1);
  }, []);

  // comments count watch
  useEffect(() => {
    if (!routeId) return;
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
  }, [routeId, reloadTick, permError]);

  // route/stops watch
  useEffect(() => {
    if (!routeId) return;
    if (
      permError === "forbidden" ||
      permError === "private" ||
      permError === "not-found"
    )
      return;

    let offRoute = () => {};
    let offStops = () => {};

    try {
      offRoute = watchRoute(routeId, async (d) => {
        setRouteDoc(d);
        if (d?.ownerId) {
          try {
            const u = await getDoc(doc(db, "users", d.ownerId));
            if (u.exists()) setOwner({ id: u.id, ...u.data() });
          } catch {}
        }
      });
    } catch {}

    try {
      offStops = watchStops(routeId, (arr) => {
        const sorted = (arr || [])
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        setStops(sorted);
        setStopsLoaded(true);
      });
    } catch {}

    return () => {
      try {
        offRoute();
      } catch {}
      try {
        offStops();
      } catch {}
    };
  }, [routeId, reloadTick, permError]);

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
  };
}
