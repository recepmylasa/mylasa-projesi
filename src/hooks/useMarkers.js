// src/hooks/useMarkers.js
import { useCallback, useRef } from "react";
import { makeAvatarOnlyContent, makeSelfContent } from "../utils/markerContent";

export function useMarkers(mapRef, advancedAllowedRef) {
  const markersRef = useRef(new Map());
  const avatarMetaRef = useRef(new Map());
  const selfUIRef = useRef({ cone: null, nameSpan: null, fill: null, pct: null });

  const upsertMarker = useCallback((key, position, opts = {}) => {
    if (!mapRef.current || !(window.google && window.google.maps)) return;

    const Advanced = (advancedAllowedRef.current && window.google?.maps?.marker?.AdvancedMarkerElement)
      ? window.google.maps.marker.AdvancedMarkerElement
      : null;

    const existing = markersRef.current.get(key);

    const heightPx = opts.heightPx || 64;
    let content = null;
    let icon = null;

    if (opts.avatarUrl) {
      if (Advanced) {
        if (opts.isSelf) {
          const built = makeSelfContent({
            url: opts.avatarUrl,
            heightPx,
            name: opts.selfName,
            battery: opts.batteryLevel,
            headingDeg: opts.headingDeg,
          });
          content = built.node;
          selfUIRef.current = built.refs;
        } else {
          content = makeAvatarOnlyContent(opts.avatarUrl, heightPx);
        }
      } else {
        const meta = avatarMetaRef.current.get(opts.avatarUrl);
        if (meta?.w && meta?.h) {
          const ratio = meta.w / meta.h;
          icon = {
            url: opts.avatarUrl,
            scaledSize: new window.google.maps.Size(heightPx * ratio, heightPx),
            anchor: new window.google.maps.Point((heightPx * ratio) / 2, heightPx),
          };
        } else {
          const img = new Image();
          img.onload = () => {
            avatarMetaRef.current.set(opts.avatarUrl, { w: img.naturalWidth, h: img.naturalHeight });
            const m = markersRef.current.get(key);
            if (m && m.setIcon) {
              const ratio = img.naturalWidth / img.naturalHeight;
              m.setIcon({
                url: opts.avatarUrl,
                scaledSize: new window.google.maps.Size(heightPx * ratio, heightPx),
                anchor: new window.google.maps.Point((heightPx * ratio) / 2, heightPx),
              });
            }
          };
          img.src = opts.avatarUrl;

          icon = {
            url: opts.avatarUrl,
            scaledSize: new window.google.maps.Size(heightPx, heightPx),
            anchor: new window.google.maps.Point(heightPx / 2, heightPx),
          };
        }
      }
    }

    if (existing) {
      if (Advanced && existing.position) {
        existing.position = position;
        if (content) existing.content = content;
      } else if (existing.setPosition) {
        existing.setPosition(position);
        if (icon && existing.setIcon) existing.setIcon(icon);
      }
      if (opts.title && existing.setTitle) existing.setTitle(opts.title);
      return existing;
    }

    let marker;
    if (Advanced) {
      marker = new Advanced({
        map: mapRef.current,
        position,
        title: opts.title || "",
        content: content || undefined,
      });
      if (typeof opts.onClick === "function") {
        marker.addListener?.("gmp-click", opts.onClick);
      }
    } else {
      marker = new window.google.maps.Marker({
        position,
        map: mapRef.current,
        title: opts.title || "",
        icon: icon || undefined,
      });
      if (typeof opts.onClick === "function") {
        marker.addListener("click", opts.onClick);
      }
    }

    markersRef.current.set(key, marker);
    return marker;
  }, [mapRef, advancedAllowedRef]);

  const removeMarker = useCallback((key) => {
    const m = markersRef.current.get(key);
    if (m) {
      try { if (m.setMap) m.setMap(null); else if ("map" in m) m.map = null; } catch {}
      markersRef.current.delete(key);
    }
  }, []);

  return { upsertMarker, removeMarker, markersRef, avatarMetaRef, selfUIRef };
}
