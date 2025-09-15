// Mobil profil: üst bar + avatar/stats + sekmeler (grid / clips / saved / tagged)
// Profil grid kartına dokununca tam ekran mobil viewer açılır (yukarı kaydırmalı).

import React, { useState, useCallback } from "react";
import "./ProfileMobile.css";
import { GridIcon, ClipsIcon, SavedIcon, TaggedIcon } from "./icons";
import UserPosts from "./UserPosts";
import ProfilePostViewerMobile from "./ProfilePostViewerMobile";

export default function ProfileMobile({ user }) {
  const [mode, setMode] = useState("grid");
  const [viewer, setViewer] = useState(null); // { items, index, userMeta }

  const avatarUrl =
    user?.photoURL || user?.profilFoto || user?.avatar || "/avatars/default.png";

  const username =
    user?.displayName || user?.username || user?.kullaniciAdi || "kullanıcı";

  const onOpenFromGrid = useCallback(
    (items, startIndex) => {
      if (!Array.isArray(items) || items.length === 0) return;
      setViewer({
        items,
        index: Math.max(0, Math.min(startIndex ?? 0, items.length - 1)),
        userMeta: {
          id: user?.id,
          name: username,
          avatar: avatarUrl,
        },
      });
    },
    [user?.id, username, avatarUrl]
  );

  const closeViewer = useCallback(() => setViewer(null), []);

  return (
    <div>
      {/* Üst bar */}
      <div className="mobile-topbar">
        <div
          onClick={() =>
            window.history.length > 1
              ? window.history.back()
              : window.location.assign("/")
          }
          style={{ cursor: "pointer" }}
          aria-label="Geri"
          title="Geri"
        >
          ‹
        </div>
        <div className="mobile-username">{username}</div>
        <div aria-hidden="true">⋯</div>
      </div>

      {/* Avatar + istatistikler */}
      <div className="mobile-avatar-row">
        <div className="avatar-ring-sm">
          <img alt={`${username} avatar`} src={avatarUrl} />
        </div>
        <div>
          <div className="mobile-stats">
            <div>
              <div className="count">{user?.postsCount ?? 0}</div>
              <div className="label">gönderi</div>
            </div>
            <div>
              <div className="count">{user?.followersCount ?? 0}</div>
              <div className="label">takipçi</div>
            </div>
            <div>
              <div className="count">{user?.followingCount ?? 0}</div>
              <div className="label">takip</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="mobile-tabs">
        <a
          href="#"
          className={`mobile-tab ${mode === "grid" ? "active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            setMode("grid");
          }}
          aria-label="Gönderiler"
          title="Gönderiler"
        >
          <GridIcon active={mode === "grid"} />
        </a>
        <a
          href="#"
          className={`mobile-tab ${mode === "clips" ? "active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            setMode("clips");
          }}
          aria-label="Klipler"
          title="Klipler"
        >
          <ClipsIcon active={mode === "clips"} />
        </a>
        <a
          href="#"
          className={`mobile-tab ${mode === "saved" ? "active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            setMode("saved");
          }}
          aria-label="Kaydedilenler"
          title="Kaydedilenler"
        >
          <SavedIcon active={mode === "saved"} />
        </a>
        <a
          href="#"
          className={`mobile-tab ${mode === "tagged" ? "active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            setMode("tagged");
          }}
          aria-label="Etiketlenenler"
          title="Etiketlenenler"
        >
          <TaggedIcon active={mode === "tagged"} />
        </a>
      </div>

      {/* İçerik */}
      {mode === "grid" && (
        <div className="userposts-container" style={{ padding: "8px" }}>
          <UserPosts userId={user?.id} onOpen={onOpenFromGrid} />
        </div>
      )}

      {mode === "clips" && (
        <div className="userposts-container" style={{ padding: "8px" }}>
          <UserPosts userId={user?.id} onlyClips onOpen={onOpenFromGrid} />
        </div>
      )}

      {mode !== "grid" && mode !== "clips" && (
        <div style={{ padding: 16, color: "#999" }}>
          Bu sekme Sprint 2’de detaylandırılacak.
        </div>
      )}

      {/* Tam ekran mobil viewer */}
      {viewer && (
        <ProfilePostViewerMobile
          items={viewer.items}
          startIndex={viewer.index}
          onClose={closeViewer}
          viewerUser={viewer.userMeta}   // << paylaşan kullanıcı bilgisi
        />
      )}
    </div>
  );
}
