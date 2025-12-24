// src/components/StopComposerSheetMobile.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./StopComposerSheetMobile.css";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function StopComposerSheetMobile({ open, onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef(null);

  const canSubmit = useMemo(() => {
    const t = String(title || "").trim();
    return t.length > 0 && !submitting;
  }, [title, submitting]);

  // Open/close lifecycle: reset + focus + body scroll lock
  useEffect(() => {
    if (!open) {
      setTitle("");
      setNote("");
      setSubmitting(false);
      return;
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t = setTimeout(() => {
      try {
        titleRef.current?.focus?.();
      } catch {}
    }, 50);

    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!submitting) onClose?.();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, submitting, onClose]);

  const handleBackdrop = useCallback(() => {
    if (submitting) return;
    onClose?.();
  }, [submitting, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    const safeTitle = String(title || "").trim();
    const safeNote = String(note || "");

    setSubmitting(true);
    const startedAt = Date.now();

    try {
      // parent submit (routeStore / recorder) — hata olursa sessizce düş
      await Promise.resolve(onSubmit?.({ title: safeTitle, note: safeNote }));
    } catch {}

    // "premium" kısa loading hissi (0.3–0.6sn aralığında min delay)
    const minMs = 420;
    const elapsed = Date.now() - startedAt;
    if (elapsed < minMs) {
      await sleep(minMs - elapsed);
    }

    setSubmitting(false);
    onClose?.();
    // close ile birlikte reset effect çalışacak
  }, [canSubmit, title, note, onSubmit, onClose]);

  if (!open) return null;

  return (
    <div className="scs-root" role="dialog" aria-modal="true" aria-label="Durak ekle">
      <div className="scs-backdrop" onMouseDown={handleBackdrop} onTouchStart={handleBackdrop} />
      <div
        className="scs-sheet"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="scs-handle" />

        <div className="scs-header">
          <div className="scs-title">Durak ekle</div>
          <button
            type="button"
            className="scs-close"
            onClick={() => {
              if (!submitting) onClose?.();
            }}
            aria-label="Kapat"
            title="Kapat"
          >
            ✕
          </button>
        </div>

        <div className="scs-body">
          <label className="scs-label" htmlFor="scs-title-input">
            Durak başlığı
          </label>
          <input
            id="scs-title-input"
            ref={titleRef}
            className="scs-input"
            placeholder="Durak başlığı"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
            autoComplete="off"
            maxLength={80}
          />

          <label className="scs-label" htmlFor="scs-note-input">
            Not
          </label>
          <textarea
            id="scs-note-input"
            className="scs-textarea"
            placeholder="Not (opsiyonel)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            rows={4}
            maxLength={600}
          />
        </div>

        <div className="scs-footer">
          <button
            type="button"
            className={`scs-cta ${canSubmit ? "" : "is-disabled"} ${submitting ? "is-loading" : ""}`}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <span className="scs-spinner" aria-hidden="true" />
                Ekleniyor…
              </>
            ) : (
              "Durağı ekle"
            )}
          </button>

          {!String(title || "").trim() && (
            <div className="scs-hint">Başlık zorunlu.</div>
          )}
        </div>
      </div>
    </div>
  );
}
