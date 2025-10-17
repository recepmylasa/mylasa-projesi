// src/hooks/useMarkers.js
import { useCallback, useRef } from "react";
import { makeAvatarOnlyContent, makeSelfContent } from "../utils/markerContent";

/** Advanced Marker olmayan ortamda HTML içeriği çizecek basit OverlayView */
function createHtmlOverlayClass(google) {
  if (google.maps.__MylasaHtmlOverlay__) return google.maps.__MylasaHtmlOverlay__;

  class MylasaHtmlOverlay extends google.maps.OverlayView {
    constructor({ position, map, content, zIndex = 1 }) {
      super();
      this.position = new google.maps.LatLng(position);
      this.map = map;
      this.content = content;
      this.zIndex = zIndex;
      this.div = null;
      this.setMap(map);
    }
    onAdd() {
      this.div = document.createElement("div");
      this.div.style.position = "absolute";
      if (this.zIndex != null) this.div.style.zIndex = String(this.zIndex);
      if (this.content) this.div.appendChild(this.content);
      const panes = this.getPanes();
      (panes?.overlayMouseTarget || panes?.overlayLayer)?.appendChild(this.div);
    }
    draw() {
      if (!this.div) return;
      const proj = this.getProjection?.();
      if (!proj) return;
      const p = proj.fromLatLngToDivPixel(this.position);
      if (!p) return;
      this.div.style.left = `${p.x}px`;
      this.div.style.top = `${p.y}px`;
    }
    onRemove() {
      if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
      this.div = null;
    }
    setPosition(pos) {
      this.position = new google.maps.LatLng(pos);
      try { this.draw(); } catch {}
    }
    setContent(node) {
      this.content = node;
      if (this.div) {
        this.div.innerHTML = "";
        if (node) this.div.appendChild(node);
      }
    }
  }

  google.maps.__MylasaHtmlOverlay__ = MylasaHtmlOverlay;
  return MylasaHtmlOverlay;
}

export function useMarkers(mapRef, advancedAllowedRef) {
  const markersRef   = useRef(new Map());
  const avatarMetaRef = useRef(new Map());
  const selfUIRef     = useRef({ cone: null, nameSpan: null, fill: null, pct: null, valueWrap: null });

  const upsertMarker = useCallback((key, position, opts = {}) => {
    if (!mapRef.current || !(window.google && window.google.maps)) return;

    const Advanced = (advancedAllowedRef.current && window.google?.maps?.marker?.AdvancedMarkerElement)
      ? window.google.maps.marker.AdvancedMarkerElement
      : null;

    const HtmlOverlay = createHtmlOverlayClass(window.google);

    const existing = markersRef.current.get(key);
    const heightPx = opts.heightPx || 64;

    let content = null;
    let icon = null;
    let builtRefs = null;

    // İçerik/ikon
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
          builtRefs = built.refs;
        } else {
          content = makeAvatarOnlyContent(opts.avatarUrl, heightPx);
        }
      } else if (opts.isSelf) {
        const built = makeSelfContent({
          url: opts.avatarUrl, heightPx, name: opts.selfName,
          battery: opts.batteryLevel, headingDeg: opts.headingDeg,
        });
        built.node.style.pointerEvents = "auto";
        built.node.style.cursor = typeof opts.onClick === "function" ? "pointer" : "default";
        content = built.node;
        builtRefs = built.refs;
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

    // Var olanı güncelle
    if (existing) {
      if (typeof existing.setPosition === "function") existing.setPosition(position);
      else if ("position" in existing) existing.position = position;

      if (content) {
        if (typeof existing.setContent === "function") existing.setContent(content);
        else if ("content" in existing) existing.content = content;
      }
      if (icon && typeof existing.setIcon === "function") existing.setIcon(icon);
      if (opts.title && typeof existing.setTitle === "function") existing.setTitle(opts.title);
      if (opts.isSelf && builtRefs) selfUIRef.current = builtRefs;
      return existing;
    }

    // Yeni marker
    let marker;
    if (Advanced) {
      marker = new Advanced({ map: mapRef.current, position, title: opts.title || "", content: content || undefined });
      if (typeof opts.onClick === "function") marker.addListener?.("gmp-click", opts.onClick);
      if (opts.isSelf && builtRefs) selfUIRef.current = builtRefs;
    } else if (opts.isSelf && content) {
      marker = new HtmlOverlay({ map: mapRef.current, position, content, zIndex: 100 });
      if (typeof opts.onClick === "function") {
        try { content.addEventListener("click", opts.onClick); } catch {}
      }
      if (builtRefs) selfUIRef.current = builtRefs;
    } else {
      marker = new window.google.maps.Marker({ position, map: mapRef.current, title: opts.title || "", icon: icon || undefined });
      if (typeof opts.onClick === "function") marker.addListener("click", opts.onClick);
    }

    markersRef.current.set(key, marker);
    return marker;
  }, [mapRef, advancedAllowedRef]);

  const removeMarker = useCallback((key) => {
    const m = markersRef.current.get(key);
    if (m) {
      try { if (typeof m.setMap === "function") m.setMap(null); else if ("map" in m) m.map = null; } catch {}
      markersRef.current.delete(key);
    }
  }, []);

  return { upsertMarker, removeMarker, markersRef, avatarMetaRef, selfUIRef };
}
