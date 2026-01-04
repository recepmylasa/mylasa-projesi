// src/pages/RouteDetailMobile/hooks/useRouteDetailImgProof.js
import { useCallback, useRef } from "react";

// Dev proof log (load / fallback_load / error_all)
export default function useRouteDetailImgProof({
  routeId,
  defaultPublicUrl,
  defaultConstUrl,
  maxLogs = 80,
}) {
  // ✅ Log spam tamamen kapalı (dev dahil)
  const ENABLE_IMG_PROOF_LOGS = false;

  const imgProofCountRef = useRef(0);

  const logImgProof = useCallback(
    (evt, meta) => {
      if (!ENABLE_IMG_PROOF_LOGS) return; // ✅ tam sessiz
      if (process.env.NODE_ENV === "production") return;

      try {
        const c = Number(imgProofCountRef.current || 0);
        if (c >= maxLogs) return;
        imgProofCountRef.current = c + 1;
        // eslint-disable-next-line no-console
        console.log(`[RouteDetailImgProof] ${evt}`, { routeId, ...meta });
      } catch {}
    },
    [ENABLE_IMG_PROOF_LOGS, routeId, maxLogs]
  );

  // Placeholder tespiti: query/hash strip + dosya adı bazlı
  const stripQueryAndHash = useCallback((u) => {
    try {
      return String(u || "").split(/[?#]/)[0];
    } catch {
      return "";
    }
  }, []);

  const getBasenameLower = useCallback(
    (u) => {
      try {
        const s = stripQueryAndHash(u);
        if (!s) return "";
        const parts = String(s).split("/");
        return String(parts[parts.length - 1] || "").toLowerCase();
      } catch {
        return "";
      }
    },
    [stripQueryAndHash]
  );

  // Placeholder listesi: mylasa-logo.png/svg + route-default-cover.jpg
  const isDefaultCoverUrl = useCallback(
    (u) => {
      try {
        const base = stripQueryAndHash(String(u || ""));
        if (!base) return false;

        const file = getBasenameLower(base);
        if (file === "mylasa-logo.png") return true;
        if (file === "mylasa-logo.svg") return true;
        if (file === "route-default-cover.jpg") return true;

        const a = stripQueryAndHash(defaultPublicUrl);
        const b = stripQueryAndHash(defaultConstUrl);
        if (a && base === a) return true;
        if (b && base === b) return true;

        return false;
      } catch {
        return false;
      }
    },
    [defaultPublicUrl, defaultConstUrl, getBasenameLower, stripQueryAndHash]
  );

  const handleImgLoadProof = useCallback(
    (e, meta) => {
      try {
        const img = e?.currentTarget;
        const src = img?.currentSrc || img?.src || "";
        logImgProof("load", { ...meta, src });
      } catch {
        logImgProof("load", { ...meta, src: "" });
      }
    },
    [logImgProof]
  );

  const handleImgErrorToDefault = useCallback(
    (e, meta) => {
      const img = e?.currentTarget;
      if (!img) return;

      const attempted = img?.dataset?.fallbackAttempted === "1";
      const rawAttr = (() => {
        try {
          return img.getAttribute("src") || "";
        } catch {
          return "";
        }
      })();
      const cur = String(rawAttr || img?.currentSrc || img?.src || "");
      const curIsDefault = isDefaultCoverUrl(cur);

      if (!attempted && !curIsDefault) {
        try {
          img.dataset.fallbackAttempted = "1";
        } catch {}
        logImgProof("fallback_load", {
          ...meta,
          from: cur,
          to: defaultPublicUrl,
        });

        try {
          img.src = defaultPublicUrl;
        } catch {}
        return;
      }

      try {
        img.dataset.fallbackAttempted = "1";
      } catch {}
      logImgProof("error_all", {
        ...meta,
        src: cur || defaultPublicUrl,
      });
    },
    [defaultPublicUrl, isDefaultCoverUrl, logImgProof]
  );

  return {
    isDefaultCoverUrl,
    handleImgLoadProof,
    handleImgErrorToDefault,
  };
}
