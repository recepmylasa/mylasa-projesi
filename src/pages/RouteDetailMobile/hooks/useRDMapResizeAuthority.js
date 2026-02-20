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
    reason === "scroll-end" ||
    reason === "snap-end" ||
    reason === "rd-event" ||
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
  } catch {}
}

function eventHasTargetWithin(e, a, b, c) {
  try {
    const t = e?.target;
    if (!t) return false;

    if (a?.contains?.(t)) return true;
    if (b?.contains?.(t)) return true;
    if (c?.contains?.(t)) return true;

    // composedPath fallback
    const path = e?.composedPath?.();
    if (Array.isArray(path) && path.length) {
      for (const n of path) {
        if (!n) continue;
        if (a && n === a) return true;
        if (b && n === b) return true;
        if (c && n === c) return true;
      }
    }
  } catch {}
  return false;
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
    scrollEndT: null,

    pendingReason: "",
    pendingForce: false,

    lastRunAt: 0,
    lastSig: "",
    lastFitAt: 0,
    lastFitKey: "",
    fitWinStart: 0,
    fitWinCount: 0,
    mounted: false,

    // ✅ snap-end throttle
    lastSnapAt: 0,
  });

  useEffect(() => {
    stRef.current.mounted = true;
    return () => {
      stRef.current.mounted = false;

      try {
        if (stRef.current.t) clearTimeout(stRef.current.t);
      } catch {}
      try {
        if (stRef.current.scrollEndT) clearTimeout(stRef.current.scrollEndT);
      } catch {}

      stRef.current.t = null;
      stRef.current.scrollEndT = null;
      stRef.current.pendingReason = "";
      stRef.current.pendingForce = false;
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

    const enqueuePending = (reason, force) => {
      if (!reason) return;
      st.pendingReason = reason;
      st.pendingForce = st.pendingForce || !!force;
    };

    const requestRun = (reason, force = false) => {
      if (!st.mounted) return;

      if (st.t) {
        enqueuePending(reason, force);
        return;
      }

      st.t = setTimeout(() => {
        st.t = null;

        try {
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

              if (b && typeof b === "object" && b.center && typeof b.zoom === "number") {
                try {
                  map2.setCenter(b.center);
                  map2.setZoom(b.zoom);
                } catch {}
                return;
              }

              const bounds = b && b.bounds ? b.bounds : b;
              if (!bounds || typeof bounds.getSouthWest !== "function") return;

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
        } finally {
          const pr = st.pendingReason;
          const pf = st.pendingForce;

          st.pendingReason = "";
          st.pendingForce = false;

          if (pr) {
            try {
              setTimeout(() => requestRun(pr, pf), 0);
            } catch {}
          }
        }
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

      // IntersectionObserver
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

      // ✅ scroll root + scroll-end
      const onScroll = () => {
        requestRun("scroll");
        try {
          if (st.scrollEndT) clearTimeout(st.scrollEndT);
        } catch {}
        st.scrollEndT = setTimeout(() => {
          requestRun("scroll-end", true);
        }, 180);
      };

      const onScrollEnd = () => requestRun("scroll-end", true);

      if (scrollRoot && scrollRoot.addEventListener) {
        scrollRoot.addEventListener("scroll", onScroll, { passive: true });
        try {
          scrollRoot.addEventListener("scrollend", onScrollEnd, { passive: true });
        } catch {}
      }

      // transition / animation
      const onTransition = () => requestRun("transition");
      const onAnimation = () => requestRun("animation");
      if (transitionHost && transitionHost.addEventListener) {
        transitionHost.addEventListener("transitionend", onTransition, true);
        transitionHost.addEventListener("animationend", onAnimation, true);
      }

      // mutation
      if (typeof MutationObserver !== "undefined") {
        const target = transitionHost || scrollRoot || el;
        if (target) {
          mo = new MutationObserver(() => requestRun("mutation"));
          try {
            mo.observe(target, { attributes: true, attributeFilter: ["style", "class"] });
          } catch {}
        }
      }

      // ✅ GLOBAL snap-end: sheet drag bittiğinde (pointerup/touchend) FORCE repair
      const onSnapEnd = (e) => {
        const t = nowMs();
        if (t - (st.lastSnapAt || 0) < 90) return;

        // sadece bizim layout alanımızla ilişkiliyse
        const related = eventHasTargetWithin(e, transitionHost, scrollRoot, el);
        if (!related) return;

        st.lastSnapAt = t;
        requestRun("snap-end", true);
      };

      window.addEventListener("pointerup", onSnapEnd, true);
      window.addEventListener("pointercancel", onSnapEnd, true);
      window.addEventListener("touchend", onSnapEnd, true);
      window.addEventListener("touchcancel", onSnapEnd, true);
      window.addEventListener("mouseup", onSnapEnd, true);

      // ✅ custom event: rd:snap-end
      const onRDEvent = () => {
        const t = nowMs();
        if (t - (st.lastSnapAt || 0) < 70) return;
        st.lastSnapAt = t;
        requestRun("rd-event", true);
      };
      window.addEventListener("rd:snap-end", onRDEvent, { passive: true });

      // window resize/orientation
      const onWin = () => requestRun("win");
      window.addEventListener("resize", onWin, { passive: true });
      window.addEventListener("orientationchange", onWin, { passive: true });

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
          if (scrollRoot && scrollRoot.removeEventListener) {
            scrollRoot.removeEventListener("scroll", onScroll);
            try {
              scrollRoot.removeEventListener("scrollend", onScrollEnd);
            } catch {}
          }
        } catch {}

        try {
          if (transitionHost && transitionHost.removeEventListener) {
            transitionHost.removeEventListener("transitionend", onTransition, true);
            transitionHost.removeEventListener("animationend", onAnimation, true);
          }
        } catch {}

        try {
          window.removeEventListener("pointerup", onSnapEnd, true);
          window.removeEventListener("pointercancel", onSnapEnd, true);
          window.removeEventListener("touchend", onSnapEnd, true);
          window.removeEventListener("touchcancel", onSnapEnd, true);
          window.removeEventListener("mouseup", onSnapEnd, true);
        } catch {}

        try {
          window.removeEventListener("rd:snap-end", onRDEvent);
        } catch {}

        try {
          if (st.scrollEndT) clearTimeout(st.scrollEndT);
        } catch {}
        st.scrollEndT = null;

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
      try {
        if (st.t) clearTimeout(st.t);
      } catch {}
      try {
        if (st.scrollEndT) clearTimeout(st.scrollEndT);
      } catch {}
      st.t = null;
      st.scrollEndT = null;
      st.pendingReason = "";
      st.pendingForce = false;
    };
  }, [mapRef, containerRef, getBounds, boundsKey, enabled, debug, paddingPx, minSizePx]);
}