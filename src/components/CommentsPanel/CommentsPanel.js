// src/components/CommentsPanel/CommentsPanel.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getComments, addComment } from "../../commentsClient";
import "./CommentsPanel.css";

function ts(v) {
  if (!v) return 0;
  if (typeof v === "number") return v < 2e12 ? v * 1000 : v;
  if (v.seconds) return v.seconds * 1000;
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
  if (h < 24) return `${h}s önce`;
  const g = Math.floor(h / 24);
  return `${g}g önce`;
}

/**
 * IG’ye yakın, aşağıdan açılan yorum paneli (WRITE-ENABLED).
 * Props:
 *  - open: boolean
 *  - contentId: string
 *  - onClose: fn()
 *  - initialLocal?: array
 */
export default function CommentsPanel({ open, contentId, onClose, initialLocal }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isEnd, setIsEnd] = useState(false);

  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const sentinelRef = useRef(null);

  // panel açıldığında inputa fokusla
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // panel açıldığında ilk veriyi çek
  useEffect(() => {
    if (!open || !contentId) return;
    let mounted = true;

    // yerel (karttan) varsa önce onu göster
    if (!initialized) {
      const primed = Array.isArray(initialLocal) ? initialLocal : [];
      const mapped = primed.map((y, i) => ({
        id: y.id || `local-${i}`,
        text: y.text || y.mesaj || "",
        authorId: y.userId || y.authorId || "",
        authorName: y.userName || y.username || "kullanıcı",
        authorPhoto: y.userPhoto || y.photoURL || y.avatar || "",
        createdAt: y.tarih || y.createdAt || y.timestamp || null,
      }));
      if (mapped.length) setItems(mapped);
    }

    (async () => {
      setLoading(true);
      try {
        const { items: first, nextCursor } = await getComments({
          contentId,
          pageSize: 25,
        });
        if (!mounted) return;
        setItems((prev) => mergeUnique(prev, first));
        setCursor(nextCursor);
        setIsEnd(!nextCursor);
        setInitialized(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [open, contentId, initialized, initialLocal]);

  // sonsuz kaydırma
  useEffect(() => {
    if (!open || isEnd) return;
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (loading || !cursor) return;
      setLoading(true);
      try {
        const { items: more, nextCursor } = await getComments({
          contentId,
          pageSize: 25,
          cursor,
        });
        setItems((prev) => mergeUnique(prev, more));
        setCursor(nextCursor);
        setIsEnd(!nextCursor);
      } finally {
        setLoading(false);
      }
    }, { rootMargin: "600px 0px 1200px 0px", threshold: 0.01 });

    io.observe(el);
    return () => io.disconnect();
  }, [open, contentId, cursor, loading, isEnd]);

  // ESC/backdrop kapatmayı üst bileşen yönetiyor.
  const stop = (e) => e.stopPropagation();

  const list = useMemo(() => items, [items]);

  const canSend = draft.trim().length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const optimistic = await addComment({ contentId, text });
      // En yeni üstte: başa ekleyelim (liste desc ise uyumlu)
      setItems((prev) => mergeUnique([optimistic, ...prev], []));
      setDraft("");
      // Not: serverTimestamp güncellendiğinde, sonraki sayfa/yeniden yüklemede hizalanır
    } catch (e) {
      alert(e?.message || "Yorum eklenemedi.");
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }, [draft, submitting, contentId]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
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
            placeholder="Yorum ekle…"
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
}

function mergeUnique(prev, add) {
  const map = new Map(prev.map((x) => [x.id, x]));
  for (const it of add) {
    if (!it || !it.id) continue;
    map.set(it.id, it);
  }
  return Array.from(map.values());
}
