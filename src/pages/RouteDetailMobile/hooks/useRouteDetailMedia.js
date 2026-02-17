// FILE: src/pages/RouteDetailMobile/hooks/useRouteDetailMedia.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../../../firebase";

import { listStopMediaInline, uploadStopMediaInline } from "../routeDetailMedia";

export default function useRouteDetailMedia({ routeId, routeDoc, stops, tab }) {
  const mediaCacheRef = useRef(new Map());
  const [mediaTick, setMediaTick] = useState(0);

  // ✅ debug warn (dev only, once per key)
  const warnOnceRef = useRef(new Set());
  const devWarnOnce = useCallback((key, payload) => {
    try {
      if (process.env.NODE_ENV === "production") return;
      const k = String(key || "").trim();
      if (!k) return;
      if (warnOnceRef.current.has(k)) return;
      warnOnceRef.current.add(k);
      // eslint-disable-next-line no-console
      console.warn(`[RouteDetailMedia] ${k}`, payload || {});
    } catch {}
  }, []);

  const isPermDeniedLike = useCallback((e) => {
    try {
      const code = String(e?.code || "").toLowerCase();
      const msg = String(e?.message || e || "").toLowerCase();
      const text = `${code} ${msg}`;
      return text.includes("permission") && text.includes("denied");
    } catch {
      return false;
    }
  }, []);

  const mediaTickRafRef = useRef(0);
  const bumpMediaTick = useCallback(() => {
    if (mediaTickRafRef.current) return;
    mediaTickRafRef.current = requestAnimationFrame(() => {
      mediaTickRafRef.current = 0;
      setMediaTick((x) => x + 1);
    });
  }, []);

  const [galleryState, setGalleryState] = useState({
    loading: false,
    done: false,
    errorCount: 0,
  });
  const galleryInFlightRef = useRef(false);
  const galleryJobIdRef = useRef(0);
  const galleryCursorRef = useRef(0);
  const gallerySentinelRef = useRef(null);
  const routeBodyRef = useRef(null);

  const [uploadState, setUploadState] = useState({});

  const [galleryTabActive, setGalleryTabActive] = useState(false);

  // routeId değişince reset
  useEffect(() => {
    mediaCacheRef.current = new Map();
    bumpMediaTick();

    setGalleryState({ loading: false, done: false, errorCount: 0 });
    galleryJobIdRef.current += 1;
    galleryCursorRef.current = 0;
    galleryInFlightRef.current = false;

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

    try {
      if (mediaTickRafRef.current) cancelAnimationFrame(mediaTickRafRef.current);
    } catch {}
    mediaTickRafRef.current = 0;
  }, [routeId, bumpMediaTick]);

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
        if (isPermDeniedLike(e) || isPermDeniedLike(error)) {
          devWarnOnce(`thumbs:permission-denied:${routeId}:${stopId}`, {
            routeId,
            stopId,
            error: e?.message || String(e),
            code: e?.code,
          });
        } else {
          devWarnOnce(`thumbs:error:${routeId}:${stopId}`, {
            routeId,
            stopId,
            error: e?.message || String(e),
            code: e?.code,
          });
        }
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
        setGalleryState((s) => ({
          ...s,
          errorCount: (Number(s?.errorCount) || 0) + 1,
        }));
      }

      bumpMediaTick();
    },
    [routeId, bumpMediaTick, devWarnOnce, isPermDeniedLike]
  );

  // preload first 6 thumbs
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
    void mediaTick;
    const arr = [];
    try {
      for (const [sid, val] of mediaCacheRef.current.entries()) {
        const items = val?.items || [];
        items.forEach((it) => arr.push({ ...it, stopId: sid }));
      }
    } catch {}
    return arr.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [mediaTick]);

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

            if (isPermDeniedLike(e) || isPermDeniedLike(error)) {
              devWarnOnce(`gallery:permission-denied:${routeId}:${stopId}`, {
                routeId,
                stopId,
                error: e?.message || String(e),
                code: e?.code,
              });
            } else {
              devWarnOnce(`gallery:error:${routeId}:${stopId}`, {
                routeId,
                stopId,
                error: e?.message || String(e),
                code: e?.code,
              });
            }
          }

          const before = mediaCacheRef.current.get(stopId) || {};
          const nextItems = Array.isArray(items) && items.length ? items : before.items || [];

          mediaCacheRef.current.set(stopId, {
            ...before,
            items: nextItems,
            __loadedGalleryAttempted: true,
            __loadedThumbs: true,
            ...(error ? { __error: error } : { __error: null }),
          });

          if (error && !before.__error) newErrors += 1;
        })
      );

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
      devWarnOnce(`gallery:batch-throw:${routeId}`, {
        routeId,
        code: e?.code,
        message: e?.message,
      });
      if (galleryJobIdRef.current === jobId) {
        setGalleryState((s) => ({
          ...s,
          loading: false,
          errorCount: (Number(s?.errorCount) || 0) + 1,
        }));
      }
    } finally {
      galleryInFlightRef.current = false;
    }
  }, [routeId, stops, bumpMediaTick, devWarnOnce, isPermDeniedLike]);

  // Gallery IO
  useEffect(() => {
    if (!galleryTabActive) return;

    loadNextGalleryBatch();

    const rootEl = routeBodyRef.current;
    const sentinel = gallerySentinelRef.current;
    if (!rootEl || !sentinel || typeof IntersectionObserver === "undefined") {
      devWarnOnce(`gallery:io-missing-refs:${routeId}`, {
        routeId,
        hasRoot: !!rootEl,
        hasSentinel: !!sentinel,
      });
      return;
    }

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
  }, [galleryTabActive, loadNextGalleryBatch, galleryState?.done, routeId, devWarnOnce]);

  // Upload
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
              onProgress: (p) =>
                setUploadState((s) => ({
                  ...s,
                  [stopId]: { ...(s[stopId] || {}), p },
                })),
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
            devWarnOnce(`upload:error:${routeId}:${stopId}`, {
              routeId,
              stopId,
              code: e?.code,
              message: e?.message,
            });
            if (process.env.NODE_ENV !== "production") {
              // eslint-disable-next-line no-console
              console.warn("upload hata:", e?.message || e);
            }
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
    [routeId, routeDoc, bumpMediaTick, devWarnOnce]
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

  useEffect(() => {
    // tab paramı dışarıda; hook içinde sadece active flag kullanıyoruz
    if (tab !== "gallery" && galleryTabActive) setGalleryTabActive(false);
  }, [tab, galleryTabActive]);

  return {
    mediaCacheRef,
    galleryItems,
    galleryState,
    gallerySentinelRef,
    routeBodyRef,
    ensureStopThumbs,
    uploadState,
    onPickMedia,
    cancelUpload,
    bumpMediaTick,
    setGalleryTabActive,
  };
}
