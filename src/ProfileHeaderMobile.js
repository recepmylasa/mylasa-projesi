import React, { useMemo } from "react";
import "./ProfileHeaderMobile.css";

/** Mobil profil: ızgaranın üstü (TopBar/BottomNav sabit, burada yok) */
export default function ProfileHeaderMobile({
  user = {},
  isSelf = false,
  onEdit,
  onShare,
}) {
  const u = user || {};

  // Görünen ad
  const fullName =
    (typeof u.name === "string" && u.name.trim()) ? u.name :
    (typeof u.fullName === "string" && u.fullName.trim()) ? u.fullName :
    (typeof u.username === "string" ? u.username : "");

  // Sayaçlar
  const posts     = Number.isFinite(u.postsCount)     ? u.postsCount     : (u.gonderi  ?? 0);
  const followers = Number.isFinite(u.followersCount) ? u.followersCount : (u.takipci  ?? 0);
  const following = Number.isFinite(u.followingCount) ? u.followingCount : (u.takip    ?? 0);

  const avatarUrl = u.photoURL || u.profilFoto || u.avatar || "/avatars/default.png";

  // Story ring
  const hasStory  = !!u.hasStory;
  const storySeen = !!u.storySeen;
  const ringClass = hasStory && !storySeen ? "gradient" : "gray";

  const nf = useMemo(
    () => new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }),
    []
  );

  return (
    <header className="phm">
      {/* Avatar + Sağ blok */}
      <div className="phm-row">
        <div className="avatar-wrap" aria-hidden="true">
          <span className={`avatar-ring ${ringClass}`} />
          <img className="avatar-img" src={avatarUrl} alt="" />
          {isSelf && <span className="plus-badge" aria-hidden="true">+</span>}
        </div>

        <div className="phm-right">
          {/* İsim — gönderi kolonunun G hizasından başlar */}
          <div className="phm-name" title={fullName}>{fullName}</div>

          {/* Sayaçlar */}
          <div className="phm-stats" aria-label="İstatistikler">
            <div className="phm-stat">
              <div className="num">{nf.format(posts)}</div>
              <div className="label">gönderi</div>
            </div>
            <div className="phm-stat">
              <div className="num">{nf.format(followers)}</div>
              <div className="label">takipçi</div>
            </div>
            <div className="phm-stat">
              <div className="num">{nf.format(following)}</div>
              <div className="label">takip</div>
            </div>
          </div>
        </div>
      </div>

      {/* Aksiyonlar */}
      <div className="phm-actions" role="group" aria-label="Profil aksiyonları">
        <button type="button" className="chip-btn" onClick={onEdit}>Profili düzenle</button>
        <button type="button" className="chip-btn" onClick={onShare}>Profili paylaş</button>
      </div>
    </header>
  );
}
