// FILE: src/QuickCreateSheetMobile.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./QuickCreateSheetMobile.css";

const DIFFS = [
  { id: "easy", label: "Kolay" },
  { id: "mid", label: "Orta" },
  { id: "hard", label: "Zor" },
];

export default function QuickCreateSheetMobile({
  open = false,
  onClose = () => {},
  onContinueMap = null, // mevcut “Haritada oluştur (gelişmiş)” akışı
  onDraftCreated = null, // V0: sadece local state + toast
}) {
  const sheetRef = useRef(null);
  const startYRef = useRef(0);
  const [dy, setDy] = useState(0);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [diff, setDiff] = useState("easy");
  const [titleError, setTitleError] = useState(false);

  const [toast, setToast] = useState("");
  const toastTmrRef = useRef(0);

  const [keyboardLift, setKeyboardLift] = useState(0);

  const canContinueMap = typeof onContinueMap === "function";

  const showToast = useCallback((msg, ms = 2200) => {
    try {
      setToast(String(msg || ""));
    } catch {}
    try {
      if (toastTmrRef.current) clearTimeout(toastTmrRef.current);
    } catch {}
    toastTmrRef.current = window.setTimeout(() => {
      try {
        setToast("");
      } catch {}
      toastTmrRef.current = 0;
    }, ms);
  }, []);

  const closeSafe = useCallback(() => {
    try {
      onClose?.();
    } catch {}
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document?.body?.style?.overflow || "";
    try {
      document.body.style.overflow = "hidden";
    } catch {}
    return () => {
      try {
        document.body.style.overflow = prev;
      } catch {}
    };
  }, [open]);

  // cleanup
  useEffect(() => {
    return () => {
      try {
        if (toastTmrRef.current) clearTimeout(toastTmrRef.current);
      } catch {}
      toastTmrRef.current = 0;
    };
  }, []);

  // open reset
  useEffect(() => {
    if (!open) return;
    setDy(0);
    setTitleError(false);
  }, [open]);

  // Keyboard lift (VisualViewport)
  useEffect(() => {
    if (!open) {
      setKeyboardLift(0);
      return;
    }
    if (typeof window === "undefined") return;

    const vv = window.visualViewport;
    if (!vv) return;

    const compute = () => {
      try {
        const lift = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        setKeyboardLift(Number.isFinite(lift) ? lift : 0);
      } catch {
        setKeyboardLift(0);
      }
    };

    compute();
    vv.addEventListener("resize", compute);
    vv.addEventListener("scroll", compute);
    return () => {
      vv.removeEventListener("resize", compute);
      vv.removeEventListener("scroll", compute);
    };
  }, [open]);

  const sheetBottom = useMemo(() => {
    const lift = Number.isFinite(keyboardLift) ? keyboardLift : 0;
    return `calc(10px + env(safe-area-inset-bottom, 0px) + ${lift}px)`;
  }, [keyboardLift]);

  // drag close (handle area)
  const onTouchStart = useCallback((e) => {
    startYRef.current = e.touches?.[0]?.clientY ?? 0;
    setDy(0);
  }, []);

  const onTouchMove = useCallback((e) => {
    const y = e.touches?.[0]?.clientY ?? 0;
    const delta = Math.max(0, y - startYRef.current);
    setDy(Math.min(160, delta));
  }, []);

  const onTouchEnd = useCallback(() => {
    if (dy > 90) {
      closeSafe();
      setDy(0);
      return;
    }
    setDy(0);
  }, [dy, closeSafe]);

  const handleDraft = useCallback(() => {
    const t = String(title || "").trim();
    if (!t) {
      setTitleError(true);
      showToast("Rota başlığı gerekli.", 2000);
      return;
    }
    setTitleError(false);

    const payload = {
      title: t,
      desc: String(desc || "").trim(),
      diff: diff || "easy",
      createdAt: Date.now(),
    };

    try {
      onDraftCreated?.(payload);
    } catch {}

    // V0: sadece toast (Firestore yazım yok)
    showToast("Taslak oluşturuldu. (Kayıt yakında)", 2200);
  }, [title, desc, diff, onDraftCreated, showToast]);

  const handleContinueMap = useCallback(() => {
    closeSafe();
    window.setTimeout(() => {
      try {
        onContinueMap?.();
      } catch {}
    }, 0);
  }, [closeSafe, onContinueMap]);

  return (
    <>
      {open && <div className="qcs-backdrop" onClick={closeSafe} aria-hidden="true" />}

      <div
        ref={sheetRef}
        className={`qcs-sheet ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Hızlı rota oluştur"
        aria-hidden={!open}
        style={{
          transform: open ? `translateY(${dy}px)` : undefined,
          bottom: sheetBottom,
        }}
      >
        <div
          className="qcs-handleArea"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-hidden="true"
        >
          <div className="qcs-handle" />
        </div>

        <div className="qcs-head">
          <div className="qcs-title">Hızlı rota oluştur</div>
          <button type="button" className="qcs-close" onClick={closeSafe} aria-label="Kapat">
            ✕
          </button>
        </div>

        <div className="qcs-body">
          <label className="qcs-field">
            <span className="qcs-label">Rota başlığı (zorunlu)</span>
            <input
              className={`qcs-input ${titleError ? "is-error" : ""}`}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false);
              }}
              placeholder="Örn. Milas sahil yürüyüşü"
              inputMode="text"
              autoComplete="off"
            />
          </label>

          <label className="qcs-field">
            <span className="qcs-label">Kısa açıklama (opsiyonel)</span>
            <textarea
              className="qcs-textarea"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="2–3 cümle…"
              rows={3}
            />
          </label>

          <div className="qcs-field">
            <span className="qcs-label">Zorluk</span>
            <div className="qcs-pills" role="radiogroup" aria-label="Zorluk seçimi">
              {DIFFS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`qcs-pill ${diff === d.id ? "is-active" : ""}`}
                  aria-pressed={diff === d.id}
                  onClick={() => setDiff(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="qcs-ctas">
            <button
              type="button"
              className="qcs-btn qcs-btn--ghost"
              onClick={canContinueMap ? handleContinueMap : undefined}
              disabled={!canContinueMap}
              title={!canContinueMap ? "Şimdilik devre dışı." : ""}
            >
              Haritada devam et (gelişmiş)
            </button>

            <button type="button" className="qcs-btn qcs-btn--primary" onClick={handleDraft}>
              Taslak oluştur
            </button>
          </div>

          <div className="qcs-footNote">
            Not: V0’da taslak sadece bu ekranda tutulur. Firestore’a yazım bir sonraki sprint.
          </div>
        </div>

        <div className="qcs-safe" aria-hidden="true" />
      </div>

      {!!toast && <div className="qcs-toast">{toast}</div>}
    </>
  );
}