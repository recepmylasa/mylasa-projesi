// FILE: src/pages/RouteDetailMobile/RouteDetailMobile.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./RouteDetailMobile.css";
import "./RouteDetailMobileVitreous.css";

// ✅ Tabs/Pills stillleri (yoksa bar görünmeyebilir)
import "./styles/rd.sectionTabs.css";

// ✅ MAP CARD base styles
import "./styles/rd.map.css";

// ✅ hero/yazar stillleri (base)
import "./styles/rd.hero.css";

// ❌ PARÇA-1 REGRESYON RESET: premium hissiyatı bozan hardfix şimdilik kapalı
// import "./styles/rd.map.hardfix.css";

// ✅✅✅ EMİR — SHEET MOTOR HARD-FIX (transform yasak + clamp/reset)
import "./styles/rd.sheet.hardfix.css";

// Existing sheets/rows stay here (risk azalt)
import RouteDetailAccessSheet from "./components/RouteDetailAccessSheet";
import RouteDetailPrefillSheet from "./components/RouteDetailPrefillSheet";
import RouteDetailCoverRow from "./components/RouteDetailCoverRow";
import RouteDetailRateRow from "./components/RouteDetailRateRow";

// Data hooks (same)
import useRouteDetailQuest from "./hooks/useRouteDetailQuest";
import useRouteDetailCover from "./hooks/useRouteDetailCover";
import useRouteDetailImgProof from "./hooks/useRouteDetailImgProof";
import useRouteDetailData from "./hooks/useRouteDetailData";
import useRouteDetailMedia from "./hooks/useRouteDetailMedia";

// Agg
import { getRouteStarsAgg, getStopsStarsAgg } from "./routeDetailAgg";

// Utils (minimum)
import {
  DEFAULT_ROUTE_COVER_URL,
  normalizePathForPreview,
  normalizeStopsForPreview,
  buildShareRoutePayload,
} from "./routeDetailUtils";

// ✅ Feature flags (V3 kill switch)
import { ROUTES_V3_ENABLED } from "../../config/featureFlags";

// New hooks
import useRDTheme from "./hooks/useRDTheme";
import useRDInteractionBlocker from "./hooks/useRDInteractionBlocker";
import useRDAnchors from "./hooks/useRDAnchors";
import useRDPortalsAndScrollLock from "./hooks/useRDPortalsAndScrollLock";
import useRDActions from "./hooks/useRDActions";
import useRDHeroModel from "./hooks/useRDHeroModel";
import resolveCoverForUi from "./utils/resolveCoverForUi";

// New components
import RouteDetailHeroMobile from "./components/RouteDetailHeroMobile";
import RouteDetailMapCardMobile from "./components/RouteDetailMapCardMobile";
import RouteDetailSectionsMobile from "./components/RouteDetailSectionsMobile";
import RouteDetailOverlaysMobile from "./components/RouteDetailOverlaysMobile";

// ✅ Backward compatibility export’ları (IMPORTLAR BİTTİKTEN SONRA!)
export { formatTimeAgo, formatCount, formatDateTR } from "./routeDetailCompat";

// ✅ EMİR 31/P1 — Simple scroll scope flag (CSS: data-simple-scroll)
const RD_SIMPLE_SCROLL = true;

/**
 * ✅ FALLBACK STICKY TABS
 */
