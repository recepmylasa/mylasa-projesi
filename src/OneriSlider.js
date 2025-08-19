import React, { useEffect, useMemo, useRef, useState } from "react";
import "./OneriSlider.css";

/**
 * İnce “Spotlight” şeridi
 * Chip/kapsül kartlar: profile | event | place | info
 * - Küçük, sosyal uygulama hissi
 * - Hafif parıltı, avatar/ikon + başlık + mini alt yazı
 * - Tıklanınca parent’tan gelen callback çalışır
 */

const kinds = {
  profile: { pill: "Haftanın Profil", emoji: "⭐" },
  event:   { pill: "Etkinlik",        emoji: "🎟️" },
  place:   { pill: "Mekan",           emoji: "📍" },
  info:    { pill: "Güncel",          emoji: "⚡" }
};

export default function OneriSlider({
  items,
  onOpenProfile = () => {},
  onOpenEvent   = () => {},
  onOpenPlace   = () => {},
  onOpenInfo    = () => {},
  autoplayMs = 0   // default: otomatik gitmesin (sosyal his için dokun-çek)
}) {
  const data = useMemo(() => (Array.isArray(items) && items.length ? items : demo), [items]);
  const scrollerRef = useRef(null);
  const [active, setActive] = useState(0);
  const timerRef = useRef(null);

  // ilk konum
  useEffect(() => { setTimeout(() => scrollerRef.current?.scrollTo({ left: 0, behavior: "smooth" }), 10); }, []);

  // autoplay istenirse
  useEffect(() => {
    if (!autoplayMs) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      if (el.matches(":hover")) return;
      const step = el.clientWidth * 0.6;
      el.scrollBy({ left: step, behavior: "smooth" });
    }, autoplayMs);
    return () => clearInterval(timerRef.current);
  }, [autoplayMs]);

  // aktif noktayı güncelle
  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const cards = Array.from(el.querySelectorAll(".spot-card"));
    if (!cards.length) return;
    let best = 0, bestDist = Infinity;
    const center = el.getBoundingClientRect().left + el.clientWidth / 2;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = Math.abs((r.left + r.right) / 2 - center);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setActive(best);
  };

  const handleClick = (it) => {
    const t = it.type;
    if (t === "profile") return onOpenProfile(it);
    if (t === "event")   return onOpenEvent(it);
    if (t === "place")   return onOpenPlace(it);
    return onOpenInfo(it);
  };

  return (
    <section className="spot-wrap" aria-label="Öne çıkanlar">
      <div className="spot-scroller" ref={scrollerRef} onScroll={onScroll}>
        {data.map((it, i) => {
          const kind = kinds[it.type] || kinds.info;
          return (
            <button
              key={it.id || i}
              className={`spot-card ${i === active ? "is-active" : ""}`}
              onClick={() => handleClick(it)}
              aria-label={`${kind.pill}: ${it.title || it.username || it.name}`}
            >
              <div className="spot-media">
                {it.avatar || it.cover ? (
                  <img
                    src={it.avatar || it.cover}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="spot-emoji">{it.emoji || kind.emoji}</span>
                )}
                {it.badge && <span className="spot-badge">{it.badge}</span>}
              </div>

              <div className="spot-text">
                <span className="spot-pill">{kind.pill}</span>
                <span className="spot-title">
                  {it.title || it.username || it.name}
                </span>
                {it.subtitle || it.meta ? (
                  <span className="spot-sub">{it.subtitle || it.meta}</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="spot-dots" role="tablist">
        {data.map((_, i) => (
          <span key={i} className={`spot-dot ${i === active ? "on" : ""}`} />
        ))}
      </div>
    </section>
  );
}

// Demo veri (backend gelene kadar)
const demo = [
  { type: "profile", username: "recepasik", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80", subtitle: "@recepasik" },
  { type: "event",   title: "Milas’ta etkinlikler", cover: "https://images.unsplash.com/photo-1521337581557-69409f33f1d0?w=600&q=80", meta: "Güncel" },
  { type: "place",   name: "Aplangeç Çayevi", cover: "https://images.unsplash.com/photo-1498654200943-1088dd4438ae?w=600&q=80", badge: "Kafe", subtitle: "Milas Çarşı" },
  { type: "info",    title: "Mylasa Plus yakında", emoji: "⚡", subtitle: "Reklamsız + gelişmiş harita" },
];
