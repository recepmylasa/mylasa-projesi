import React, { useEffect, useState } from 'react';
import { db, auth } from './firebase';
import {
  collection, query, orderBy, limit, onSnapshot, doc, getDoc,
} from 'firebase/firestore';
import './saved.css';

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 8h-1V6a4 4 0 10-8 0v2H7a2 2 0 00-2 2v9a2 2 0 002 2h10a2 2 0 002-2V10a2 2 0 00-2-2zm-8-2a3 3 0 016 0v2H9V6zm9 13a1 1 0 01-1 1H7a1 1 0 01-1-1V10a1 1 0 011-1h10a1 1 0 011 1v9z" fill="currentColor"/>
    </svg>
  );
}

const getPermalink = ({ type = 'post', id }) => {
  const base = window.location.origin;
  const seg = type === 'clip' ? 'c' : type === 'story' ? 'story' : 'p';
  return `${base}/${seg}/${id}`;
};

function Tile({ item }) {
  const isClip = item.type === 'clip';
  return (
    <button
      className="svd-tile"
      title={item.caption || ''}
      onClick={() => (window.location.href = getPermalink({ type: item.type, id: item.contentId }))}
    >
      {/* Görsel */}
      {isClip ? (
        <video
          className="svd-media"
          src={item.mediaUrl || ''}
          preload="metadata"
          muted
          playsInline
        />
      ) : (
        <img
          className="svd-media"
          src={item.mediaUrl || 'https://placehold.co/600x600/EFEFEF/AAAAAA?text=Saved'}
          alt=""
          loading="lazy"
        />
      )}

      {/* Overlayler */}
      {isClip && (
        <div className="svd-badge svd-badge-play" aria-hidden="true">▶</div>
      )}
    </button>
  );
}

export default function SavedPage() {
  const [items, setItems] = useState(null); // null = loading, [] = empty
  const [enriched, setEnriched] = useState(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setItems([]); return; }

    const col = collection(db, 'users', uid, 'saved');
    const q = query(col, orderBy('createdAt', 'desc'), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(arr);
    });
    return () => unsub();
  }, []);

  // Eksik mediaUrl varsa (eski kayıtlar) ilgili doc’tan tamamla
  useEffect(() => {
    if (!items) return;
    let cancelled = false;

    (async () => {
      const filled = await Promise.all(items.map(async (it) => {
        if (it.mediaUrl) return it;
        try {
          const coll = it.type === 'clip' ? 'clips' : 'posts';
          const snap = await getDoc(doc(db, coll, it.contentId));
          if (snap.exists()) {
            const d = snap.data();
            return { ...it, mediaUrl: d.mediaUrl || it.mediaUrl || null };
          }
        } catch (_) {}
        return it;
      }));

      if (!cancelled) setEnriched(filled);
    })();

    return () => { cancelled = true; };
  }, [items]);

  const list = enriched || items;

  if (list === null) {
    return (
      <div className="svd-wrap">
        <header className="svd-header">
          <div className="svd-title"><LockIcon /> Kaydedilenler</div>
          <div className="svd-sub">Sadece sen görebilirsin</div>
        </header>
        <div className="svd-grid">
          {Array.from({ length: 9 }).map((_, i) => <div className="svd-tile skel" key={i} />)}
        </div>
      </div>
    );
  }

  if (!list || list.length === 0) {
    return (
      <div className="svd-wrap">
        <header className="svd-header">
          <div className="svd-title"><LockIcon /> Kaydedilenler</div>
          <div className="svd-sub">Sadece sen görebilirsin</div>
        </header>

        <div className="svd-empty">
          <div className="svd-empty-ico">🔖</div>
          <h3>Henüz kaydın yok</h3>
          <p>Gönderilerdeki yer imine dokunarak burada topla.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="svd-wrap">
      <header className="svd-header">
        <div className="svd-title"><LockIcon /> Kaydedilenler</div>
        <div className="svd-sub">Sadece sen görebilirsin</div>
      </header>

      <div className="svd-grid">
        {list.map((it) => <Tile key={it.id} item={it} />)}
      </div>
    </div>
  );
}
