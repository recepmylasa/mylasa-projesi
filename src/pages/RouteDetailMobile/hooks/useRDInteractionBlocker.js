// FILE: src/pages/RouteDetailMobile/hooks/useRDInteractionBlocker.js
import React, { useCallback, useEffect, useRef, useState } from "react";

export default function useRDInteractionBlocker() {
  // ✅ Ghost click kırıcı: overlay kapanınca kısa süre etkileşimi blokla
  const [interactionBlocked, setInteractionBlocked] = useState(false);
  const blockTimerRef = useRef(null);

  const emitSnapEnd = useCallback((reason = "interaction-block") => {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(
        new CustomEvent("rd:snap-end", {
          detail: { reason, t: Date.now() },
        })
      );
    } catch {}
  }, []);

  const requestRepairNow = useCallback((reason = "interaction-block") => {
    if (typeof window === "undefined") return;
    // DEV-only: varsa debug komutunu çalıştır, yoksa event yeterli
    try {
      if (typeof window.__RD_REPAIR_NOW__ === "function") {
        window.__RD_REPAIR_NOW__(reason);
      }
    } catch {}
    emitSnapEnd(reason);
  }, [emitSnapEnd]);

  const blockInteractionsBriefly = useCallback(
    (ms = 220) => {
      if (typeof window === "undefined") return;

      try {
        if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
      } catch {}

      setInteractionBlocked(true);

      // ✅ overlay kapanışı/ghost-click anında snap-end sinyali bas
      requestRepairNow("interaction-block");

      blockTimerRef.current = window.setTimeout(() => {
        setInteractionBlocked(false);
        blockTimerRef.current = null;
        // ✅ unblock sonrası da 1 kere daha (bazı cihazlarda layout 1 frame geç oturuyor)
        emitSnapEnd("interaction-unblock");
      }, ms);
    },
    [emitSnapEnd, requestRepairNow]
  );

  useEffect(() => {
    return () => {
      try {
        if (blockTimerRef.current) window.clearTimeout(blockTimerRef.current);
      } catch {}
      blockTimerRef.current = null;
    };
  }, []);

  return {
    interactionBlocked,
    blockInteractionsBriefly,
    // ekstra (kırmaz): isteyen çağırabilir
    requestRepairNow,
    emitSnapEnd,
  };
}