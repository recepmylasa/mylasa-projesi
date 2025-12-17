// src/pages/RouteDetailMobile/components/Lightbox.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

function normalizeType(t, url) {
  const s = String(t || "").toLowerCase();
  if (s === "video" || s === "vid") return "video";
  if (s === "image" || s === "img" || s === "photo" || s === "picture") return "image";
  const u = String(url || "").toLowerCase();
  if (u.includes(".mp4") || u.includes(".mov") || u.includes(".webm") || u.includes("video")) return "video";
  return "image";
}

export default function Lightbox({ items = [], index = 0, onClose = () => {} }) {
  const safeItems = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    return arr
      .map((it) => ({
        url: it?.url || "",
        type: normalizeType(it?.type, it?.url),
        title: it?.title || "",
      }))
      .filter((it) => !!it.url);
  }, [items]);

  const clampIndex = useCallback(
    (v) => {
      const max = Math.max(0, safeItems.length - 1);
      return Math.min(Math.max(0, Number(v) || 0), max);
    },
    [safeItems.length]
  );

  const [i, setI] = useState(() => clampIndex(index));
  useEffect(() => setI(clampIndex(index)), [index, clampIndex]);
  useEffect(() => setI((p) => clampIndex(p)), [safeItems.length, clampIndex]);

  const cur = safeItems[i];

  // DOM refs
  const stageRef = useRef(null);
  const transformRef = useRef(null);
  const videoRef = useRef(null);

  // Layout cache (no measurements during move)
  const layoutRef = useRef({
    stageW: 0,
    stageH: 0,
    stageL: 0,
    stageT: 0,
    baseW: 0,
    baseH: 0,
    mediaW: 0,
    mediaH: 0,
  });

  // Transform refs (source of truth)
  const trRef = useRef({ scale: 1, tx: 0, ty: 0 });

  // Gesture refs
  const pointersRef = useRef(new Map()); // id -> {x,y}
  const modeRef = useRef("none"); // "swipe" | "pan" | "pinch" | "none"
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0, t: 0 });
  const pinchRef = useRef({ startDist: 1, startScale: 1, lastCx: 0, lastCy: 0 });

  // rAF for DOM transform updates (no setState)
  const rafDomRef = useRef(0);
  const pendingTransitionRef = useRef(0);

  const MAX_SCALE = 4;

  const cssText = useMemo(
    () => `
/* Lightbox (mobile) — minimal CSS, GPU-friendly transforms */
.mylasa-lb-overlay{
  position:fixed; inset:0; z-index:7000;
  background:rgba(0,0,0,.90);
  display:flex; align-items:center; justify-content:center;
  overscroll-behavior:contain;
}
.mylasa-lb-stage{
  width:92vw; height:86vh; max-width:92vw; max-height:86vh;
  position:relative; overflow:hidden;
  display:grid; place-items:center;
  touch-action:none;
}
.mylasa-lb-transform{
  transform-origin:center center;
  will-change:transform;
  touch-action:none;
}
.mylasa-lb-close{
  position:absolute; top:10px; right:10px; z-index:4;
  width:40px; height:40px; border-radius:999px;
  border:0; background:rgba(0,0,0,.35); color:#fff;
  font-size:18px; cursor:pointer;
}
.mylasa-lb-nav{
  position:absolute; top:50%; transform:translateY(-50%);
  z-index:4; width:44px; height:44px; border-radius:999px;
  border:0; background:rgba(0,0,0,.35); color:#fff;
  font-size:20px; cursor:pointer;
}
.mylasa-lb-nav.left{ left:10px; }
.mylasa-lb-nav.right{ right:10px; }
.mylasa-lb-media{
  max-width:92vw; max-height:86vh; display:block;
}
.mylasa-lb-img{
  max-width:92vw; max-height:86vh; object-fit:contain;
  display:block; user-select:none; -webkit-user-select:none;
  pointer-events:none;
}
`,
    []
  );

  const cancelRaf = useCallback(() => {
    try {
      if (rafDomRef.current) cancelAnimationFrame(rafDomRef.current);
    } catch {}
    rafDomRef.current = 0;
  }, []);

  const clearTransitionTimer = useCallback(() => {
    try {
      if (pendingTransitionRef.current) clearTimeout(pendingTransitionRef.current);
    } catch {}
    pendingTransitionRef.current = 0;
  }, []);

  const applyDomNow = useCallback((animate) => {
    const el = transformRef.current;
    if (!el) return;

    const { scale, tx, ty } = trRef.current;

    clearTransitionTimer();
    cancelRaf();

    if (animate) {
      el.style.transition = "transform 170ms ease-out";
      pendingTransitionRef.current = window.setTimeout(() => {
        pendingTransitionRef.current = 0;
        try {
          if (transformRef.current) transformRef.current.style.transition = "none";
        } catch {}
      }, 210);
    } else {
      el.style.transition = "none";
    }

    el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
  }, [cancelRaf, clearTransitionTimer]);

  const scheduleDom = useCallback(() => {
    if (rafDomRef.current) return;
    rafDomRef.current = requestAnimationFrame(() => {
      rafDomRef.current = 0;
      const el = transformRef.current;
      if (!el) return;
      const { scale, tx, ty } = trRef.current;
      el.style.transition = "none";
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    });
  }, []);

  const computeBaseFit = useCallback(() => {
    const L = layoutRef.current;
    const cw = Number(L.stageW) || 0;
    const ch = Number(L.stageH) || 0;

    const mw = Number(L.mediaW) || 0;
    const mh = Number(L.mediaH) || 0;

    if (!cw || !ch) {
      L.baseW = 0;
      L.baseH = 0;
      return;
    }

    if (!mw || !mh) {
      // fallback: allow transforms but clamp conservatively
      L.baseW = cw;
      L.baseH = ch;
      return;
    }

    const mediaR = mw / mh;
    const contR = cw / ch;

    let bw = cw;
    let bh = ch;

    if (mediaR > contR) {
      bw = cw;
      bh = cw / mediaR;
    } else {
      bh = ch;
      bw = ch * mediaR;
    }

    L.baseW = bw;
    L.baseH = bh;
  }, []);

  const measureStage = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    layoutRef.current.stageW = Number(r.width) || 0;
    layoutRef.current.stageH = Number(r.height) || 0;
    layoutRef.current.stageL = Number(r.left) || 0;
    layoutRef.current.stageT = Number(r.top) || 0;
  }, []);

  const clampTransform = useCallback(
    (tx, ty, scale) => {
      const L = layoutRef.current;
      const cw = Number(L.stageW) || 0;
      const ch = Number(L.stageH) || 0;
      const bw = Number(L.baseW) || 0;
      const bh = Number(L.baseH) || 0;

      let s = Math.min(MAX_SCALE, Math.max(1, Number(scale) || 1));
      if (!cw || !ch || !bw || !bh) {
        if (s <= 1.0001) return { scale: 1, tx: 0, ty: 0 };
        return { scale: s, tx: 0, ty: 0 };
      }

      if (s <= 1.0001) {
        return { scale: 1, tx: 0, ty: 0 };
      }

      const sw = bw * s;
      const sh = bh * s;

      const maxTx = Math.max(0, (sw - cw) / 2);
      const maxTy = Math.max(0, (sh - ch) / 2);

      const ntx = Math.min(Math.max(Number(tx) || 0, -maxTx), maxTx);
      const nty = Math.min(Math.max(Number(ty) || 0, -maxTy), maxTy);

      return { scale: s, tx: ntx, ty: nty };
    },
    [MAX_SCALE]
  );

  const setTransform = useCallback(
    (next, { animate = false, clamp = true } = {}) => {
      const curTr = trRef.current;
      const tx = clamp ? clampTransform(next.tx, next.ty, next.scale).tx : Number(next.tx) || 0;
      const ty = clamp ? clampTransform(next.tx, next.ty, next.scale).ty : Number(next.ty) || 0;
      const scale = clamp ? clampTransform(next.tx, next.ty, next.scale).scale : Math.min(MAX_SCALE, Math.max(1, Number(next.scale) || 1));

      curTr.tx = tx;
      curTr.ty = ty;
      curTr.scale = scale;

      if (animate) applyDomNow(true);
      else scheduleDom();
    },
    [MAX_SCALE, applyDomNow, clampTransform, scheduleDom]
  );

  const resetTransform = useCallback(
    (animate = false) => {
      trRef.current = { scale: 1, tx: 0, ty: 0 };
      if (animate) applyDomNow(true);
      else applyDomNow(false);
    },
    [applyDomNow]
  );

  const pauseVideo = useCallback(() => {
    try {
      if (videoRef.current && typeof videoRef.current.pause === "function") videoRef.current.pause();
    } catch {}
  }, []);

  const safeClose = useCallback(() => {
    pauseVideo();
    try {
      pointersRef.current.clear();
    } catch {}
    modeRef.current = "none";
    clearTransitionTimer();
    cancelRaf();
    try {
      onClose();
    } catch {}
  }, [cancelRaf, clearTransitionTimer, onClose, pauseVideo]);

  // Scroll lock (safe)
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  // ESC support
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") safeClose();
      if (e.key === "ArrowLeft") setI((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setI((p) => Math.min(safeItems.length - 1, p + 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [safeClose, safeItems.length]);

  // On mount + on index change: pause previous video, reset transforms, clear pointers
  useEffect(() => {
    pauseVideo();
    videoRef.current = null;

    try {
      pointersRef.current.clear();
    } catch {}
    modeRef.current = "none";

    // update measurements + clamp with current media dims (if known)
    requestAnimationFrame(() => {
      try {
        measureStage();
        computeBaseFit();
        resetTransform(false);
      } catch {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Resize / orientation: re-measure + recompute base fit + clamp current transform
  useEffect(() => {
    const onResize = () => {
      requestAnimationFrame(() => {
        try {
          measureStage();
          computeBaseFit();
          const { tx, ty, scale } = trRef.current;
          const out = clampTransform(tx, ty, scale);
          trRef.current = out;
          applyDomNow(true);
        } catch {}
      });
    };

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    return () => {
      try {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
      } catch {}
    };
  }, [applyDomNow, clampTransform, computeBaseFit, measureStage]);

  // Pointer handlers (no layout reads here)
  const onStagePointerDown = useCallback(
    (e) => {
      try {
        e.stopPropagation();
      } catch {}

      clearTransitionTimer();

      try {
        if (typeof e.currentTarget?.setPointerCapture === "function") {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      } catch {}

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const pts = Array.from(pointersRef.current.values());
      const s = trRef.current.scale;
      const now = Date.now();

      if (pts.length === 1) {
        modeRef.current = s <= 1.01 ? "swipe" : "pan";
        panStartRef.current = {
          x: pts[0].x,
          y: pts[0].y,
          tx: trRef.current.tx,
          ty: trRef.current.ty,
          t: now,
        };
        return;
      }

      if (pts.length >= 2) {
        modeRef.current = "pinch";
        const a = pts[0];
        const b = pts[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;

        pinchRef.current = {
          startDist: dist,
          startScale: trRef.current.scale,
          lastCx: cx,
          lastCy: cy,
        };
      }
    },
    [clearTransitionTimer]
  );

  const onStagePointerMove = useCallback(() => {
    const pts = Array.from(pointersRef.current.values());
    if (!pts.length) return;

    const mode = modeRef.current;
    const curTr = trRef.current;

    if (mode === "pinch" && pts.length >= 2) {
      const a = pts[0];
      const b = pts[1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;

      const P = pinchRef.current;

      // scale
      const rawScale = (P.startScale || 1) * (dist / (P.startDist || 1));
      const nextScale = Math.min(MAX_SCALE, Math.max(1, rawScale));

      // focal point (premium): keep pinch center stable relative to stage center
      const L = layoutRef.current;
      const stageCx = (Number(L.stageL) || 0) + (Number(L.stageW) || 0) / 2;
      const stageCy = (Number(L.stageT) || 0) + (Number(L.stageH) || 0) / 2;

      const px = cx - stageCx;
      const py = cy - stageCy;

      const oldScale = curTr.scale || 1;
      const ratio = nextScale / (oldScale || 1);

      // center movement -> pan
      const dCx = cx - (P.lastCx || cx);
      const dCy = cy - (P.lastCy || cy);

      let tx = curTr.tx * ratio + px * (1 - ratio) + dCx;
      let ty = curTr.ty * ratio + py * (1 - ratio) + dCy;

      const out = clampTransform(tx, ty, nextScale);
      trRef.current = out;
      P.lastCx = cx;
      P.lastCy = cy;

      scheduleDom();
      return;
    }

    if (mode === "pan" && pts.length === 1) {
      const p = pts[0];
      const S = panStartRef.current;
      const dx = p.x - (S.x || 0);
      const dy = p.y - (S.y || 0);

      const out = clampTransform((S.tx || 0) + dx, (S.ty || 0) + dy, curTr.scale);
      trRef.current = out;
      scheduleDom();
      return;
    }

    if (mode === "swipe" && pts.length === 1) {
      const p = pts[0];
      const S = panStartRef.current;
      const dx = p.x - (S.x || 0);
      const dy = p.y - (S.y || 0);

      // only visual follow; decision on up
      // slight damping to feel “premium” without extra work
      const damp = 0.92;
      trRef.current = { scale: 1, tx: dx * damp, ty: dy * 0.12 };
      scheduleDom();
      return;
    }
  }, [MAX_SCALE, clampTransform, scheduleDom]);

  const onStagePointerUp = useCallback(() => {
    const pts = Array.from(pointersRef.current.values());
    const mode = modeRef.current;

    // If pinch ends to single pointer, switch to pan/swipe baseline
    if (mode === "pinch" && pts.length === 1) {
      const p = pts[0];
      modeRef.current = trRef.current.scale <= 1.01 ? "swipe" : "pan";
      panStartRef.current = {
        x: p.x,
        y: p.y,
        tx: trRef.current.tx,
        ty: trRef.current.ty,
        t: Date.now(),
      };
      return;
    }

    // Gesture finished
    if (pts.length === 0) {
      modeRef.current = "none";

      // Snap / decision
      if (trRef.current.scale <= 1.01) {
        const L = layoutRef.current;
        const w = Number(L.stageW) || window.innerWidth || 360;
        const threshold = Math.max(60, w * 0.15);

        const S = panStartRef.current;
        const dx = trRef.current.tx; // visual dx already stored in tx
        const dt = Math.max(1, Date.now() - (S.t || Date.now()));
        const vx = dx / dt;

        const mostlyHorizontal = Math.abs(dx) > Math.abs(trRef.current.ty) * 3;
        const flick = Math.abs(vx) > 0.9 && Math.abs(dx) > 30;

        if (mostlyHorizontal && (Math.abs(dx) > threshold || flick)) {
          if (dx < 0 && i < safeItems.length - 1) setI((p) => Math.min(safeItems.length - 1, p + 1));
          else if (dx > 0 && i > 0) setI((p) => Math.max(0, p - 1));
        }

        // always snap back to center
        resetTransform(true);
        return;
      }

      // scale > 1 : clamp and ease into bounds
      const { tx, ty, scale } = trRef.current;
      trRef.current = clampTransform(tx, ty, scale);
      applyDomNow(true);
    }
  }, [applyDomNow, clampTransform, i, resetTransform, safeItems.length]);

  const onStagePointerCancel = useCallback(() => {
    try {
      pointersRef.current.clear();
    } catch {}
    modeRef.current = "none";
    const { tx, ty, scale } = trRef.current;
    trRef.current = clampTransform(tx, ty, scale);
    applyDomNow(true);
  }, [applyDomNow, clampTransform]);

  const onAnyPointerMove = useCallback(
    (e) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      onStagePointerMove();
    },
    [onStagePointerMove]
  );

  const onAnyPointerUp = useCallback(
    (e) => {
      if (pointersRef.current.has(e.pointerId)) pointersRef.current.delete(e.pointerId);
      onStagePointerUp();
    },
    [onStagePointerUp]
  );

  const onAnyPointerCancel = useCallback(
    (e) => {
      if (pointersRef.current.has(e.pointerId)) pointersRef.current.delete(e.pointerId);
      onStagePointerCancel();
    },
    [onStagePointerCancel]
  );

  // Media dimension updates (cached only; no move-time measure)
  const onImageLoad = useCallback(
    (e) => {
      try {
        const img = e.currentTarget;
        layoutRef.current.mediaW = Number(img?.naturalWidth) || 0;
        layoutRef.current.mediaH = Number(img?.naturalHeight) || 0;

        measureStage();
        computeBaseFit();

        const out = clampTransform(trRef.current.tx, trRef.current.ty, trRef.current.scale);
        trRef.current = out;
        applyDomNow(false);
      } catch {}
    },
    [applyDomNow, clampTransform, computeBaseFit, measureStage]
  );

  const onVideoMeta = useCallback(
    (e) => {
      try {
        const v = e.currentTarget;
        layoutRef.current.mediaW = Number(v?.videoWidth) || 0;
        layoutRef.current.mediaH = Number(v?.videoHeight) || 0;

        measureStage();
        computeBaseFit();

        const out = clampTransform(trRef.current.tx, trRef.current.ty, trRef.current.scale);
        trRef.current = out;
        applyDomNow(false);
      } catch {}
    },
    [applyDomNow, clampTransform, computeBaseFit, measureStage]
  );

  // Unmount cleanup
  useEffect(() => {
    return () => {
      pauseVideo();
      clearTransitionTimer();
      cancelRaf();
      try {
        pointersRef.current.clear();
      } catch {}
    };
  }, [cancelRaf, clearTransitionTimer, pauseVideo]);

  if (!safeItems.length) return null;

  return (
    <div
      className="mylasa-lb-overlay"
      onPointerDown={(e) => {
        // only true backdrop tap closes
        if (e.target === e.currentTarget) safeClose();
      }}
    >
      <style>{cssText}</style>

      <button
        className="mylasa-lb-close"
        onClick={(e) => {
          e.stopPropagation();
          safeClose();
        }}
        aria-label="Kapat"
        title="Kapat"
      >
        ✕
      </button>

      {i > 0 && (
        <button
          className="mylasa-lb-nav left"
          onClick={(e) => {
            e.stopPropagation();
            setI((p) => Math.max(0, p - 1));
          }}
          aria-label="Önceki"
          title="Önceki"
        >
          ‹
        </button>
      )}

      {i < safeItems.length - 1 && (
        <button
          className="mylasa-lb-nav right"
          onClick={(e) => {
            e.stopPropagation();
            setI((p) => Math.min(safeItems.length - 1, p + 1));
          }}
          aria-label="Sonraki"
          title="Sonraki"
        >
          ›
        </button>
      )}

      <div
        ref={stageRef}
        className="mylasa-lb-stage"
        onPointerDown={onStagePointerDown}
        onPointerMove={onAnyPointerMove}
        onPointerUp={onAnyPointerUp}
        onPointerCancel={onAnyPointerCancel}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={transformRef} className="mylasa-lb-transform">
          {cur.type === "video" ? (
            <video
              ref={(el) => {
                videoRef.current = el;
              }}
              className="mylasa-lb-media"
              src={cur.url}
              controls
              playsInline
              onLoadedMetadata={onVideoMeta}
            />
          ) : (
            <img className="mylasa-lb-img" src={cur.url} alt={cur.title || "media"} draggable={false} onLoad={onImageLoad} />
          )}
        </div>
      </div>
    </div>
  );
}
