// src/pages/RouteDetailMobile/components/StarBars.js
import React from "react";

export default function StarBars({
  counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  total = 0,
  compact = false,
  showNumbers = true,
  height = 10,
}) {
  const rows = [5, 4, 3, 2, 1];
  const maxCount = Math.max(...rows.map((r) => counts[r] || 0), 1);

  const barStyle = (r) => ({
    height,
    width: total
      ? `${Math.max(4, Math.round(((counts[r] || 0) / maxCount) * 100))}%`
      : "4%",
    background: "#1a73e8",
    borderRadius: 999,
    transition: "width .25s ease",
  });

  const wrap = {
    display: "grid",
    gridTemplateColumns: compact ? "1fr" : "24px 1fr 48px",
    gap: 8,
    width: "100%",
  };

  const rowCss = { display: "contents" };

  return (
    <div style={{ width: "100%" }}>
      <div style={wrap}>
        {rows.map((r) => (
          <div key={r} style={rowCss}>
            {!compact && <div style={{ fontSize: 12, opacity: 0.7 }}>{r}★</div>}

            <div
              style={{
                background: "#e5e7eb",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div style={barStyle(r)} />
            </div>

            {!compact && showNumbers && (
              <div style={{ fontSize: 12, textAlign: "right", opacity: 0.8 }}>
                {counts[r] || 0}
              </div>
            )}
          </div>
        ))}
      </div>

      {!compact && (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
          Toplam: {total}
        </div>
      )}
    </div>
  );
}
