// FILE: src/routes/RoutesDiscoverHeroManusMobile.js
import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function formatDotThousands(n) {
  const x = Math.max(0, Math.round(Number(n) || 0));
  return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function getReducedMotion() {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function RoutesDiscoverHeroManusMobile({
  routesCount,
  onScrollToGrid,
  onStartRoute,
  startDisabledHint = "",
}) {
  const rootRef = useRef(null);
  const playedRef = useRef(false);
  const rafRef = useRef(0);

  const [reducedMotion, setReducedMotion] = useState(() => getReducedMotion());
  const [revealed, setRevealed] = useState(() => (getReducedMotion() ? true : false));

  const canStart = typeof onStartRoute === "function";

  // Targets (EMİR)
  const targets = useMemo(() => {
    const raw = routesCount;
    const rc = typeof raw === "number" ? raw : Number(raw);

    // ✅ "varsa" = prop verilmiş ve finite
    const hasReal = raw !== undefined && raw !== null && Number.isFinite(rc);

    const activeTarget = hasReal ? Math.max(0, Math.round(rc)) : 2400;
    const activePlus = !hasReal;

    const travelerTarget = 18000;
    const travelerPlus = true;

    const cityTarget = 81;
    const cityPlus = false;

    return {
      active: { n: activeTarget, plus: activePlus },
      traveler: { n: travelerTarget, plus: travelerPlus },
      city: { n: cityTarget, plus: cityPlus },
    };
  }, [routesCount]);

  const [counts, setCounts] = useState(() => {
    // İlk render’da reduce-motion ise final değerleri bas
    if (getReducedMotion()) {
      return {
        active: `${formatDotThousands(targets.active.n)}${targets.active.plus ? "+" : ""}`,
        traveler: `${formatDotThousands(targets.traveler.n)}${targets.traveler.plus ? "+" : ""}`,
        city: `${formatDotThousands(targets.city.n)}${targets.city.plus ? "+" : ""}`,
      };
    }
    return { active: "—", traveler: "—", city: "—" };
  });

  // prefers-reduced-motion listener
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      const rm = !!m.matches;
      setReducedMotion(rm);
      if (rm) {
        setRevealed(true);
        playedRef.current = true;
        setCounts({
          active: `${formatDotThousands(targets.active.n)}${targets.active.plus ? "+" : ""}`,
          traveler: `${formatDotThousands(targets.traveler.n)}${targets.traveler.plus ? "+" : ""}`,
          city: `${formatDotThousands(targets.city.n)}${targets.city.plus ? "+" : ""}`,
        });
      }
    };

    try {
      if (typeof m.addEventListener === "function") m.addEventListener("change", onChange);
      else if (typeof m.addListener === "function") m.addListener(onChange);
    } catch {}

    return () => {
      try {
        if (typeof m.removeEventListener === "function") m.removeEventListener("change", onChange);
        else if (typeof m.removeListener === "function") m.removeListener(onChange);
      } catch {}
    };
  }, [targets]);

  // Count-up starter (1 kez)
  const startCountUp = () => {
    if (playedRef.current) return;
    playedRef.current = true;

    const durA = 980;
    const durB = 920;
    const durC = 760;

    const start = performance?.now ? performance.now() : Date.now();

    const tick = (ts) => {
      const now = ts || (performance?.now ? performance.now() : Date.now());
      const t = Math.max(0, now - start);

      const a = easeOutCubic(t / durA);
      const b = easeOutCubic(t / durB);
      const c = easeOutCubic(t / durC);

      const aVal = Math.round(targets.active.n * a);
      const bVal = Math.round(targets.traveler.n * b);
      const cVal = Math.round(targets.city.n * c);

      setCounts({
        active: `${formatDotThousands(aVal)}${targets.active.plus ? "+" : ""}`,
        traveler: `${formatDotThousands(bVal)}${targets.traveler.plus ? "+" : ""}`,
        city: `${formatDotThousands(cVal)}${targets.city.plus ? "+" : ""}`,
      });

      const done = t >= Math.max(durA, durB, durC);
      if (!done) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // final snap
      setCounts({
        active: `${formatDotThousands(targets.active.n)}${targets.active.plus ? "+" : ""}`,
        traveler: `${formatDotThousands(targets.traveler.n)}${targets.traveler.plus ? "+" : ""}`,
        city: `${formatDotThousands(targets.city.n)}${targets.city.plus ? "+" : ""}`,
      });
      rafRef.current = 0;
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  // IntersectionObserver reveal + count-up
  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true);
      playedRef.current = true;
      setCounts({
        active: `${formatDotThousands(targets.active.n)}${targets.active.plus ? "+" : ""}`,
        traveler: `${formatDotThousands(targets.traveler.n)}${targets.traveler.plus ? "+" : ""}`,
        city: `${formatDotThousands(targets.city.n)}${targets.city.plus ? "+" : ""}`,
      });
      return;
    }

    const el = rootRef.current;
    if (!el) return;

    let io = null;
    try {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries && entries[0];
          if (!e) return;
          if (e.isIntersecting && e.intersectionRatio >= 0.35) {
            setRevealed(true);
            startCountUp();
            try {
              io?.disconnect?.();
            } catch {}
          }
        },
        { threshold: [0, 0.15, 0.35, 0.6, 0.9] }
      );
      io.observe(el);
    } catch {
      // fallback: hemen göster
      setRevealed(true);
      startCountUp();
    }

    return () => {
      try {
        io?.disconnect?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, targets.active.n, targets.active.plus]);

  useEffect(() => {
    return () => {
      try {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } catch {}
      rafRef.current = 0;
    };
  }, []);

  const stats = useMemo(() => {
    return [
      { label: "Aktif rota", value: counts.active },
      { label: "Gezgin", value: counts.traveler },
      { label: "Şehir", value: counts.city },
    ];
  }, [counts]);

  return (
    <section
      ref={rootRef}
      className={`manus-discover-hero${revealed ? " is-revealed" : ""}`}
      data-revealed={revealed ? "1" : "0"}
      aria-label="Keşfet kahraman alanı"
    >
      <div className="manus-discover-hero__bg" aria-hidden="true" />
      <div className="manus-discover-hero__inner">
        <div className="manus-discover-hero__pill manus-shimmerText">YENİ NESİL ROTA SİSTEMİ</div>

        <h1 className="manus-discover-hero__title">
          Şehri keşfet, <span className="manus-discover-hero__titleGrad manus-shimmerText">hikayesini dinle</span>
        </h1>

        <p className="manus-discover-hero__desc">
          Rotaları keşfet, duraklarda hikâyeyi takip et. Ghost Mode ile rotayı tamamla, ödülü al.
        </p>

        <div className="manus-discover-hero__ctas">
          <button
            type="button"
            className="manus-discover-hero__btn manus-discover-hero__btn--primary"
            onClick={canStart ? onStartRoute : undefined}
            disabled={!canStart}
            title={!canStart ? startDisabledHint || "Şimdilik devre dışı." : ""}
          >
            Rotayı başlat
          </button>

          <button
            type="button"
            className="manus-discover-hero__btn manus-discover-hero__btn--ghost"
            onClick={typeof onScrollToGrid === "function" ? onScrollToGrid : undefined}
          >
            Rotaları keşfet
          </button>
        </div>

        <div className="manus-discover-hero__stats" aria-label="Keşfet istatistikleri">
          {stats.map((s) => (
            <div key={s.label} className="manus-discover-hero__stat">
              <div className="manus-discover-hero__statVal">{s.value}</div>
              <div className="manus-discover-hero__statLbl">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}