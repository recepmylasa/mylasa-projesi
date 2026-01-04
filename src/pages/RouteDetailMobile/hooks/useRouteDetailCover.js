// src/pages/RouteDetailMobile/hooks/useRouteDetailCover.js
import { useCallback, useEffect, useRef, useState } from "react";
import { auth, db } from "../../../firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

import { normalizeRouteCover } from "../routeDetailUtils";
import { listStopMediaInline, uploadRouteCoverInline } from "../routeDetailMedia";

export default function useRouteDetailCover({
  routeId,
  routeDoc,
  stops,
  stopsLoaded,
  normalizeMediaType,
  mediaCacheRef,
  bumpMediaTick,
}) {
  // ✅ Kapak (local optimistic)
  const [coverLocal, setCoverLocal] = useState(null); // {kind,url,stopId,mediaId}
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [coverPickerMode, setCoverPickerMode] = useState("menu"); // "menu" | "stops"
  const [coverPickerState, setCoverPickerState] = useState({
    loading: false,
    items: [],
    error: null,
  });
  const coverPickerJobRef = useRef(0);

  // ✅ Kapak upload state (cihazdan yükle)
  const [coverUpload, setCoverUpload] = useState(null); // {uploading,p,error,abort?}

  const autoCoverInFlightRef = useRef(false);
  const autoCoverPendingRef = useRef(false);

  // routeId değişince reset
  useEffect(() => {
    setCoverLocal(null);
    setCoverPickerOpen(false);
    setCoverPickerMode("menu");
    setCoverPickerState({ loading: false, items: [], error: null });
    coverPickerJobRef.current += 1;

    try {
      coverUpload?.abort?.abort?.();
    } catch {}
    setCoverUpload(null);

    autoCoverInFlightRef.current = false;
    autoCoverPendingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const toMillisSafe = useCallback((v) => {
    try {
      if (!v) return null;
      if (typeof v?.toDate === "function") return v.toDate().getTime();
      if (typeof v?.seconds === "number") return v.seconds * 1000;
      if (typeof v === "number") return v;
      if (v instanceof Date) return v.getTime();
      const d = new Date(v);
      // eslint-disable-next-line no-restricted-globals
      if (isNaN(d.getTime())) return null;
      return d.getTime();
    } catch {
      return null;
    }
  }, []);

  const isOwner = !!(auth.currentUser && routeDoc && auth.currentUser.uid === routeDoc.ownerId);

  const setRouteCover = useCallback(
    async (coverObj) => {
      if (!routeId) return;

      const url = coverObj?.url ? String(coverObj.url) : "";
      const patch = {
        cover: {
          ...coverObj,
          updatedAt: serverTimestamp(),
        },
        ...(url
          ? { coverUrl: url, thumbnailUrl: url, hasMedia: true }
          : { coverUrl: "", thumbnailUrl: "" }),
      };

      await updateDoc(doc(db, "routes", routeId), patch);
    },
    [routeId]
  );

  const getStopMediaForCover = useCallback(
    async (stopId) => {
      if (!routeId || !stopId) return [];
      const prev = mediaCacheRef.current.get(stopId) || {};
      const existingItems = Array.isArray(prev.items) ? prev.items : [];

      if (prev.__loadedCoverPicker) return existingItems;

      if (prev.__loadedGalleryAttempted) {
        mediaCacheRef.current.set(stopId, { ...prev, __loadedCoverPicker: true });
        return existingItems;
      }

      try {
        const res = await listStopMediaInline({ routeId, stopId, limit: 200 });
        const items = res?.items || [];
        mediaCacheRef.current.set(stopId, {
          ...prev,
          items: items.length ? items : existingItems,
          __loadedCoverPicker: true,
          __loadedThumbs: true,
          ...(res?.error ? { __error: res.error } : { __error: null }),
        });
        bumpMediaTick();
        return items.length ? items : existingItems;
      } catch (e) {
        const code = String(e?.code || e?.message || e || "unknown");
        mediaCacheRef.current.set(stopId, {
          ...prev,
          __loadedCoverPicker: true,
          __loadedThumbs: true,
          __error: code,
        });
        bumpMediaTick();
        return existingItems;
      }
    },
    [routeId, mediaCacheRef, bumpMediaTick]
  );

  const computeAutoCoverCandidate = useCallback(async () => {
    const ordered = (stops || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const s of ordered) {
      const sid = s?.id;
      if (!sid) continue;

      const items = await getStopMediaForCover(sid);
      const images = (items || []).filter((m) => normalizeMediaType(m) === "image" && m?.url);
      if (!images.length) continue;

      const sorted = images.slice().sort((a, b) => {
        const am = toMillisSafe(a?.createdAt);
        const bm = toMillisSafe(b?.createdAt);
        if (am == null && bm == null) return 0;
        if (am == null) return 1;
        if (bm == null) return -1;
        return am - bm;
      });

      const pick = sorted[0];
      return { stopId: sid, mediaId: pick?.id || null, url: String(pick.url) };
    }
    return null;
  }, [stops, getStopMediaForCover, normalizeMediaType, toMillisSafe]);

  const requestAutoCoverSync = useCallback(() => {
    if (!auth.currentUser || !routeDoc) return;
    if (auth.currentUser.uid !== routeDoc.ownerId) return;

    const kindNow = coverLocal?.kind || routeDoc?.cover?.kind || null;
    if (kindNow === "picked") return; // ✅ picked override edilmez

    autoCoverPendingRef.current = true;
    if (autoCoverInFlightRef.current) return;

    (async () => {
      autoCoverInFlightRef.current = true;
      try {
        while (autoCoverPendingRef.current) {
          autoCoverPendingRef.current = false;

          const candidate = await computeAutoCoverCandidate();
          if (!candidate?.url) continue;

          const cur = normalizeRouteCover(routeDoc || {});
          const curUrl = coverLocal?.url || cur?.url || "";
          const curMediaId = coverLocal?.mediaId || routeDoc?.cover?.mediaId || null;

          if (
            String(curUrl || "") === String(candidate.url || "") &&
            String(curMediaId || "") === String(candidate.mediaId || "")
          ) {
            continue;
          }

          await setRouteCover({
            kind: "auto",
            url: candidate.url,
            ...(candidate.stopId ? { stopId: candidate.stopId } : {}),
            ...(candidate.mediaId ? { mediaId: candidate.mediaId } : {}),
          });

          setCoverLocal({
            kind: "auto",
            url: candidate.url,
            ...(candidate.stopId ? { stopId: candidate.stopId } : {}),
            ...(candidate.mediaId ? { mediaId: candidate.mediaId } : {}),
          });
        }
      } catch {
        // sessiz
      } finally {
        autoCoverInFlightRef.current = false;
      }
    })();
  }, [routeDoc, coverLocal, computeAutoCoverCandidate, setRouteCover]);

  useEffect(() => {
    if (!routeDoc) return;
    if (!auth.currentUser) return;
    if (auth.currentUser.uid !== routeDoc.ownerId) return;
    if (!stopsLoaded) return;

    const kindNow = coverLocal?.kind || routeDoc?.cover?.kind || null;
    if (kindNow === "picked") return;

    requestAutoCoverSync();
  }, [routeDoc, stopsLoaded, requestAutoCoverSync, coverLocal?.kind]);

  const openCoverPicker = useCallback(() => {
    if (!isOwner) return;
    setCoverPickerOpen(true);
    coverPickerJobRef.current += 1;
    setCoverPickerMode("menu");
    setCoverPickerState({ loading: false, items: [], error: null });
  }, [isOwner]);

  const backToCoverPickerMenu = useCallback(() => {
    coverPickerJobRef.current += 1;
    setCoverPickerMode("menu");
    setCoverPickerState({ loading: false, items: [], error: null });
  }, []);

  const chooseCoverFromStops = useCallback(async () => {
    if (!isOwner) return;

    setCoverPickerMode("stops");
    const jobId = (coverPickerJobRef.current += 1);
    setCoverPickerState({ loading: true, items: [], error: null });

    try {
      const ordered = (stops || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      const all = [];

      for (const s of ordered) {
        if (coverPickerJobRef.current !== jobId) return;
        const sid = s?.id;
        if (!sid) continue;

        const items = await getStopMediaForCover(sid);
        const images = (items || [])
          .filter((m) => normalizeMediaType(m) === "image" && m?.url)
          .map((m) => ({ ...m, stopId: sid, mediaId: m?.id || null }));

        images.sort((a, b) => {
          const am = toMillisSafe(a?.createdAt);
          const bm = toMillisSafe(b?.createdAt);
          if (am == null && bm == null) return 0;
          if (am == null) return 1;
          if (bm == null) return -1;
          return am - bm;
        });

        all.push(...images);
      }

      if (coverPickerJobRef.current !== jobId) return;
      setCoverPickerState({ loading: false, items: all, error: null });
    } catch (e) {
      if (coverPickerJobRef.current !== jobId) return;
      setCoverPickerState({
        loading: false,
        items: [],
        error: String(e?.message || e || "unknown"),
      });
    }
  }, [isOwner, stops, getStopMediaForCover, normalizeMediaType, toMillisSafe]);

  const closeCoverPicker = useCallback(() => {
    coverPickerJobRef.current += 1;
    setCoverPickerOpen(false);
    setCoverPickerMode("menu");
  }, []);

  const pickCover = useCallback(
    async (it) => {
      if (!isOwner) return;

      const url = it?.url ? String(it.url) : "";
      if (!url) return;

      const nextLocal = {
        kind: "picked",
        url,
        ...(it.stopId ? { stopId: String(it.stopId) } : {}),
        ...(it.mediaId ? { mediaId: String(it.mediaId) } : {}),
      };

      const prevLocal = coverLocal;

      setCoverLocal(nextLocal);
      closeCoverPicker();

      try {
        await setRouteCover(nextLocal);
      } catch {
        setCoverLocal(prevLocal || null);
      }
    },
    [isOwner, coverLocal, closeCoverPicker, setRouteCover]
  );

  const uploadCoverFromDevice = useCallback(() => {
    if (!isOwner) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = false;

    input.onchange = async () => {
      const f = (input.files || [])[0];
      if (!f) return;

      const prevLocal = coverLocal;
      let objectUrl = "";
      try {
        objectUrl = URL.createObjectURL(f);
      } catch {}

      if (objectUrl) setCoverLocal({ kind: "picked", url: objectUrl });
      else setCoverLocal({ kind: "picked", url: prevLocal?.url || "" });

      closeCoverPicker();

      const ac = new AbortController();
      setCoverUpload({ uploading: true, p: 0, error: null, abort: ac });

      try {
        const res = await uploadRouteCoverInline({
          routeId,
          file: f,
          onProgress: (p) => setCoverUpload((s) => (s ? { ...s, p: Number(p) || 0 } : s)),
          signal: ac.signal,
        });

        const url = res?.url ? String(res.url) : "";
        if (!/^https?:\/\//i.test(url)) throw new Error("cover_url_not_https");

        await setRouteCover({ kind: "picked", url });
        setCoverLocal({ kind: "picked", url });

        setCoverUpload(null);
      } catch (e) {
        const code = String(e?.code || e?.message || e || "unknown");
        setCoverLocal(prevLocal || null);
        setCoverUpload((s) =>
          s ? { ...s, uploading: false, error: code } : { uploading: false, p: 0, error: code }
        );
      } finally {
        try {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        } catch {}
      }
    };

    input.click();
  }, [isOwner, coverLocal, closeCoverPicker, routeId, setRouteCover]);

  const clearCover = useCallback(async () => {
    if (!isOwner) return;

    const prevLocal = coverLocal;
    setCoverLocal({ kind: "auto", url: "" });

    try {
      await setRouteCover({ kind: "auto", url: "" });
      requestAutoCoverSync();
    } catch {
      setCoverLocal(prevLocal || null);
    }
  }, [isOwner, coverLocal, setRouteCover, requestAutoCoverSync]);

  return {
    coverLocal,
    setCoverLocal,

    coverPickerOpen,
    coverPickerMode,
    coverPickerState,
    coverUpload,

    openCoverPicker,
    closeCoverPicker,
    backToCoverPickerMenu,
    chooseCoverFromStops,
    pickCover,
    uploadCoverFromDevice,
    clearCover,

    requestAutoCoverSync,
    isOwner,
  };
}
