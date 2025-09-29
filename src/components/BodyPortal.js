// src/components/BodyPortal.js
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

/**
 * Güvenli portal: body altına tek bir kapsayıcı <div> ekler.
 * Unmount'ta kapsayıcıyı bir sonraki frame'de kaldırır; removeChild yarışlarını engeller.
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
      requestAnimationFrame(() => {
        try {
          if (container.parentNode) container.parentNode.removeChild(container);
        } catch {}
      });
    };
  }, [container]);

  return createPortal(children, container);
}
