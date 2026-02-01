// FILE: src/pages/RouteDetailMobile/hooks/useRDAnchors.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function useRDAnchors({ routeId, routeBodyRef }) {
  const TAB_KEYS = useMemo(() => ["stops", "gallery", "comments", "gpx", "report"], []);

  const readTabFromUrl = useCallback(() => {
    if (typeof window === "undefined") return "stops";
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (TAB_KEYS.includes(t)) return t;
    } catch {}
    return "stops";
  }, [TAB_KEYS]);

  const [tab, setTab] = useState(() => readTabFromUrl());
  const [activeSection, setActiveSection] = useState(() => {
    const t = readTabFromUrl();
    return t === "report" ? "report" : t || "stops";
  });

  const activeRef = useRef(activeSection);
  useEffect(() => {
    activeRef.current = activeSection;
  }, [activeSection]);

  const tabsBarRef = React.useRef(null);
  const [tabsBarH, setTabsBarH] = useState(56);

  const stopsSectionRef = React.useRef(null);
  const gallerySectionRef = React.useRef(null);
  const commentsSectionRef = React.useRef(null);
  const gpxSectionRef = React.useRef(null);
  const reportSectionRef = React.useRef(null);

  const getScrollEl = useCallback(() => {
    try {
      return routeBodyRef?.current || document.querySelector(".route-detail-body");
    } catch {
      return null;
    }
  }, [routeBodyRef]);

  // Sticky bar height
  useEffect(() => {
    const el = tabsBarRef.current;
    if (!el) return;

    const measure = () => {
      try {
        const h = Math.round(el.getBoundingClientRect().height) || 56;
        setTabsBarH(h);
      } catch {}
    };

    measure();

    let ro = null;
    try {
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => measure());
        ro.observe(el);
      }
    } catch {}

    return () => {
      try {
        if (ro) ro.disconnect();
      } catch {}
    };
  }, []);

  const getTargetRef = useCallback((key) => {
    if (key === "stops") return stopsSectionRef;
    if (key === "gallery") return gallerySectionRef;
    if (key === "comments") return commentsSectionRef;
    if (key === "gpx") return gpxSectionRef;
    if (key === "report") return reportSectionRef;
    return stopsSectionRef;
  }, []);

  const scrollToSection = useCallback(
    (key, opts = { smooth: true }) => {
      const sc = getScrollEl();
      if (!sc) return;

      const ref = getTargetRef(key);
      const target = ref?.current;
      if (!target) return;

      try {
        const scRect = sc.getBoundingClientRect();
        const tRect = target.getBoundingClientRect();

        const extra = 12;
        const top = tRect.top - scRect.top + sc.scrollTop - (tabsBarH || 56) - extra;

        sc.scrollTo({
          top: Math.max(0, Math.round(top)),
          behavior: opts?.smooth === false ? "auto" : "smooth",
        });
      } catch {
        try {
          target.scrollIntoView({
            behavior: opts?.smooth === false ? "auto" : "smooth",
            block: "start",
          });
        } catch {}
      }
    },
    [getScrollEl, getTargetRef, tabsBarH]
  );

  const writeTabToUrl = useCallback((safe) => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (safe && safe !== "stops") url.searchParams.set("tab", safe);
      else url.searchParams.delete("tab");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {}
  }, []);

  // ✅ NEW: Conditional mount uyumu (tek içerik kuralı)
  // Tab değişince section bazen bir frame sonra mount olur → raf retry ile garanti.
  const scrollJobRef = useRef({ raf: 0, timer: 0 });

  const cancelScrollJob = useCallback(() => {
    try {
      if (scrollJobRef.current.timer) {
        window.clearTimeout(scrollJobRef.current.timer);
        scrollJobRef.current.timer = 0;
      }
    } catch {}
    try {
      if (scrollJobRef.current.raf) {
        window.cancelAnimationFrame(scrollJobRef.current.raf);
        scrollJobRef.current.raf = 0;
      }
    } catch {}
  }, []);

  useEffect(() => {
    return () => cancelScrollJob();
  }, [cancelScrollJob]);

  const scheduleScrollToSection = useCallback(
    (key, opts = { smooth: true }) => {
      if (typeof window === "undefined") return;

      cancelScrollJob();

      const start = Date.now();
      const maxMs = 700; // mount + layout için yeterli
      const maxTries = 24;

      const attempt = (tries) => {
        const sc = getScrollEl();
        const target = getTargetRef(key)?.current;

        if (sc && target) {
          scrollToSection(key, opts);
          return;
        }

        if (tries >= maxTries) return;
        if (Date.now() - start > maxMs) return;

        scrollJobRef.current.raf = window.requestAnimationFrame(() => attempt(tries + 1));
      };

      // önce micro-delay, sonra raf loop
      scrollJobRef.current.timer = window.setTimeout(() => attempt(0), 0);
    },
    [cancelScrollJob, getScrollEl, getTargetRef, scrollToSection]
  );

  const onTabChange = useCallback(
    (nextTab) => {
      const safe = TAB_KEYS.includes(nextTab) ? nextTab : "stops";
      setTab(safe);

      // UI highlight
      setActiveSection(safe === "report" ? "report" : safe);

      writeTabToUrl(safe);

      // ✅ tek içerik kuralı: section mount'u bekleyerek scroll
      scheduleScrollToSection(safe, { smooth: true });
    },
    [TAB_KEYS, writeTabToUrl, scheduleScrollToSection]
  );

  // Route change: tab sanitize + initial scroll
  useEffect(() => {
    if (!routeId) return;

    const wanted = readTabFromUrl();
    const safe = TAB_KEYS.includes(wanted) ? wanted : "stops";

    setTab(safe);
    setActiveSection(safe === "report" ? "report" : safe);
    writeTabToUrl(safe);

    scheduleScrollToSection(safe, { smooth: false });
  }, [routeId, readTabFromUrl, TAB_KEYS, writeTabToUrl, scheduleScrollToSection]);

  // Scroll-spy: aktif section’ı otomatik güncelle (report açık değilken report takip etme)
  const rafRef = useRef(0);
  useEffect(() => {
    const sc = getScrollEl();
    if (!sc) return;

    const keys =
      tab === "report"
        ? ["stops", "gallery", "comments", "gpx", "report"]
        : ["stops", "gallery", "comments", "gpx"];

    const pickActive = () => {
      const scRect = sc.getBoundingClientRect();
      const offset = (tabsBarH || 56) + 16;

      let bestKey = activeRef.current || "stops";
      let bestDist = Number.POSITIVE_INFINITY;

      keys.forEach((k) => {
        const el = getTargetRef(k)?.current;
        if (!el) return;
        const r = el.getBoundingClientRect();

        const visible = r.bottom > scRect.top + offset && r.top < scRect.bottom - 12;
        if (!visible) return;

        const dist = Math.abs(r.top - scRect.top - offset);
        if (dist < bestDist) {
          bestDist = dist;
          bestKey = k;
        }
      });

      if (bestKey && bestKey !== activeRef.current) {
        setActiveSection(bestKey);
      }
    };

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0;
        pickActive();
      });
    };

    sc.addEventListener("scroll", onScroll, { passive: true });
    try {
      pickActive();
    } catch {}

    return () => {
      try {
        sc.removeEventListener("scroll", onScroll);
      } catch {}
      try {
        if (rafRef.current) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      } catch {}
    };
  }, [getScrollEl, getTargetRef, tabsBarH, tab]);

  return {
    tab,
    onTabChange,
    activeSection,
    setActiveSection,
    tabsBarRef,
    tabsBarH,
    stopsSectionRef,
    gallerySectionRef,
    commentsSectionRef,
    gpxSectionRef,
    reportSectionRef,
  };
}
