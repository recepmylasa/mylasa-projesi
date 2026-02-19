// FILE: src/pages/RouteDetailMobile/hooks/useRDMapResizeAuthority.js
import { useEffect, useRef } from "react";

function getEl(refLike) {
  try {
    if (!refLike) return null;
    if (typeof refLike === "function") return null;
    if (typeof refLike === "object" && "current" in refLike) return refLike.current || null;
    return null;
  } catch {
    return null;
  }
}

function getMap(mapRefLike) {
  try {
    if (!mapRefLike) return null;

    // mapRefLike olabilir: map instance, ref.current=map, ref.current(ref)=map...
    const a = typeof mapRefLike === "object" && "current" in mapRefLike ? mapRefLike.current : mapRefLike;
    const b = a && typeof a === "object" && "current" in a ? a.current : a;

    if (b && typeof b.fitBounds === "function" && typeof b.setCenter === "function") return b;
    return null;
  } catch {
    return null;
  }
}

function nowMs() {
  return Date.now();
}

function safeRect(el) {
  try {
    return el?.getBoundingClientRect?.() || null;
  } catch {
    return null;
  }
}

function sigFromRect(rect) {
  if (!rect) return "";
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const dpr = Math.round(((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1) * 100);
  return `${w}x${h}@${dpr}`;
}

function shouldAllowSameSig(reason) {
  return (
    reason === "io" ||
    reason === "vv" ||
    reason === "scroll" ||
    reason === "transition" ||
    reason === "animation" ||
    reason === "mutation" ||
    reason === "mount" ||
    reason === "bounds"
  );
}

function findScrollRoot(el) {
  if (!el) return null;
  try {
    return (
      el.closest?.(".route-detail-body") ||
      el.closest?.("[data-rd-scroll-root='1']") ||
      el.closest?.("[data-rd-scroll-root='true']") ||
      document.querySelector?.(".route-detail-body") ||
      document.querySelector?.("[data-rd-scroll-root='1']") ||
      document.querySelector?.("[data-rd-scroll-root='true']") ||
      null
    );
  } catch {
    return null;
  }
}

function findTransitionHost(el, scrollRoot) {
  try {
    return (
      el.closest?.(".rd-map-card") ||
      el.closest?.(".rd-map") ||
      el.closest?.(".rd-section") ||
      el.closest?.(".route-detail") ||
      scrollRoot ||
      el.parentElement ||
      el
    );
  } catch {
    return scrollRoot || el || null;
  }
}

function triggerGmapsResize(map) {
  try {
    const g = typeof window !== "undefined" ? window.google : null;
    g?.maps?.event?.trigger?.(map, "resize");
  } catch {
    // ignore
  }
}

export default function useRDMapResizeAuthority({
  mapRef,
  containerRef,
  getBounds,
  boundsKey,
  enabled = true,
  debug = false,
  paddingPx = 44,
  minSizePx = 80,
}) {
  const stRef = useRef({
    t: null,
    lastRunAt: 0,
    lastSig: "",
    lastFitAt: 0,
    lastFitKey: "",
    fitWinStart: 0,
    fitWinCount: 0,
    mounted: false,
  });

  useEffect(() => {
    stRef.current.mounted = true;
    return () => {
      stRef.current.mounted = false;
      if (stRef.current.t) clearTimeout(stRef.current.t);
      stRef.current.t = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const st = stRef.current;
    let ro = null;
    let io = null;
    let mo = null;
    let rafAttach = 0;

    const log = (...args) => {
      if (!debug) return;
      try {
        // eslint-disable-next-line no-console
        console.log("[RDMapRA]", ...args);
      } catch {}
    };

    const requestRun = (reason, force = false) => {
      if (!st.mounted) return;
      if (st.t) return;

      st.t = setTimeout(() => {
        st.t = null;

        const map = getMap(mapRef);
        const el = getEl(containerRef);
        if (!map || !el) return;

        const rect = safeRect(el);
        const w = rect?.width || 0;
        const h = rect?.height || 0;
        if (w < minSizePx || h < minSizePx) return;

        const sig = sigFromRect(rect);
        const tnow = nowMs();
        const since = tnow - (st.lastRunAt || 0);

        const allowSame =
          force ||
          sig !== st.lastSig ||
          since > 900 ||
          (shouldAllowSameSig(reason) && since > 220);

        if (!allowSame) return;

        st.lastSig = sig;
        st.lastRunAt = tnow;

        log("run", { reason, force, sig });

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const map2 = getMap(mapRef);
            if (!map2) return;

            triggerGmapsResize(map2);

            let b = null;
            try {
              b = typeof getBounds === "function" ? getBounds() : null;
            } catch {
              b = null;
            }

            // Tek nokta desteği: {center, zoom}
            if (b && typeof b === "object" && b.center && typeof b.zoom === "number") {
              try {
                map2.setCenter(b.center);
                map2.setZoom(b.zoom);
              } catch {}
              return;
            }

            const bounds = b && b.bounds ? b.bounds : b;
            if (!bounds || typeof bounds.getSouthWest !== "function") return;

            // loop-breaker: 1 sn içinde max 3 fit
            const t2 = nowMs();
            if (t2 - st.fitWinStart > 1000) {
              st.fitWinStart = t2;
              st.fitWinCount = 0;
            }
            if (st.fitWinCount >= 3) return;

            const fitKey = `${sig}|${String(boundsKey || "")}`;
            const fitSince = t2 - (st.lastFitAt || 0);

            if (fitKey === st.lastFitKey && fitSince < 900) return;

            st.lastFitKey = fitKey;
            st.lastFitAt = t2;
            st.fitWinCount += 1;

            try {
              map2.fitBounds(bounds, {
                top: paddingPx,
                right: paddingPx,
                bottom: paddingPx,
                left: paddingPx,
              });
            } catch {
              try {
                map2.fitBounds(bounds, paddingPx);
              } catch {}
            }
          });
        });
      }, 160);
    };

    const attach = () => {
      const el = getEl(containerRef);
      if (!el) {
        rafAttach = requestAnimationFrame(attach);
        return;
      }

      const scrollRoot = findScrollRoot(el);
      const transitionHost = findTransitionHost(el, scrollRoot);

      // ResizeObserver
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => requestRun("ro"));
        try {
          ro.observe(el);
        } catch {}
      }

      // IntersectionObserver (transform/scroll görünürlük)
      if (typeof IntersectionObserver !== "undefined") {
        io = new IntersectionObserver(
          (entries) => {
            const e = entries && entries[0];
            if (!e) return;
            if (e.isIntersecting && (e.intersectionRatio || 0) > 0.08) requestRun("io");
          },
          { root: scrollRoot || null, threshold: [0, 0.08, 0.15, 0.3, 0.6, 1] }
        );
        try {
          io.observe(el);
        } catch {}
      }

      // visualViewport
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      const onVV = () => requestRun("vv");
      if (vv) {
        vv.addEventListener("resize", onVV, { passive: true });
        vv.addEventListener("scroll", onVV, { passive: true });
      }

      // scroll root
      const onScroll = () => requestRun("scroll");
      if (scrollRoot && scrollRoot.addEventListener) {
        scrollRoot.addEventListener("scroll", onScroll, { passive: true });
      }

      // transition / animation (sheet aç-kapa, transform)
      const onTransition = () => requestRun("transition");
      const onAnimation = () => requestRun("animation");
      if (transitionHost && transitionHost.addEventListener) {
        transitionHost.addEventListener("transitionend", onTransition, true);
        transitionHost.addEventListener("animationend", onAnimation, true);
      }

      // mutation (style/class değişimi yakala)
      if (typeof MutationObserver !== "undefined") {
        const target = transitionHost || scrollRoot || el;
        if (target) {
          mo = new MutationObserver(() => requestRun("mutation"));
          try {
            mo.observe(target, { attributes: true, attributeFilter: ["style", "class"] });
          } catch {}
        }
      }

      // window resize/orientation
      const onWin = () => requestRun("win");
      window.addEventListener("resize", onWin, { passive: true });
      window.addEventListener("orientationchange", onWin, { passive: true });

      // ilk ve bounds değişimi
      requestRun("mount", true);
      requestRun("bounds", true);

      return () => {
        try {
          window.removeEventListener("resize", onWin);
          window.removeEventListener("orientationchange", onWin);
        } catch {}

        try {
          if (vv) {
            vv.removeEventListener("resize", onVV);
            vv.removeEventListener("scroll", onVV);
          }
        } catch {}

        try {
          if (scrollRoot && scrollRoot.removeEventListener) scrollRoot.removeEventListener("scroll", onScroll);
        } catch {}

        try {
          if (transitionHost && transitionHost.removeEventListener) {
            transitionHost.removeEventListener("transitionend", onTransition, true);
            transitionHost.removeEventListener("animationend", onAnimation, true);
          }
        } catch {}

        try {
          ro?.disconnect?.();
        } catch {}
        try {
          io?.disconnect?.();
        } catch {}
        try {
          mo?.disconnect?.();
        } catch {}
      };
    };

    const detach = attach();

    return () => {
      if (rafAttach) cancelAnimationFrame(rafAttach);
      if (detach) detach();
      if (st.t) clearTimeout(st.t);
      st.t = null;
    };
  }, [mapRef, containerRef, getBounds, boundsKey, enabled, debug, paddingPx, minSizePx]);
}
