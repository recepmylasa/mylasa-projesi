// FILE: src/pages/RouteDetailMobile/hooks/useRDAnchors.js
import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * ✅ Sprint 1 / EMİR A (P0)
 * Amaç: Tab = "tek içerik" mantığına geçerken
 * - otomatik anchor scroll'u KAPAT
 * - scroll-spy KAPAT (aktif section tab ile aynı olsun)
 * Çünkü:
 * - anchor scroll + sticky height + hero collapse birlikte layout'ı kaydırıyor,
 *   map yarım/alta gömülme ve "timeline" hissi üretiyor.
 *
 * Not: Tek içerik kuralı RouteDetailSectionsMobile.js içinde uygulanacak.
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

  // ✅ Artık aktifSection = tab (scroll-spy yok)
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

  // ✅ Scroll element getter (şimdilik kullanılmıyor ama ileride gerekebilir)
  const getScrollEl = useCallback(() => {
    try {
      return routeBodyRef?.current || document.querySelector(".route-detail-body");
    } catch {
      return null;
    }
  }, [routeBodyRef]);

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

  const onTabChange = useCallback(
    (nextTab) => {
      const safe = TAB_KEYS.includes(nextTab) ? nextTab : "stops";

      setTab(safe);
      setActiveSection(safe === "report" ? "report" : safe);

      // URL sync
      writeTabToUrl(safe);

      // ✅ ÖNEMLİ: Artık burada scrollToSection YOK.
      // Tek içerik kuralı geldiğinde scroll zaten "0" olacak (RouteDetailMobile handleTabChange).
    },
    [TAB_KEYS, writeTabToUrl]
  );

  // Route change: tab sanitize + url sync (scroll yok)
  useEffect(() => {
    if (!routeId) return;

    const wanted = readTabFromUrl();
    const safe = TAB_KEYS.includes(wanted) ? wanted : "stops";

    setTab(safe);
    setActiveSection(safe === "report" ? "report" : safe);
    writeTabToUrl(safe);

    // ✅ scroll-spy yok, scheduleScroll yok
    // routeBodyRef/current reset gibi işler RouteDetailMobile tarafında yapılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, readTabFromUrl, TAB_KEYS]);

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
    // getScrollEl şimdilik dışarı açmıyoruz (gerekmiyor)
  };
}
