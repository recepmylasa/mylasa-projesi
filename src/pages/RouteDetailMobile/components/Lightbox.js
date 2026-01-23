// FILE: src/pages/RouteDetailMobile/components/Lightbox.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./Lightbox.css";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const OVERLAY_Z = 980;

export default function Lightbox({
  items = [],
  index = 0,
  onClose = () => {},
  portalTarget = null,
}) {
  const safeItems = useMemo(() => (Array.isArray(items) ? items.filter(Boolean) : []), [items]);
  const len = safeItems.length;

  const [active, setActive] = useState(() => clamp(Number(index) || 0, 0, Math.max(0, len - 1)));
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const scrollerRef = useRef(null);
  const videoElsRef = useRef(new Map()); // idx -> HTMLVideoElement
  const closeBtnRef = useRef(null);
  const prevFocusRef = useRef(null);

  const scrollRafRef = useRef(0);
  const pendingScrollElRef = useRef(null);

  const pauseVideoAt = useCallback(
    (i) => {
      try {
        const el = videoElsRef.current.get(i);
        if (el && typeof el.pause === "function") el.pause();
      } catch {}
    },
    [videoElsRef]
  );

  const scrollToIndex = useCallback((i, smooth = true) => {
    const el = scrollerRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const left = i * w;
    try {
      el.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
    } catch {
      try {
        el.scrollLeft = left;
      } catch {}
    }
  }, []);

  const close = useCallback(() => {
    pauseVideoAt(activeRef.current);
    onClose();
  }, [onClose, pauseVideoAt]);

  // ✅ EMİR 13: Overlay açıkken body scroll kilitle (iOS dahil) + geri yükle
  useEffect(() => {
    let scrollY = 0;

    const body = document.body;
    const docEl = document.documentElement;

    const prev = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      docOverflow: docEl.style.overflow,
      docOverscroll: docEl.style.overscrollBehavior,
    };

    try {
      scrollY = window.scrollY || window.pageYOffset || 0;
    } catch {
      scrollY = 0;
    }

    try {
      // iOS-safe: body fixed
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";

      docEl.style.overflow = "hidden";
      docEl.style.overscrollBehavior = "none";
    } catch {
      // no-op
    }

    return () => {
      try {
        body.style.overflow = prev.bodyOverflow;
        body.style.position = prev.bodyPosition;
        body.style.top = prev.bodyTop;
        body.style.left = prev.bodyLeft;
        body.style.right = prev.bodyRight;
        body.style.width = prev.bodyWidth;

        docEl.style.overflow = prev.docOverflow;
        docEl.style.overscrollBehavior = prev.docOverscroll;
      } catch {}

      try {
        window.scrollTo(0, scrollY);
      } catch {}
    };
  }, []);

  // Focus management (a11y): open -> focus close button, close -> restore previous focus
  useEffect(() => {
    try {
      prevFocusRef.current = document.activeElement;
    } catch {
      prevFocusRef.current = null;
    }

    const t = setTimeout(() => {
      try {
        closeBtnRef.current?.focus?.();
      } catch {}
    }, 0);

    return () => {
      clearTimeout(t);
      try {
        const el = prevFocusRef.current;
        if (el && typeof el.focus === "function") el.focus();
      } catch {}
    };
  }, []);

  // ESC
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  // Unmount: active video pause + cancel pending scroll rAF
  useEffect(() => {
    return () => {
      pauseVideoAt(activeRef.current);
      try {
        if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      } catch {}
      scrollRafRef.current = 0;
      pendingScrollElRef.current = null;
    };
  }, [pauseVideoAt]);

  // resize/orientationchange: keep slide aligned
  useEffect(() => {
    const onResize = () => {
      scrollToIndex(activeRef.current, false);
    };

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });

    setTimeout(() => onResize(), 0);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [scrollToIndex]);

  // index/items changes: sync active + scroll
  useEffect(() => {
    const next = clamp(Number(index) || 0, 0, Math.max(0, safeItems.length - 1));
    setActive(next);
    setTimeout(() => scrollToIndex(next, false), 0);
  }, [index, safeItems.length, scrollToIndex]);

  const onPrev = useCallback(
    (e) => {
      e?.stopPropagation?.();
      const cur = activeRef.current;
      const next = clamp(cur - 1, 0, Math.max(0, len - 1));
      if (next === cur) return;
      pauseVideoAt(cur);
      setActive(next);
      scrollToIndex(next, true);
    },
    [len, pauseVideoAt, scrollToIndex]
  );

  const onNext = useCallback(
    (e) => {
      e?.stopPropagation?.();
      const cur = activeRef.current;
      const next = clamp(cur + 1, 0, Math.max(0, len - 1));
      if (next === cur) return;
      pauseVideoAt(cur);
      setActive(next);
      scrollToIndex(next, true);
    },
    [len, pauseVideoAt, scrollToIndex]
  );

  const flushScroll = useCallback(() => {
    scrollRafRef.current = 0;
    const el = pendingScrollElRef.current;
    pendingScrollElRef.current = null;
    if (!el) return;

    const w = el.clientWidth || 1;
    const next = clamp(Math.round((el.scrollLeft || 0) / w), 0, Math.max(0, len - 1));
    const cur = activeRef.current;

    if (next === cur) return;

    pauseVideoAt(cur);
    setActive(next);
  }, [len, pauseVideoAt]);

  const onScroll = useCallback(
    (e) => {
      pendingScrollElRef.current = e.currentTarget;
      if (scrollRafRef.current) return;
      scrollRafRef.current = requestAnimationFrame(flushScroll);
    },
    [flushScroll]
  );

  // ✅ EMİR 18-6: ref object veya direkt element destekle
  const targetEl = portalTarget?.current || portalTarget || null;
  const canPortal = useMemo(() => {
    try {
      return !!(targetEl && typeof targetEl.appendChild === "function");
    } catch {
      return false;
    }
  }, [targetEl]);

  // ✅ EMİR 13: Overlay root style (fixed/inset/z-index/pointer-events) + iOS touch-action
  const overlayStyle = useMemo(
    () => ({
      position: "fixed",
      inset: 0,
      zIndex: OVERLAY_Z,
      pointerEvents: "auto",
      // iOS: alttaki scroll’u kilitledik; overlay içinde dikey pan "kibar"
      touchAction: "pan-y",
      overscrollBehavior: "contain",
      WebkitOverflowScrolling: "touch",
    }),
    []
  );

  const sliderStyle = useMemo(
    () => ({
      touchAction: "pan-x",
      overscrollBehavior: "contain",
      WebkitOverflowScrolling: "touch",
    }),
    []
  );

  const node = !len ? (
    <div
      className="mylasa-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Medya görüntüleyici"
      style={overlayStyle}
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
    >
      <div className="mylasa-lightbox__panel" onClick={(e) => e.stopPropagation()}>
        <div className="mylasa-lightbox__top">
          <button
            type="button"
            className="mylasa-lightbox__iconBtn"
            onClick={close}
            aria-label="Kapat"
            ref={closeBtnRef}
          >
            ✕
          </button>
          <div className="mylasa-lightbox__meta">Medya yok</div>
          <div className="mylasa-lightbox__spacer" />
        </div>
        <div className="mylasa-lightbox__empty">Gösterilecek medya bulunamadı.</div>
      </div>
    </div>
  ) : (
    <div
      className="mylasa-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Medya görüntüleyici"
      style={overlayStyle}
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
    >
      <div className="mylasa-lightbox__panel" onClick={(e) => e.stopPropagation()}>
        <div className="mylasa-lightbox__top">
          <button
            type="button"
            className="mylasa-lightbox__iconBtn"
            onClick={close}
            aria-label="Kapat"
            ref={closeBtnRef}
          >
            ✕
          </button>

          <div className="mylasa-lightbox__meta">
            {active + 1} / {len}
          </div>

          <div className="mylasa-lightbox__spacer" />
        </div>

        <div className="mylasa-lightbox__sliderWrap">
          <div
            className="mylasa-lightbox__slider"
            ref={scrollerRef}
            onScroll={onScroll}
            style={sliderStyle}
          >
            {safeItems.map((it, idx) => {
              const url = it?.url ? String(it.url) : "";
              const type = it?.type === "video" ? "video" : "image";

              return (
                <div className="mylasa-lightbox__slide" key={`${idx}_${url}`}>
                  {type === "video" ? (
                    <video
                      className="mylasa-lightbox__media"
                      src={url}
                      controls
                      playsInline
                      preload="metadata"
                      ref={(node2) => {
                        if (node2) videoElsRef.current.set(idx, node2);
                        else videoElsRef.current.delete(idx);
                      }}
                    />
                  ) : (
                    <img
                      className="mylasa-lightbox__media"
                      src={url}
                      alt=""
                      draggable={false}
                      loading="eager"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {len > 1 && (
            <>
              <button
                type="button"
                className="mylasa-lightbox__nav mylasa-lightbox__nav--prev"
                onClick={onPrev}
                aria-label="Önceki"
                disabled={active <= 0}
              >
                ‹
              </button>
              <button
                type="button"
                className="mylasa-lightbox__nav mylasa-lightbox__nav--next"
                onClick={onNext}
                aria-label="Sonraki"
                disabled={active >= len - 1}
              >
                ›
              </button>
            </>
          )}
        </div>

        {!!(safeItems[active]?.title ? String(safeItems[active].title) : "") && (
          <div className="mylasa-lightbox__caption">
            {safeItems[active]?.title ? String(safeItems[active].title) : ""}
          </div>
        )}
      </div>
    </div>
  );

  return canPortal ? createPortal(node, targetEl) : node;
}
