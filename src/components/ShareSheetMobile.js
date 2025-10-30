// src/components/ShareSheetMobile.js
import React, { useState } from "react";
import "./ShareSheetMobile.css";
import { renderRouteShare } from "../share/routeShareRenderer";

function useToast() {
  return (msg) => {
    try {
      if (window?.showToast) window.showToast(msg);
      else alert(msg);
    } catch {
      alert(msg);
    }
  };
}

async function shareBlobAsFile(blob, filename) {
  const file = new File([blob], filename, { type: "image/png" });
  const payload = { files: [file], title: "Mylasa Rota" };
  try {
    if (navigator.canShare && navigator.canShare(payload) && navigator.share) {
      await navigator.share(payload);
      return true;
    }
  } catch {
    // düşer ise download'a geç
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return false;
}

export default function ShareSheetMobile({
  route,
  stops,
  onClose,
}) {
  const [size, setSize] = useState("story"); // "story" | "square"
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const doRender = async (mode, act) => {
    if (busy) return;
    setBusy(true);
    try {
      const { blob } = await renderRouteShare({ route, stops, size: mode });
      const filename = `mylasa-route-${route?.id || "share"}.png`;
      if (act === "share") {
        await shareBlobAsFile(blob, filename);
        toast("Paylaşım hazır.");
      } else {
        await shareBlobAsFile(blob, filename); // aynı fonksiyon indirme fallback'ini içeriyor
        toast("Görsel kaydedildi.");
      }
      onClose?.();
    } catch (e) {
      console.error(e);
      toast("Görsel oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ssm-card">
      <div className="ssm-header">
        <div className="ssm-title">Görsel Olarak Paylaş</div>
        <button className="ssm-close" onClick={onClose} aria-label="Kapat">✕</button>
      </div>

      <div className="ssm-options" role="group" aria-label="Format seçimi">
        <button
          className={`ssm-option ${size === "story" ? "active" : ""}`}
          onClick={() => setSize("story")}
        >
          <div className="ssm-thumb story" />
          <div className="ssm-label">Story (1080×1920)</div>
        </button>

        <button
          className={`ssm-option ${size === "square" ? "active" : ""}`}
          onClick={() => setSize("square")}
        >
          <div className="ssm-thumb square" />
          <div className="ssm-label">Kare (1080×1080)</div>
        </button>
      </div>

      <div className="ssm-actions">
        <button className="ssm-btn" disabled={busy} onClick={() => doRender(size, "share")}>
          {busy ? "Hazırlanıyor…" : "Paylaş"}
        </button>
        <button className="ssm-btn ghost" disabled={busy} onClick={() => doRender(size, "save")}>
          {busy ? "Hazırlanıyor…" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
