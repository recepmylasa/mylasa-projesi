// Mobil profil: üst bar + avatar/stats + sekmeler (grid / clips / saved / tagged)

import React, { useState } from "react";
import "./ProfileMobile.css";
import { GridIcon, ClipsIcon, SavedIcon, TaggedIcon } from "./icons";
import UserPosts from "./UserPosts";

export default function ProfileMobile({ user }) {
  const [mode, setMode] = useState("grid");
  const avatarUrl = user?.photoURL || user?.profilFoto || user?.avatar || "/avatars/default.png";

  return (
    <div>
      <div className="mobile-topbar">
        <div onClick={()=>window.history.length>1?window.history.back():window.location.assign('/')} style={{cursor:'pointer'}}>‹</div>
        <div className="mobile-username">{user.username || user.kullaniciAdi}</div>
        <div>⋯</div>
      </div>

      <div className="mobile-avatar-row">
        <div className="avatar-ring-sm">
          <img alt={`${user.username || user.kullaniciAdi} avatar`} src={avatarUrl} />
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

      <div className="mobile-tabs">
        <a href="#" className={`mobile-tab ${mode==='grid'?'active':''}`} onClick={(e)=>{e.preventDefault(); setMode('grid')}}>
          <GridIcon active={mode==='grid'} />
        </a>
        <a href="#" className={`mobile-tab ${mode==='clips'?'active':''}`} onClick={(e)=>{e.preventDefault(); setMode('clips')}}>
          <ClipsIcon active={mode==='clips'} />
        </a>
        <a href="#" className={`mobile-tab ${mode==='saved'?'active':''}`} onClick={(e)=>{e.preventDefault(); setMode('saved')}}>
          <SavedIcon active={mode==='saved'} />
        </a>
        <a href="#" className={`mobile-tab ${mode==='tagged'?'active':''}`} onClick={(e)=>{e.preventDefault(); setMode('tagged')}}>
          <TaggedIcon active={mode==='tagged'} />
        </a>
      </div>

      {mode === 'grid' && (
        <div className="userposts-container" style={{padding: '8px'}}>
          <UserPosts userId={user.id} />
        </div>
      )}
      {mode === 'clips' && (
        <div className="userposts-container" style={{padding: '8px'}}>
          <UserPosts userId={user.id} onlyClips />
        </div>
      )}
      {mode !== 'grid' && mode !== 'clips' && (
        <div style={{padding: 16, color: '#999'}}>Bu sekme Sprint 2’de detaylandırılacak.</div>
      )}
    </div>
  );
}
