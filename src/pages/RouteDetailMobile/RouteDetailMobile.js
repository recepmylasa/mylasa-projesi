// FILE: src/pages/RouteDetailMobile/RouteDetailMobile.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./RouteDetailMobile.css";
import "./RouteDetailMobileVitreous.css";

// ✅ Tabs/Pills stilleri (yoksa bar görünmeyebilir)
import "./styles/rd.sectionTabs.css";

// ✅ MAP CARD base styles
import "./styles/rd.map.css";

// ✅ hero/yazar stilleri (base)
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

  return (
    <div
      ref={tabsBarRef}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 90, // ✅ üstte kesin dursun (map/hero altında kalmasın)
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

  // ✅ EMİR — HARD RESET px eşiği
  const HARD_RESET_TOP_PX = 2;

  // ✅ EMİR — “Clamp & Reset” mandalı (spam kırıcı)
  const hardFixRef = React.useRef({
    lastAtTop: true,
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

  // ✅ EMİR — inline transform “temizleyici”
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

  // ✅ EMİR — HARD RESET: scrollTop=0 iken offset/transform “zorla 0”
  const hardResetSheetMotor = useCallback(
    (reason = "") => {
      const sheetEl = sheetRef.current;
      if (!sheetEl) return;

      const bodyEl =
        mainBodyRef.current ||
        sheetEl.querySelector?.(".route-detail-body") ||
        sheetEl.querySelector?.(".content-body");

      const st = typeof bodyEl?.scrollTop === "number" ? bodyEl.scrollTop : 0;
      if (st > HARD_RESET_TOP_PX) return;

      const backdropEl = sheetEl.closest?.(".route-detail-backdrop") || null;

      stripInlineTransform(backdropEl);
      stripInlineTransform(sheetEl);
      stripInlineTransform(bodyEl);
      stripInlineTransform(sheetEl.parentElement);

      try {
        scheduleHeroCollapse(0);
      } catch {}

      // ✅ EMİR 03 (Adım 4): top reset anında map repaint (yarım kalma kırıcı)
      try {
        requestMapResize(`hardreset:${reason || "top"}`);
      } catch {}

      try {
        backdropEl?.setAttribute("data-rd-hardfix-top", "1");
        if (process.env.NODE_ENV !== "production" && reason) {
          // eslint-disable-next-line no-console
          console.debug(`[RD HARD-FIX] reset @top (${reason})`);
        }
      } catch {}
    },
    [HARD_RESET_TOP_PX, scheduleHeroCollapse, stripInlineTransform, requestMapResize]
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
      const sheetEl = pick(".route-detail-sheet") || sheetRef.current;
      const bodyEl = pick(".route-detail-body") || mainBodyRef.current;

      // ✅ sadece inline: sheet/body
      const changedSheet = stripInlineTransformOnly(sheetEl);
      const changedBody = stripInlineTransformOnly(bodyEl);

      // ✅ 2x RAF reflow
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

            // ✅ Map varsa: custom event
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

    // ✅ cleanup düzgün olsun (aynı fn ref)
    const evtHandlers = {};
    evtTypes.forEach((t) => {
      try {
        const fn = () => markEvt(t);
        evtHandlers[t] = fn;
        rootEl.addEventListener(t, fn, evtOpts);
      } catch {}
    });

    // Scroll otoritesi: aynı anda hem sheet hem body scroll mu?
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
      const key = `${src}|s:${sst}|b:${bst}`;
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

    // Transform avcısı: inline style değişince gerçek hedef node’u yakala
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

    // ✅ EMİR 03 (V2) — DEV ONLY: Layout dump + Repair now (debug helper)
    const pick = (sel) => {
      try {
        return rootEl.querySelector(sel);
      } catch {
        return null;
      }
    };

    const rectOf = (el) => {
      if (!el) return null;
      try {
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
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
          translate: cs.translate,
          top: cs.top,
          bottom: cs.bottom,
          left: cs.left,
          right: cs.right,
          height: cs.height,
          minHeight: cs.minHeight,
          maxHeight: cs.maxHeight,
          overflow: cs.overflow,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          contain: cs.contain,
          willChange: cs.willChange,
          clipPath: cs.clipPath || cs.webkitClipPath,
          borderRadius: cs.borderRadius,
        };
      } catch {
        return null;
      }
    };

    const nodeDump = (name, el) => {
      if (!el) return { name, ok: false };
      const st = typeof el.scrollTop === "number" ? Math.round(el.scrollTop) : null;
      return {
        name,
        ok: true,
        label: getLabel(el),
        rect: rectOf(el),
        style: styleOf(el),
        scrollTop: st,
        data: extractDataAttrs(el),
      };
    };

    const dumpLayout = (label = "dump") => {
      const backdrop = rootEl;
      const sheet = pick(".route-detail-sheet");
      const body = pick(".route-detail-body");
      const hero = pick(".route-detail-hero") || pick("[data-hero-collapsed] .route-detail-hero");
      const mapCard = pick(".rd-map-card") || pick("[data-rd-map-card='1']");
      const mapCanvas = mapCard ? mapCard.querySelector(".rd-map-card__canvas") : null;
      const gmStyle = mapCard ? mapCard.querySelector(".gm-style") : null;

      const vv = (() => {
        try {
          const v = window.visualViewport;
          if (!v) return null;
          return {
            width: Math.round(v.width),
            height: Math.round(v.height),
            scale: Number(v.scale) || 1,
            offsetTop: Math.round(v.offsetTop || 0),
            offsetLeft: Math.round(v.offsetLeft || 0),
          };
        } catch {
          return null;
        }
      })();

      const out = {
        ts: Date.now(),
        label: String(label || ""),
        routeId: routeId || null,
        viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
        visualViewport: vv,
        atTopHint: (() => {
          try {
            const bst = typeof body?.scrollTop === "number" ? body.scrollTop : 0;
            return bst <= HARD_RESET_TOP_PX;
          } catch {
            return null;
          }
        })(),
        nodes: {
          backdrop: nodeDump("backdrop", backdrop),
          sheet: nodeDump("sheet", sheet),
          hero: nodeDump("hero", hero),
          body: nodeDump("body", body),
          mapCard: nodeDump("mapCard", mapCard),
          mapCanvas: nodeDump("mapCanvas", mapCanvas),
          gmStyle: nodeDump("gmStyle", gmStyle),
        },
      };

      try {
        // eslint-disable-next-line no-console
        console.groupCollapsed(`[RD_DEBUG][LAYOUT_DUMP] ${out.label} @${new Date(out.ts).toLocaleTimeString()}`);
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

    const repairNow = async (label = "repair") => {
      const sheet = pick(".route-detail-sheet") || sheetEl;
      const body = pick(".route-detail-body") || bodyEl;
      const backdrop = rootEl;

      try {
        // eslint-disable-next-line no-console
        console.groupCollapsed(`[RD_DEBUG][REPAIR_NOW] ${String(label || "")}`);
      } catch {}

      // 1) Inline transform/translate temizle
      try {
        stripInlineTransform(backdrop);
      } catch {}
      try {
        stripInlineTransform(sheet);
      } catch {}
      try {
        stripInlineTransform(body);
      } catch {}
      try {
        stripInlineTransform(sheet?.parentElement);
      } catch {}

      // 2) Clip/contain “takıldıysa” DEV-ONLY gevşet (inline ile)
      try {
        if (sheet) {
          sheet.style.clipPath = "none";
          sheet.style.webkitClipPath = "none";
          sheet.style.contain = "none";
          sheet.style.willChange = "auto";
        }
      } catch {}
      try {
        if (body) {
          body.style.contain = "none";
          body.style.willChange = "auto";
        }
      } catch {}

      // 3) 2x RAF + reflow
      const raf = (fn) =>
        new Promise((res) => {
          try {
            window.requestAnimationFrame(() => {
              try {
                fn?.();
              } catch {}
              res();
            });
          } catch {
            try {
              fn?.();
            } catch {}
            res();
          }
        });

      await raf(() => {
        try {
          // force reflow
          void sheet?.offsetHeight;
          void body?.offsetHeight;
        } catch {}
      });

      await raf(() => {
        try {
          void backdrop?.offsetHeight;
        } catch {}
      });

      // 4) Hero collapse vars “0”a çek (bazen stuck)
      try {
        scheduleHeroCollapse(typeof body?.scrollTop === "number" ? body.scrollTop : 0);
      } catch {}

      // 5) Map resize dene (varsa)
      try {
        if (typeof window.__RD_MAP_FORCE__ === "function") {
          window.__RD_MAP_FORCE__();
        } else if (window.__RD_MAP__ && window.google?.maps?.event?.trigger) {
          try {
            window.google.maps.event.trigger(window.__RD_MAP__, "resize");
          } catch {}
          try {
            const c = window.__RD_MAP__.getCenter?.();
            if (c) window.__RD_MAP__.setCenter(c);
          } catch {}
          try {
            const z = window.__RD_MAP__.getZoom?.();
            if (typeof z === "number") window.__RD_MAP__.setZoom(z);
          } catch {}
        }
      } catch {}

      const after = dumpLayout(`after:${label}`);

      try {
        // eslint-disable-next-line no-console
        console.log("[RD_DEBUG] repairNow complete.", after);
      } catch {}
      try {
        // eslint-disable-next-line no-console
        console.groupEnd();
      } catch {}

      return after;
    };

    try {
      obs.observe(rootEl, {
        subtree: true,
        attributes: true,
        attributeFilter: ["style"],
      });
      // eslint-disable-next-line no-console
      console.log("[RD_DEBUG] Transform Avcısı aktif. (localStorage RD_DEBUG=1)");
    } catch {}

    // ✅ Debug exports (DEV ONLY)
    // Not: asıl istenen komutlar __RD_DUMP__ ve __RD_REPAIR_NOW__ (üstte, dev-only) — burada debug alias’ları var.
    try {
      window.__RD_LAYOUT_DUMP__ = dumpLayout;
      window.__RD_REPAIR_DEBUG__ = repairNow;
      window.__RD_REPAIR_DEBUG = repairNow;
      // eslint-disable-next-line no-console
      console.log("[RD_DEBUG] Debug API: __RD_LAYOUT_DUMP__('bug'), __RD_REPAIR_DEBUG__('bug')");
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

      // ✅ cleanup — debug alias’ları
      try {
        delete window.__RD_LAYOUT_DUMP__;
        delete window.__RD_REPAIR_DEBUG__;
        delete window.__RD_REPAIR_DEBUG;
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RD_DEBUG, routeId]);

  // ✅ EMİR — mount/route değişince: en baştan “temiz” başla
  useEffect(() => {
    let raf = 0;
    raf = window.requestAnimationFrame(() => {
      try {
        hardResetSheetMotor("mount");
      } catch {}
    });
    return () => {
      try {
        if (raf) window.cancelAnimationFrame(raf);
      } catch {}
    };
  }, [routeId, hardResetSheetMotor]);

  // ✅ EMİR — gesture end: top’a döndüyse offset birikimi imkansız
  useEffect(() => {
    const sheetEl = sheetRef.current;
    if (!sheetEl) return;

    const onGestureEnd = () => {
      try {
        hardResetSheetMotor("gesture-end");
      } catch {}
      try {
        requestMapResize("gesture-end");
      } catch {}
    };

    const opts = { passive: true };

    sheetEl.addEventListener("touchend", onGestureEnd, opts);
    sheetEl.addEventListener("touchcancel", onGestureEnd, opts);
    sheetEl.addEventListener("pointerup", onGestureEnd, opts);
    sheetEl.addEventListener("pointercancel", onGestureEnd, opts);
    sheetEl.addEventListener("mouseup", onGestureEnd, opts);

    return () => {
      try {
        sheetEl.removeEventListener("touchend", onGestureEnd, opts);
        sheetEl.removeEventListener("touchcancel", onGestureEnd, opts);
        sheetEl.removeEventListener("pointerup", onGestureEnd, opts);
        sheetEl.removeEventListener("pointercancel", onGestureEnd, opts);
        sheetEl.removeEventListener("mouseup", onGestureEnd, opts);
      } catch {}
    };
  }, [routeId, hardResetSheetMotor, requestMapResize]);

  // ✅ EMİR — scroll handler
  const handleBodyScroll = useCallback(
    (e) => {
      const st = Math.max(0, Math.round(Number(e?.currentTarget?.scrollTop) || 0));
      scheduleHeroCollapse(st);

      const atTop = st <= HARD_RESET_TOP_PX;
      const ref = hardFixRef.current;

      if (atTop) {
        hardResetSheetMotor("scroll@top");
        try {
          requestMapResize("scroll@top");
        } catch {}
      }

      if (ref.lastAtTop !== atTop) {
        ref.lastAtTop = atTop;
        try {
          const backdropEl = sheetRef.current?.closest?.(".route-detail-backdrop");
          if (backdropEl) backdropEl.setAttribute("data-rd-at-top", atTop ? "1" : "0");
        } catch {}
      }
    },
    [HARD_RESET_TOP_PX, hardResetSheetMotor, scheduleHeroCollapse, requestMapResize]
  );

  useEffect(() => {
    scheduleHeroCollapse(0);
    return () => {
      try {
        const r = heroCollapseRef.current;
        if (r?.raf) {
          window.cancelAnimationFrame(r.raf);
          r.raf = 0;
        }
      } catch {}
    };
  }, [routeId, scheduleHeroCollapse]);

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

  // ✅ EMİR — route doc geldikten sonra 1 kez “TOP reset” (deep-link varsa dokunma)
  useEffect(() => {
    if (!routeId) return;
    if (!routeDoc) return;

    const ref = initialTopResetRef.current;
    if (ref.routeId === routeId && ref.done) return;
    ref.routeId = routeId;
    ref.done = true;

    let hasHash = false;
    try {
      hasHash = typeof window !== "undefined" && !!(window.location.hash && window.location.hash.length > 1);
    } catch {}

    const hasExplicitTab = !!(tab && String(tab) !== "stops");
    if (hasHash || hasExplicitTab) return;

    const sheetEl = sheetRef.current;
    const bodyEl =
      mainBodyRef.current ||
      sheetEl?.querySelector?.(".route-detail-body") ||
      sheetEl?.querySelector?.(".content-body") ||
      null;

    if (!bodyEl) return;

    let raf = 0;
    raf = window.requestAnimationFrame(() => {
      try {
        bodyEl.scrollTop = 0;
      } catch {}
      try {
        scheduleHeroCollapse(0);
      } catch {}
      try {
        hardResetSheetMotor("route-ready");
      } catch {}
      try {
        requestMapResize("route-ready");
      } catch {}
    });

    return () => {
      try {
        if (raf) window.cancelAnimationFrame(raf);
      } catch {}
    };
  }, [routeId, routeDoc, tab, scheduleHeroCollapse, hardResetSheetMotor, requestMapResize]);

  const rawPath = useMemo(() => {
    const m = routeDoc || initialRoute || {};
    return m?.path || m?.routePath || m?.polyline || m?.points || m?.raw?.path || m?.raw?.polyline || [];
  }, [routeDoc, initialRoute]);

  const { pts: pathPts, dropped: pathDropped } = useMemo(() => normalizePathForPreview(rawPath), [rawPath]);

  const { stops: stopsForPreview, dropped: stopsDropped } = useMemo(
    () => normalizeStopsForPreview(stops || []),
    [stops]
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!routeId) return;
    if (!routeDoc && !initialRoute) return;

    try {
      const rawLen = Array.isArray(rawPath) ? rawPath.length : 0;
      if (pathDropped > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[RouteDetailMobile] path normalize dropped ${pathDropped}/${rawLen}`, { routeId });
      }
      const totalStops = (stops || []).length;
      if (totalStops > 0 && stopsDropped > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[RouteDetailMobile] stops missing coords ${stopsDropped}/${totalStops}`, { routeId });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, pathDropped, stopsDropped, routeDoc, initialRoute]);

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
      typeof ghostMetrics?.completion === "number" && Number.isFinite(ghostMetrics.completion)
        ? ghostMetrics.completion
        : 0;

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
          <span className={`route-detail-quest-pill ${offRoute ? "route-detail-quest-pill--warn" : ""}`}>
            Sapma: {distText}
          </span>
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
  }, [
    V3_ENABLED,
    pathPts,
    stopsForPreview,
    ghostMetrics,
    questState,
    questLocLine,
    startQuest,
    stopQuest,
    finishQuest,
    authUid,
  ]);

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
        const st = typeof el?.scrollTop === "number" ? el.scrollTop : 0;
        scheduleHeroCollapse(st);
        if (st <= HARD_RESET_TOP_PX) {
          hardResetSheetMotor("body-ref");
          try {
            requestMapResize("body-ref");
          } catch {}
        }
      } catch {}
    },
    [routeBodyRef, scheduleHeroCollapse, HARD_RESET_TOP_PX, hardResetSheetMotor, requestMapResize]
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
      onClick={handleBackdropClick}
    >
      <div className="route-detail-sheet" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        <div className="route-detail-grab" />

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

        <div
          className="route-detail-body"
          ref={setRouteBodyEl}
          style={{
            "--rd-sticky-tabs-h": `${tabsBarH}px`,
            overflowAnchor: "none",
            overscrollBehavior: "contain",
          }}
          onScroll={handleBodyScroll}
        >
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