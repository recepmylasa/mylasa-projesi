import React, { useEffect, useRef, useState } from "react";
import "./styles.css";
import { rateContent } from "../../reputationClient";

const STAR_SIZE = 28;
const STAR_GAP = 8;
const ACTIVE_COLOR = "#F5C518"; // sarı
const OUTLINE_COLOR = "#000";
const FILL_COLOR = "#fff";

function StarIcon({ active, size = STAR_SIZE }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="mr-star"
    >
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.85L18.18 22 12 18.56 5.82 22 7 14.12l-5-4.85 6.91-1.01L12 2z"
        fill={active ? ACTIVE_COLOR : FILL_COLOR}
        stroke={OUTLINE_COLOR}
        strokeWidth="1.6"
      />
    </svg>
  );
}

/**
 * Tek ikon → uzun basınca 5'li seçici açılır.
 * Hızlı tık = 1★. Bırakınca seçili değer gönderilir.
 */
export default function StarRatingV2({
  contentId,
  authorId,
  type = "clip",
  className = "",
  onRated, // optional callback(value)
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [hoverVal, setHoverVal] = useState(0);
  const [pickerPos, setPickerPos] = useState({ left: 0, top: 0 });
  const [blast, setBlast] = useState(null); // {value, id} → center animasyon
  const timerRef = useRef(null);
  const pickerRef = useRef(null);

  // uzun bas – 300ms
  const onPointerDown = (e) => {
    e.preventDefault();
    const { clientX, clientY } = e.touches ? e.touches[0] : e;
    timerRef.current = setTimeout(() => {
      const panelWidth = STAR_SIZE * 5 + STAR_GAP * 4 + 16; // padding
      const left = Math.min(
        Math.max(clientX - panelWidth / 2, 8),
        window.innerWidth - panelWidth - 8
      );
      const top = Math.max(clientY - 64, 8);
      setPickerPos({ left, top });
      setHoverVal(3);
      setShowPicker(true);
    }, 300);
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // hızlı tık = 1★
  const onPointerUp = async (e) => {
    if (showPicker) return; // picker açıkken bırakma ayrı handle ediliyor
    if (timerRef.current) {
      clearTimer();
      await doRate(1);
    }
  };

  // picker açıkken hareket
  useEffect(() => {
    if (!showPicker) return;

    const handleMove = (e) => {
      const evt = e.touches ? e.touches[0] : e;
      if (!pickerRef.current) return;
      const rect = pickerRef.current.getBoundingClientRect();
      const x = Math.min(Math.max(evt.clientX - rect.left, 0), rect.width);
      const slot = Math.ceil(x / (STAR_SIZE + STAR_GAP));
      const val = Math.min(Math.max(slot, 1), 5);
      setHoverVal(val);
    };

    const handleUp = async (e) => {
      const rect = pickerRef.current?.getBoundingClientRect();
      const evt = e.changedTouches ? e.changedTouches[0] : e;
      const inside =
        rect &&
        evt.clientX >= rect.left &&
        evt.clientX <= rect.right &&
        evt.clientY >= rect.top &&
        evt.clientY <= rect.bottom;

      setShowPicker(false);
      if (inside) {
        await doRate(hoverVal || 1);
      }
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp, { passive: false });
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp, { passive: false });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPicker, hoverVal]);

  async function doRate(value) {
    try {
      await rateContent({ contentId, authorId, value, type });
      setBlast({ value, id: Math.random().toString(36).slice(2) });
      onRated?.(value);
      // opsiyonel ses
      const el = new Audio("/assets/sounds/star-chime.mp3");
      el.volume = 0.4;
      el.play().catch(() => {});
      setTimeout(() => setBlast(null), 900);
    } catch (err) {
      console.error("rateContent error:", err);
    }
  }

  return (
    <>
      <button
        className={`mr-starbtn ${className}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchEnd={onPointerUp}
        aria-label="Puan ver"
        title="Puan ver"
      >
        {/* tek, konturlu yıldız (beyaz iç, siyah çizgi) */}
        <StarIcon active={false} size={28} />
      </button>

      {showPicker && (
        <div
          ref={pickerRef}
          className="mr-picker"
          style={{ left: pickerPos.left, top: pickerPos.top }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <StarIcon key={i} active={i <= hoverVal} />
          ))}
        </div>
      )}

      {blast && (
        <div className="mr-blast" key={blast.id} aria-hidden="true">
          <StarIcon active size={120} />
          <span className="mr-blast-num">{blast.value}</span>
        </div>
      )}
    </>
  );
}
