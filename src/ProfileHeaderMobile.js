// src/ProfileHeaderMobile.js
import React, { useEffect, useMemo, useState } from "react";
import { auth } from "./firebase";
import {
  follow,
  unfollow,
  watchIsFollowing,
  watchCounts,
  mapError,
} from "./services/relationships";
import "./ProfileHeaderMobile.css";

/** Mobil profil: ızgaranın üstü (TopBar/BottomNav sabit, burada yok) */
export default function ProfileHeaderMobile({
  user = {},
  isSelf = false,
  onEdit,
  onShare,
}) {
  const u = user || {};
  const viewer = auth.currentUser;
  const viewerUid = viewer?.uid || null;

  // Hedef UID (takip butonu için şart)
  const targetUid = u.id || u.uid || u.userId || null;
  const computedIsSelf = isSelf || (viewerUid && targetUid && viewerUid === targetUid);

  // Görünen ad
  const fullName =
    (typeof u.name === "string" && u.name.trim()) ? u.name :
    (typeof u.fullName === "string" && u.fullName.trim()) ? u.fullName :
    (typeof u.username === "string" ? u.username : "");

  // Sayaçlar (başlangıç props, sonra canlı izleme ile güncellenir)
  const basePosts     = Number.isFinite(u.postsCount)     ? u.postsCount     : (u.gonderi  ?? 0);
  const baseFollowers = Number.isFinite(u.followersCount) ? u.followersCount : (u.takipci  ?? 0);
  const baseFollowing = Number.isFinite(u.followingCount) ? u.followingCount : (u.takip    ?? 0);

  const [liveCounts, setLiveCounts] = useState({
    followersCount: baseFollowers,
    followingCount: baseFollowing,
  });

  const followers = Number.isFinite(liveCounts.followersCount) ? liveCounts.followersCount : baseFollowers;
  const following = Number.isFinite(liveCounts.followingCount) ? liveCounts.followingCount : baseFollowing;

  const avatarUrl = u.photoURL || u.profilFoto || u.avatar || "/avatars/default.png";

  // Story ring
  const hasStory  = !!u.hasStory;
  const storySeen = !!u.storySeen;
  const ringClass = hasStory && !storySeen ? "gradient" : "gray";

  const nf = useMemo(
    () => new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }),
    []
  );

  // Follow state (canlı)
  const [isFollowing, setIsFollowing] = useState(false);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => setToast(""), [targetUid]);

  useEffect(() => {
    if (!targetUid) return;
    const unsubCounts = watchCounts(targetUid, setLiveCounts);

    let unsubFollow = () => {};
    if (!computedIsSelf && viewerUid) {
      unsubFollow = watchIsFollowing(targetUid, setIsFollowing);
    } else {
      setIsFollowing(false);
    }
    return () => {
      unsubCounts && unsubCounts();
      unsubFollow && unsubFollow();
    };
  }, [targetUid, viewerUid, computedIsSelf]);

  const onFollowClick = async () => {
    if (!viewerUid || !targetUid || computedIsSelf || pending) return;
    setPending(true);
    const prev = isFollowing;
    setIsFollowing(!prev); // optimistic
    try {
      if (prev) {
        await unfollow(targetUid);
      } else {
        await follow(targetUid);
      }
    } catch (e) {
      setIsFollowing(prev); // rollback
      setToast(mapError(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <header className="phm">
      {/* Avatar + Sağ blok */}
      <div className="phm-row">
        <div className="avatar-wrap" aria-hidden="true">
          <span className={`avatar-ring ${ringClass}`} />
          <img
            className="avatar-img"
            src={avatarUrl}
            alt=""
            onError={(e) => (e.currentTarget.src = "/avatars/default.png")}
          />
          {computedIsSelf && <span className="plus-badge" aria-hidden="true">+</span>}
        </div>

        <div className="phm-right">
          {/* İsim — gönderi kolonunun G hizasından başlar */}
          <div className="phm-name" title={fullName}>{fullName}</div>

          {/* Sayaçlar */}
          <div className="phm-stats" aria-label="İstatistikler">
            <div className="phm-stat">
              <div className="num">{nf.format(basePosts)}</div>
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
        {computedIsSelf ? (
          <>
            <button type="button" className="chip-btn" onClick={onEdit}>Profili düzenle</button>
            <button type="button" className="chip-btn" onClick={onShare}>Profili paylaş</button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`chip-btn ${isFollowing ? "chip-outline" : "chip-primary"}`}
              disabled={pending}
              onClick={onFollowClick}
            >
              {isFollowing ? "Takibi Bırak" : "Takip Et"}
            </button>
            <button type="button" className="chip-btn" onClick={onShare}>Profili paylaş</button>
          </>
        )}
      </div>

      {toast ? <div className="phm-toast">{toast}</div> : null}
    </header>
  );
}
