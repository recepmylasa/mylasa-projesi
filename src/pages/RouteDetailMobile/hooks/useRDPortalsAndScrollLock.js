// FILE: src/pages/RouteDetailMobile/hooks/useRDPortalsAndScrollLock.js
import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function useRDPortalsAndScrollLock() {
  // ✅ FIX — Overlay portal target’ları: ref.current ilk render’da null → state ile garanti (click yutma biter)
  const [commentsPortalEl, setCommentsPortalEl] = useState(null);
  const [lightboxPortalEl, setLightboxPortalEl] = useState(null);

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const withPortal = useCallback((node) => (portalTarget ? createPortal(node, portalTarget) : node), [portalTarget]);

  // ✅ Scroll lock
  useEffect(() => {
    if (!portalTarget) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [portalTarget]);

  return {
    withPortal,
    portalTarget,
    commentsPortalEl,
    setCommentsPortalEl,
    lightboxPortalEl,
    setLightboxPortalEl,
  };
}
