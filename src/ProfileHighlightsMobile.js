// src/ProfileHighlightsMobile.js
import React, { useMemo, useState, useEffect } from "react";
import "./ProfileHighlightsMobile.css";
import { PlusIcon } from "./icons";
import StoryModalMobile from "./StoryModalMobile";
import StoryModalDesktop from "./StoryModalDesktop";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
  });
  useEffect(() => {
    const mm = window.matchMedia("(max-width: 767px)");
    const handler = (e) => setIsMobile(e.matches);
    try { mm.addEventListener("change", handler); } catch { mm.addListener(handler); }
    setIsMobile(mm.matches);
    return () => {
      try { mm.removeEventListener("change", handler); } catch { mm.removeListener(handler); }
    };
  }, []);
  return isMobile;
}

function coverOf(h, fallbackAvatar) {
  return (
    h?.coverUrl ||
    h?.cover ||
    (Array.isArray(h?.stories) && h.stories[0]?.mediaUrl) ||
    fallbackAvatar ||
    "/avatars/default.png"
  );
}

export default function ProfileHighlightsMobile({ user, isSelf }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [activeStories, setActiveStories] = useState([]);

  const username = user?.username || user?.kullaniciAdi || "kullanıcı";
  const avatarUrl =
    user?.avatar || user?.profilFoto || user?.photoURL || "/avatars/default.png";

  const highlights = useMemo(() => {
    const arr = Array.isArray(user?.highlights) ? user.highlights : [];
    return arr
      .map((h, i) => ({
        id: h?.id || `hl-${i}`,
        title: h?.title || h?.name || "Öne Çıkan",
        coverUrl: coverOf(h, avatarUrl),
        stories: Array.isArray(h?.stories) ? h.stories : [],
      }))
      .sort((a, b) => (b.stories?.length || 0) - (a.stories?.length || 0));
  }, [user, avatarUrl]);

  const openHighlight = (h) => {
    if (!h?.stories || h.stories.length === 0) return;
    setActiveStories(h.stories);
    setOpen(true);
  };

  const handleCreateClick = () => {
    alert("Öne çıkan oluşturma akışı yakında eklenecek.");
  };

  if (!isSelf && highlights.length === 0) return null;

  return (
    <div className="phl-container" role="region" aria-label={`${username} öne çıkanlar`}>
      <div className="phl-scroll" role="list">
        {isSelf && (
          <button
            type="button"
            className="phl-item phl-add"
            onClick={handleCreateClick}
            role="listitem"
            aria-label="Yeni öne çıkan"
            title="Yeni"
          >
            <div className="phl-ring phl-ring--plain">
              <div className="phl-inner">
                <div className="phl-add-icon">
                  <PlusIcon size={22} />
                </div>
              </div>
            </div>
            <span className="phl-label">Yeni</span>
          </button>
        )}

        {highlights.map((h) => (
          <button
            key={h.id}
            type="button"
            className="phl-item"
            onClick={() => openHighlight(h)}
            role="listitem"
            aria-label={`Öne çıkan: ${h.title}`}
            title={h.title}
          >
            <div className="phl-ring phl-ring--plain">
              <div className="phl-inner">
                <img
                  className="phl-cover"
                  src={h.coverUrl}
                  alt={`${h.title} kapağı`}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
            <span className="phl-label">{h.title}</span>
          </button>
        ))}
      </div>

      {open &&
        (isMobile ? (
          <StoryModalMobile stories={activeStories} onClose={() => setOpen(false)} />
        ) : (
          <StoryModalDesktop stories={activeStories} onClose={() => setOpen(false)} />
        ))}
    </div>
  );
}
