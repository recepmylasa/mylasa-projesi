// Mobil profil: üst bar + avatar/stats + aksiyon şeridi + sekmeler (grid / clips / saved / tagged)
// Bu sürümde: Profil ızgarasındaki karta dokununca tam ekran mobil viewer açılır (yukarı kaydırmalı feed).

import React, { useState, useCallback } from "react";
import "./ProfileMobile.css";
import { GridIcon, ClipsIcon, SavedIcon, TaggedIcon } from "./icons";
import UserPosts from "./UserPosts";
import ProfilePostViewerMobile from "./ProfilePostViewerMobile";

export default function ProfileMobile({ user = null }) {
  // user null/undefined gelebilir → güvenli alias
  const u = user ?? {};
  // id alanı farklı isimlerle gelebilir → hepsini dene
  const userId = u.id ?? u.uid ?? u.userId ?? u.accountId ?? u._id ?? null;
  const hasUserId = !!userId;

  const [mode, setMode] = useState("grid");
  const [viewer, setViewer] = useState(null); // { items, index }

  const avatarUrl =
    u.photoURL || u.profilFoto || u.avatar || "/avatars/default.png";
  const username = u.username || u.kullaniciAdi || "kullanıcı";

  const onOpenFromGrid = useCallback((items, startIndex) => {
    if (!Array.isArray(items) || items.length === 0) return;
    setViewer({
      items,
      index: Math.max(0, Math.min(startIndex ?? 0, items.length - 1)),
    });
  }, []);

  const closeViewer = useCallback(() => setViewer(null), []);

  return (
    <div className="profile-mobile">
      {/* Üst bar */}
      <div className="mobile-topbar">
        <button
          type="button"
          onClick={() =>
            window.history.length > 1
              ? window.history.back()
              : window.location.assign("/")
          }
          className="icon-btn"
          aria-label="Geri"
          title="Geri"
        >
          ‹
        </button>

        <div className="mobile-username" aria-live="polite">
          {username}
        </div>

        <div className="topbar-kebab" aria-hidden="true">⋯</div>
      </div>

      {/* Avatar + istatistikler */}
      <div className="mobile-avatar-row">
        <div className="avatar-ring-sm">
          <img alt={`${username} avatar`} src={avatarUrl} />
        </div>

        <div className="mobile-stats">
          <div>
            <div className="count">{u.postsCount ?? 0}</div>
            <div className="label">gönderi</div>
          </div>
          <div>
            <div className="count">{u.followersCount ?? 0}</div>
            <div className="label">takipçi</div>
          </div>
          <div>
            <div className="count">{u.followingCount ?? 0}</div>
            <div className="label">takip</div>
          </div>
        </div>
      </div>

      {/* Aksiyon buton şeridi (IG stili) */}
      <div className="profile-actions" role="group" aria-label="Profil aksiyonları">
        <button type="button" className="action-btn">Profili düzenle</button>
        <button type="button" className="action-btn">Profili paylaş</button>
        <button type="button" className="action-btn">Abonelik</button>
        <button
          type="button"
          className="action-btn more"
          aria-label="Diğer seçenekler"
          title="Diğer"
          onClick={() => {}}
        >
          ⌄
        </button>
      </div>

      {/* Sekmeler */}
      <div className="mobile-tabs" role="tablist" aria-label="Profil sekmeleri">
        <a
          href="#"
          role="tab"
          aria-selected={mode === "grid"}
          className={`mobile-tab ${mode === "grid" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setMode("grid"); }}
          aria-label="Gönderiler"
          title="Gönderiler"
        >
          <GridIcon size={24} />
        </a>
        <a
          href="#"
          role="tab"
          aria-selected={mode === "clips"}
          className={`mobile-tab ${mode === "clips" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setMode("clips"); }}
          aria-label="Klipler"
          title="Klipler"
        >
          <ClipsIcon size={24} />
        </a>
        <a
          href="#"
          role="tab"
          aria-selected={mode === "saved"}
          className={`mobile-tab ${mode === "saved" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setMode("saved"); }}
          aria-label="Kaydedilenler"
          title="Kaydedilenler"
        >
          <SavedIcon size={24} active={mode === "saved"} />
        </a>
        <a
          href="#"
          role="tab"
          aria-selected={mode === "tagged"}
          className={`mobile-tab ${mode === "tagged" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setMode("tagged"); }}
          aria-label="Etiketlenenler"
          title="Etiketlenenler"
        >
          <TaggedIcon size={24} />
        </a>
      </div>

      {/* İçerik: userId yoksa render etmeyelim */}
      {mode === "grid" && hasUserId && (
        <div className="userposts-container">
          <UserPosts userId={userId} onOpen={onOpenFromGrid} />
        </div>
      )}

      {mode === "clips" && hasUserId && (
        <div className="userposts-container">
          <UserPosts userId={userId} onlyClips onOpen={onOpenFromGrid} />
        </div>
      )}

      {/* userId henüz yoksa basit placeholder */}
      {!hasUserId && (
        <div className="userposts-container">
          <div className="user-posts-message">Profil yükleniyor…</div>
        </div>
      )}

      {mode !== "grid" && mode !== "clips" && (
        <div className="tab-empty">Bu sekme Sprint 2’de detaylandırılacak.</div>
      )}

      {/* Tam ekran mobil viewer */}
      {viewer && (
        <ProfilePostViewerMobile
          items={viewer.items}
          startIndex={viewer.index}
          onClose={closeViewer}
          viewerUser={{ name: username, avatar: avatarUrl }}
        />
      )}
    </div>
  );
}
