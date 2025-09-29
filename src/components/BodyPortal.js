// src/components/BodyPortal.js
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

/**
 * Güvenli portal: her bileşen örneği için body altına tek bir kapsayıcı <div> ekler.
 * Unmount sırasında kapsayıcıyı bir sonraki frame'de kaldırarak React'in child'ları
 * önce sökmesine fırsat verir; removeChild yarış durumlarını engeller.
 */
export default function BodyPortal({ children, id = "" }) {
  const container = useMemo(() => {
    const el = document.createElement("div");
    el.className = "portal-host";
    if (id) el.dataset.portalId = id;
    return el;
  }, [id]);

  useEffect(() => {
    document.body.appendChild(container);
    return () => {
      // Çocukları önce React sökecek; sonra kapsayıcıyı temizle.
      requestAnimationFrame(() => {
        try {
          if (container.parentNode) container.parentNode.removeChild(container);
        } catch {}
      });
    };
  }, [container]);

  return createPortal(children, container);
}
