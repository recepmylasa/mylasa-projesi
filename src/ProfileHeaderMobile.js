// src/ProfileHeaderMobile.jsx
import React from "react";
import "./ProfileHeaderMobile.css";
import { KebabIcon, ChevronLeftIcon, PlusIcon } from "./icons";

export default function ProfileHeaderMobile({
  user = {},
  onBack,
  onMenu,
  onEdit,
  onShare,
  onCreate, // NEW: + butonu
}) {
  const u = user ?? {};
  const avatarUrl =
    u.photoURL || u.profilFoto || u.avatar || "/avatars/default.png";
  const username = u.username || u.kullaniciAdi || "kullanıcı";

  const isBizOrCreator =
    u.accountType === "business" ||
    u.accountType === "creator" ||
    u.isBusiness === true ||
    u.isPro === true ||
    u.professional === true;

  const showSubscription = !!u.hasSubscriptions && isBizOrCreator;

  const postsCount = u.postsCount ?? 0;
  const followersCount = u.followersCount ?? 0;
  const followingCount = u.followingCount ?? 0;

  const doBack =
    onBack ||
    (() =>
      window.history.length > 1
        ? window.history.back()
        : window.location.assign("/"));

  return (
    <header className="phm">
      {/* Üst bar */}
      <div className="phm-top sticky-top">
        <button
          type="button"
          className="icon-btn"
          aria-label="Geri"
          title="Geri"
          onClick={doBack}
        >
          <ChevronLeftIcon />
        </button>

        <div className="phm-username" aria-live="polite">
          {username}
        </div>

        <button
          type="button"
          className="icon-btn"
          aria-label="Oluştur"
          title="Oluştur"
          onClick={onCreate}
        >
          <PlusIcon />
        </button>

        <button
          type="button"
          className="icon-btn"
          aria-label="Seçenekler"
          title="Seçenekler"
          onClick={onMenu}
        >
          <KebabIcon direction="vertical" size={22} />
        </button>
      </div>

      {/* Avatar + stats */}
      <div className="phm-avatar-row">
        <div className="phm-avatar-ring">
          <img alt={`${username} avatar`} src={avatarUrl} />
        </div>

        <div className="phm-stats" aria-label="Profil istatistikleri">
          <div>
            <div className="count">{postsCount}</div>
            <div className="label">gönderi</div>
          </div>
          <div>
            <div className="count">{followersCount}</div>
            <div className="label">takipçi</div>
          </div>
          <div>
            <div className="count">{followingCount}</div>
            <div className="label">takip</div>
          </div>
        </div>
      </div>

      {/* Aksiyonlar */}
      <div className="phm-actions" role="group" aria-label="Profil aksiyonları">
        <button type="button" className="action-btn" onClick={onEdit}>
          Profili düzenle
        </button>
        <button type="button" className="action-btn" onClick={onShare}>
          Profili paylaş
        </button>
        {showSubscription && (
          <button type="button" className="action-btn">Abonelik</button>
        )}
        <button type="button" className="action-btn more" aria-label="Diğer">
          ⌄
        </button>
      </div>
    </header>
  );
}
