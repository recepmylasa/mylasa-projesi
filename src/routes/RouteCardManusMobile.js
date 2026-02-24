// FILE: src/routes/RouteCardManusMobile.js
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../icons";

function toNum(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function formatRating(avgRaw) {
  const avg = toNum(avgRaw);
  if (!avg || avg <= 0) return { text: "—", badge: "Yeni", pct: 0 };
  const fixed = Math.round(avg * 10) / 10;
  const badge = fixed >= 4.5 ? "Harika" : fixed >= 3.5 ? "İyi" : "Yeni";
  return { text: fixed.toFixed(1), badge, pct: clamp01(fixed / 5) };
}

export default function RouteCardManusMobile({
  title = "",
  coverUrl = "",
  cityOrTag = "",
  authorName = "",
  ratingAvg = 0,
  distanceText = "—",
  durationText = "—",
  viewsText = "—",
  savesText = "—",
  onOpen,
  onCoverLoadEvent, // optional (debug/proof)
}) {
  const safeTitle = (title || "").toString().trim() || "Adsız rota";
  const safeCity = (cityOrTag || "").toString().trim();
  const safeAuthor = (authorName || "").toString().trim();

  const hasCover = !!(coverUrl && String(coverUrl).trim());
  const [imgOk, setImgOk] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgOk(false);
    setImgFailed(false);
  }, [coverUrl]);

  const rating = useMemo(() => formatRating(ratingAvg), [ratingAvg]);

  const handleClick = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    try {
      onOpen?.();
    } catch {}
  };

  return (
    <button
      type="button"
      className="rcm-card"
      onClick={handleClick}
      aria-label={`${safeTitle} rotasını aç`}
      data-route-skin="manus"
    >
      <div className="rcm-cover" aria-hidden="true">
        <div className="rcm-coverPlaceholder" />

        {hasCover && !imgFailed ? (
          <img
            className="rcm-coverImg"
            src={String(coverUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ opacity: imgOk ? 1 : 0 }}
            onLoad={(e) => {
              setImgOk(true);
              try {
                const cur = e?.currentTarget?.currentSrc || String(coverUrl || "");
                onCoverLoadEvent?.("load", cur);
              } catch {}
            }}
            onError={(e) => {
              setImgOk(false);
              setImgFailed(true);
              try {
                const cur = e?.currentTarget?.currentSrc || String(coverUrl || "");
                onCoverLoadEvent?.("error_all", cur);
              } catch {}
            }}
          />
        ) : null}

        <div className="rcm-coverGradient" />

        {!!safeCity && <div className="rcm-pill">{safeCity}</div>}
      </div>

      <div className="rcm-glass" aria-hidden="true">
        <div className="rcm-head">
          <div className="rcm-title" title={safeTitle}>
            {safeTitle}
          </div>

          <div className={`rcm-author ${safeAuthor ? "" : "is-empty"}`} title={safeAuthor || ""}>
            {safeAuthor || " "}
          </div>
        </div>

        <div className="rcm-ratingRow">
          <span className="rcm-star">
            <Icon name="star" size={16} weight="fill" />
          </span>
          <span className="rcm-ratingVal">{rating.text}</span>
          <span className="rcm-ratingBadge">{rating.badge}</span>

          <span className="rcm-ratingBar" aria-hidden="true">
            <span className="rcm-ratingBarFill" style={{ width: `${Math.round(rating.pct * 100)}%` }} />
          </span>
        </div>

        <div className="rcm-stats">
          <div className="rcm-stat">
            <div className="rcm-statLabel">Mesafe</div>
            <div className="rcm-statVal">{(distanceText || "—").toString()}</div>
          </div>

          <div className="rcm-stat">
            <div className="rcm-statLabel">Süre</div>
            <div className="rcm-statVal">{(durationText || "—").toString()}</div>
          </div>

          <div className="rcm-stat">
            <div className="rcm-statLabel">Görüntü</div>
            <div className="rcm-statVal">{(viewsText || "—").toString()}</div>
          </div>

          <div className="rcm-stat">
            <div className="rcm-statLabel">Kaydet</div>
            <div className="rcm-statVal">{(savesText || "—").toString()}</div>
          </div>
        </div>
      </div>
    </button>
  );
}