function RouteDetailStickyTabsFallback({
  activeTab,
  onTabChange,
  canInteract,
  tabsBarRef,
  routeDescText,
  rdTheme,
  commentsCount,
  galleryCount,
}) {
  const isLight = rdTheme === "light";

  const tabs = useMemo(() => {
    const cc = Number(commentsCount) || 0;
    const gc = Number(galleryCount) || 0;

    return [
      { key: "stops", label: "Duraklar" },
      { key: "gallery", label: "Galeri", badge: gc > 0 ? String(gc) : "" },
      { key: "comments", label: "Yorumlar", badge: cc > 0 ? String(cc) : "" },
      { key: "gpx", label: "GPX" },
    ];
  }, [commentsCount, galleryCount]);

  const handleClick = useCallback(
    (key) => {
      if (!key) return;
      if (!canInteract) return;
      try {
        onTabChange?.(key);
      } catch {}
    },
    [canInteract, onTabChange]
  );

  const bg = isLight ? "rgba(255,255,255,0.84)" : "rgba(10,10,12,0.62)";
  const border = isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.08)";
  const textMuted = isLight ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.70)";
  const pillBg = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)";
  const pillBorder = isLight ? "1px solid rgba(0,0,0,0.10)" : "1px solid rgba(255,255,255,0.10)";
  const pillActiveBg = isLight ? "rgba(0,0,0,0.86)" : "rgba(255,255,255,0.92)";
  const pillActiveText = isLight ? "rgba(255,255,255,0.96)" : "rgba(0,0,0,0.92)";

  // ✅ EMİR 31/P2 — Simple scroll modda sticky kapat (inline style olduğu için JS’ten garantile)
  const tabsPosition = RD_SIMPLE_SCROLL ? "static" : "sticky";
  const tabsTop = RD_SIMPLE_SCROLL ? "auto" : 0;

  return (
    <div
      ref={tabsBarRef}
      style={{
        position: tabsPosition,
        top: tabsTop,
        zIndex: 90,
        padding: "10px 12px 10px",
        background: bg,
        borderBottom: border,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        {tabs.map((t) => {
          const isActive = (activeTab || "stops") === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => handleClick(t.key)}
              disabled={!canInteract}
              aria-pressed={isActive}
              style={{
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                border: isActive ? "1px solid transparent" : pillBorder,
                background: isActive ? pillActiveBg : pillBg,
                color: isActive ? pillActiveText : isLight ? "rgba(0,0,0,0.88)" : "rgba(255,255,255,0.90)",
                fontSize: 13,
                fontWeight: 700,
                lineHeight: "16px",
                letterSpacing: 0.2,
                opacity: canInteract ? 1 : 0.55,
                cursor: canInteract ? "pointer" : "default",
                userSelect: "none",
              }}
            >
              <span>{t.label}</span>
              {!!t.badge && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 20,
                    height: 18,
                    padding: "0 6px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 800,
                    lineHeight: "18px",
                    background: isActive
                      ? "rgba(0,0,0,0.18)"
                      : isLight
                      ? "rgba(0,0,0,0.10)"
                      : "rgba(255,255,255,0.10)",
                    color: isActive ? pillActiveText : isLight ? "rgba(0,0,0,0.76)" : "rgba(255,255,255,0.78)",
                  }}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!!routeDescText && (
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            lineHeight: "16px",
            color: textMuted,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {routeDescText}
        </div>
      )}
    </div>
  );
}

export default function RouteDetailMobile({
  routeId,
  initialRoute = null,
  source = null,
  followInitially = false,
  ownerFromLink = null,
  onClose = () => {
    try {
      window.history.back();
    } catch {}
  },
}) {
  const V3_ENABLED = ROUTES_V3_ENABLED;

  // ✅ Sheet ref
  const sheetRef = React.useRef(null);

  // ✅ Main scroller ref (jitter fix: tek otorite)
  const mainBodyRef = React.useRef(null);

  // ✅ PARÇA 2/5 — bodyScrollRef (scroll-end + snap-end otoritesi + MapPreviewShell'e passthrough)
  const bodyScrollRef = React.useRef(null);

  // ✅ EMİR 06 — Scroll owner tracker (body | sheet)
  const scrollOwnerRef = React.useRef("body");

  // ✅ EMİR 03 (Adım 4) — Map repaint/resize otoritesi (RO/IO/VV)
  const mapCardHostRef = React.useRef(null);
  const mapResizeRef = React.useRef({
    raf: 0,
    lastTs: 0,
    lastRectKey: "",
    lastReason: "",
  });

  const requestMapResize = useCallback((reason = "") => {
    const ref = mapResizeRef.current;
    ref.lastReason = reason || ref.lastReason || "";

    try {
      if (ref.raf) return;
      ref.raf = window.requestAnimationFrame(() => {
        ref.raf = 0;

        const host = mapCardHostRef.current;
        if (!host) return;

        let r = null;
        try {
          r = host.getBoundingClientRect();
        } catch {}

        const w = r ? Math.round(r.width) : 0;
        const h = r ? Math.round(r.height) : 0;
        if (w < 16 || h < 16) return;

        const top = r ? Math.round(r.top) : 0;

        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const rectKey = `${w}x${h}@${top}`;

        // ✅ spam breaker: aynı ölçü + yakın zaman ise tekrar etme
        if (ref.lastRectKey === rectKey && now - ref.lastTs < 450) return;

        ref.lastRectKey = rectKey;
        ref.lastTs = now;

        // ✅ 1) Eğer map component kendi force fonksiyonunu expose ettiyse onu kullan
        try {
          if (typeof window.__RD_MAP_FORCE__ === "function") {
            window.__RD_MAP_FORCE__();
            return;
          }
        } catch {}

        // ✅ 2) Global map instance fallback
        try {
          const map = window.__RD_MAP__;
          if (map && window.google?.maps?.event?.trigger) {
            window.google.maps.event.trigger(map, "resize");
            const c = map.getCenter?.();
            if (c) map.setCenter(c);
            const z = map.getZoom?.();
            if (typeof z === "number") map.setZoom(z);
          }
        } catch {}
      });
    } catch {}
  }, []);

  // ✅ EMİR 03 (Adım 4) — RO + IO + VisualViewport ile repaint tetikle
  useEffect(() => {
    const host = mapCardHostRef.current;
    if (!host) return;

    requestMapResize("mount");

    let ro = null;
    try {
      ro = new ResizeObserver(() => requestMapResize("RO"));
      ro.observe(host);
    } catch {}

    let io = null;
    try {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries && entries[0];
          if (!e) return;
          const ratio = Number(e.intersectionRatio) || 0;
          if (e.isIntersecting && ratio > 0.25) requestMapResize("IO");
        },
        {
          root: mainBodyRef.current || null,
          threshold: [0, 0.25, 0.55, 0.85],
        }
      );
      io.observe(host);
    } catch {}

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const onVV = () => {
      requestMapResize("VV");
    };

    try {
      vv?.addEventListener("resize", onVV, { passive: true });
      vv?.addEventListener("scroll", onVV, { passive: true });
    } catch {}

    try {
      window.addEventListener("orientationchange", onVV, { passive: true });
      window.addEventListener("resize", onVV, { passive: true });
    } catch {}

    return () => {
      try {
        ro?.disconnect();
      } catch {}
      try {
        io?.disconnect();
      } catch {}
      try {
        vv?.removeEventListener("resize", onVV);
        vv?.removeEventListener("scroll", onVV);
      } catch {}
      try {
        window.removeEventListener("orientationchange", onVV);
        window.removeEventListener("resize", onVV);
      } catch {}
      try {
        const ref = mapResizeRef.current;
        if (ref?.raf) {
          window.cancelAnimationFrame(ref.raf);
          ref.raf = 0;
        }
      } catch {}
    };
  }, [routeId, requestMapResize]);

  // ✅ EMİR — route başına 1 kere "TOP reset" mandalı (StrictMode spam kırıcı)
  const initialTopResetRef = React.useRef({ routeId: null, done: false });

  // ✅ EMİR 04 — HARD RESET px eşiği (zoom/rounding için büyüt)
  const HARD_RESET_TOP_PX = 12;

  // ✅ EMİR — “Clamp & Reset” mandalı (spam kırıcı)
  const hardFixRef = React.useRef({
    lastAtTop: true,
  });

  // ✅ EMİR 04 — TOP hard reset gate (spam breaker)
  const topHardResetGateRef = React.useRef({
    routeId: null,
    lastAt: 0,
    lastReason: "",
  });

  // ✅ EMİR 01 — Collapsible hero (RAF + CSS vars)
  const heroCollapseRef = React.useRef({
    raf: 0,
    lastTop: 0,
    lastInputTop: -1,
    lastAppliedKey: "",
  });

  const clamp01 = (n) => Math.max(0, Math.min(1, n));

  const applyHeroCollapseVars = useCallback((scrollTop) => {
    // ✅ EMİR 31/P2 — Simple Scroll modda collapse motoru KAPALI
    if (RD_SIMPLE_SCROLL) return;

    const st = Math.max(0, Math.round(Number(scrollTop) || 0));

    const H_MAX = 500;
    const H_MIN = 140;
    const RANGE = Math.max(1, H_MAX - H_MIN);

    const t = clamp01(st / RANGE);
    const h = Math.round(H_MAX - t * RANGE);

    const infoOpacityRaw = clamp01(1 - t * 1.35);
    const infoOpacity = Math.round(infoOpacityRaw * 1000) / 1000;

    const infoY = Math.round(-t * 18);
    const imgScale = (1.045 - t * 0.07).toFixed(3);
    const hubY = Math.round(-t * 10);
    const collapsed = t >= 0.98 ? 1 : 0;

    const scopeEl = sheetRef.current?.closest(".route-detail-backdrop") || sheetRef.current;
    if (!scopeEl) return;

    const key = `${h}|${infoOpacity}|${infoY}|${imgScale}|${hubY}|${collapsed}`;
    const ref = heroCollapseRef.current;
    if (ref.lastAppliedKey === key) return;
    ref.lastAppliedKey = key;

    try {
      scopeEl.style.setProperty("--rd-hero-h", `${h}px`);
      scopeEl.style.setProperty("--rd-hero-info-o", `${infoOpacity}`);
      scopeEl.style.setProperty("--rd-hero-info-y", `${infoY}px`);
      scopeEl.style.setProperty("--rd-hero-img-scale", `${imgScale}`);
      scopeEl.style.setProperty("--rd-hero-hub-y", `${hubY}px`);
      scopeEl.setAttribute("data-hero-collapsed", collapsed ? "1" : "0");
    } catch {}
  }, []);

  const scheduleHeroCollapse = useCallback(
    (scrollTop) => {
      // ✅ EMİR 31/P2 — Simple Scroll modda collapse motoru KAPALI
      if (RD_SIMPLE_SCROLL) return;

      const st = Math.max(0, Math.round(Number(scrollTop) || 0));
      const ref = heroCollapseRef.current;

      if (ref.lastInputTop === st) return;
      ref.lastInputTop = st;

      ref.lastTop = st;
      if (ref.raf) return;

      ref.raf = window.requestAnimationFrame(() => {
        ref.raf = 0;
        applyHeroCollapseVars(ref.lastTop);
      });
    },
    [applyHeroCollapseVars]
  );

  const forceHeroExpanded = useCallback(
    (reason = "") => {
      // ✅ EMİR 31/P2 — Simple Scroll modda force/reset KAPALI
      if (RD_SIMPLE_SCROLL) return;

      try {
        heroCollapseRef.current.lastInputTop = -1;
      } catch {}
      try {
        heroCollapseRef.current.lastAppliedKey = "";
      } catch {}

      try {
        applyHeroCollapseVars(0); // schedule değil, direkt
      } catch {}

      try {
        const scopeEl = sheetRef.current?.closest(".route-detail-backdrop") || sheetRef.current;
        scopeEl?.setAttribute?.("data-hero-collapsed", "0");
      } catch {}

      if (process.env.NODE_ENV !== "production") {
        try {
          // eslint-disable-next-line no-console
          console.debug("[RD][forceHeroExpanded]", { routeId: String(routeId || ""), reason: String(reason || "") });
        } catch {}
      }
    },
    [applyHeroCollapseVars, routeId]
  );

  const stripInlineTransform = useCallback((el) => {
    if (!el) return;
    try {
      const t = el.style?.transform;
      if (t && t !== "none") el.style.transform = "none";
    } catch {}
    try {
      const tr = el.style?.translate;
      if (tr && tr !== "none") el.style.translate = "none";
    } catch {}
    try {
      const wc = String(el.style?.willChange || "");
      if (wc && wc.includes("transform")) {
        const cleaned = wc
          .split(",")
          .map((x) => x.trim())
          .filter((x) => x && x !== "transform")
          .join(", ");
        el.style.willChange = cleaned || "auto";
      }
    } catch {}
  }, []);

  const scrollEndRef = React.useRef({ tmr: 0 });
  const snapEndGateRef = React.useRef({ lastAt: 0 });
  const settleSecondWaveRef = React.useRef({ lastAt: 0, tmr: 0 });
  const transitionEndGateRef = React.useRef({ lastAt: 0 });
  const lastScrollTopRef = React.useRef(0);

  const clearInlineLayoutStuck = useCallback((el) => {
    if (!el) return false;
    let changed = false;

    try {
      const t = el.style?.transform;
      if (t && t !== "none") {
        el.style.transform = "none";
        changed = true;
      }
    } catch {}

    try {
      const tr = el.style?.translate;
      if (tr && tr !== "none") {
        el.style.translate = "none";
        changed = true;
      }
    } catch {}

    try {
      const top = el.style?.top;
      if (typeof top === "string" && top !== "") {
        el.style.top = "";
        changed = true;
      }
    } catch {}
    try {
      const bottom = el.style?.bottom;
      if (typeof bottom === "string" && bottom !== "") {
        el.style.bottom = "";
        changed = true;
      }
    } catch {}
    try {
      const left = el.style?.left;
      if (typeof left === "string" && left !== "") {
        el.style.left = "";
        changed = true;
      }
    } catch {}
    try {
      const right = el.style?.right;
      if (typeof right === "string" && right !== "") {
        el.style.right = "";
        changed = true;
      }
    } catch {}

    return changed;
  }, []);

  const forceImportantReset = useCallback(
    (reason = "topHardReset") => {
      // ✅ EMİR 31/P2 — Simple Scroll modda reset motoru KAPALI
      if (RD_SIMPLE_SCROLL) return;

      const rid = String(routeId || "");
      const gate = topHardResetGateRef.current;

      if (gate.routeId !== rid) {
        gate.routeId = rid;
        gate.lastAt = 0;
        gate.lastReason = "";
      }

      const now = Date.now();
      if (now - (gate.lastAt || 0) < 80 && gate.lastReason === String(reason || "")) return;
      gate.lastAt = now;
      gate.lastReason = String(reason || "");

      const sheetEl = sheetRef.current;
      if (!sheetEl) return;

      const root = sheetEl.closest?.(".route-detail-backdrop") || sheetEl;

      const bodyEl =
        bodyScrollRef.current ||
        mainBodyRef.current ||
        root.querySelector?.(".route-detail-body") ||
        root.querySelector?.(".content-body") ||
        null;

      const heroEl =
        root.querySelector?.(".route-detail-hero") ||
        root.querySelector?.(".rd-hero") ||
        root.querySelector?.("[data-rd-hero]") ||
        null;

      const hubEl = root.querySelector?.(".rd-hero__hub") || heroEl?.querySelector?.(".rd-hero__hub") || null;

      const nodes = [sheetEl, bodyEl, heroEl, hubEl].filter(Boolean);

      const imp = (el, prop, val) => {
        try {
          el.style.setProperty(prop, val, "important");
        } catch {}
      };

      const maybeAutoIfInline = (el, prop) => {
        try {
          const v = el.style.getPropertyValue(prop);
          if (v && String(v).trim() !== "") imp(el, prop, "auto");
        } catch {}
      };

      nodes.forEach((el) => {
        imp(el, "transform", "none");
        imp(el, "translate", "none");
        imp(el, "will-change", "auto");
        imp(el, "contain", "none");
        imp(el, "filter", "none");
        imp(el, "clip-path", "none");
        imp(el, "-webkit-clip-path", "none");

        maybeAutoIfInline(el, "top");
        maybeAutoIfInline(el, "left");
        maybeAutoIfInline(el, "right");
        maybeAutoIfInline(el, "bottom");
      });

      try {
        window.dispatchEvent(new CustomEvent("rd:repair", { detail: { reason: String(reason || "topHardReset") } }));
      } catch {}

      if (process.env.NODE_ENV !== "production") {
        try {
          // eslint-disable-next-line no-console
          console.debug("[RD][ForceImportantReset]", { routeId: rid, reason: String(reason || "") });
        } catch {}
      }
    },
    [routeId]
  );

  const isAltBlockStuckUnderHero = useCallback(() => {
    // ✅ EMİR 31/P2 — Simple Scroll modda stuck detector kullanılmıyor
    if (RD_SIMPLE_SCROLL) return false;

    const sheetEl = sheetRef.current;
    if (!sheetEl) return false;

    const root = sheetEl.closest?.(".route-detail-backdrop") || sheetEl;

    const bodyEl =
      bodyScrollRef.current ||
      mainBodyRef.current ||
      root.querySelector?.(".route-detail-body") ||
      root.querySelector?.(".content-body") ||
      null;

    const heroEl =
      root.querySelector?.(".route-detail-hero") ||
      root.querySelector?.(".rd-hero") ||
      root.querySelector?.("[data-rd-hero]") ||
      null;

    if (!bodyEl || !heroEl) return false;

    const st = Math.max(0, Math.round(Number(bodyEl.scrollTop) || 0));
    if (st > HARD_RESET_TOP_PX) return false;

    let heroRect = null;
    let bodyRect = null;

    try {
      heroRect = heroEl.getBoundingClientRect();
      bodyRect = bodyEl.getBoundingClientRect();
    } catch {
      heroRect = null;
      bodyRect = null;
    }

    if (!heroRect || !bodyRect) return false;

    return bodyRect.top < heroRect.bottom - 2;
  }, [HARD_RESET_TOP_PX]);

  const checkTopHardReset = useCallback(
    (reason = "topHardReset") => {
      // ✅ EMİR 31/P2 — Simple Scroll modda reset motoru KAPALI
      if (RD_SIMPLE_SCROLL) return;

      const sheetEl = sheetRef.current;
      if (!sheetEl) return;

      const root = sheetEl.closest?.(".route-detail-backdrop") || sheetEl;
      const bodyEl =
        bodyScrollRef.current ||
        mainBodyRef.current ||
        root.querySelector?.(".route-detail-body") ||
        root.querySelector?.(".content-body") ||
        null;

      const owner = String(scrollOwnerRef.current || "body");
      const sheetSt = Math.max(0, Math.round(Number(sheetEl.scrollTop) || 0));
      const bodySt =
        typeof bodyEl?.scrollTop === "number" ? Math.max(0, Math.round(Number(bodyEl.scrollTop) || 0)) : null;

      const st = Math.max(
        0,
        Math.round(
          owner === "sheet"
            ? sheetSt
            : bodySt != null
            ? bodySt
            : typeof lastScrollTopRef.current === "number"
            ? lastScrollTopRef.current
            : 0
        )
      );

      if (st > HARD_RESET_TOP_PX) return;

      try {
        sheetEl.scrollTop = 0;
      } catch {}
      try {
        if (bodyEl) bodyEl.scrollTop = 0;
      } catch {}

      if (isAltBlockStuckUnderHero()) {
        try {
          forceHeroExpanded("stuckUnderHero");
        } catch {}
        try {
          forceImportantReset("stuckUnderHero");
        } catch {}
        try {
          requestMapResize("stuckUnderHero");
        } catch {}
        return;
      }

      const rsn = String(reason || "topHardReset");

      try {
        forceHeroExpanded(rsn);
      } catch {}
      try {
        forceImportantReset(rsn);
      } catch {}
      try {
        requestMapResize(rsn);
      } catch {}
    },
    [
      HARD_RESET_TOP_PX,
      isAltBlockStuckUnderHero,
      forceHeroExpanded,
      forceImportantReset,
      requestMapResize,
      scrollOwnerRef,
    ]
  );

  const nudgeGateRef = React.useRef({ lastAt: 0, raf1: 0, raf2: 0 });

  const nudgeScrollTopToReflow = useCallback(
    (reason = "nudge") => {
      // ✅ EMİR 31/P2 — Simple Scroll modda nudge KAPALI
      if (RD_SIMPLE_SCROLL) return;

      const sheetEl = sheetRef.current;
      if (!sheetEl) return;

      const root = sheetEl.closest?.(".route-detail-backdrop") || sheetEl;
      const bodyEl =
        bodyScrollRef.current ||
        mainBodyRef.current ||
        root.querySelector?.(".route-detail-body") ||
        root.querySelector?.(".content-body") ||
        null;

      const owner = String(scrollOwnerRef.current || "body");
      const target = owner === "sheet" ? sheetEl : bodyEl;

      if (!target) return;

      const st = Math.max(0, Math.round(Number(target.scrollTop) || 0));
      if (st > HARD_RESET_TOP_PX) return;

      const gate = nudgeGateRef.current;
      const now = Date.now();
      if (now - (gate.lastAt || 0) < 300) return;
      gate.lastAt = now;

      try {
        if (gate.raf1) cancelAnimationFrame(gate.raf1);
      } catch {}
      try {
        if (gate.raf2) cancelAnimationFrame(gate.raf2);
      } catch {}
      gate.raf1 = 0;
      gate.raf2 = 0;

      try {
        sheetEl.scrollTop = 0;
      } catch {}
      try {
        if (bodyEl) bodyEl.scrollTop = 0;
      } catch {}

      try {
        target.scrollTop = 1;
      } catch {}

      try {
        gate.raf1 = requestAnimationFrame(() => {
          gate.raf1 = 0;
          try {
            target.scrollTop = 0;
          } catch {}

          gate.raf2 = requestAnimationFrame(() => {
            gate.raf2 = 0;

            try {
              sheetEl.scrollTop = 0;
            } catch {}
            try {
              if (bodyEl) bodyEl.scrollTop = 0;
            } catch {}

            try {
              checkTopHardReset(String(reason || "nudge"));
            } catch {}
            try {
              requestMapResize(String(reason || "nudge"));
            } catch {}
          });
        });
      } catch {
        try {
          checkTopHardReset(String(reason || "nudge"));
        } catch {}
        try {
          requestMapResize(String(reason || "nudge"));
        } catch {}
      }
    },
    [HARD_RESET_TOP_PX, checkTopHardReset, requestMapResize]
  );

  useEffect(() => {
    return () => {
      try {
        const g = nudgeGateRef.current;
        if (g?.raf1) cancelAnimationFrame(g.raf1);
        if (g?.raf2) cancelAnimationFrame(g.raf2);
        if (g) {
          g.raf1 = 0;
          g.raf2 = 0;
        }
      } catch {}
    };
  }, [routeId]);

  const layoutRepair = useCallback(
    (reason = "scrollEnd") => {
      // ✅ EMİR 31/P2 — Simple Scroll modda repair KAPALI
      if (RD_SIMPLE_SCROLL) return;

      const sheetEl = sheetRef.current;
      const bodyEl = bodyScrollRef.current || mainBodyRef.current;

      try {
        if (String(reason) === "snapEnd") {
          const now = Date.now();
          if (now - (snapEndGateRef.current.lastAt || 0) < 120) return;
          snapEndGateRef.current.lastAt = now;
        }
      } catch {}

      try {
        clearInlineLayoutStuck(sheetEl);
      } catch {}
      try {
        clearInlineLayoutStuck(bodyEl);
      } catch {}
      try {
        clearInlineLayoutStuck(sheetEl?.parentElement);
      } catch {}

      const dispatch = () => {
        try {
          window.dispatchEvent(new CustomEvent("rd:repair", { detail: { reason: String(reason || "") } }));
        } catch {}
      };

      try {
        window.requestAnimationFrame(() => {
          try {
            void sheetEl?.offsetHeight;
            void bodyEl?.offsetHeight;
          } catch {}
          window.requestAnimationFrame(() => {
            try {
              void sheetEl?.offsetHeight;
              void bodyEl?.offsetHeight;
            } catch {}
            dispatch();
          });
        });
      } catch {
        dispatch();
      }
    },
    [clearInlineLayoutStuck]
  );

  const hardResetSheetMotor = useCallback(
    (reason = "") => {
      // ✅ EMİR 31/P2 — Simple Scroll modda hardreset KAPALI
      if (RD_SIMPLE_SCROLL) return;

      const sheetEl = sheetRef.current;
      if (!sheetEl) return;

      const bodyEl =
        mainBodyRef.current ||
        sheetEl.querySelector?.(".route-detail-body") ||
        sheetEl.querySelector?.(".content-body");

      const owner = String(scrollOwnerRef.current || "body");
      const st = Math.max(
        0,
        Math.round(
          owner === "sheet"
            ? Number(sheetEl.scrollTop) || 0
            : typeof bodyEl?.scrollTop === "number"
            ? Number(bodyEl.scrollTop) || 0
            : 0
        )
      );
      if (st > HARD_RESET_TOP_PX) return;

      try {
        sheetEl.scrollTop = 0;
      } catch {}
      try {
        if (bodyEl) bodyEl.scrollTop = 0;
      } catch {}

      const backdropEl = sheetEl.closest?.(".route-detail-backdrop") || null;

      stripInlineTransform(backdropEl);
      stripInlineTransform(sheetEl);
      stripInlineTransform(bodyEl);
      stripInlineTransform(sheetEl.parentElement);

      try {
        scheduleHeroCollapse(0);
      } catch {}

      try {
        requestMapResize(`hardreset:${reason || "top"}`);
      } catch {}

      try {
        checkTopHardReset(`topHardReset:${String(reason || "top")}`);
      } catch {}

      try {
        backdropEl?.setAttribute("data-rd-hardfix-top", "1");
        if (process.env.NODE_ENV !== "production" && reason) {
          // eslint-disable-next-line no-console
          console.debug(`[RD HARD-FIX] reset @top (${reason})`);
        }
      } catch {}
    },
    [HARD_RESET_TOP_PX, scheduleHeroCollapse, stripInlineTransform, requestMapResize, checkTopHardReset]
  );

  // ✅ PARÇA 1/5 — DEV ONLY: Global dump + manual repair (console komutları)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;

    const getRoot = () => {
      const sheetEl = sheetRef.current;
      return sheetEl?.closest?.(".route-detail-backdrop") || sheetEl || document;
    };

    const pick = (sel) => {
      try {
        const root = getRoot();
        return root?.querySelector ? root.querySelector(sel) : null;
      } catch {
        return null;
      }
    };

    const rectOf = (el) => {
      if (!el) return null;
      try {
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          left: Math.round(r.left),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      } catch {
        return null;
      }
    };

    const styleOf = (el) => {
      if (!el) return null;
      try {
        const cs = window.getComputedStyle(el);
        return {
          position: cs.position,
          transform: cs.transform,
          overflow: cs.overflow,
        };
      } catch {
        return null;
      }
    };

    const dumpNode = (selector, fallbackEl = null) => {
      const el = pick(selector) || fallbackEl;
      if (!el) return { selector, found: false };

      let inlineTransform = "";
      let inlineTranslate = "";
      try {
        inlineTransform = String(el.style?.transform || "");
      } catch {}
      try {
        inlineTranslate = String(el.style?.translate || "");
      } catch {}

      return {
        selector,
        found: true,
        rect: rectOf(el),
        style: styleOf(el),
        inline: {
          transform: inlineTransform,
          translate: inlineTranslate,
        },
      };
    };

    const dump = () => {
      const sheetEl = pick(".route-detail-sheet") || sheetRef.current;
      const bodyEl = pick(".route-detail-body") || mainBodyRef.current;
      const heroEl = pick(".route-detail-hero");
      const mapCardEl = pick(".rd-map-card");

      const out = {
        ts: Date.now(),
        routeId: routeId || null,
        bodyScrollTop: typeof bodyEl?.scrollTop === "number" ? Math.round(bodyEl.scrollTop) : null,
        nodes: {
          sheet: dumpNode(".route-detail-sheet", sheetEl),
          body: dumpNode(".route-detail-body", bodyEl),
          hero: dumpNode(".route-detail-hero", heroEl),
          mapCard: dumpNode(".rd-map-card", mapCardEl),
        },
      };

      try {
        // eslint-disable-next-line no-console
        console.groupCollapsed(`[RD] __RD_DUMP__ @${new Date(out.ts).toLocaleTimeString()}`);
        // eslint-disable-next-line no-console
        console.log(out);
        // eslint-disable-next-line no-console
        console.groupEnd();
      } catch {}

      try {
        window.__RD_LAST_DUMP__ = out;
      } catch {}

      return out;
    };

    const stripInlineTransformOnly = (el) => {
      if (!el) return false;
      let changed = false;

      try {
        const t = el.style?.transform;
        if (t && t !== "none") {
          el.style.transform = "none";
          changed = true;
        }
      } catch {}

      try {
        const tr = el.style?.translate;
        if (tr && tr !== "none") {
          el.style.translate = "none";
          changed = true;
        }
      } catch {}

      return changed;
    };

    const repairNow = () => {
      // ✅ Simple scroll’da bile manuel “inline transform” temizliği işe yarayabilir — DEV ONLY
      const sheetEl = pick(".route-detail-sheet") || sheetRef.current;
      const bodyEl = pick(".route-detail-body") || mainBodyRef.current;

      const changedSheet = stripInlineTransformOnly(sheetEl);
      const changedBody = stripInlineTransformOnly(bodyEl);

      try {
        window.requestAnimationFrame(() => {
          try {
            void sheetEl?.offsetHeight;
            void bodyEl?.offsetHeight;
          } catch {}

          window.requestAnimationFrame(() => {
            try {
              void sheetEl?.offsetHeight;
              void bodyEl?.offsetHeight;
            } catch {}

            try {
              const hasMap = !!(pick(".rd-map-card") || window.__RD_MAP__);
              if (hasMap) {
                window.dispatchEvent(new CustomEvent("rd:repair", { detail: { reason: "manual" } }));
              }
            } catch {}
          });
        });
      } catch {}

      try {
        // eslint-disable-next-line no-console
        console.log("[RD] __RD_REPAIR_NOW__ issued", { changedSheet, changedBody });
      } catch {}
    };

    try {
      window.__RD_DUMP__ = dump;
      window.__RD_REPAIR_NOW__ = repairNow;
    } catch {}

    return () => {
      try {
        delete window.__RD_DUMP__;
      } catch {}
      try {
        delete window.__RD_REPAIR_NOW__;
      } catch {}
    };
  }, [routeId]);

  // ✅ PARÇA-1: Debug flag (prod’da kapalı)
  const RD_DEBUG = useMemo(() => {
    try {
      if (process.env.NODE_ENV === "production") return false;
      return typeof window !== "undefined" && window.localStorage.getItem("RD_DEBUG") === "1";
    } catch {
      return false;
    }
  }, []);

  // ✅ EMİR 06 — Sheet scroll listener (capture): owner=sheet + st update + hero collapse sync
  useEffect(() => {
    // ✅ EMİR 31/P2 — Simple Scroll modda sheet listener KAPALI
    if (RD_SIMPLE_SCROLL) return;

    const sheetEl = sheetRef.current;
    if (!sheetEl) return;

    const onSheetScroll = () => {
      try {
        scrollOwnerRef.current = "sheet";
      } catch {}
      const st = Math.max(0, Math.round(Number(sheetEl.scrollTop) || 0));
      try {
        lastScrollTopRef.current = st;
      } catch {}
      try {
        scheduleHeroCollapse(st);
      } catch {}
    };

    try {
      sheetEl.addEventListener("scroll", onSheetScroll, { passive: true, capture: true });
    } catch {}

    return () => {
      try {
        sheetEl.removeEventListener("scroll", onSheetScroll, true);
      } catch {}
    };
  }, [routeId, scheduleHeroCollapse]);

  // ✅ PARÇA-1: TRANSFORM AVCISI + SCROLL OTORİTESİ LOGGER (debug-only)
  useEffect(() => {
    if (!RD_DEBUG) return;

    const sheetEl = sheetRef.current;
    if (!sheetEl) return;

    const rootEl = sheetEl.closest(".route-detail-backdrop") || sheetEl;

    const getLabel = (el) => {
      try {
        const tag = String(el.tagName || "").toLowerCase();
        const clsRaw = String(el.className || "");
        const cls = clsRaw && typeof clsRaw === "string" ? clsRaw.trim().replace(/\s+/g, ".") : "";
        const id = el.id ? `#${el.id}` : "";
        return `${tag}${id}${cls ? "." + cls : ""}`;
      } catch {
        return "node";
      }
    };

    const extractDataAttrs = (el) => {
      try {
        const out = {};
        const attrs = el.getAttributeNames?.() || [];
        attrs.forEach((a) => {
          if (!a || !a.startsWith("data-")) return;
          out[a] = el.getAttribute(a);
        });
        return out;
      } catch {
        return {};
      }
    };

    const lastEvtRef = { type: "init", ts: Date.now() };
    const markEvt = (type) => {
      try {
        lastEvtRef.type = type;
        lastEvtRef.ts = typeof performance !== "undefined" ? performance.now() : Date.now();
      } catch {}
    };

    const evtOpts = { capture: true, passive: true };
    const evtTypes = [
      "scroll",
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
      "touchcancel",
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "mousedown",
      "mousemove",
      "mouseup",
      "wheel",
    ];

    const evtHandlers = {};
    evtTypes.forEach((t) => {
      try {
        const fn = () => markEvt(t);
        evtHandlers[t] = fn;
        rootEl.addEventListener(t, fn, evtOpts);
      } catch {}
    });

    const bodyEl =
      mainBodyRef.current ||
      sheetEl.querySelector?.(".route-detail-body") ||
      sheetEl.querySelector?.(".content-body") ||
      null;

    const scrollLogRef = { lastTs: 0, lastKey: "" };
    const logScroll = (src) => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - scrollLogRef.lastTs < 220) return;

      const sst = typeof sheetEl.scrollTop === "number" ? Math.round(sheetEl.scrollTop) : 0;
      const bst = typeof bodyEl?.scrollTop === "number" ? Math.round(bodyEl.scrollTop) : 0;
      const owner = String(scrollOwnerRef.current || "");
      const key = `${src}|owner:${owner}|s:${sst}|b:${bst}`;
      if (scrollLogRef.lastKey === key) return;

      scrollLogRef.lastKey = key;
      scrollLogRef.lastTs = now;

      // eslint-disable-next-line no-console
      console.log(`[RD_DEBUG][scroll] ${key}`, { sheet: sheetEl, body: bodyEl });
    };

    const onSheetScroll = () => logScroll("sheet");
    const onBodyScroll = () => logScroll("body");

    try {
      sheetEl.addEventListener("scroll", onSheetScroll, { passive: true });
    } catch {}
    try {
      bodyEl?.addEventListener("scroll", onBodyScroll, { passive: true });
    } catch {}

    const seen = new WeakMap();
    let logCount = 0;
    const MAX_LOG = 120;

    const obs = new MutationObserver((list) => {
      if (!list || !list.length) return;
      if (logCount >= MAX_LOG) return;

      for (const m of list) {
        if (logCount >= MAX_LOG) break;
        if (m.type !== "attributes") continue;
        if (m.attributeName !== "style") continue;

        const el = m.target;
        if (!(el instanceof HTMLElement)) continue;

        let styleStr = "";
        try {
          styleStr = String(el.getAttribute("style") || "");
        } catch {}

        let tf = "none";
        try {
          tf = String(window.getComputedStyle(el).transform || "none");
        } catch {}

        const looksLikeTransform =
          tf !== "none" || styleStr.includes("transform") || styleStr.includes("translate") || styleStr.includes("matrix");

        if (!looksLikeTransform) continue;

        const lastKey = seen.get(el) || "";
        const key = `${tf}||${styleStr}`;
        if (lastKey === key) continue;

        seen.set(el, key);
        logCount++;

        const sst = typeof sheetEl.scrollTop === "number" ? Math.round(sheetEl.scrollTop) : 0;
        const bst = typeof bodyEl?.scrollTop === "number" ? Math.round(bodyEl?.scrollTop) : 0;

        // eslint-disable-next-line no-console
        console.groupCollapsed(
          `[RD_DEBUG][transform#${logCount}] ${getLabel(el)} | tf:${tf !== "none" ? "YES" : "maybe"} | evt:${
            lastEvtRef.type
          } | s:${sst} b:${bst}`
        );
        // eslint-disable-next-line no-console
        console.log("node:", el);
        // eslint-disable-next-line no-console
        console.log("label:", getLabel(el));
        // eslint-disable-next-line no-console
        console.log("data:", extractDataAttrs(el));
        // eslint-disable-next-line no-console
        console.log("computed.transform:", tf);
        // eslint-disable-next-line no-console
        console.log("inline style:", styleStr);
        // eslint-disable-next-line no-console
        console.log("lastEvent:", { ...lastEvtRef });
        // eslint-disable-next-line no-console
        console.groupEnd();
      }

      if (logCount >= MAX_LOG) {
        try {
          // eslint-disable-next-line no-console
          console.warn("[RD_DEBUG] MAX_LOG reached, observer muted.");
        } catch {}
      }
    });

    try {
      obs.observe(rootEl, {
        subtree: true,
        attributes: true,
        attributeFilter: ["style"],
      });
      // eslint-disable-next-line no-console
      console.log("[RD_DEBUG] Transform Avcısı aktif. (localStorage RD_DEBUG=1)");
    } catch {}

    return () => {
      try {
        obs.disconnect();
      } catch {}
      try {
        sheetEl.removeEventListener("scroll", onSheetScroll);
      } catch {}
      try {
        bodyEl?.removeEventListener("scroll", onBodyScroll);
      } catch {}

      evtTypes.forEach((t) => {
        try {
          const fn = evtHandlers[t];
          if (fn) rootEl.removeEventListener(t, fn, evtOpts);
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RD_DEBUG, routeId]);

  // ✅ Simple scroll’da map resize’i hafif debounced tetikle
  const simpleScrollResizeGateRef = React.useRef({ lastAt: 0 });

  // ✅ EMİR — scroll handler
  const handleBodyScroll = useCallback(
    (e) => {
      try {
        scrollOwnerRef.current = "body";
      } catch {}

      const st = Math.max(0, Math.round(Number(e?.currentTarget?.scrollTop) || 0));
      lastScrollTopRef.current = st;

      // ✅ EMİR 31/P2 — Simple Scroll: yalnızca hafif map resize debounce
      if (RD_SIMPLE_SCROLL) {
        const now = Date.now();
        const g = simpleScrollResizeGateRef.current;
        if (now - (g.lastAt || 0) > 180) {
          g.lastAt = now;
          try {
            requestMapResize("scroll");
          } catch {}
        }
        return;
      }

      scheduleHeroCollapse(st);

      const atTop = st <= HARD_RESET_TOP_PX;
      const ref = hardFixRef.current;

      if (atTop) {
        hardResetSheetMotor("scroll@top");
        try {
          requestMapResize("scroll@top");
        } catch {}
        try {
          checkTopHardReset("scroll@top");
        } catch {}
      }

      if (ref.lastAtTop !== atTop) {
        ref.lastAtTop = atTop;
        try {
          const backdropEl = sheetRef.current?.closest?.(".route-detail-backdrop");
          if (backdropEl) backdropEl.setAttribute("data-rd-at-top", atTop ? "1" : "0");
        } catch {}
      }

      try {
        const r = scrollEndRef.current;
        if (r?.tmr) window.clearTimeout(r.tmr);
        r.tmr = window.setTimeout(() => {
          try {
            r.tmr = 0;
          } catch {}

          layoutRepair("scrollEnd");

          const stNow = Math.max(0, Math.round(Number(lastScrollTopRef.current) || 0));
          if (stNow <= HARD_RESET_TOP_PX) {
            try {
              nudgeScrollTopToReflow("scrollEnd+nudge");
            } catch {}
            try {
              checkTopHardReset("scrollEnd");
            } catch {}
          }
        }, 120);
      } catch {}
    },
    [
      HARD_RESET_TOP_PX,
      hardResetSheetMotor,
      scheduleHeroCollapse,
      requestMapResize,
      layoutRepair,
      checkTopHardReset,
      nudgeScrollTopToReflow,
    ]
  );

  // ✅ Snap-End + 2. dalga reset (+160ms)
  const handleSnapEnd = useCallback(() => {
    // ✅ EMİR 31/P2 — Simple Scroll modda snapEnd KAPALI
    if (RD_SIMPLE_SCROLL) return;

    try {
      layoutRepair("snapEnd");
    } catch {}

    try {
      checkTopHardReset("snapEnd");
    } catch {}

    const now = Date.now();
    const gate = settleSecondWaveRef.current;
    if (now - (gate.lastAt || 0) < 300) return;
    gate.lastAt = now;

    try {
      if (gate.tmr) window.clearTimeout(gate.tmr);
    } catch {}
    gate.tmr = window.setTimeout(() => {
      try {
        forceHeroExpanded("snapEnd+160");
      } catch {}
      try {
        checkTopHardReset("snapEnd+160");
      } catch {}
      try {
        requestMapResize("snapEnd+160");
      } catch {}
      try {
        nudgeScrollTopToReflow("snapEnd+nudge");
      } catch {}
    }, 160);
  }, [layoutRepair, checkTopHardReset, forceHeroExpanded, requestMapResize, nudgeScrollTopToReflow]);

  // ✅ Portals + scroll lock
  const { withPortal, commentsPortalEl, setCommentsPortalEl, lightboxPortalEl, setLightboxPortalEl } =
    useRDPortalsAndScrollLock();

  // ✅ Ghost click blocker
  const { interactionBlocked, blockInteractionsBriefly } = useRDInteractionBlocker();

  // ✅ Theme
  const { rdTheme, rdThemeSource, themeAnimOn, onToggleTheme } = useRDTheme();

  // ✅ Anchors (tab/url + scroll-spy)
  const routeBodyRefForAnchors = React.useRef(null);
  const {
    tab,
    onTabChange,
    activeSection,
    tabsBarRef,
    tabsBarH,
    stopsSectionRef,
    gallerySectionRef,
    commentsSectionRef,
    gpxSectionRef,
    reportSectionRef,
    retryPermCheck,
  } = useRDAnchors({ routeId, routeBodyRef: routeBodyRefForAnchors });

  const activeTabKey = useMemo(() => {
    return activeSection || tab || "stops";
  }, [activeSection, tab]);

  const handleTabChange = useCallback(
    (key) => {
      if (!key) return;
      try {
        onTabChange?.(key);
      } catch {}
    },
    [onTabChange]
  );

  const {
    routeDoc,
    stops,
    stopsLoaded,
    owner,
    permError,
    commentsCount,
    ownerIdForProfile,
    lockedOwnerDoc,
    authUid,
  } = useRouteDetailData({
    routeId,
    initialRoute,
    followInitially,
    ownerFromLink,
  });

  const routeModel = routeDoc || initialRoute;

  const normalizeMediaType = useCallback((it) => {
    try {
      const t = String(it?.type || it?.mime || it?.contentType || "").toLowerCase();
      const u = String(it?.url || "").toLowerCase();
      if (t.includes("video")) return "video";
      if (t.includes("image") || t.includes("photo") || t.includes("img")) return "image";
      if (u.match(/\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i)) return "video";
      return "image";
    } catch {
      return "image";
    }
  }, []);

  const buildLightboxItems = useCallback(
    (arr) => {
      const out = [];
      (arr || []).forEach((x) => {
        const url = x?.url ? String(x.url) : "";
        if (!url) return;
        out.push({
          url,
          type: normalizeMediaType(x),
          title: x?.title || x?.name || "",
        });
      });
      return out;
    },
    [normalizeMediaType]
  );

  const DEFAULT_ROUTE_COVER_URL_PUBLIC = (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg";
  const { isDefaultCoverUrl, handleImgLoadProof, handleImgErrorToDefault } = useRouteDetailImgProof({
    routeId,
    defaultPublicUrl: DEFAULT_ROUTE_COVER_URL_PUBLIC,
    defaultConstUrl: DEFAULT_ROUTE_COVER_URL,
    maxLogs: 80,
  });

  const rawPath = useMemo(() => {
    const m = routeDoc || initialRoute || {};
    return m?.path || m?.routePath || m?.polyline || m?.points || m?.raw?.path || m?.raw?.polyline || [];
  }, [routeDoc, initialRoute]);

  const { pts: pathPts } = useMemo(() => normalizePathForPreview(rawPath), [rawPath]);

  const { stops: stopsForPreview } = useMemo(() => normalizeStopsForPreview(stops || []), [stops]);

  const { questState, startQuest, stopQuest, finishQuest, questLocLine, ghostMetrics } = useRouteDetailQuest({
    routeId,
    enabled: V3_ENABLED,
    path: pathPts,
    stops: stopsForPreview || [],
  });

  const questUi = useMemo(() => {
    if (!V3_ENABLED) return null;

    const hasPath = Array.isArray(pathPts) && pathPts.length >= 2;
    const hasStops = Array.isArray(stopsForPreview) && stopsForPreview.length >= 1;

    const total = Number(ghostMetrics?.totalCheckpoints) || (hasStops ? stopsForPreview.length : 0);
    const visitedCount = Number(ghostMetrics?.visitedCount) || 0;

    const completion =
      typeof ghostMetrics?.completion === "number" && Number.isFinite(ghostMetrics.completion) ? ghostMetrics.completion : 0;

    const pct = Math.max(0, Math.min(1, completion));
    const pctText = Math.round(pct * 100);

    const dist = ghostMetrics?.distanceToRouteM;
    const distText = typeof dist === "number" && Number.isFinite(dist) ? `${Math.round(dist)}m` : "—";

    const offRoute = !!ghostMetrics?.offRoute;
    const canFinish = !!ghostMetrics?.canFinish;

    const isAuthed = !!String(authUid || "").trim();

    let disabledReason = "";
    if (!hasPath) disabledReason = "Bu rotada iz bulunamadı.";
    else if (!hasStops) disabledReason = "Bu rotada checkpoint bulunamadı.";

    const startDisabled = questState !== "idle" || !!disabledReason;
    const finishDisabled = !canFinish || !isAuthed;

    const statusKey = questState === "active" ? "active" : "idle";
    const statusText = questState === "active" ? "Aktif" : "Hazır";

    return (
      <div className="route-detail-quest" data-status={statusKey}>
        <div className="route-detail-quest-top">
          <div className="route-detail-quest-left">
            <div className="route-detail-quest-title">Ghost Mode</div>
            <div className="route-detail-quest-sub">Rotayı takip et, %85 tamamla, ödülü al.</div>
          </div>
          <div className={`route-detail-quest-badge ${questState === "active" ? "is-active" : ""}`}>{statusText}</div>
        </div>

        {questLocLine ? (
          <div className={`route-detail-quest-line ${offRoute ? "is-warn" : ""}`}>{questLocLine}</div>
        ) : disabledReason ? (
          <div className="route-detail-quest-line is-muted">{disabledReason}</div>
        ) : (
          <div className="route-detail-quest-line is-muted">Konum hazır olunca başlat.</div>
        )}

        <div className="route-detail-quest-metrics">
          <span className={`route-detail-quest-pill ${offRoute ? "route-detail-quest-pill--warn" : ""}`}>Sapma: {distText}</span>
          <span className="route-detail-quest-pill">
            Checkpoint: {visitedCount}/{total || "—"}
          </span>
          <span className="route-detail-quest-pill">%{pctText}</span>
        </div>

        <div className="route-detail-quest-progress">
          <div className="route-detail-quest-progressTrack" aria-hidden="true">
            <div className="route-detail-quest-progressFill" style={{ width: `${pctText}%` }} />
          </div>
          <div className="route-detail-quest-progressPct">%{pctText}</div>
        </div>

        {questState === "idle" ? (
          <button type="button" className="route-detail-quest-primary" onClick={startQuest} disabled={startDisabled}>
            Quest’i başlat
          </button>
        ) : (
          <>
            <button
              type="button"
              className="route-detail-quest-primary"
              onClick={finishQuest}
              disabled={finishDisabled}
              title={!isAuthed ? "Ödül için giriş yapmalısın." : !canFinish ? "Bitirmek için en az %85 tamamla." : ""}
            >
              Bitir ve ödülü al
            </button>

            {!isAuthed && <div className="route-detail-quest-hint">Ödül için giriş yapmalısın.</div>}

            <button type="button" className="route-detail-quest-stop" onClick={stopQuest}>
              Durdur
            </button>
          </>
        )}
      </div>
    );
  }, [V3_ENABLED, pathPts, stopsForPreview, ghostMetrics, questState, questLocLine, startQuest, stopQuest, finishQuest, authUid]);

  const {
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
  } = useRouteDetailMedia({ routeId, routeDoc, stops, tab });

  const setRouteBodyEl = useCallback(
    (el) => {
      try {
        routeBodyRef.current = el;
      } catch {}
      try {
        routeBodyRefForAnchors.current = el;
      } catch {}
      try {
        mainBodyRef.current = el;
      } catch {}
      try {
        bodyScrollRef.current = el;
      } catch {}

      try {
        scrollOwnerRef.current = "body";
      } catch {}

      try {
        const st = typeof el?.scrollTop === "number" ? el.scrollTop : 0;
        lastScrollTopRef.current = Math.max(0, Math.round(Number(st) || 0));

        if (RD_SIMPLE_SCROLL) {
          try {
            requestMapResize("body-ref");
          } catch {}
          return;
        }

        scheduleHeroCollapse(st);
        if (st <= HARD_RESET_TOP_PX) {
          hardResetSheetMotor("body-ref");
          try {
            requestMapResize("body-ref");
          } catch {}
          try {
            checkTopHardReset("body-ref");
          } catch {}
        }
      } catch {}
    },
    [routeBodyRef, scheduleHeroCollapse, HARD_RESET_TOP_PX, hardResetSheetMotor, requestMapResize, checkTopHardReset]
  );

  const {
    coverLocal,
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
    isOwner,
  } = useRouteDetailCover({
    routeId,
    routeDoc,
    stops,
    stopsLoaded,
    normalizeMediaType,
    mediaCacheRef,
    bumpMediaTick,
  });

  const [mode, setMode] = useState("view");
  const isEditMode = useMemo(() => !!isOwner && mode === "edit", [isOwner, mode]);
  const modeForTabs = isEditMode ? "edit" : "view";

  useEffect(() => {
    setMode("view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  useEffect(() => {
    if (!isOwner && mode !== "view") setMode("view");
  }, [isOwner, mode]);

  useEffect(() => {
    if (mode !== "view") return;
    if (!coverPickerOpen) return;
    try {
      closeCoverPicker();
    } catch {}
  }, [mode, coverPickerOpen, closeCoverPicker]);

  const [mapsRetryTick, setMapsRetryTick] = useState(0);
  const retryMap = useCallback(() => setMapsRetryTick((x) => x + 1), []);

  const [lightboxItems, setLightboxItems] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const [showShareSheet, setShowShareSheet] = useState(false);
  const [commentsOverlayOpen, setCommentsOverlayOpen] = useState(false);

  const [reportLoaded, setReportLoaded] = useState(false);
  const [routeAgg, setRouteAgg] = useState(null);
  const [stopAgg, setStopAgg] = useState(null);

  const loadReportAgg = useCallback(async () => {
    if (reportLoaded || !routeId) return;
    const [rAgg, sAgg] = await Promise.all([
      getRouteStarsAgg(routeId, 1000).catch(() => null),
      getStopsStarsAgg(routeId, 1000).catch(() => null),
    ]);
    setRouteAgg(rAgg);
    setStopAgg(sAgg);
    setReportLoaded(true);
  }, [reportLoaded, routeId]);

  useEffect(() => {
    if (activeTabKey === "report") loadReportAgg();
  }, [activeTabKey, loadReportAgg]);

  useEffect(() => {
    try {
      setGalleryTabActive(activeTabKey === "gallery");
    } catch {}
  }, [activeTabKey, setGalleryTabActive]);

  useEffect(() => {
    if (!isEditMode) return;
    if (tab === "report") handleTabChange("stops");
    if (commentsOverlayOpen) setCommentsOverlayOpen(false);
  }, [isEditMode, tab, commentsOverlayOpen, handleTabChange]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "Escape") return;

      if (lightboxItems) {
        setLightboxItems(null);
        blockInteractionsBriefly(260);
        return;
      }
      if (coverPickerOpen) {
        try {
          closeCoverPicker();
        } catch {}
        blockInteractionsBriefly(260);
        return;
      }
      if (showShareSheet) {
        setShowShareSheet(false);
        blockInteractionsBriefly(260);
        return;
      }
      if (commentsOverlayOpen) {
        setCommentsOverlayOpen(false);
        blockInteractionsBriefly(260);
        return;
      }

      if (isEditMode) {
        setMode("view");
        blockInteractionsBriefly(240);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    onClose,
    lightboxItems,
    coverPickerOpen,
    closeCoverPicker,
    isEditMode,
    showShareSheet,
    commentsOverlayOpen,
    blockInteractionsBriefly,
  ]);

  const heroModel = useRDHeroModel({
    routeModel,
    owner,
    lockedOwnerDoc,
    stopsForPreview,
    ownerId: ownerIdForProfile,
  });

  const { onShare, onExportGpx, canRateRoute, onRouteRate, onStopRate, isFav, onToggleFav, canToggleFav } =
    useRDActions({
      routeId,
      routeDoc,
      initialRoute,
      source,
      ownerFromLink,
      stopsForPreview,
      pathPts,
    });

  const coverUi = useMemo(
    () =>
      resolveCoverForUi({
        coverLocal,
        routeModel,
        isDefaultCoverUrl,
        normalizeMediaType,
        mediaCacheRef,
        stops,
        coverUpload,
      }),
    [coverLocal, routeModel, isDefaultCoverUrl, normalizeMediaType, mediaCacheRef, stops, coverUpload]
  );

  const handleBackdropClick = useCallback(() => onClose(), [onClose]);

  const showCoverPickerOverlay = !!(isEditMode && coverPickerOpen);
  const overlayOpen = !!(lightboxItems || showShareSheet || showCoverPickerOverlay || commentsOverlayOpen);
  const canInteract = !overlayOpen && !interactionBlocked;

  const [heroMenuOpen, setHeroMenuOpen] = useState(false);
  const closeHeroMenu = useCallback(() => setHeroMenuOpen(false), []);
  const toggleHeroMenu = useCallback((e) => {
    e?.stopPropagation?.();
    setHeroMenuOpen((x) => !x);
  }, []);

  useEffect(() => {
    setHeroMenuOpen(false);
  }, [rdTheme]);

  useEffect(() => {
    if (!isEditMode) return;
    if (showShareSheet) setShowShareSheet(false);
    if (commentsOverlayOpen) setCommentsOverlayOpen(false);
  }, [isEditMode, showShareSheet, commentsOverlayOpen]);

  const requestOpenProfile = useCallback(
    (e) => {
      e?.stopPropagation?.();
      const uid = ownerIdForProfile || routeDoc?.ownerId || routeModel?.ownerId || null;
      if (!uid) return;
      try {
        const ev = new CustomEvent("mylasa:openProfile", { detail: { uid }, bubbles: true });
        window.dispatchEvent(ev);
      } catch {}
    },
    [ownerIdForProfile, routeDoc, routeModel]
  );

  const shareRoutePayload = useMemo(() => {
    return buildShareRoutePayload(
      { ...(routeDoc || initialRoute || {}), cover: { kind: coverUi.coverKindUi, url: coverUi.coverResolved } },
      owner,
      routeId
    );
  }, [routeDoc, initialRoute, coverUi.coverKindUi, coverUi.coverResolved, owner, routeId]);

  if (!routeId)
    return withPortal(<RouteDetailAccessSheet kind="not-found" followInitially={followInitially} onClose={onClose} />);

  if (permError === "forbidden")
    return withPortal(
      <RouteDetailAccessSheet
        kind="forbidden"
        followInitially={followInitially}
        onClose={onClose}
        onRetry={retryPermCheck}
        ownerIdForProfile={ownerIdForProfile}
        ownerPreview={lockedOwnerDoc || owner}
      />
    );

  if (permError === "private")
    return withPortal(
      <RouteDetailAccessSheet
        kind="private"
        followInitially={followInitially}
        onClose={onClose}
        onRetry={retryPermCheck}
        ownerIdForProfile={ownerIdForProfile}
        ownerPreview={lockedOwnerDoc || owner}
      />
    );

  if (permError === "not-found")
    return withPortal(<RouteDetailAccessSheet kind="not-found" followInitially={followInitially} onClose={onClose} />);

  if (!routeDoc && initialRoute)
    return withPortal(
      <RouteDetailPrefillSheet
        title={heroModel.title}
        audienceKey={heroModel.audienceKey}
        audienceLabel={heroModel.audienceLabel}
        ratingAvgLabel={heroModel.ratingAvgLabel}
        metaLine={heroModel.metaLine}
        onClose={onClose}
      />
    );

  if (!routeDoc)
    return withPortal(
      <RouteDetailPrefillSheet
        title="Yükleniyor…"
        audienceKey={heroModel.audienceKey}
        audienceLabel={heroModel.audienceLabel}
        ratingAvgLabel={heroModel.ratingAvgLabel}
        metaLine={heroModel.metaLine}
        onClose={onClose}
      />
    );

  const content = (
    <div
      className={`route-detail-backdrop ${rdTheme === "light" ? "route-detail-light" : "route-detail-dark"}${
        overlayOpen ? " rd-overlay-open" : ""
      }`}
      data-theme={rdTheme}
      data-theme-source={rdThemeSource}
      data-theme-anim={themeAnimOn ? "1" : "0"}
      data-simple-scroll={RD_SIMPLE_SCROLL ? "1" : "0"}
      data-route-skin="manus"
      // ✅ Simple scroll modda overlap padding’i kapat
      style={
        RD_SIMPLE_SCROLL
          ? {
              "--rd-hero-hub-overlap": "0px",
            }
          : undefined
      }
      onClick={handleBackdropClick}
    >
      <div className="route-detail-sheet" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        {/* ✅ Simple scroll: grab bar yok */}
        {!RD_SIMPLE_SCROLL && <div className="route-detail-grab" />}

        <div
          className="route-detail-body"
          ref={setRouteBodyEl}
          style={{
            "--rd-sticky-tabs-h": `${tabsBarH}px`,
            overflowAnchor: "none",
            overscrollBehavior: "contain",
          }}
          onScroll={handleBodyScroll}
          // ✅ Simple scroll: snapEnd handler yok
          onPointerUp={RD_SIMPLE_SCROLL ? undefined : handleSnapEnd}
          onTouchEnd={RD_SIMPLE_SCROLL ? undefined : handleSnapEnd}
          onTouchCancel={RD_SIMPLE_SCROLL ? undefined : handleSnapEnd}
        >
          {/* ✅✅✅ EMİR 31 / PARÇA 1 — HERO artık scroller içinde (natural flow) */}
          <div style={{ overflowAnchor: "none" }}>
            <RouteDetailHeroMobile
              coverResolved={coverUi.coverResolved}
              handleImgLoadProof={handleImgLoadProof}
              handleImgErrorToDefault={handleImgErrorToDefault}
              heroMenuOpen={heroMenuOpen}
              toggleHeroMenu={toggleHeroMenu}
              closeHeroMenu={closeHeroMenu}
              enterEdit={() => {
                if (!isOwner) return;
                try {
                  setMode("edit");
                } catch {}
              }}
              exitEdit={() => {
                try {
                  setMode("view");
                } catch {}
                try {
                  blockInteractionsBriefly(240);
                } catch {}
              }}
              isOwner={!!isOwner}
              isEditMode={isEditMode}
              onClose={onClose}
              onShare={onShare}
              onExportGpx={onExportGpx}
              onToggleTheme={onToggleTheme}
              onOpenReport={() => handleTabChange("report")}
              onOpenShareSheet={() => setShowShareSheet(true)}
              rdTheme={rdTheme}
              heroCategory={heroModel.heroCategory}
              heroTitle={heroModel.heroTitle}
              heroStarsModel={heroModel.heroStarsModel}
              heroRatingBadgeText={heroModel.heroExplorerLabel || "(0 Kaşif)"}
              heroAvgRating={heroModel.heroRatingInfo?.avg}
              ownerName={heroModel.ownerName}
              ownerAvatarUrl={heroModel.ownerAvatarUrl}
              timeAgoLine={heroModel.timeAgoLine}
              ownerState={heroModel.ownerState}
              isFav={isFav}
              onToggleFav={onToggleFav}
              canToggleFav={canToggleFav}
              requestOpenProfile={requestOpenProfile}
            />
          </div>

          <RouteDetailStickyTabsFallback
            activeTab={activeTabKey}
            onTabChange={(key) => {
              handleTabChange(key);
              try {
                blockInteractionsBriefly(120);
              } catch {}
            }}
            canInteract={canInteract}
            tabsBarRef={tabsBarRef}
            routeDescText={heroModel.routeDescText}
            rdTheme={rdTheme}
            commentsCount={commentsCount}
            galleryCount={Array.isArray(galleryItems) ? galleryItems.length : 0}
          />

          {/* ✅ EMİR 03 (Adım 4): Map host wrapper (RO/IO/VV repaint) */}
          <div ref={mapCardHostRef} data-rd-map-host="1" style={{ overflowAnchor: "none" }}>
            <RouteDetailMapCardMobile
              routeId={routeId}
              mapsRetryTick={mapsRetryTick}
              retryMap={retryMap}
              pathPts={pathPts}
              stopsForPreview={stopsForPreview || []}
              stopsLoaded={stopsLoaded}
              mapBadgeCount={heroModel.mapBadgeCount}
              mapAreaLabel={heroModel.mapAreaLabel}
              scrollRootRef={bodyScrollRef}
            />
          </div>

          {questUi}

          {isEditMode && (
            <RouteDetailCoverRow
              coverResolved={coverUi.coverResolved}
              coverIsPlaceholder={coverUi.coverIsPlaceholder}
              isOwner={true}
              coverPickBtnLabel={coverUi.coverPickBtnLabel}
              coverStatusText={coverUi.coverStatusText}
              coverUpload={coverUpload}
              coverKindUi={coverUi.coverKindUi}
              onOpenPicker={openCoverPicker}
              onClearCover={(e) => {
                e?.stopPropagation?.();
                if (!isOwner) return;
                try {
                  clearCover();
                } catch {}
              }}
              onImgLoad={(e) => handleImgLoadProof(e, { scope: "cover_thumb" })}
              onImgError={(e) => handleImgErrorToDefault(e, { scope: "cover_thumb" })}
            />
          )}

          {!isEditMode && <RouteDetailRateRow canRateRoute={canRateRoute} onRouteRate={onRouteRate} />}

          <RouteDetailSectionsMobile
            stopsSectionRef={stopsSectionRef}
            gallerySectionRef={gallerySectionRef}
            commentsSectionRef={commentsSectionRef}
            gpxSectionRef={gpxSectionRef}
            reportSectionRef={reportSectionRef}
            tab={activeTabKey}
            isEditMode={isEditMode}
            canInteract={canInteract}
            modeForTabs={modeForTabs}
            isOwner={!!isOwner}
            stops={stops}
            stopsLoaded={stopsLoaded}
            commentsCount={commentsCount}
            stopAgg={stopAgg}
            uploadState={uploadState}
            mediaCacheRef={mediaCacheRef}
            ensureStopThumbs={ensureStopThumbs}
            cancelUpload={cancelUpload}
            onPickMedia={onPickMedia}
            normalizeMediaType={normalizeMediaType}
            buildLightboxItems={buildLightboxItems}
            openLightbox={(items, idx) => {
              setLightboxItems(items);
              setLightboxIndex(idx);
            }}
            onImgError={handleImgErrorToDefault}
            onStopRate={onStopRate}
            galleryItems={galleryItems}
            galleryState={galleryState}
            gallerySentinelRef={gallerySentinelRef}
            onOpenCommentsOverlay={() => {
              if (!canInteract) return;
              if (isEditMode) return;
              setCommentsOverlayOpen(true);
            }}
            onExportGpx={onExportGpx}
            reportLoaded={reportLoaded}
            routeAgg={routeAgg}
            stopAggForReport={stopAgg}
            distanceText={heroModel.distanceText}
            durationText={heroModel.durationText}
            stopsText={heroModel.stopsText}
            avgSpeedText={heroModel.avgSpeedText}
          />
        </div>

        {isEditMode && (
          <div className="route-detail-footer">
            <button
              type="button"
              className="route-detail-close-btn"
              onClick={() => {
                try {
                  setMode("view");
                } catch {}
                try {
                  blockInteractionsBriefly(240);
                } catch {}
              }}
            >
              Düzenlemeyi bitir
            </button>
          </div>
        )}
      </div>

      <RouteDetailOverlaysMobile
        isEditMode={isEditMode}
        blockInteractionsBriefly={blockInteractionsBriefly}
        showShareSheet={showShareSheet}
        setShowShareSheet={setShowShareSheet}
        shareRoutePayload={shareRoutePayload}
        shareStops={stops}
        showCoverPickerOverlay={showCoverPickerOverlay}
        coverPickerMode={coverPickerMode}
        coverPickerState={coverPickerState}
        coverUpload={coverUpload}
        closeCoverPicker={closeCoverPicker}
        backToCoverPickerMenu={backToCoverPickerMenu}
        chooseCoverFromStops={chooseCoverFromStops}
        uploadCoverFromDevice={uploadCoverFromDevice}
        pickCover={pickCover}
        onImgLoadProof={handleImgLoadProof}
        onImgErrorToDefault={handleImgErrorToDefault}
        commentsOverlayOpen={commentsOverlayOpen}
        setCommentsOverlayOpen={setCommentsOverlayOpen}
        routeId={routeId}
        commentsPortalEl={commentsPortalEl}
        setCommentsPortalEl={setCommentsPortalEl}
        lightboxItems={lightboxItems}
        lightboxIndex={lightboxIndex}
        setLightboxItems={setLightboxItems}
        lightboxPortalEl={lightboxPortalEl}
        setLightboxPortalEl={setLightboxPortalEl}
      />
    </div>
  );

  return withPortal(content);
}