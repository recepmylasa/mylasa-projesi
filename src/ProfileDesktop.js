// src/ProfileDesktop.js
// Instagram/Pixelfed benzeri masaüstü profil + sekmeler + Labubu
import React, { useMemo, useState } from "react";
import "./ProfileDesktop.css";
import { GridIcon, ClipsIcon, SavedIcon, TaggedIcon, StarIcon } from "./icons";
import UserPosts from "./UserPosts";
import ClipsDesktop from "./ClipsDesktop";

import useLabubu from "./hooks/useLabubu";
import LabubuGridDesktop from "./components/Labubu/LabubuGridDesktop";
import LabubuOpenModalDesktop from "./components/Labubu/LabubuOpenModalDesktop";

export default function ProfileDesktop({ user }) {
  const [mode, setMode] = useState("grid"); // grid | clips | collection | saved | tagged

  const username = user?.username || user?.kullaniciAdi || "";
  const name = user?.displayName || user?.fullName || username;
  const bio = user?.bio || "";
  const website = user?.website || user?.web || "";
  const avatarUrl = user?.photoURL || user?.profilFoto || user?.avatar || "/avatars/default.png";
  const reputation = Math.round((user?.reputation?.score ?? user?.reputation ?? 0) * 10) / 10;

  const stats = useMemo(() => ({
    posts: user?.postsCount ?? user?.statuses_count ?? 0,
    followers: user?.followersCount ?? user?.followers_count ?? 0,
    following: user?.followingCount ?? user?.following_count ?? 0,
  }), [user]);

  const highlights = Array.isArray(user?.highlights) ? user.highlights : [];
  const isSelf = !!user?.isSelf;

  // Labubu
  const uid = user?.id || user?.uid;
  const { cards, boxesReady, openBox } = useLabubu(uid);
  const [lastDrop, setLastDrop] = useState(null);

  return (
    <div className="igp-wrap">
      {/* ÜST BAŞLIK */}
      <header className="igp-header">
        <div className="igp-avatar-col">
          <div className="igp-avatar-ring">
            <img src={avatarUrl} alt={`${username} profil`} />
            <div className="igp-avatar-star" title="İtibar">★{Number.isFinite(reputation) ? reputation : "0"}</div>
          </div>
        </div>

        <div className="igp-main-col">
          <div className="igp-username-row">
            <h2 className="igp-username">{username}</h2>
            <div className="igp-actions">
              <button className="igp-btn">Takip Et</button>
              <button className="igp-btn">Mesaj</button>
              <button className="igp-btn igp-btn-icon" aria-label="Diğer">⋯</button>
            </div>
          </div>

          <ul className="igp-stats">
            <li><b className="count">{stats.posts}</b> gönderi</li>
            <li><b className="count">{stats.followers}</b> takipçi</li>
            <li><b className="count">{stats.following}</b> takip</li>
          </ul>

          <div className="igp-bio">
            <div className="igp-name">{name}</div>
            {bio ? (<p className="igp-bio-text" dangerouslySetInnerHTML={{ __html: bio }} />) : null}
            {website ? (<p><a href={website} target="_blank" rel="noopener nofollow noreferrer">{website.replace(/^https?:\/\//, "")}</a></p>) : null}
          </div>
        </div>
      </header>

      {/* HİKAYELER */}
      {highlights.length > 0 && (
        <div className="igp-highlights">
          {highlights.map((h, i) => (
            <div key={i} className="igp-hl-item" title={h.title || ""}>
              <div className="igp-hl-cover"><img src={h.coverUrl} alt={h.title || "öne çıkan"} /></div>
              <div className="igp-hl-title">{h.title || "Öne çıkan"}</div>
            </div>
          ))}
          {isSelf && (<div className="igp-hl-item"><div className="igp-hl-cover igp-hl-new">+</div><div className="igp-hl-title">Yeni</div></div>)}
        </div>
      )}

      {/* SEKME ÇUBUĞU */}
      <nav className="igp-tabs" role="tablist" aria-label="Profil sekmeleri">
        <button role="tab" aria-selected={mode === "grid"} className={`igp-tab ${mode === "grid" ? "active" : ""}`} onClick={() => setMode("grid")}>
          <GridIcon active={mode === "grid"} /><span>GÖNDERİLER</span>
        </button>
        <button role="tab" aria-selected={mode === "clips"} className={`igp-tab ${mode === "clips" ? "active" : ""}`} onClick={() => setMode("clips")}>
          <ClipsIcon active={mode === "clips"} /><span>Clips</span>
        </button>
        <button role="tab" aria-selected={mode === "collection"} className={`igp-tab ${mode === "collection" ? "active" : ""}`} onClick={() => setMode("collection")}>
          <StarIcon active={mode === "collection"} /><span>Koleksiyon</span>
        </button>
        <button role="tab" aria-selected={mode === "saved"} className={`igp-tab ${mode === "saved" ? "active" : ""}`} onClick={() => setMode("saved")}>
          <SavedIcon active={mode === "saved"} /><span>KAYDEDİLENLER</span>
        </button>
        <button role="tab" aria-selected={mode === "tagged"} className={`igp-tab ${mode === "tagged" ? "active" : ""}`} onClick={() => setMode("tagged")}>
          <TaggedIcon active={mode === "tagged"} /><span>ETİKETLENENLER</span>
        </button>
      </nav>

      {/* İÇERİK */}
      {mode === "grid" && (<div className="userposts-container"><UserPosts userId={user.id} /></div>)}
      {mode === "clips" && (<ClipsDesktop userId={user.id} />)}
      {mode === "collection" && (
        <div className="userposts-container">
          <LabubuGridDesktop
            cards={cards}
            boxesReady={isSelf ? boxesReady : 0}
            onOpenBox={isSelf ? async ()=>{ try{ const d=await openBox("standardBox"); setLastDrop(d);}catch(e){ console.warn(e);} } : undefined}
            onOpenCard={(c)=>setLastDrop(c)}
          />
        </div>
      )}
      {mode === "saved" && (<div className="igp-placeholder">Kaydedilenler — sadece hesap sahibine görünür.</div>)}
      {mode === "tagged" && (<div className="igp-placeholder">Etiketlenenler — sonraki sprintte eklenecek.</div>)}

      {lastDrop && <LabubuOpenModalDesktop drop={lastDrop} onClose={()=>setLastDrop(null)} />}
    </div>
  );
}
