// FILE: src/pages/RouteDetailMobile/components/StarBars.js
import React, { useMemo } from "react";

function toNum(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function StarBars({
  counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  total = 0,
  compact = false,
  showNumbers = true,
  height = 10,
}) {
  const rows = [5, 4, 3, 2, 1];

  const safe = useMemo(() => {
    const c = {};
    rows.forEach((r) => {
      c[r] = toNum(counts?.[r] ?? counts?.[String(r)] ?? 0);
    });
    const t = toNum(total);
    const maxCount = Math.max(...rows.map((r) => c[r] || 0), 1);
    const denom = t > 0 ? t : maxCount; // total varsa yüzde; yoksa max'a göre relatif
    return { c, t, maxCount, denom };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, total]);

  const pctFor = (r) => {
    const v = safe.c[r] || 0;
    if (!safe.denom) return 0;
    const raw = (v / safe.denom) * 100;
    const clamped = Math.max(0, Math.min(100, raw));
    return clamped;
  };

  const wrapStyle = {
    display: "grid",
    gridTemplateColumns: compact ? "1fr" : "24px 1fr 48px",
    gap: 8,
    width: "100%",
  };

  const rowCss = { display: "contents" };

  return (
    <div className="rdglass-starbars" style={{ width: "100%" }}>
      <div style={wrapStyle}>
        {rows.map((r) => {
          const w = safe.t > 0 ? pctFor(r) : pctFor(r); // tek hesap (denom zaten seçildi)
          const width = safe.t > 0 ? `${Math.max(4, w).toFixed(2)}%` : `${Math.max(4, w).toFixed(2)}%`;

          return (
            <div key={r} style={rowCss}>
              {!compact && (
                <div className="rdglass-muted" style={{ fontSize: 12 }}>
                  {r}★
                </div>
              )}

              <div
                className="rdglass-starbar-track"
                style={{
                  background: "var(--rdglass-track, #e5e7eb)",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
                aria-label={`${r} yıldız: ${safe.c[r] || 0}`}
              >
                <div
                  className="rdglass-starbar-fill"
                  style={{
                    height,
                    width: safe.t > 0 || safe.maxCount > 0 ? width : "4%",
                    background: "var(--rdglass-accent, #1a73e8)",
                    borderRadius: 999,
                    transition: "width .25s ease",
                  }}
                />
              </div>

              {!compact && showNumbers && (
                <div className="rdglass-muted" style={{ fontSize: 12, textAlign: "right" }}>
                  {safe.c[r] || 0}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="rdglass-muted" style={{ marginTop: 6, fontSize: 12 }}>
          Toplam: {safe.t || 0}
        </div>
      )}
    </div>
  );
}
