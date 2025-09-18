// Mobil profil: üst bar + avatar/stats + aksiyon şeridi + sekmeler (grid / clips / saved / tagged)
// Bu sürümde: Profil ızgarasındaki karta dokununca tam ekran mobil viewer açılır (yukarı kaydırmalı feed).

import React, { useState, useCallback } from "react";
import "./ProfileMobile.css";
import { GridIcon, ClipsIcon, SavedIcon, TaggedIcon, KebabIcon } from "./icons";
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

  // kişisel hesap varsayılan; yalnızca iş/creator profilde abonelik göster
  const isBizOrCreator =
    u.accountType === "business" ||
    u.accountType === "creator" ||
    u.isBusiness === true ||
    u.isPro === true ||
    u.professional === true;

  const showSubscription = !!u.hasSubscriptions && isBizOrCreator;

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

        <button
          type="button"
          className="icon-btn topbar-icon"
          aria-label="Seçenekler"
          title="Seçenekler"
        >
          <KebabIcon direction="vertical" size={22} />
        </button>
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
        {showSubscription && (
          <button type="button" className="action-btn">Abonelik</button>
        )}
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
          aria-controls="tab-panel-grid"
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
          aria-controls="tab-panel-clips"
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
          aria-controls="tab-panel-saved"
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
          aria-controls="tab-panel-tagged"
          className={`mobile-tab ${mode === "tagged" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setMode("tagged"); }}
          aria-label="Etiketlenenler"
          title="Etiketlenenler"
        >
          <TaggedIcon size={24} />
        </a>
      </div>

      {/* İçerik panelleri */}
      <div
        id="tab-panel-grid"
        role="tabpanel"
        hidden={mode !== "grid"}
        className="tab-panel"
      >
        {hasUserId ? (
          <div className="userposts-container">
            <UserPosts userId={userId} onOpen={onOpenFromGrid} />
          </div>
        ) : (
          <div className="userposts-container">
            <div className="user-posts-message">Profil yükleniyor…</div>
          </div>
        )}
      </div>

      <div
        id="tab-panel-clips"
        role="tabpanel"
        hidden={mode !== "clips"}
        className="tab-panel"
      >
        {hasUserId ? (
          <div className="userposts-container">
            <UserPosts userId={userId} onlyClips onOpen={onOpenFromGrid} />
          </div>
        ) : (
          <div className="userposts-container">
            <div className="user-posts-message">Profil yükleniyor…</div>
          </div>
        )}
      </div>

      <div
        id="tab-panel-saved"
        role="tabpanel"
        hidden={mode !== "saved"}
        className="tab-panel"
      >
        <div className="empty-tab">
          <div className="empty-tab__icon">
            <SavedIcon size={48} active />
          </div>
          <div className="empty-tab__title">Kaydedikleriniz</div>
          <div className="empty-tab__desc">
            Gönderileri kaydedin ve burada görün. Sadece siz görebilirsiniz.
          </div>
        </div>
      </div>

      <div
        id="tab-panel-tagged"
        role="tabpanel"
        hidden={mode !== "tagged"}
        className="tab-panel"
      >
        <div className="empty-tab">
          <div className="empty-tab__icon">
            <TaggedIcon size={48} />
          </div>
          <div className="empty-tab__title">Etiketlendiğin fotoğraflar</div>
          <div className="empty-tab__desc">
            Başkaları sizi gönderilerine etiketlediğinde burada görünecek.
          </div>
        </div>
      </div>

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
