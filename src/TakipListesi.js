import { useEffect, useState } from "react";
import { db } from "./firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import "./TakipListesi.css";

/** Takipçi / Takip edilen modalı – ortada overlay */
export default function TakipListesi({ userId, tip, onClose, onUserClick }) {
  const [kullanicilar, setKullanicilar] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchList() {
      setLoading(true);
      try {
        const usersRef = collection(db, "users");
        const userQuery = query(usersRef, where("uid", "==", userId));
        const userQuerySnapshot = await getDocs(userQuery);

        if (userQuerySnapshot.empty) { setKullanicilar([]); setLoading(false); return; }

        const userDoc = userQuerySnapshot.docs[0];
        const uidList = (userDoc.data()[tip] || []);

        if (uidList.length === 0) { setKullanicilar([]); setLoading(false); return; }

        const usersDataQuery = query(collection(db, "users"), where("uid", "in", uidList.slice(0, 30)));
        const usersSnapshot = await getDocs(usersDataQuery);

        const usersData = usersSnapshot.docs.map(doc => doc.data());
        setKullanicilar(usersData);

      } catch (error) {
        console.error("Takip listesi çekilirken hata:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchList();
  }, [userId, tip]);

  const handleUserClick = (userUid) => {
    if (onUserClick) {
      onClose();
      onUserClick(userUid);
    }
  };

  return (
    <div className="modal-global" onClick={onClose} role="dialog" aria-modal="true">
      <div className="takip-listesi-content" onClick={e => e.stopPropagation()}>
        <header className="takip-listesi-header">
          <h3>{tip === 'takipciler' ? 'Takipçiler' : 'Takip Edilenler'}</h3>
          <button onClick={onClose} className="takip-listesi-close-btn" aria-label="Kapat">&times;</button>
        </header>
        <div className="takip-listesi-body">
          {loading ? (
            <div className="takip-listesi-message">Yükleniyor...</div>
          ) : kullanicilar.length === 0 ? (
            <div className="takip-listesi-message">Hiç kullanıcı yok.</div>
          ) : (
            <ul>
              {kullanicilar.map(user => (
                <li key={user.uid} className="takip-listesi-item" onClick={() => handleUserClick(user.uid)}>
                  <img
                    src={user.profilFoto || 'https://placehold.co/44x44/e0e0e0/e0e0e0?text=?'}
                    alt={user.kullaniciAdi}
                    className="takip-listesi-avatar"
                  />
                  <div className="takip-listesi-user-info">
                    <div className="takip-listesi-username">{user.kullaniciAdi}</div>
                    <div className="takip-listesi-fullname">{user.adSoyad}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
