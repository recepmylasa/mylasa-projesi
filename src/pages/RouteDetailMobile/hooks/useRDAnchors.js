// FILE: src/pages/RouteDetailMobile/hooks/useRDAnchors.js
import React, { useCallback, useEffect, useState } from "react";

export default function useRDAnchors({ routeId, routeBodyRef }) {
  // ✅ URL’den “tab” okuma (EMİR 3: comments/gpx dahil)
  const readTabFromUrl = useCallback(() => {
    if (typeof window === "undefined") return "stops";
    try {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t === "gallery" || t === "report" || t === "comments" || t === "stops" || t === "gpx") return t;
    } catch {}
    return "stops";
  }, []);

  // ✅ tab + URL sync (artık anchor sekmeleri de bu “tab” ile yazıyoruz; scroll-spy URL spam yapmaz)
  const [tab, setTab] = useState(() => readTabFromUrl());
  const onTabChange = useCallback((nextTab) => {
    setTab(nextTab);
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (!nextTab || nextTab === "stops") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {}
  }, []);

  // ✅ EMİR 3 — Anchor sekme state (UI highlight) + ölçüm
  const [activeSection, setActiveSection] = useState(() => {
    const t = readTabFromUrl();
    if (t === "stops" || t === "gallery" || t === "comments" || t === "gpx") return t;
    return "stops";
  });

  const tabsBarRef = React.useRef(null);
  const [tabsBarH, setTabsBarH] = useState(56);

  const stopsSectionRef = React.useRef(null);
  const gallerySectionRef = React.useRef(null);
  const commentsSectionRef = React.useRef(null);
  const gpxSectionRef = React.useRef(null);
  const reportSectionRef = React.useRef(null);

  // ✅ Sticky sekme bar yükseklik ölçümü
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

  // ✅ Scroll helpers
  const getScrollEl = useCallback(() => {
    try {
      return routeBodyRef?.current || document.querySelector(".route-detail-body");
    } catch {
      return null;
    }
  }, [routeBodyRef]);

  const scrollToSection = useCallback(
    (key, opts = { smooth: true }) => {
      const sc = getScrollEl();
      if (!sc) return;

      let target = null;
      if (key === "stops") target = stopsSectionRef.current;
      else if (key === "gallery") target = gallerySectionRef.current;
      else if (key === "comments") target = commentsSectionRef.current;
      else if (key === "gpx") target = gpxSectionRef.current;
      else if (key === "report") target = reportSectionRef.current;

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
          target.scrollIntoView({ behavior: opts?.smooth === false ? "auto" : "smooth", block: "start" });
        } catch {}
      }
    },
    [getScrollEl, tabsBarH]
  );

  // ✅ tab değişince (URL / click) ilgili anchor’a kaydır (scroll-spy URL spam yapmaz)
  const didInitialAnchorRef = React.useRef(false);
  useEffect(() => {
    if (!routeId) return;

    const isAnchor = tab === "stops" || tab === "gallery" || tab === "comments" || tab === "gpx";
    const isReport = tab === "report";
    if (!isAnchor && !isReport) return;

    const smooth = didInitialAnchorRef.current ? true : false;

    const t = window.setTimeout(() => {
      if (isAnchor) {
        setActiveSection(tab);
        scrollToSection(tab, { smooth });
      } else if (isReport) {
        scrollToSection("report", { smooth });
      }
      didInitialAnchorRef.current = true;
    }, 60);

    return () => {
      try {
        window.clearTimeout(t);
      } catch {}
    };
  }, [tab, routeId, scrollToSection]);

  // ✅ Scroll-spy (jitter yok): rAF throttle ile activeSection güncelle
  useEffect(() => {
    const sc = getScrollEl();
    if (!sc) return;

    let raf = 0;

    const pick = () => {
      try {
        const top = (sc.scrollTop || 0) + (tabsBarH || 56) + 18;

        const order = [
          { key: "stops", el: stopsSectionRef.current },
          { key: "gallery", el: gallerySectionRef.current },
          { key: "comments", el: commentsSectionRef.current },
          { key: "gpx", el: gpxSectionRef.current },
        ];

        let cur = "stops";
        for (const it of order) {
          if (!it.el) continue;
          if (it.el.offsetTop <= top) cur = it.key;
        }

        setActiveSection((prev) => (prev === cur ? prev : cur));
      } catch {}
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        pick();
      });
    };

    try {
      sc.addEventListener("scroll", onScroll, { passive: true });
    } catch {}

    pick();

    return () => {
      try {
        sc.removeEventListener("scroll", onScroll);
      } catch {}
      try {
        if (raf) window.cancelAnimationFrame(raf);
      } catch {}
      raf = 0;
    };
  }, [getScrollEl, tabsBarH, routeId]);

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
