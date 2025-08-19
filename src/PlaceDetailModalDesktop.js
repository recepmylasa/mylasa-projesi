import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import './PlaceDetailModal.css';

const CloseIcon = () => (
  <svg height="24" viewBox="0 0 24 24" width="24">
    <path d="M18 6L6 18M6 6l12 12"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const formatTimeAgo = (timestamp) => {
  if (!timestamp || typeof timestamp.seconds !== 'number') return '';
  const now = new Date();
  const postDate = new Date(timestamp.seconds * 1000);
  const secondsPast = (now.getTime() - postDate.getTime()) / 1000;
  if (secondsPast < 60) return `${Math.round(secondsPast)} sn`;
  if (secondsPast < 3600) return `${Math.floor(secondsPast / 60)} dk`;
  return `${Math.floor(secondsPast / 3600)} sa`;
};

function PlaceDetailModalDesktop({ placeData, onClose, onUserClick }) {
  const [recentCheckIns, setRecentCheckIns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!placeData || !placeData.placeId) return;

    const fetchRecentCheckIns = async () => {
      setIsLoading(true);
      try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // 1) Son 24 saatteki check-in'ler
        const checkInsQuery = query(
          collection(db, 'checkins'),
          where('placeId', '==', placeData.placeId),
          where('timestamp', '>=', twentyFourHoursAgo),
          orderBy('timestamp', 'desc')
        );
        const checkInsSnap = await getDocs(checkInsQuery);
        const checkIns = checkInsSnap.docs.map(d => ({ ...d.data(), id: d.id }));

        if (checkIns.length === 0) {
          setRecentCheckIns([]);
          setIsLoading(false);
          return;
        }

        // 2) Kullanıcı profilleri
        const userIds = [...new Set(checkIns.map(c => c.userId))];
        const usersQuery = query(collection(db, 'users'), where('uid', 'in', userIds));
        const usersSnap = await getDocs(usersQuery);
        const usersData = {};
        usersSnap.forEach(d => { usersData[d.data().uid] = d.data(); });

        // 3) Birleştir
        const combined = checkIns
          .map(c => ({ ...c, userData: usersData[c.userId] }))
          .filter(item => item.userData);

        setRecentCheckIns(combined);
      } catch (err) {
        console.error("Yakındaki check-in'ler alınırken hata (desktop):", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecentCheckIns();
  }, [placeData]);

  if (!placeData) return null;

  return (
    <div className="place-detail-modal-overlay" onClick={onClose}>
      <div
        className="place-detail-modal-content place-detail-desktop"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="place-detail-header">
          <h2>{placeData.placeName}</h2>
          <button onClick={onClose} className="place-detail-close-btn">
            <CloseIcon />
          </button>
        </header>

        <div className="place-detail-body">
          {isLoading ? (
            <p>Yükleniyor...</p>
          ) : recentCheckIns.length > 0 ? (
            <div className="recent-checkins-list">
              {recentCheckIns.map(item => (
                <div
                  key={item.id}
                  className="user-item"
                  onClick={() => onUserClick?.(item.userId)}
                >
                  <img
                    src={item.userData.profilFoto || 'https://placehold.co/40x40/EFEFEF/AAAAAA?text=P'}
                    alt={item.userData.kullaniciAdi}
                    className="user-avatar"
                  />
                  <div className="user-info">
                    <span className="user-name">{item.userData.kullaniciAdi}</span>
                    <span className="checkin-time-ago">{formatTimeAgo(item.timestamp)} önce</span>
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
