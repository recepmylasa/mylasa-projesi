// src/pages/RouteDetailMobile/tabs/RouteDetailReportTab.js
import React from "react";
import StarBars from "../components/StarBars";

export default function RouteDetailReportTab({
  reportLoaded,
  routeAgg,
  stopAgg,
  stops,
  distanceText,
  durationText,
  stopsText,
  avgSpeedText,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!reportLoaded && <div style={{ fontSize: 13, opacity: 0.7 }}>Rapor yükleniyor…</div>}

      {reportLoaded && (
        <>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Rota puan dağılımı</div>
            {routeAgg?.counts ? (
              <StarBars counts={routeAgg.counts} total={routeAgg.total} height={10} />
            ) : (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Henüz yeterli veri yok.</div>
            )}
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Genel istatistik</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Mesafe</div>
                <div style={{ fontWeight: 900 }}>{distanceText || "—"}</div>
              </div>
              <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Süre</div>
                <div style={{ fontWeight: 900 }}>{durationText || "—"}</div>
              </div>
              <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Durak</div>
                <div style={{ fontWeight: 900 }}>{stopsText || `${(stops || []).length || 0}`}</div>
              </div>
              <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Ort. hız</div>
                <div style={{ fontWeight: 900 }}>{avgSpeedText || "—"}</div>
              </div>
            </div>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Durak puanları</div>
            {(stops || []).slice(0, 10).map((s) => {
              const agg = stopAgg?.[s.id];
              if (!agg) return null;
              return (
                <div key={s.id} style={{ padding: "8px 0", borderTop: "1px solid #f0f0f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>
                      {s.order ? `${s.order}. ` : ""}
                      {s.title || "Durak"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{agg.total ? `${agg.total} oy` : ""}</div>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <StarBars counts={agg.counts} total={agg.total} compact height={8} />
                  </div>
                </div>
              );
            })}
            {(!stopAgg || Object.keys(stopAgg || {}).length === 0) && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>Henüz durak raporu yok.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
