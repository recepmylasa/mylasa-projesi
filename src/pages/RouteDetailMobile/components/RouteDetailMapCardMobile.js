// FILE: src/pages/RouteDetailMobile/components/RouteDetailMapCardMobile.js
import React, { useEffect, useMemo, useRef } from "react";
import RouteDetailMapPreviewShell from "./RouteDetailMapPreviewShell";

function safeRect(el) {
  try {
    return el?.getBoundingClientRect?.() || null;
  } catch {
    return null;
  }
}

function sigFromRect(rect) {
  if (!rect) return "";
  const w = Math.round(rect.width || 0);
  const h = Math.round(rect.height || 0);
  const dpr = Math.round(((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1) * 100);
  return `${w}x${h}@${dpr}`;
}

export default function RouteDetailMapCardMobile({
  routeId,
  mapsRetryTick,
  retryMap,
  pathPts,
  stopsForPreview,
  stopsLoaded,
  mapBadgeCount,
  mapAreaLabel,
}) {
  const badgeCount = useMemo(() => {
    const n = Number(mapBadgeCount) || 0;
    return Math.max(0, Math.min(12, Math.floor(n)));
  }, [mapBadgeCount]);

  const areaLabel = useMemo(() => {
    const s = String(mapAreaLabel || "").trim();
    return s ? s : "";
  }, [mapAreaLabel]);

  // ✅ Tek otorite: MapCard yüksekliği (CSS’te de --rd-map-h ile kilitli)
  const cardH = "var(--rd-map-h, 240px)";

  const cardRef = useRef(null);

  /**
   * ✅ EMİR 03 — “Yarım/alta kaçma” için repaint otoritesi:
   * - Sheet drag / hero collapse / viewport UI değişiminde Google Maps bazen resize’ı kaçırıyor.
   * - En risksiz: MapCard boyut/görünürlük değişiminde Shell’i kontrollü remount (mapsRetryTick) et.
   * - Throttle: 900ms (spam kırıcı).
   */
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const st = {
      mounted: false,
      visible: true,
      lastSig: "",
      lastKickAt: 0,
    };

    const kick = (reason) => {
      try {
        if (typeof retryMap !== "function") return;
        const now = Date.now();
        if (now - st.lastKickAt < 900) return;
        st.lastKickAt = now;

        // İlk mount’ta gereksiz remount yapma (ama sig oturunca takip et)
        if (!st.mounted) return;

        retryMap();
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.debug("[RDMapKick]", { reason, routeId });
        }
      } catch {}
    };

    const readSig = () => {
      const r = safeRect(el);
      return sigFromRect(r);
    };

    // Initial sig
    st.lastSig = readSig();
    st.mounted = true;

    let ro = null;
    let io = null;

    // ResizeObserver: gerçek boyut değişimini yakala
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        const sig = readSig();
        if (!sig) return;

        // min-size guard
        const parts = sig.split("x");
        const w = Number(parts?.[0] || 0);
        const h = Number((parts?.[1] || "").split("@")?.[0] || 0);
        if (w < 80 || h < 80) return;

        if (sig !== st.lastSig) {
          st.lastSig = sig;
          if (st.visible) kick("ro");
        }
      });

      try {
        ro.observe(el);
      } catch {}
    }

    // IntersectionObserver: görünürlüğe girince (özellikle aşağı-yukarı çekişte) bir kez “kick”
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries && entries[0];
          if (!e) return;

          const vis = !!(e.isIntersecting && (e.intersectionRatio || 0) > 0.08);
          const was = st.visible;
          st.visible = vis;

          if (vis && !was) {
            // yeniden görünür oldu → kick
            kick("io-enter");
          }
        },
        { threshold: [0, 0.08, 0.15, 0.3, 0.6, 1] }
      );

      try {
        io.observe(el);
      } catch {}
    }

    const onWin = () => {
      if (!st.visible) return;
      kick("win");
    };

    const onVis = () => {
      try {
        if (document.visibilityState === "visible") onWin();
      } catch {}
    };

    try {
      window.addEventListener("resize", onWin, { passive: true });
      window.addEventListener("orientationchange", onWin, { passive: true });
    } catch {}

    try {
      document.addEventListener("visibilitychange", onVis, { passive: true });
    } catch {}

    return () => {
      try {
        ro?.disconnect?.();
      } catch {}
      try {
        io?.disconnect?.();
      } catch {}
      try {
        window.removeEventListener("resize", onWin);
        window.removeEventListener("orientationchange", onWin);
      } catch {}
      try {
        document.removeEventListener("visibilitychange", onVis);
      } catch {}
    };
    // mapsRetryTick değişince zaten remount oluyor, burada dependency’ye koymaya gerek yok.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryMap, routeId]);

  return (
    <div
      ref={cardRef}
      className="rd-map-card"
      data-rd-map-card="1"
      style={{
        position: "relative",
        width: "100%",
        display: "block",
        height: cardH,
        minHeight: cardH,
        borderRadius: "var(--rd-map-radius, 20px)",
        overflow: "hidden",
        isolation: "isolate",

        // ✅ Shell’in clamp vb. hiçbir şeye kaçmaması için:
        "--rdmps-h": "100%",
      }}
    >
      <div
        className="rd-map-card__canvas"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          minHeight: "100%",
          overflow: "hidden",
          borderRadius: "inherit",
        }}
      >
        <RouteDetailMapPreviewShell
          key={mapsRetryTick}
          routeId={routeId}
          path={pathPts}
          stops={stopsForPreview || []}
          stopsLoaded={stopsLoaded}
          badgeCount={badgeCount}
          areaLabel={areaLabel}
          onRetry={() => retryMap()}
        />
      </div>
    </div>
  );
}