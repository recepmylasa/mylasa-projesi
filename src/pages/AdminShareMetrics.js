// src/pages/AdminShareMetrics.js
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import {
  fetchDailyAgg,
  downloadAggCsv,
} from "../services/adminMetrics";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  CartesianGrid,
} from "recharts";

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(baseStr, delta) {
  const [y, m, d] = baseStr.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function AdminShareMetrics() {
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [from, setFrom] = useState(() => addDays(todayStr(), -6));
  const [to, setTo] = useState(() => todayStr());
  const [preset, setPreset] = useState("7"); // '7' | '14' | '30' | 'custom'

  const [days, setDays] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Admin claim kontrolü
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAdmin(false);
        setAuthLoading(false);
        return;
      }
      try {
        const token = await user.getIdTokenResult(true);
        setIsAdmin(!!token.claims?.admin);
      } catch {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Tarih preset tuşları
  const applyPreset = (daysCount) => {
    const end = todayStr();
    const start = addDays(end, -(daysCount - 1));
    setPreset(String(daysCount));
    setFrom(start);
    setTo(end);
  };

  // Veriyi çek
  useEffect(() => {
    if (!isAdmin || !from || !to) return;

    let cancelled = false;
    setLoadingData(true);

    fetchDailyAgg(from, to)
      .then((rows) => {
        if (!cancelled) setDays(rows);
      })
      .catch(() => {
        if (!cancelled) setDays([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, from, to]);

  const lineData = useMemo(
    () =>
      days.map((d) => ({
        date: d.date,
        total_clicks: d.total_clicks,
      })),
    [days]
  );

  const totals = useMemo(() => {
    const byMode = { pwa: 0, intent: 0, spa: 0 };
    const byPlatform = { android: 0, ios: 0, desktop: 0 };
    const routesMap = {};

    for (const d of days) {
      const m = d.by_mode || {};
      byMode.pwa += Number(m.pwa || 0);
      byMode.intent += Number(m.intent || 0);
      byMode.spa += Number(m.spa || 0);

      const p = d.by_platform || {};
      byPlatform.android += Number(p.android || 0);
      byPlatform.ios += Number(p.ios || 0);
      byPlatform.desktop += Number(p.desktop || 0);

      const rt = d.routes_top || [];
      for (const r of rt) {
        if (!r || !r.hash) continue;
        const key = String(r.hash);
        const count = Number(r.count || 0);
        routesMap[key] = (routesMap[key] || 0) + count;
      }
    }

    const routesTop = Object.entries(routesMap)
      .map(([hash, count]) => ({ hash, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return { byMode, byPlatform, routesTop };
  }, [days]);

  const modeBarData = useMemo(
    () => [
      {
        name: "Toplam",
        pwa: totals.byMode.pwa,
        intent: totals.byMode.intent,
        spa: totals.byMode.spa,
      },
    ],
    [totals]
  );

  const platformBarData = useMemo(
    () => [
      {
        name: "Toplam",
        android: totals.byPlatform.android,
        ios: totals.byPlatform.ios,
        desktop: totals.byPlatform.desktop,
      },
    ],
    [totals]
  );

  if (authLoading) {
    return <div style={{ padding: 16 }}>Yükleniyor...</div>;
  }

  if (!isAdmin) {
    // Admin değilse paneli hiç göstermiyoruz
    return null;
  }

  const handleCsvDownload = () => {
    if (!from || !to) return;
    downloadAggCsv(from, to).catch(() => {});
  };

  const wrap = {
    maxWidth: 960,
    margin: "0 auto",
    padding: "16px 12px 32px",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  const card = {
    background: "#fff",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,.10)",
    marginBottom: 16,
  };

  const h1 = {
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 4,
  };

  const h2 = {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8,
  };

  const pillRow = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  };

  const pill = (active) => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: active ? "1px solid #111" : "1px solid #ddd",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#111",
    fontSize: 13,
    cursor: "pointer",
  });

  const label = {
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
    color: "#555",
  };

  const input = {
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid #ddd",
    fontSize: 13,
  };

  const csvBtn = {
    padding: "8px 12px",
    borderRadius: 12,
    border: "none",
    background: "#111",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={h1}>Paylaşım Telemetri Panosu</div>
        <div style={{ fontSize: 12, color: "#666" }}>
          “Uygulamada Aç” akışının 7/14/30 günlük özetleri ve rota
          performansı.
        </div>

        {/* Tarih aralığı */}
        <div style={{ marginTop: 12 }}>
          <div style={label}>Tarih aralığı</div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={pillRow}>
              <button
                type="button"
                style={pill(preset === "7")}
                onClick={() => applyPreset(7)}
              >
                Son 7 gün
              </button>
              <button
                type="button"
                style={pill(preset === "14")}
                onClick={() => applyPreset(14)}
              >
                Son 14 gün
              </button>
              <button
                type="button"
                style={pill(preset === "30")}
                onClick={() => applyPreset(30)}
              >
                Son 30 gün
              </button>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <input
                type="date"
                style={input}
                value={from}
                onChange={(e) => {
                  setPreset("custom");
                  setFrom(e.target.value);
                }}
              />
              <span style={{ fontSize: 12 }}>–</span>
              <input
                type="date"
                style={input}
                value={to}
                onChange={(e) => {
                  setPreset("custom");
                  setTo(e.target.value);
                }}
              />
            </div>
          </div>
        </div>

        {/* CSV butonu */}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#888" }}>
            Toplam kayıt: {days.length}
          </div>
          <button type="button" style={csvBtn} onClick={handleCsvDownload}>
            CSV indir
          </button>
        </div>
      </div>

      {/* Zaman serisi */}
      <div style={card}>
        <div style={h2}>Günlük toplam tıklama</div>
        <div style={{ width: "100%", height: 220 }}>
          {loadingData ? (
            <div style={{ fontSize: 12, color: "#666" }}>Yükleniyor...</div>
          ) : lineData.length === 0 ? (
            <div style={{ fontSize: 12, color: "#666" }}>
              Bu aralıkta veri yok.
            </div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="total_clicks"
                  stroke="#111"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Mod & Platform bar chart */}
      <div style={{ display: "grid", gap: 16 }}>
        <div style={card}>
          <div style={h2}>Açılış modu kırılımı</div>
          <div style={{ width: "100%", height: 190 }}>
            <ResponsiveContainer>
              <BarChart data={modeBarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="pwa" name="PWA" />
                <Bar dataKey="intent" name="Intent" />
                <Bar dataKey="spa" name="SPA" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={card}>
          <div style={h2}>Platform kırılımı</div>
          <div style={{ width: "100%", height: 190 }}>
            <ResponsiveContainer>
              <BarChart data={platformBarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="android" name="Android" />
                <Bar dataKey="ios" name="iOS" />
                <Bar dataKey="desktop" name="Desktop" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Routes tablosu */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={h2}>En çok açılan rotalar (hash)</div>
        {totals.routesTop.length === 0 ? (
          <div style={{ fontSize: 12, color: "#666" }}>
            Bu aralık için rota verisi yok.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "6px 4px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Route Hash
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "6px 4px",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {totals.routesTop.map((r) => (
                  <tr key={r.hash}>
                    <td
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #f3f3f3",
                        fontFamily: "monospace",
                      }}
                    >
                      {r.hash}
                    </td>
                    <td
                      style={{
                        padding: "6px 4px",
                        borderBottom: "1px solid #f3f3f3",
                        textAlign: "right",
                      }}
                    >
                      {r.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
