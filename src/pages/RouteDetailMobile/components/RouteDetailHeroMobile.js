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

  heroAvgRating,

  ownerName,
  ownerAvatarUrl,
  timeAgoLine,

  ownerState,

  isFav,
  onToggleFav,
  canToggleFav,

  requestOpenProfile,
}) {
  const hasOwnerName = !!String(ownerName || "").trim();
  const hasOwnerAvatar = !!String(ownerAvatarUrl || "").trim();
  const hasTime = !!String(timeAgoLine || "").trim();
  const hasTitle = !!String(heroTitle || "").trim();

  // ✅ FIX: ownerState prop gelmezse "loading" diye kilitlenmesin.
  // Eğer isim veya avatar varsa asla skeleton gösterme.
  const derivedOwnerState =
    ownerState || (hasOwnerName || hasOwnerAvatar ? "fallback" : "loading");

  const showOwnerSkeleton =
    derivedOwnerState === "loading" && !hasOwnerName && !hasOwnerAvatar;

  const canOpenProfile = typeof requestOpenProfile === "function";

  const saveLabel = isFav ? "Kaydedilenlerden çıkar" : "Kaydet";
  const saveTitle = !canToggleFav ? "Kaydetmek için giriş yapmalısın." : saveLabel;

  const categoryText =
    (heroCategory && String(heroCategory).trim()) || "Macera";

  const avgNum = Number(heroAvgRating);
  const hasAvg = Number.isFinite(avgNum) && avgNum > 0;

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
      {/* ✅ EMİR 34/P1 — Cover rounded + inset (card-in-card) */}
      <div className="route-detail-hero__media">
        <div className="route-detail-hero__mediaInset">
          <img
            className="route-detail-hero__img"
            src={coverResolved || (process.env.PUBLIC_URL || "") + "/route-default-cover.jpg"}
            alt="Rota kapağı"
            loading="eager"
            decoding="async"
            onLoad={(e) => handleImgLoadProof(e, { scope: "hero_cover" })}
            onError={(e) => handleImgErrorToDefault(e, { scope: "hero_cover" })}
          />

          {/* Overlay’ler de inset wrapper içinde kalsın ki köşeler yuvarlak kalsın */}
          <div className="rd-hero__overlay rd-hero__overlay--top" />
          <div className="rd-hero__overlay rd-hero__overlay--bottom" />
        </div>
      </div>

      {/* ✅ EMİR 31/P2 — Simple scroll modda hero’nun flow alanını garanti eden spacer (CSS’de sadece o modda aktif) */}
      <div className="rd-hero__flowSpacer" aria-hidden="true" />

      {/* ✅ EMİR 32 (FINAL): Floating glass action buttons */}
      <div
        className="route-detail-hero__nav rd-hero-nav--floating"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rd-hero-nav-left">
          <button
            type="button"
            className="rd-hero-nav-btn rd-hero-nav-btn--icononly rd-hero-nav-btn--glass"
            onClick={onClose}
            title="Geri"
          >
            <span className="rd-hero-nav-btn__icon" aria-hidden="true">
              ←
            </span>
          </button>
        </div>

        <div className="rd-hero-nav-right">
          {!isEditMode && (
            <button
              type="button"
              className="rd-hero-nav-btn rd-hero-nav-btn--icononly rd-hero-nav-btn--glass"
              onClick={onShare}
              title="Paylaş"
            >
              <span className="rd-hero-nav-btn__icon" aria-hidden="true">
                ⤴
              </span>
            </button>
          )}

          <button
            type="button"
            className="rd-hero-nav-btn rd-hero-nav-btn--icononly rd-hero-nav-btn--glass"
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
        <div className="rd-hero__pill">{categoryText}</div>

        {hasTitle ? (
          <h1 className="rd-hero__title" title={heroTitle}>
            {heroTitle}
          </h1>
        ) : (
          <div className="rd-hero__titleSkeleton" aria-hidden="true" />
        )}

        <div className="rd-hero__ratingRow" aria-label="Rota puanı">
          {hasAvg ? (
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
          ) : null}

          <span className="rd-hero__ratingBadge">{heroRatingBadgeText || "(0 Kaşif)"}</span>
        </div>
      </div>

      <div className="rd-hero__hub" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="rd-hero__hubProfile"
          onClick={(e) => {
            e?.stopPropagation?.();
            if (!canOpenProfile) return;
            requestOpenProfile(e);
          }}
          disabled={!canOpenProfile}
          title={canOpenProfile ? "Profili aç" : "Profil verisi yok"}
          aria-label="Profili aç"
        >
          <div className="rd-hero__avatar" aria-hidden="true">
            {hasOwnerAvatar ? (
              <img
                src={ownerAvatarUrl}
                alt={hasOwnerName ? ownerName : "Profil fotoğrafı"}
                loading="lazy"
                decoding="async"
              />
            ) : showOwnerSkeleton ? (
              <span className="rd-hero__avatarSkeleton" aria-hidden="true" />
            ) : (
              <span className="rd-hero__avatarFallback">{(ownerName && ownerName[0]) || "•"}</span>
            )}
          </div>

          <div className="rd-hero__authorMeta">
            {hasOwnerName ? (
              <div className="rd-hero__authorName" title={ownerName}>
                {ownerName}
              </div>
            ) : showOwnerSkeleton ? (
              <div className="rd-hero__skeletonLine rd-hero__skeletonLine--name" aria-hidden="true" />
            ) : (
              <div className="rd-hero__authorName" title="Kullanıcı">
                Kullanıcı
              </div>
            )}

            {hasTime ? (
              <div className="rd-hero__time">{timeAgoLine}</div>
            ) : showOwnerSkeleton ? (
              <div className="rd-hero__skeletonLine rd-hero__skeletonLine--time" aria-hidden="true" />
            ) : (
              <div className="rd-hero__time">—</div>
            )}
          </div>
        </button>

        {!isEditMode && (
          <button
            type="button"
            className={`rd-hero__favBtn ${isFav ? "is-active" : ""}`}
            onClick={(e) => {
              e?.stopPropagation?.();
              if (!canToggleFav) return;
              onToggleFav?.(e);
            }}
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
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}