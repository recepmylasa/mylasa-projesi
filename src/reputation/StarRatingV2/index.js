// src/reputation/StarRatingV2/index.js
// Masaüstünde ve listelerde yıldız tetikleyicilerini yakalayan AJAN.
// Amaç: (1) sayfa yenilenmesini durdurmak (2) popover'ı tıklanan yerde açmak
// (3) seçim yapıldığında görsel geri bildirim göstermek.

import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import StarRatingV2 from "../../components/StarRatingV2/StarRatingV2";
import { triggerStarFeedback } from "../../components/StarRatingV2/StarFeedbackAnimation";
import "./styles.css";

const CONTAINER_ID = "sr2-boot-root";

function Boot() {
  const [anchor, setAnchor] = useState(null); // {x,y} veya null
  const [key, setKey] = useState(0);

  useEffect(() => {
    // Olası tetikleyici seçimleri: akıştaki yıldız, yorum "puanla", eski StarRating butonları vs.
    const selectors = [
      ".sr2-trigger",
      ".mr-row .mr-starbtn",
      ".mr-chooser-btn",
      "[data-star-rate]",
      "[data-testid='rate-star']",
      "[aria-label*='puanla' i]",
      "[title*='puanla' i]",
      ".js-star-rate",
      ".rate-star",
    ];
    const isTrigger = (el) => el && el.closest && el.closest(selectors.join(","));

    const stopAll = (ev) => {
      if (ev.cancelable) ev.preventDefault();      // default (navigasyon) iptal
      ev.stopPropagation();                         // React bubble'ı kes
      if (ev.nativeEvent?.stopImmediatePropagation) {
        ev.nativeEvent.stopImmediatePropagation();  // capture/propagation tamamen kes
      }
      // Etiket <a> ise ve href varsa, anında boşalt ki tarayıcı follow etmesin
      const a = ev.target.closest && ev.target.closest("a[href]");
      if (a) a.setAttribute("data-sr2-skip", "1");
    };

    const openFromEvent = (ev) => {
      const match = isTrigger(ev.target);
      if (!match) return;
      stopAll(ev);

      const r = match.getBoundingClientRect();
      setAnchor({
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top),
      });
      setKey((k) => k + 1);
    };

    const opts = { capture: true, passive: false }; // iptal edebilmek için passive:false
    document.addEventListener("pointerdown", openFromEvent, opts);
    document.addEventListener("click", openFromEvent, opts);

    // Güvenlik için: data-sr2-skip flag’li anchorlarda bütün click’leri kesin
    const guard = (ev) => {
      const a = ev.target.closest && ev.target.closest("a[data-sr2-skip='1']");
      if (a) {
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
      }
    };
    document.addEventListener("click", guard, true);

    return () => {
      document.removeEventListener("pointerdown", openFromEvent, opts);
      document.removeEventListener("click", openFromEvent, opts);
      document.removeEventListener("click", guard, true);
    };
  }, []);

  // Bileşen kendi kapanınca anchor'ı sıfırla
  useEffect(() => {
    const onClose = () => setAnchor(null);
    window.addEventListener("mylasa:sr2-close", onClose);
    return () => window.removeEventListener("mylasa:sr2-close", onClose);
  }, []);

  if (!anchor) return null;

  return (
    <StarRatingV2
      key={key}
      openAt={anchor}
      size={28}
      onRate={(n) => {
        // UI geri bildirimi (sparkle & pop) – kayıt işini zorlamıyoruz
        triggerStarFeedback({ x: anchor.x, y: anchor.y, value: n });
        window.dispatchEvent(new CustomEvent("mylasa:sr2-close"));
      }}
    />
  );
}

(function mount() {
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = CONTAINER_ID;
    document.body.appendChild(host);
  }
  const root = createRoot(host);
  root.render(<Boot />);
})();

// NOT: Eğer bu dosya çalışmıyorsa, src/index.js'in EN ÜSTÜNE şunu ekle:
// import "./reputation/StarRatingV2";
