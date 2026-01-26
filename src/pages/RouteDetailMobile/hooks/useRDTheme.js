// FILE: src/pages/RouteDetailMobile/hooks/useRDTheme.js
import React, { useCallback, useEffect, useMemo, useState } from "react";

export default function useRDTheme() {
  // =========================
  // ✅ EMİR 4 — Dark/Light Toggle (RouteDetail scope)
  // - Auto(system) vs Manual override ayrımı
  // - Auto modda prefers-color-scheme değişimini canlı takip eder
  // - Manual modda localStorage persist, sistem değişse bile override etmez
  // - prefers-reduced-motion varsa geçiş anim minim/kapalı
  // =========================
  const THEME_KEY = "mylasa_rd_theme";
  const LEGACY_THEME_KEY_1 = "rd_theme";
  const LEGACY_THEME_KEY_2 = "mylasa:rdm_theme";

  const getSystemTheme = () => {
    try {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "dark";
    }
  };

  const readThemeInit = () => {
    // source: "manual" | "legacy" | "system"
    if (typeof window === "undefined") return { theme: "dark", source: "system" };
    try {
      const v = window.localStorage.getItem(THEME_KEY);
      if (v === "light" || v === "dark") return { theme: v, source: "manual" };

      // legacy read (yazmıyoruz → diğer ekranları etkilemesin)
      const legacy1 = window.localStorage.getItem(LEGACY_THEME_KEY_1);
      if (legacy1 === "light" || legacy1 === "dark") return { theme: legacy1, source: "legacy" };

      const legacy2 = window.localStorage.getItem(LEGACY_THEME_KEY_2);
      if (legacy2 === "light" || legacy2 === "dark") return { theme: legacy2, source: "legacy" };

      return { theme: getSystemTheme(), source: "system" };
    } catch {
      return { theme: "dark", source: "system" };
    }
  };

  const [rdTheme, setRdTheme] = useState(() => readThemeInit().theme);
  const [rdThemeSource, setRdThemeSource] = useState(() => readThemeInit().source);

  const prefersReducedMotion = useMemo(() => {
    try {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }, []);

  const [themeAnimOn, setThemeAnimOn] = useState(false);
  const themeAnimTimerRef = React.useRef(null);

  const triggerThemeAnim = useCallback(() => {
    if (prefersReducedMotion) return;
    try {
      if (themeAnimTimerRef.current) window.clearTimeout(themeAnimTimerRef.current);
    } catch {}
    setThemeAnimOn(true);
    themeAnimTimerRef.current = window.setTimeout(() => {
      setThemeAnimOn(false);
      themeAnimTimerRef.current = null;
    }, 220);
  }, [prefersReducedMotion]);

  useEffect(() => {
    return () => {
      try {
        if (themeAnimTimerRef.current) window.clearTimeout(themeAnimTimerRef.current);
      } catch {}
      themeAnimTimerRef.current = null;
    };
  }, []);

  // ✅ Auto(system) mod: OS tema değişimini canlı yakala
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (rdThemeSource !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (matches) => {
      const next = matches ? "dark" : "light";
      setRdTheme((prev) => (prev === next ? prev : next));
      triggerThemeAnim();
    };

    // mount anında sync
    apply(mq.matches);

    const handler = (e) => apply(!!e.matches);

    try {
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", handler);
      else if (typeof mq.addListener === "function") mq.addListener(handler);
    } catch {}

    return () => {
      try {
        if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", handler);
        else if (typeof mq.removeListener === "function") mq.removeListener(handler);
      } catch {}
    };
  }, [rdThemeSource, triggerThemeAnim]);

  // ✅ Manual mod: persist (Auto modda yazma yok → sistem takibi bozulmaz)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (rdThemeSource !== "manual") return;
    try {
      window.localStorage.setItem(THEME_KEY, rdTheme);
    } catch {}
  }, [rdTheme, rdThemeSource]);

  const onToggleTheme = useCallback(() => {
    setRdThemeSource("manual");
    setRdTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {}
      return next;
    });
    triggerThemeAnim();
  }, [triggerThemeAnim]);

  return { rdTheme, rdThemeSource, themeAnimOn, onToggleTheme };
}
