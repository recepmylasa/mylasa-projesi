// src/ProfileDesktop.js
// Pixelfed davranışı ile uyumlu profil başlığı + sekmeler + grid kapsayıcı

import React, { useMemo, useState } from 'react';
import './ProfileDesktop.css';
import { GridIcon, ReelsIcon, SavedIcon, TaggedIcon } from './Icons';
import UserPosts from './UserPosts';

export default function ProfileDesktop({ user }) {
  const [mode, setMode] = useState('grid'); // grid | reels | saved | tagged
  const name = user?.displayName || user?.fullName || user?.username;
  const bio = user?.bio || '';
  const website = user?.website || '';
  const avatarUrl = user?.photoURL || user?.avatar || '/avatars/default.png';
  const reputation = Math.round((user?.reputation?.score ?? user?.reputation ?? 0) * 10) / 10;

  const stats = useMemo(() => ({
    posts: user?.postsCount ?? user?.statuses_count ?? 0,
    followers: user?.followersCount ?? user?.followers_count ?? 0,
    following: user?.followingCount ?? user?.following_count ?? 0,
  }), [user]);

  const dmHref = `/account/direct/t/${user.id}`;

  return (
    <div>
      <div className="profile-wrap">
        <div className="profile-header">
          <div className="avatar-wrap">
            <div className="avatar-ring">
              <img alt={`${user.username} avatar`} src={avatarUrl} />
              <div className="avatar-star" title="İtibar">
                ★{Number.isFinite(reputation) ? reputation : '0'}
              </div>
            </div>
          </div>

          <div className="profile-main">
            <div className="username-row">
              <div className="username">{user.username}</div>
              <div className="profile-actions">
                <button className="btn">Follow</button>
                <a className="btn" href={dmHref}>Message</a>
                <button className="btn">···</button>
              </div>
            </div>

            <div className="profile-stats">
              <span><b className="count">{stats.posts}</b> posts</span>
              <a href="#" onClick={(e)=>{e.preventDefault();}}>
                <b className="count">{stats.followers}</b> followers
              </a>
              <a href="#" onClick={(e)=>{e.preventDefault();}}>
                <b className="count">{stats.following}</b> following
              </a>
            </div>

            <div className="profile-bio">
              <div><span className="name">{name}</span></div>
              {bio ? <p dangerouslySetInnerHTML={{__html: bio}} /> : null}
              {website ? <p><a href={website} rel="me noopener nofollow" target="_blank">{website}</a></p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="profile-tabs">
        <a href="#" className={`profile-tab ${mode==='grid'?'active':''}`} onClick={(e)=>{e.preventDefault(); setMode('grid')}}>
          <GridIcon active={mode==='grid'} /> <span>POSTS</span>
        </a>
        <a href="#" className={`profile-tab ${mode==='reels'?'active':''}`} onClick={(e)=>{e.preventDefault(); setMode('reels')}}>
          <ReelsIcon active={mode==='reels'} /> <span>REELS</span>
        </a>
        <a href="#" className={`profile-tab ${mode==='saved'?'active':''}`} onClick={(e)=>{e.preventDefault(); setMode('saved')}}>
          <SavedIcon active={mode==='saved'} /> <span>SAVED</span>
        </a>
        <a href="#" className={`profile-tab ${mode==='tagged'?'active':''}`} onClick={(e)=>{e.preventDefault(); setMode('tagged')}}>
          <TaggedIcon active={mode==='tagged'} /> <span>TAGGED</span>
        </a>
      </div>

      {mode === 'grid' && (
        <div className="userposts-container">
          <UserPosts userId={user.id} />
        </div>
      )}
      {mode === 'reels' && (
        <div className="userposts-container" style={{padding: '24px', color: '#999'}}>Reels sekmesi (9:16 portre grid) — Sprint 2’de özel layout.</div>
      )}
      {mode === 'saved' && (
        <div className="userposts-container" style={{padding: '24px', color: '#999'}}>Kaydedilenler — sadece sahibine görünür.</div>
      )}
      {mode === 'tagged' && (
        <div className="userposts-container" style={{padding: '24px', color: '#999'}}>Etiketlenenler — Sprint 2’de Firestore sorgusu eklenecek.</div>
      )}
    </div>
  );
}
