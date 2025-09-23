import React, { useMemo } from "react";
import "./ProfileHeaderMobile.css";
import { KebabIcon, PlusIcon } from "./icons";

/**
 * Instagram mobil üst bölüm (ızgaranın üstü).
 * - Profesyonel pano YOK (normal kullanıcı için).
 * - Hikâye halkası: gradient (görülmemiş), gri (yok/görüldü).
 * - Kendimsek avatar sağ-altta + rozeti.
 */
export default function ProfileHeaderMobile({
  user = {},
  isSelf = false,
  onMenu,
  onCreate,
  onEdit,
  onShare,
}) {
  const u = user || {};

  // ---- Güvenli ad/username (asla kendi uydurma yapma) ----
  const username =
    u.username ?? u.kullaniciAdi ?? u.slug ?? "";
  const fullName =
    u.fullName ?? u.name ?? u.adSoyad ?? u.displayName ?? "";

  // İstatistikler (sadece sayı göster; biçimlendirme kısaltmalı)
  const posts = u.postsCount ?? u.gonderi ?? 0;
  const followers = u.followersCount ?? u.takipci ?? 0;
  const following = u.followingCount ?? u.takip ?? 0;

  const avatarUrl =
    u.photoURL || u.profilFoto || u.avatar || "/avatars/default.png";

  // Hikâye durumu
  const hasStory = !!u.hasStory;
  const storySeen = !!u.storySeen;
  const ringClass = hasStory && !storySeen ? "gradient" : "gray";

  const isVerified = !!u.verified || !!u.isVerified;

  const nf = useMemo(
    () =>
      new Intl.NumberFormat("tr-TR", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    []
  );

  return (
    <header className="phm">
      {/* ÜST BAR */}
      <div className="phm-top sticky-top" role="toolbar" aria-label="Profil üst menü">
        <div className="phm-userline" aria-live="polite">
          <span className="phm-username">{username}</span>
          {isVerified && <span className="badge-verified" aria-label="Doğrulanmış">✓</span>}
        </div>

        <div className="phm-top-actions">
          <button type="button" className="icon-btn btn-reset" aria-label="Oluştur" onClick={onCreate}>
            <PlusIcon />
          </button>
          <button type="button" className="icon-btn btn-reset" aria-label="Seçenekler" onClick={onMenu}>
            <KebabIcon direction="horizontal" />
          </button>
        </div>
      </div>

      {/* AVATAR + SAYIMLAR */}
      <div className="phm-row">
        <div className="avatar-wrap" aria-hidden="true">
          <span className={`avatar-ring ${ringClass}`} />
          <img className="avatar-img" src={avatarUrl} alt="" />
          {isSelf && <span className="plus-badge" aria-hidden="true">+</span>}
        </div>

        <div className="phm-stats" aria-label="İstatistikler">
          <div><div className="num">{nf.format(posts)}</div><div className="label">gönderi</div></div>
          <div><div className="num">{nf.format(followers)}</div><div className="label">takipçi</div></div>
          <div><div className="num">{nf.format(following)}</div><div className="label">takip</div></div>
        </div>
      </div>

      {/* İSİM */}
      {fullName ? <div className="phm-name">{fullName}</div> : null}

      {/* BUTONLAR */}
      <div className="phm-actions" role="group" aria-label="Profil aksiyonları">
        <button type="button" className="chip-btn" onClick={onEdit}>Profili düzenle</button>
        <button type="button" className="chip-btn" onClick={onShare}>Profili paylaş</button>
        <button type="button" className="chip-btn more" aria-label="Diğer">⌄</button>
      </div>
    </header>
  );
}
