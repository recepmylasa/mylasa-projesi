// FILE: src/pages/RouteDetailMobile/hooks/useRDPortalsAndScrollLock.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function safeDispatchSnapEnd(reason = "portal") {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("rd:snap-end", {
        detail: { reason, t: Date.now() },
      })
    );
  } catch {}
}

export default function useRDPortalsAndScrollLock() {
  // ✅ Overlay portal target’ları: ref.current ilk render’da null → state ile garanti
  const [commentsPortalEl, setCommentsPortalEl] = useState(null);
  const [lightboxPortalEl, setLightboxPortalEl] = useState(null);

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const withPortal = useCallback(
    (node) => (portalTarget ? createPortal(node, portalTarget) : node),
    [portalTarget]
  );

  // ✅ Scroll lock (re-entrant / güvenli restore)
  const lockRef = useRef({
    count: 0,
    prevBody: "",
    prevHtml: "",
    applied: false,
  });

  const lockScroll = useCallback(
    (reason = "lock") => {
      if (!portalTarget) return;
      const st = lockRef.current;

      st.count += 1;
      if (st.applied) return;

      try {
        st.prevBody = document.body.style.overflow || "";
        st.prevHtml = document.documentElement.style.overflow || "";
      } catch {}

      try {
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        st.applied = true;
      } catch {}

      // ✅ lock sonrası layout toparlansın
      safeDispatchSnapEnd(`scroll-lock:${reason}`);
    },
    [portalTarget]
  );

  const unlockScroll = useCallback(
    (reason = "unlock") => {
      if (!portalTarget) return;
      const st = lockRef.current;

      st.count = Math.max(0, (st.count || 0) - 1);
      if (st.count > 0) return;

      if (!st.applied) return;

      try {
        document.body.style.overflow = st.prevBody || "";
        document.documentElement.style.overflow = st.prevHtml || "";
      } catch {}

      st.applied = false;
      st.prevBody = "";
      st.prevHtml = "";

      // ✅ unlock sonrası da toparla
      safeDispatchSnapEnd(`scroll-unlock:${reason}`);
    },
    [portalTarget]
  );

  // ✅ mevcut davranışı bozmamak için: RouteDetail’de mount boyunca body/html locked kalsın
  useEffect(() => {
    if (!portalTarget) return;
    lockScroll("mount");
    return () => unlockScroll("unmount");
  }, [portalTarget, lockScroll, unlockScroll]);

  const emitSnapEnd = useCallback((reason = "portal") => {
    safeDispatchSnapEnd(reason);
  }, []);

  return useMemo(
    () => ({
      withPortal,
      portalTarget,
      commentsPortalEl,
      setCommentsPortalEl,
      lightboxPortalEl,
      setLightboxPortalEl,

      // ✅ yeni (kırmaz): ileri adımlarda overlay aç/kapa için kullanılabilir
      lockScroll,
      unlockScroll,
      emitSnapEnd,
    }),
    [
      withPortal,
      portalTarget,
      commentsPortalEl,
      lightboxPortalEl,
      lockScroll,
      unlockScroll,
      emitSnapEnd,
    ]
  );
}