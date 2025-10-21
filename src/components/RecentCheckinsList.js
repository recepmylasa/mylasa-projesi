// src/components/RecentCheckinsList.jsx
import React from "react";
import { formatRelativeMinutes } from "../utils/geo";

export default function RecentCheckinsList({ loading, items }) {
  return (
    <div style={{ padding: "8px 10px", borderTop: "1px solid #efefef" }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: "#333" }}>
        Son 30 dk’daki check-in’ler
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: "#666" }}>Yükleniyor…</div>
      )}

      {!loading && (!items || items.length === 0) && (
        <div style={{ fontSize: 12, color: "#666" }}>
          Bu mekânda son 30 dakika içinde kimse yok.
        </div>
      )}

      {!loading &&
        items?.map((it) => (
          <div
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 0",
            }}
          >
            <img
              src={it.avatarUrl || "/avatars/avatar 1.png"}
              alt={it.displayName || "Kullanıcı"}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                objectFit: "cover",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                {it.displayName || "Kullanıcı"}
              </div>
              <div style={{ fontSize: 11, color: "#666" }}>
                {formatRelativeMinutes(it.ts)}{it.comment ? ` • ${it.comment}` : ""}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
