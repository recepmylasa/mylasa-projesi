// src/ProfileMobile.js
// Mobil üst bar + avatar/stats + sekmeler (basit)

import React, { useState } from 'react';
import './ProfileMobile.css';
import { GridIcon, ReelsIcon, SavedIcon, TaggedIcon } from './Icons';
import UserPosts from './UserPosts';

export default function ProfileMobile({ user }) {
  const [mode, setMode] = useState('grid');
  const avatarUrl = user?.photoURL || user?.avatar || '/avatars/default.png';

  return (
    <div>
      <div className="mobile-topbar">
        <div onClick={()=>window.history.length>1?window.history.back():window.location.assign('/')} style={{cursor:'pointer'}}>‹</div>
        <div className="mobile-username">{user.username}</div>
        <div>⋯</div>
      </div>

      <div className="mobile-avatar-row">
        <div className="avatar-ring-sm">
          <img alt={`${user.username} avatar`} src={avatarUrl} />
        </div>
        <div>
          <div className="mobile-stats">
            <div>
              <div className="count">{user?.postsCount ?? 0}</div>
              <div className="label">posts</div>
            </div>
            <div>
              <div className="count">{user?.followersCount ?? 0}</div>
              <div className="label">followers</div>
            </div>
            <div>
              <div className="count">{user?.followingCount ?? 0}</div>
              <div className="label">following</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mobile-tabs">
        <a href="#" className={`mobile-tab ${mode==='grid'?'active':''}`} onClick={(e)=>{e.preventDefault(); setMode('grid')}}>
          <GridIcon active={mode==='grid'} />
        </a>
        <a href="#" className={`mobile-tab ${mode==='reels'?'active':''}`} onClick={(e)=>{e.preventDefault(); setMode('reels')}}>
          <ReelsIcon active={mode==='reels'} />
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
      {mode !== 'grid' && (
        <div style={{padding: 16, color: '#999'}}>Bu sekme Sprint 2’de detaylandırılacak.</div>
      )}
    </div>
  );
}
