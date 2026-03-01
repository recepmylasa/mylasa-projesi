// FILE: src/routes/RoutesDiscoverHeroManusMobile.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

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

function getWinFlag(key) {
  try {
    if (typeof window === "undefined") return false;
    return !!window[key];
  } catch {
    return false;
  }
}

function setWinFlag(key, val) {
  try {
    if (typeof window === "undefined") return;
    window[key] = !!val;
  } catch {}
}

const WIN_REVEAL_FLAG = "__MYLASA_DISCOVER_HERO_REVEALED__";
const WIN_COUNT_FLAG = "__MYLASA_DISCOVER_HERO_COUNTED__";

export default function RoutesDiscoverHeroManusMobile({
  routesCount,
  onScrollToGrid,
  onStartRoute,
  startDisabledHint = "",
}) {
  const rootRef = useRef(null);
  const statsRef = useRef(null);

  const revealDoneRef = useRef(false);
  const countDoneRef = useRef(false);
  const rafRef = useRef(0);

  const [reducedMotion, setReducedMotion] = useState(() => getReducedMotion());

  const [revealed, setRevealed] = useState(() => {
    if (getReducedMotion()) return true;
    if (getWinFlag(WIN_REVEAL_FLAG)) return true;
    return false;
  });

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

  const finalCounts = useMemo(() => {
    return {
      active: `${formatDotThousands(targets.active.n)}${targets.active.plus ? "+" : ""}`,
      traveler: `${formatDotThousands(targets.traveler.n)}${targets.traveler.plus ? "+" : ""}`,
      city: `${formatDotThousands(targets.city.n)}${targets.city.plus ? "+" : ""}`,
    };
  }, [targets]);

  const [counts, setCounts] = useState(() => {
    // reduce-motion veya "daha önce sayıldı" ise direkt final
    if (getReducedMotion() || getWinFlag(WIN_COUNT_FLAG)) return finalCounts;
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
        setWinFlag(WIN_REVEAL_FLAG, true);
        setWinFlag(WIN_COUNT_FLAG, true);
        revealDoneRef.current = true;
        countDoneRef.current = true;

        setRevealed(true);
        setCounts(finalCounts);
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
  }, [finalCounts]);

  // targets değişirse: reduce-motion veya countDone ise final’e güncelle
  useEffect(() => {
    if (reducedMotion || getWinFlag(WIN_COUNT_FLAG) || countDoneRef.current) {
      setCounts(finalCounts);
    }
  }, [finalCounts, reducedMotion]);

  const applyRevealClasses = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    try {
      const nodes = root.querySelectorAll("[data-reveal]");
      nodes.forEach((n) => {
        try {
          n.classList.add("is-visible");
        } catch {}
      });
    } catch {}
  }, []);

  const startCountUp = useCallback(() => {
    if (countDoneRef.current || getWinFlag(WIN_COUNT_FLAG)) return;
    countDoneRef.current = true;
    setWinFlag(WIN_COUNT_FLAG, true);

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
      setCounts(finalCounts);
      rafRef.current = 0;
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [finalCounts, targets]);

  // Reveal (IntersectionObserver) — 1 kere, spam yok
  useEffect(() => {
    // reduce-motion ise direkt visible
    if (reducedMotion) {
      setWinFlag(WIN_REVEAL_FLAG, true);
      revealDoneRef.current = true;

      setRevealed(true);
      applyRevealClasses();
      return;
    }

    // daha önce reveal olduysa direkt görünür
    if (getWinFlag(WIN_REVEAL_FLAG)) {
      revealDoneRef.current = true;
      setRevealed(true);
      applyRevealClasses();
      return;
    }

    const root = rootRef.current;
    if (!root) return;

    let io = null;
    try {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries && entries[0];
          if (!e) return;

          if (e.isIntersecting && e.intersectionRatio >= 0.25) {
            if (revealDoneRef.current) return;
            revealDoneRef.current = true;
            setWinFlag(WIN_REVEAL_FLAG, true);

            setRevealed(true);
            applyRevealClasses();

            try {
              io?.disconnect?.();
            } catch {}
          }
        },
        {
          threshold: 0.25,
          rootMargin: "0px 0px -10% 0px",
        }
      );
      io.observe(root);
    } catch {
      // fallback: hemen göster
      revealDoneRef.current = true;
      setWinFlag(WIN_REVEAL_FLAG, true);
      setRevealed(true);
      applyRevealClasses();
    }

    return () => {
      try {
        io?.disconnect?.();
      } catch {}
    };
  }, [applyRevealClasses, reducedMotion]);

  // Count-up observer — stat satırı görünür olunca başla, 1 kere
  useEffect(() => {
    if (reducedMotion) return;
    if (getWinFlag(WIN_COUNT_FLAG) || countDoneRef.current) return;

    const el = statsRef.current;
    if (!el) return;

    let io = null;
    try {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries && entries[0];
          if (!e) return;
          if (e.isIntersecting && e.intersectionRatio >= 0.35) {
            startCountUp();
            try {
              io?.disconnect?.();
            } catch {}
          }
        },
        {
          threshold: 0.35,
          rootMargin: "0px 0px -10% 0px",
        }
      );
      io.observe(el);
    } catch {
      startCountUp();
    }

    return () => {
      try {
        io?.disconnect?.();
      } catch {}
    };
  }, [reducedMotion, startCountUp]);

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
      aria-label="Keşfet kahraman alanı"
    >
      <div className="manus-discover-hero__bg" aria-hidden="true" />

      <div className="manus-discover-hero__inner">
        <div className="manus-discover-hero__layout">
          {/* LEFT */}
          <div className="manus-discover-hero__left">
            <div className="manus-discover-hero__pill manus-shimmerText mylasa-reveal" data-reveal="pill">
              YENİ NESİL ROTA SİSTEMİ
            </div>

            <h1 className="manus-discover-hero__title mylasa-reveal" data-reveal="title">
              Şehri keşfet,{" "}
              <span className="manus-discover-hero__titleGrad manus-shimmerText">hikayesini dinle</span>
            </h1>

            <p className="manus-discover-hero__desc mylasa-reveal" data-reveal="desc">
              Rotaları keşfet, duraklarda hikâyeyi takip et. Ghost Mode ile rotayı tamamla, ödülü al.
            </p>

            <div className="manus-discover-hero__ctas mylasa-reveal" data-reveal="cta">
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

            <div
              ref={statsRef}
              className="manus-discover-hero__stats mylasa-reveal"
              data-reveal="stats"
              aria-label="Keşfet istatistikleri"
            >
              {stats.map((s) => (
                <div key={s.label} className="manus-discover-hero__stat">
                  <div className="manus-discover-hero__statVal">{s.value}</div>
                  <div className="manus-discover-hero__statLbl">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — floating phone mockup (asset yok, CSS/HTML) */}
          <div className="manus-phone mylasa-reveal" data-reveal="phone" aria-hidden="true">
            <div className="manus-phone__float">
              <div className="manus-phone__frame">
                <div className="manus-phone__notch" />
                <div className="manus-phone__screen">
                  <div className="manus-phone__miniTop">
                    <div className="manus-phone__dot manus-phone__dot--cyan" />
                    <div className="manus-phone__miniTitle" />
                  </div>

                  <div className="manus-phone__card">
                    <div className="manus-phone__cardCover" />
                    <div className="manus-phone__cardMeta">
                      <div className="manus-phone__line manus-phone__line--lg" />
                      <div className="manus-phone__line manus-phone__line--sm" />
                    </div>
                    <div className="manus-phone__cardStats">
                      <div className="manus-phone__pill" />
                      <div className="manus-phone__pill" />
                    </div>
                  </div>

                  <div className="manus-phone__bottomFade" />
                </div>
              </div>

              <div className="manus-phone__glow" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}