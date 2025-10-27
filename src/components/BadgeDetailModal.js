// src/components/BadgeDetailModal.js
import React from "react";

export default function BadgeDetailModal({ badge, onClose = () => {} }) {
  if (!badge) return null;

  const wrap = {
    position: "fixed", inset: 0, zIndex: 4000,
    background: "rgba(0,0,0,.6)",
    display: "flex", alignItems: "center", justifyContent: "center"
  };
  const card = {
    width: "min(92vw, 420px)", background: "#fff", borderRadius: 16,
    padding: "16px 14px", boxShadow: "0 20px 40px rgba(0,0,0,.25)"
  };
  const icon = {
    width: 64, height: 64, borderRadius: 12, display: "grid", placeItems: "center",
    fontSize: 36, background: "#111", color: "#fff"
  };
  const close = {
    marginLeft: "auto", padding: "8px 12px", borderRadius: 10,
    border: "1px solid #ddd", background: "#fff", fontWeight: 700, cursor: "pointer"
  };

  return (
    <div style={wrap} onMouseDown={onClose}>
      <div style={card} onMouseDown={(e)=>e.stopPropagation()}>
        <div style={{display:"flex", gap:12, alignItems:"center"}}>
          <div style={icon} aria-hidden>{badge.icon || "🏅"}</div>
          <div style={{minWidth:0}}>
            <div style={{fontWeight:900, fontSize:18}}>{badge.name || badge.id}</div>
            <div style={{fontSize:12, opacity:.7, marginTop:2}}>
              {badge.tier === "rare" ? "Nadir rozet" : "Rozet"}
            </div>
          </div>
          <button style={close} onClick={onClose}>Kapat</button>
        </div>
        <div style={{marginTop:12, fontSize:14, lineHeight:1.4}}>
          {badge.desc || "Açıklama yok."}
        </div>
      </div>
    </div>
  );
}
