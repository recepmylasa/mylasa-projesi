// src/PlaceDetailModalDesktop.js
import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import './PlaceDetailModal.css';

/* ========== Icons ========== */
const CloseIcon = () => (
  <svg height="24" viewBox="0 0 24 24" width="24" aria-hidden="true">
    <path
      d="M18 6L6 18M6 6l12 12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/* ========== Time Utils (TR — kısa) ========== */
/** Firestore Timestamp / ISO / number (ms|s) → ms */
function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts < 2e12 ? ts * 1000 : ts; // s→ms
  if (typeof ts === 'string') {
    const t = Date.parse(ts);
    return Number.isFinite(t) ? t : 0;
  }
  if (ts.seconds) return ts.seconds * 1000;
  if (ts._seconds) return ts._seconds * 1000;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  return 0;
}

/** IG kısa format: Xs / Xdk / Xsa / Xg ("önce" eklenmez) */
function formatTimeAgoTR(input) {
  const then = toMillis(input);
  if (!then) return '';
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`.replace('s', 's'); // saniye → "Xs"
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa`;
  const g = Math.floor(h / 24);
  return `${g}g`;
}

/* ========== Data Utils ========== */
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

/** Firestore `in` operatörü max 10 eleman destekler → 10'luk parçalarla çek. */
async function fetchUsersByUidInBatches(userIds) {
  const out = {};
  const ids = uniq(userIds);
  if (ids.length === 0) return out;

  const chunkSize = 10;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    try {
      const qy = query(collection(db, 'users'), where('uid', 'in', chunk));
      const snap = await getDocs(qy);
      snap.forEach((d) => {
        const data = d.data();
        if (data?.uid) out[data.uid] = data;
      });
    } catch (e) {
      console.error('users batch fetch error:', e);
    }
  }
  return out;
}

/* ========== Component ========== */
function PlaceDetailModalDesktop({ placeData, onClose, onUserClick }) {
  const [recentCheckIns, setRecentCheckIns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!placeData?.placeId) return;

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // 1) Son 24 saat check-in'leri (en yeni üste)
        const checkInsQ = query(
          collection(db, 'checkins'),
          where('placeId', '==', placeData.placeId),
          where('timestamp', '>=', twentyFourHoursAgo),
          orderBy('timestamp', 'desc')
        );
        const checkInsSnap = await getDocs(checkInsQ);
        const checkIns = checkInsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (cancelled) return;

        if (checkIns.length === 0) {
          setRecentCheckIns([]);
          setIsLoading(false);
          return;
        }

        // 2) Kullanıcı profilleri (10'luk batch)
        const userIds = checkIns.map((c) => c.userId);
        const usersMap = await fetchUsersByUidInBatches(userIds);
        if (cancelled) return;

        // 3) Birleştir + eksik profilleri ayıkla
        const combined = checkIns
          .map((c) => ({ ...c, userData: usersMap[c.userId] }))
          .filter((x) => !!x.userData);

        setRecentCheckIns(combined);
      } catch (err) {
        console.error("Yakındaki check-in'ler alınırken hata (desktop):", err);
        setRecentCheckIns([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [placeData?.placeId]);

  if (!placeData) return null;

  const stop = (e) => e.stopPropagation();

  return (
    <div className="place-detail-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="place-detail-modal-content place-detail-desktop" onClick={stop}>
        <header className="place-detail-header">
          <h2>{placeData.placeName}</h2>
          <button onClick={onClose} className="place-detail-close-btn" aria-label="Kapat">
            <CloseIcon />
          </button>
        </header>

        <div className="place-detail-body">
          {isLoading ? (
            <p>Yükleniyor...</p>
          ) : recentCheckIns.length > 0 ? (
            <div className="recent-checkins-list">
              {recentCheckIns.map((item) => (
                <div
                  key={item.id}
                  className="user-item"
                  onClick={() => onUserClick?.(item.userId)}
                  role="button"
                >
                  <img
                    src={item.userData.profilFoto || 'https://placehold.co/40x40/EFEFEF/AAAAAA?text=P'}
                    alt={item.userData.kullaniciAdi || 'Kullanıcı'}
                    className="user-avatar"
                  />
                  <div className="user-info">
                    <span className="user-name">{item.userData.kullaniciAdi || 'Kullanıcı'}</span>
                    {/* IG kısa zaman: Xs / Xdk / Xsa / Xg */}
                    <span className="checkin-time-ago">{formatTimeAgoTR(item.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="place-detail-placeholder">Son 24 saatte kimse check-in yapmadı.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default PlaceDetailModalDesktop;
