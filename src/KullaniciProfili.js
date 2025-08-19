import { useEffect, useState } from 'react';
import { db, auth } from './firebase';
import { doc, onSnapshot, collection, query, where, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import UserPosts from './UserPosts';
import PostDetailModal from './PostDetailModal';
import TakipListesi from './TakipListesi';
import './KullaniciProfili.css';

const GridIcon = () => (
  <svg aria-label="Gönderiler" height="12" role="img" viewBox="0 0 24 24" width="12">
    <rect x="2" y="2" width="8" height="8" rx="2"></rect>
    <rect x="14" y="2" width="8" height="8" rx="2"></rect>
    <rect x="2" y="14" width="8" height="8" rx="2"></rect>
    <rect x="14" y="14" width="8" height="8" rx="2"></rect>
  </svg>
);

function KullaniciProfili({ userId, onClose, aktifKullaniciId, onUserClick, onSendMessage }) {
  const [userData, setUserData] = useState(null);
  const [postCount, setPostCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [listModal, setListModal] = useState({ open: false, type: '' });
  const [aktifKullaniciData, setAktifKullaniciData] = useState(null);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    const userRef = doc(db, "users", userId);
    const unsubscribeUser = onSnapshot(userRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData(data);
        const postsQuery = query(collection(db, "posts"), where("authorId", "==", userId));
        const postsSnapshot = await getDocs(postsQuery);
        setPostCount(postsSnapshot.size);
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    let unsubscribeCurrentUser = () => {};
    if (aktifKullaniciId) {
      const currentUserRef = doc(db, "users", aktifKullaniciId);
      unsubscribeCurrentUser = onSnapshot(currentUserRef, (snap) => {
        if (snap.exists()) {
          const currentUserData = snap.data();
          setAktifKullaniciData(currentUserData);
          setIsFollowing(currentUserData.takipEdilenler?.includes(userId));
        }
      });
    }

    return () => {
      unsubscribeUser();
      unsubscribeCurrentUser();
    };
  }, [userId, aktifKullaniciId]);

  const handleTakip = async () => {
    if (!aktifKullaniciId || aktifKullaniciId === userId) return;

    const aktifKullaniciRef = doc(db, "users", aktifKullaniciId);
    const hedefKullaniciRef = doc(db, "users", userId);

    if (isFollowing) {
      await updateDoc(aktifKullaniciRef, { takipEdilenler: arrayRemove(userId) });
      await updateDoc(hedefKullaniciRef, { takipciler: arrayRemove(aktifKullaniciId) });
    } else {
      await updateDoc(aktifKullaniciRef, { takipEdilenler: arrayUnion(userId) });
      await updateDoc(hedefKullaniciRef, { takipciler: arrayUnion(aktifKullaniciId) });

      if (aktifKullaniciData) {
        await addDoc(collection(db, "notifications"), {
          to: userId,
          from: aktifKullaniciId,
          fromUsername: aktifKullaniciData.kullaniciAdi,
          fromAvatar: aktifKullaniciData.profilFoto || '',
          text: "seni takip etmeye başladı.",
          createdAt: serverTimestamp(),
          read: false
        });
      }
    }
  };

  if (loading) return <div className="kullanici-profili-loading">Yükleniyor...</div>;
  if (!userData) return <div className="kullanici-profili-loading">Kullanıcı bulunamadı.</div>;

  const repVisible = Number(userData?.reputation?.visible) || 0;
  const repSample  = Number(userData?.reputation?.sample)  || 0;
  const showGold = (repVisible >= 4.5 && repSample >= 1000) || !!userData?.badges?.gold;

  return (
    <>
      <div className="kullanici-profili-content">
        <div className="kullanici-profili-body">
          <header className="profile-header">
            <div className={`profile-avatar-wrapper ${showGold ? 'gold-ring' : ''}`}>
              <div className="avatar-inner">
                <img
                  src={userData.profilFoto || 'https://placehold.co/150x150/e0e0e0/e0e0e0?text=?'}
                  alt="Profil"
                  className="profile-avatar"
                />
                {showGold && (
                  <span className="gold-star" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="gold-star-svg">
                      <defs>
                        <linearGradient id="gold-grad-view" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#fff6bf"/>
                          <stop offset="45%" stopColor="#ffd458"/>
                          <stop offset="70%" stopColor="#e6b522"/>
                          <stop offset="100%" stopColor="#a8740f"/>
                        </linearGradient>
                      </defs>
                      <path
                        d="M12 17.27 18.18 21 16.54 13.97 22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                        fill="url(#gold-grad-view)"
                        stroke="#ffffff"
                        strokeWidth="1.2"
                      />
                    </svg>
                  </span>
                )}
              </div>
            </div>

            <section className="profile-info">
              <div className="profile-info-top">
                <h2 className="profile-username">{userData.kullaniciAdi}</h2>
                <button onClick={handleTakip} className={`profile-action-btn follow-btn ${isFollowing ? 'following' : ''}`}>
                  {isFollowing ? 'Takibi Bırak' : 'Takip Et'}
                </button>
                <button className="profile-action-btn message-btn" onClick={() => onSendMessage(userId)}>
                  Mesaj Gönder
                </button>
              </div>

              <ul className="profile-stats">
                <li><span>{postCount}</span> gönderi</li>
                <li onClick={() => setListModal({ open: true, type: 'takipciler' })}><span>{userData.takipciler?.length || 0}</span> takipçi</li>
                <li onClick={() => setListModal({ open: true, type: 'takipEdilenler' })}><span>{userData.takipEdilenler?.length || 0}</span> takip</li>
              </ul>

              <div className="profile-bio">
                <div className="fullname">{userData.adSoyad}</div>
                <div className="bio-text">{userData.bio}</div>
              </div>
            </section>
          </header>

          <div className="profile-tabs">
            <button className="profile-tab-btn active"><GridIcon /> Gönderiler</button>
          </div>

          <UserPosts userId={userId} onPostClick={(post) => setSelectedPost(post)} />
        </div>
      </div>

      <button onClick={onClose} className="kullanici-profili-close-btn">&times;</button>

      {listModal.open && (
        <TakipListesi
          userId={userId}
          tip={listModal.type}
          onClose={() => setListModal({ open: false, type: '' })}
          onUserClick={onUserClick}
        />
      )}

      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          aktifKullaniciId={aktifKullaniciId}
        />
      )}
    </>
  );
}

export default KullaniciProfili;
