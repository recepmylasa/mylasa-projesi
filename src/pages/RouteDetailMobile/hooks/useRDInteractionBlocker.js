// FILE: src/pages/RouteDetailMobile/hooks/useRDInteractionBlocker.js
import React, { useCallback, useEffect, useState } from "react";

export default function useRDInteractionBlocker() {
  // ✅ EMİR 13 — Ghost click kırıcı: overlay kapanınca kısa süre etkileşimi blokla
  const [interactionBlocked, setInteractionBlocked] = useState(false);
  const blockTimerRef = React.useRef(null);

  const blockInteractionsBriefly = useCallback((ms = 220) => {
    if (typeof window === "undefined") return;
    try {
      if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
    } catch {}
    setInteractionBlocked(true);
    blockTimerRef.current = window.setTimeout(() => {
      setInteractionBlocked(false);
      blockTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
      } catch {}
      blockTimerRef.current = null;
    };
  }, []);

  return { interactionBlocked, blockInteractionsBriefly };
}
