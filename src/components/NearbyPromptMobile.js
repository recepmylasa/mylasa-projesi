import React from "react";

export default function NearbyPromptMobile({ onAllow = () => {}, onCancel = () => {} }) {
  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ margin: "8px 0 4px" }}>Yakınımdaki rotalar</h3>
      <p style={{ margin: "0 0 12px", color: "#666" }}>
        Çevrendeki bitmiş rotaları göstermek için konum iznine ihtiyacımız var.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onAllow}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff" }}
        >
          İzin ver
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
        >
          Daha sonra
        </button>
      </div>
    </div>
  );
}
