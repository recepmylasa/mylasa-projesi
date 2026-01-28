// FILE: src/pages/RouteDetailMobile/components/RouteDetailHeroMobile.js
import React from "react";

export default function RouteDetailHeroMobile({
  coverResolved,
  handleImgLoadProof,
  handleImgErrorToDefault,

  heroMenuOpen,
  toggleHeroMenu,
  closeHeroMenu,

  enterEdit,
  exitEdit,
  isOwner,
  isEditMode,

  onClose,
  onShare,
  onExportGpx,
  onToggleTheme,
  onOpenReport,
  onOpenShareSheet,

  rdTheme,

  heroCategory,
  heroTitle,
  heroStarsModel,
  heroRatingBadgeText,

  ownerName,
  ownerAvatarUrl,
  timeAgoLine,

  isFav,
  onToggleFav,
  canToggleFav,

  requestOpenProfile,
}) {
  const hasOwnerName = !!String(ownerName || "").trim();
  const hasTime = !!String(timeAgoLine || "").trim();
  const hasTitle = !!String(heroTitle || "").trim();

  const saveLabel = isFav ? "Kaydedilenlerden çıkar" : "Kaydet";
  const saveTitle = !canToggleFav ? "Kaydetmek için giriş yapmalısın." : saveLabel;

  // ✅ FIX: heroStarsModel null/bozuk gelirse crash yok
  const safeStars = (() => {
    const m = heroStarsModel || {};
    const full = Math.max(0, Math.min(5, Number(m.full) || 0));
    const half = !!m.half;
    const emptyFromModel = Number.isFinite(Number(m.empty)) ? Number(m.empty) : null;
    const empty =
      emptyFromModel != null
        ? Math.max(0, Math.min(5, emptyFromModel))
        : Math.max(0, 5 - full - (half ? 1 : 0));

    const total = full + (half ? 1 : 0) + empty;
    if (total !== 5) {
      return { full, half, empty: Math.max(0, 5 - full - (half ? 1 : 0)) };
    }
    return { full, half, empty };
  })();

  return (
    <div
      className="route-detail-hero"
      onClick={() => {
        if (heroMenuOpen) closeHeroMenu();
      }}
    >
      <div className="route-detail-hero__media">
        <img
          className="route-detail-hero__img"
          src={coverResolved || (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg"}
          alt="Rota kapağı"
          loading="eager"
          decoding="async"
          onLoad={(e) => handleImgLoadProof(e, { scope: "hero_cover" })}
          onError={(e) => handleImgErrorToDefault(e, { scope: "hero_cover" })}
        />
      </div>

      <div className="rd-hero__overlay rd-hero__overlay--top" />
      <div className="rd-hero__overlay rd-hero__overlay--bottom" />

      <div className="route-detail-hero__nav" onClick={(e) => e.stopPropagation()}>
        <div className="rd-hero-nav-left">
          <button type="button" className="rd-hero-nav-btn rd-hero-nav-btn--icononly" onClick={onClose} title="Geri">
            <span className="rd-hero-nav-btn__icon" aria-hidden="true">
              ←
            </span>
          </button>
        </div>

        <div className="rd-hero-nav-right">
          {!isEditMode && (
            <button type="button" className="rd-hero-nav-btn rd-hero-nav-btn--icononly" onClick={onShare} title="Paylaş">
              <span className="rd-hero-nav-btn__icon" aria-hidden="true">
                ⤴
              </span>
            </button>
          )}

          <button
            type="button"
            className="rd-hero-nav-btn rd-hero-nav-btn--icononly"
            onClick={toggleHeroMenu}
            aria-expanded={heroMenuOpen}
            aria-label="Menü"
            title="Menü"
          >
            <span className="rd-hero-nav-btn__icon" aria-hidden="true">
              ⋯
            </span>
          </button>
        </div>

        {heroMenuOpen && (
          <div className="rd-hero-menu" onClick={(e) => e.stopPropagation()}>
            {!!isOwner && !isEditMode && (
              <button
                type="button"
                className="rd-hero-menu__item"
                onClick={() => {
                  enterEdit();
                  closeHeroMenu();
                }}
              >
                <span>Düzenle</span>
                <span className="rd-hero-menu__hint">Edit</span>
              </button>
            )}

            {!!isOwner && isEditMode && (
              <button
                type="button"
                className="rd-hero-menu__item"
                onClick={() => {
                  exitEdit();
                  closeHeroMenu();
                }}
              >
                <span>Düzenlemeyi bitir</span>
                <span className="rd-hero-menu__hint">View</span>
              </button>
            )}

            {!isEditMode && (
              <button
                type="button"
                className="rd-hero-menu__item"
                onClick={() => {
                  onOpenShareSheet();
                  closeHeroMenu();
                }}
              >
                <span>Görsel paylaş</span>
                <span className="rd-hero-menu__hint">Sheet</span>
              </button>
            )}

            {!isEditMode && (
              <button
                type="button"
                className="rd-hero-menu__item"
                onClick={() => {
                  onExportGpx();
                  closeHeroMenu();
                }}
              >
                <span>GPX indir</span>
                <span className="rd-hero-menu__hint">.gpx</span>
              </button>
            )}

            {!isEditMode && (
              <button
                type="button"
                className="rd-hero-menu__item"
                onClick={() => {
                  onOpenReport();
                  closeHeroMenu();
                }}
              >
                <span>Rapor</span>
                <span className="rd-hero-menu__hint">İstatistik</span>
              </button>
            )}

            <button
              type="button"
              className="rd-hero-menu__item"
              onClick={() => {
                onToggleTheme();
                closeHeroMenu();
              }}
            >
              <span>Tema</span>
              <span className="rd-hero-menu__hint">{rdTheme === "dark" ? "Açık" : "Koyu"}</span>
            </button>
          </div>
        )}
      </div>

      <div className="rd-hero__info" aria-label="Rota özeti">
        {heroCategory ? <div className="rd-hero__pill">{heroCategory}</div> : null}

        {hasTitle ? (
          <h1 className="rd-hero__title" title={heroTitle}>
            {heroTitle}
          </h1>
        ) : (
          <div className="rd-hero__titleSkeleton" aria-hidden="true" />
        )}

        <div className="rd-hero__ratingRow" aria-label="Rota puanı">
          <div className="rd-hero__stars" aria-hidden="true">
            {Array.from({ length: safeStars.full }).map((_, i) => (
              <span key={`f${i}`} className="rd-hero__star rd-hero__star--full">
                ★
              </span>
            ))}
            {safeStars.half ? (
              <span key="h" className="rd-hero__star rd-hero__star--half">
                ★
              </span>
            ) : null}
            {Array.from({ length: safeStars.empty }).map((_, i) => (
              <span key={`e${i}`} className="rd-hero__star rd-hero__star--empty">
                ★
              </span>
            ))}
          </div>

          <span className="rd-hero__ratingBadge">{heroRatingBadgeText || "(0 Kaşif)"}</span>
        </div>
      </div>

      <div className="rd-hero__hub" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="rd-hero__hubProfile"
          onClick={requestOpenProfile}
          title="Profili aç"
          aria-label="Profili aç"
        >
          <div className="rd-hero__avatar" aria-hidden="true">
            {ownerAvatarUrl ? (
              <img src={ownerAvatarUrl} alt={hasOwnerName ? ownerName : "Profil fotoğrafı"} loading="lazy" decoding="async" />
            ) : hasOwnerName ? (
              <span className="rd-hero__avatarFallback">{ownerName?.[0] || "•"}</span>
            ) : (
              <span className="rd-hero__avatarSkeleton" aria-hidden="true" />
            )}
          </div>

          <div className="rd-hero__authorMeta">
            {hasOwnerName ? (
              <div className="rd-hero__authorName" title={ownerName}>
                {ownerName}
              </div>
            ) : (
              <div className="rd-hero__skeletonLine rd-hero__skeletonLine--name" aria-hidden="true" />
            )}

            {hasTime ? (
              <div className="rd-hero__time">{timeAgoLine || ""}</div>
            ) : (
              <div className="rd-hero__skeletonLine rd-hero__skeletonLine--time" aria-hidden="true" />
            )}
          </div>
        </button>

        {!isEditMode && (
          <button
            type="button"
            className={`rd-hero__favBtn ${isFav ? "is-active" : ""}`}
            onClick={onToggleFav}
            aria-label={saveLabel}
            aria-pressed={!!isFav}
            title={saveTitle}
            disabled={!canToggleFav}
          >
            <span className="rd-hero__favIcon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill={isFav ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M6 3h12a1 1 0 0 1 1 1v18l-7-4-7 4V4a1 1 0 0 1 1-1z" />
              </svg>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
