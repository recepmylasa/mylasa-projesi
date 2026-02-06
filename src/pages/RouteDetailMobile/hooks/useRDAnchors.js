// FILE: src/pages/RouteDetailMobile/hooks/useRDAnchors.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * ✅ Sprint / EMİR A (P0)
 * Amaç:
 * - Tabs URL senkronu (tab param)
 * - Tab tıklayınca ilgili section’a "güvenli" scroll (sticky + hero collapse offsetli)
 * - Scroll-spy KAPALI (jitter/loop riskini artırıyordu)
 *
 * Not:
 * - Eğer RouteDetailSectionsMobile tek içerik render ediyorsa, section ref yoksa scroll NO-OP olur.
 * - Eğer tüm section’lar DOM’da ise, tab → section zıplaması çalışır.
 */
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

  const writeTabToUrl = useCallback((safe) => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (safe && safe !== "stops") url.searchParams.set("tab", safe);
      else url.searchParams.delete("tab");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {}
  }, []);

  const [tab, setTab] = useState(() => readTabFromUrl());

  // ✅ scroll-spy yok: activeSection default olarak tab ile aynı tutulur
  const [activeSection, setActiveSection] = useState(() => {
    const t = readTabFromUrl();
    return t === "report" ? "report" : t || "stops";
  });

  // Tabs bar ölçümü
  const tabsBarRef = React.useRef(null);
  const [tabsBarH, setTabsBarH] = useState(56);

  const stopsSectionRef = React.useRef(null);
  const gallerySectionRef = React.useRef(null);
  const commentsSectionRef = React.useRef(null);
  const gpxSectionRef = React.useRef(null);
  const reportSectionRef = React.useRef(null);

  // ✅ Scroll element getter
  const getScrollEl = useCallback(() => {
    try {
      return routeBodyRef?.current || document.querySelector(".route-detail-body");
    } catch {
      return null;
    }
  }, [routeBodyRef]);

  // ✅ Tab → ref map
  const getSectionRefByKey = useCallback(
    (key) => {
      switch (key) {
        case "gallery":
          return gallerySectionRef;
        case "comments":
          return commentsSectionRef;
        case "gpx":
          return gpxSectionRef;
        case "report":
          return reportSectionRef;
        case "stops":
        default:
          return stopsSectionRef;
      }
    },
    [gallerySectionRef, commentsSectionRef, gpxSectionRef, reportSectionRef, stopsSectionRef]
  );

  // Sticky bar height ölç
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

  // ✅ Programmatic scroll guard (loop breaker)
  const scrollJobRef = useRef({ raf: 0, sig: "" });

  const doScrollToTab = useCallback(
    (safe, behavior = "smooth") => {
      const scrollEl = getScrollEl();
      if (!scrollEl) return;

      // "Duraklar" = üst (map + üst bloklar) daha mantıklı
      if (!safe || safe === "stops") {
        try {
          scrollEl.scrollTo({ top: 0, behavior });
        } catch {
          try {
            scrollEl.scrollTop = 0;
          } catch {}
        }
        return;
      }

      const ref = getSectionRefByKey(safe);
      const sectionEl = ref?.current;
      if (!sectionEl) return; // tek içerik modunda normal

      try {
        const scrollRect = scrollEl.getBoundingClientRect();
        const secRect = sectionEl.getBoundingClientRect();

        // hedef: section başı sticky tabs altında görünsün
        const MARGIN = 10;
        let top = scrollEl.scrollTop + (secRect.top - scrollRect.top) - (tabsBarH + MARGIN);

        top = Math.max(0, Math.round(top));

        scrollEl.scrollTo({ top, behavior });
      } catch {}
    },
    [getScrollEl, getSectionRefByKey, tabsBarH]
  );

  const scheduleScrollToTab = useCallback(
    (safe, behavior = "smooth") => {
      const job = scrollJobRef.current;
      try {
        if (job.raf) cancelAnimationFrame(job.raf);
      } catch {}

      const sig = `${safe}:${Date.now()}`;
      job.sig = sig;

      // ✅ iki RAF: state + layout otursun (hero collapse / sticky height)
      job.raf = requestAnimationFrame(() => {
        job.raf = requestAnimationFrame(() => {
          job.raf = 0;
          if (scrollJobRef.current.sig !== sig) return;
          doScrollToTab(safe, behavior);
        });
      });
    },
    [doScrollToTab]
  );

  const onTabChange = useCallback(
    (nextTab) => {
      const safe = TAB_KEYS.includes(nextTab) ? nextTab : "stops";

      setTab(safe);
      setActiveSection(safe === "report" ? "report" : safe);

      // URL sync
      writeTabToUrl(safe);

      // ✅ tab tıklayınca section’a git (tek içerikse ref yok → no-op)
      scheduleScrollToTab(safe, "smooth");
    },
    [TAB_KEYS, writeTabToUrl, scheduleScrollToTab]
  );

  // Route change: tab sanitize + url sync (+ gerekiyorsa initial scroll)
  useEffect(() => {
    if (!routeId) return;

    const wanted = readTabFromUrl();
    const safe = TAB_KEYS.includes(wanted) ? wanted : "stops";

    setTab(safe);
    setActiveSection(safe === "report" ? "report" : safe);
    writeTabToUrl(safe);

    // ✅ URL’de tab varsa (gallery/comments/gpx/report) açılışta da oraya götür
    if (safe && safe !== "stops") {
      scheduleScrollToTab(safe, "auto");
    } else {
      scheduleScrollToTab("stops", "auto");
    }

    return () => {
      try {
        const j = scrollJobRef.current;
        if (j?.raf) cancelAnimationFrame(j.raf);
        j.raf = 0;
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

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
