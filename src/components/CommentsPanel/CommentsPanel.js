// FILE: src/components/CommentsPanel/CommentsPanel.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { getComments, addComment } from "../../commentsClient";
import "./CommentsPanel.css";

function ts(v) {
  if (!v) return 0;
  if (typeof v === "number") return v < 2e12 ? v * 1000 : v;
  if (v?.seconds) return v.seconds * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}
function relTimeTR(input) {
  const d = ts(input);
  if (!d) return "";
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return `${diff}s önce`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa önce`;
  const g = Math.floor(h / 24);
  return `${g}g önce`;
}

/**
 * IG’ye yakın, aşağıdan açılan yorum paneli (WRITE-ENABLED).
 * Props:
 *  - open: boolean
 *  - contentId?: string
 *  - targetType?: string ("route" vb.)
 *  - targetId?: string
 *  - onClose: fn()
 *  - initialLocal?: array
 *  - placeholder?: string
 *  - portalTarget?: HTMLElement | { current: HTMLElement | null } (opsiyonel, geriye uyumlu)
 */
export default function CommentsPanel({
  open,
  contentId,
  targetType,
  targetId,
  onClose,
  initialLocal,
  placeholder = "Yorum ekle…",
  portalTarget,
}) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isEnd, setIsEnd] = useState(false);

  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const sentinelRef = useRef(null);

  // ✅ EMİR 12: targetType/targetId varsa contentId'i yok say (tek standart kaynak kilidi)
  const hasTarget = !!(targetType && targetId);
  const effectiveContentId = hasTarget ? undefined : contentId;

  const keySig = useMemo(() => {
    if (hasTarget) return `${String(targetType)}:${String(targetId)}`;
    if (contentId) return String(contentId);
    return "";
  }, [hasTarget, targetType, targetId, contentId]);

  // state snapshot (deps şişirmeden kontrol)
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // hedef değişince reset (ileri uyumluluk)
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setIsEnd(false);
    setDraft("");
    setSubmitting(false);
  }, [keySig]);

  // panel açıldığında inputa fokusla
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ✅ panel açılışını tek sefer yakala (double-fetch/spam fix)
  const prevOpenRef = useRef(false);

  // panel açıldığında ilk veriyi çek (B yolu)
  useEffect(() => {
    const becameOpen = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (!becameOpen) return;
    if (!keySig) return;

    let mounted = true;

    // yerel (karttan) varsa önce onu göster (sadece liste boşsa)
    try {
      if (itemsRef.current.length === 0) {
        const primed = Array.isArray(initialLocal) ? initialLocal : [];
        const mapped = primed.map((y, i) => ({
          id: y.id || `local-${i}`,
          text: y.text || y.mesaj || "",
          authorId: y.userId || y.authorId || "",
          authorName: y.userName || y.username || "kullanıcı",
          authorPhoto: y.userPhoto || y.photoURL || y.avatar || "",
          createdAt: y.tarih || y.createdAt || y.timestamp || null,
        }));
        if (mapped.length) setItems((prev) => mergeUnique(prev, mapped));
      }
    } catch {
      // no-op
    }

    (async () => {
      setLoading(true);
      try {
        const { items: first, nextCursor } = await getComments({
          contentId: effectiveContentId,
          targetType,
          targetId,
          pageSize: 25,
        });
        if (!mounted) return;

        setItems((prev) => mergeUnique(prev, first));
        setCursor(nextCursor);
        setIsEnd(!nextCursor);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [open, keySig, effectiveContentId, targetType, targetId, initialLocal]);

  // sonsuz kaydırma
  useEffect(() => {
    if (!open || isEnd) return;
    if (!keySig) return;

    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      async (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loading || !cursor) return;

        setLoading(true);
        try {
          const { items: more, nextCursor } = await getComments({
            contentId: effectiveContentId,
            targetType,
            targetId,
            pageSize: 25,
            cursor,
          });
          setItems((prev) => mergeUnique(prev, more));
          setCursor(nextCursor);
          setIsEnd(!nextCursor);
        } finally {
          setLoading(false);
        }
      },
      { rootMargin: "600px 0px 1200px 0px", threshold: 0.01 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [open, keySig, cursor, loading, isEnd, effectiveContentId, targetType, targetId]);

  // ESC/backdrop kapatmayı üst bileşen yönetiyor.
  const stop = (e) => e.stopPropagation();

  const list = useMemo(() => items, [items]);

  const canSend = draft.trim().length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    const text = draft.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      const optimistic = await addComment({
        contentId: effectiveContentId,
        targetType,
        targetId,
        text,
      });

      // En yeni üstte: mergeUnique zaten createdAt desc sıralar
      setItems((prev) => mergeUnique([optimistic], prev));
      setDraft("");

      // ADIM 31: Hafif analitik tetikleyici (route yorumları)
      try {
        if (typeof window !== "undefined" && window.dispatchEvent) {
          const detail = {
            event: targetType === "route" ? "route_comment_added" : "content_comment_added",
          };
          if (targetType) detail.targetType = targetType;
          if (targetId) detail.targetId = targetId;
          if (targetType === "route" && targetId) detail.routeId = targetId;

          window.dispatchEvent(new CustomEvent("analytics", { detail }));
        }
      } catch {
        // analytics hataları akışı bozmasın
      }
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.message || "Yorum eklenemedi.");
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }, [draft, submitting, effectiveContentId, targetType, targetId]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const node = (
    <div
      className={"cp-backdrop" + (open ? " open" : "")}
      role="presentation"
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        className={"cp-sheet" + (open ? " open" : "")}
        role="dialog"
        aria-modal="true"
        aria-label="Yorumlar"
        onClick={stop}
      >
        <div className="cp-handle" />
        <div className="cp-title">Yorumlar</div>

        <div className="cp-list" role="list">
          {list.length === 0 && (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="cp-item skel" role="listitem" aria-hidden="true">
                  <div className="cp-avatar skel-block" />
                  <div className="cp-body">
                    <div className="cp-skel-line w60" />
                    <div className="cp-skel-line w90" />
                  </div>
                </div>
              ))}
            </>
          )}

          {list.map((c) => (
            <div key={c.id} className="cp-item" role="listitem">
              {c.authorPhoto ? (
                <img className="cp-avatar" src={c.authorPhoto} alt="" />
              ) : (
                <div className="cp-avatar placeholder" />
              )}
              <div className="cp-body">
                <div className="cp-line">
                  <strong className="cp-name">{c.authorName || "kullanıcı"}</strong>
                  <span className="cp-time">{relTimeTR(c.createdAt)}</span>
                </div>
                <div className="cp-text">{c.text}</div>
              </div>
            </div>
          ))}

          {!isEnd && (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={"skel-more-" + i} className="cp-item skel" aria-hidden="true">
                  <div className="cp-avatar skel-block" />
                  <div className="cp-body">
                    <div className="cp-skel-line w70" />
                    <div className="cp-skel-line w80" />
                  </div>
                </div>
              ))}
              <div ref={sentinelRef} className="cp-sentinel" aria-hidden="true" />
            </>
          )}
        </div>

        <div className="cp-input">
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={submitting}
          />
          <button onClick={handleSubmit} disabled={!canSend}>
            Paylaş
          </button>
        </div>
      </div>
    </div>
  );

  // ✅ EMİR 18-6: portalTarget desteği (geriye uyumlu)
  const targetEl = portalTarget?.current || portalTarget || null;
  return targetEl ? createPortal(node, targetEl) : node;
}

function mergeUnique(a, b) {
  const map = new Map();
  (a || []).forEach((x) => {
    if (x?.id) map.set(x.id, x);
  });
  (b || []).forEach((x) => {
    if (x?.id) map.set(x.id, x);
  });

  const arr = Array.from(map.values());
  arr.sort((x, y) => ts(y?.createdAt) - ts(x?.createdAt));
  return arr;
}
