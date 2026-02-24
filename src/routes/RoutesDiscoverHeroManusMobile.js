// FILE: src/routes/RoutesDiscoverHeroManusMobile.js
import React, { useMemo } from "react";

function formatCompactCount(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "—";
  if (x < 1000) return String(Math.round(x));
  if (x < 1000000) return `${Math.round((x / 1000) * 10) / 10}K`;
  return `${Math.round((x / 1000000) * 10) / 10}M`;
}

export default function RoutesDiscoverHeroManusMobile({
  routesCount = 0,
  onScrollToGrid,
  onStartRoute,
  startDisabledHint = "",
}) {
  const canStart = typeof onStartRoute === "function";

  const stats = useMemo(() => {
    return [
      { label: "Aktif rota", value: formatCompactCount(routesCount) },
      { label: "Gezgin", value: "18K+" },
      { label: "Şehir", value: "81" },
    ];
  }, [routesCount]);

  return (
    <section className="manus-discover-hero" aria-label="Keşfet kahraman alanı">
      <div className="manus-discover-hero__bg" aria-hidden="true" />
      <div className="manus-discover-hero__inner">
        <div className="manus-discover-hero__pill">YENİ NESİL ROTA SİSTEMİ</div>

        <h1 className="manus-discover-hero__title">
          Şehri keşfet, <span className="manus-discover-hero__titleGrad">hikayesini dinle</span>
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