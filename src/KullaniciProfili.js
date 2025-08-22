import { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  doc, onSnapshot, collection, query, where, orderBy,
  updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp,
} from "firebase/firestore";
import UserPosts from "./UserPosts";
import PostDetailModal from "./PostDetailModal";
import TakipListesi from "./TakipListesi";
import "./KullaniciProfili.css";

/* Sekme ikonları */
const GridIcon = () => (
  <svg aria-hidden="true" height="24" viewBox="0 0 24 24" width="24">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" fill="none" strokeWidth="2"/>
    <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth="2"/>
    <line x1="15" y1="3" x2="15" y2="21" stroke="currentColor" strokeWidth="2"/>
    <line x1="3" y1="9"  x2="21" y2="9"  stroke="currentColor" strokeWidth="2"/>
    <line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="2"/>
  </svg>
);
const ReelsIcon = () => (
  <svg aria-hidden="true" height="24" viewBox="0 0 24 24" width="24">
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="3"/>
      <path d="M3 9h18M7 5l3 4M12 5l3 4M9 12l6 3-6 3z" />
    </g>
  </svg>
);
const TaggedIcon = () => (
  <svg aria-hidden="true" height="24" viewBox="0 0 24 24" width="24">
    <path d="M17 8.5a2.5 2.5 0 1 1-5.001.001A2.5 2.5 0 0 1 17 8.5Zm3.5 7.25c0 2.071-3.357 3.75-7.5 3.75s-7.5-1.679-7.5-3.75 3.357-3.75 7.5-3.75 7.5 1.679 7.5 3.75Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

export default function KullaniciProfili({ userId, onClose, aktifKullaniciId, onUserClick, onSendMessage }) {
  const [userData, setUserData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [aktifKullaniciData, setAktifKullaniciData] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [listModal, setListModal] = useState({ open: false, type: "" });
  const [activeTab, setActiveTab] = useState("posts");

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);

    const userRef = doc(db, "users", userId);
    const unsubUser = onSnapshot(userRef, (snap) => {
      setUserData(snap.exists() ? snap.data() : null);
      setLoading(false);
    });

    const qPosts = query(collection(db, "posts"), where("authorId", "==", userId), orderBy("tarih", "desc"));
    const unsubPosts = onSnapshot(qPosts, (s) => setPosts(s.docs.map((d) => ({ id: d.id, type: "post", ...d.data() }))));

    const qClips = query(collection(db, "clips"), where("authorId", "==", userId), orderBy("tarih", "desc"));
    const unsubClips = onSnapshot(qClips, (s) => setClips(s.docs.map((d) => ({ id: d.id, type: "clip", ...d.data() }))));

    let unsubMe = () => {};
    if (aktifKullaniciId) {
      const meRef = doc(db, "users", aktifKullaniciId);
      unsubMe = onSnapshot(meRef, (snap) => {
        if (snap.exists()) {
          const me = snap.data();
          setAktifKullaniciData(me);
          setIsFollowing(!!me?.takipEdilenler?.includes(userId));
        }
      });
    }

    return () => { unsubUser(); unsubPosts(); unsubClips(); unsubMe(); };
  }, [userId, aktifKullaniciId]);

  const handleTakipToggle = async () => {
    if (!aktifKullaniciId || aktifKullaniciId === userId) return;
    const aktifRef = doc(db, "users", aktifKullaniciId);
    const hedefRef = doc(db, "users", userId);
    try {
      if (isFollowing) {
        await updateDoc(aktifRef, { takipEdilenler: arrayRemove(userId) });
        await updateDoc(hedefRef, { takipciler: arrayRemove(aktifKullaniciId) });
      } else {
        await updateDoc(aktifRef, { takipEdilenler: arrayUnion(userId) });
        await updateDoc(hedefRef, { takipciler: arrayUnion(aktifKullaniciId) });
        if (aktifKullaniciData) {
          await addDoc(collection(db, "notifications"), {
            to: userId,
            from: aktifKullaniciId,
            fromUsername: aktifKullaniciData.kullaniciAdi,
            fromAvatar: aktifKullaniciData.profilFoto || "",
            text: "seni takip etmeye başladı.",
            createdAt: serverTimestamp(),
            read: false,
          });
        }
      }
    } catch (e) {
      console.error("Takip işlemi hatası:", e);
    }
  };

  if (loading) return <div className="kullanici-profili-loading">Yükleniyor...</div>;
  if (!userData) return <div className="kullanici-profili-loading">Kullanıcı bulunamadı.</div>;

  const repVisible = Number(userData?.reputation?.visible) || 0;
  const repSample  = Number(userData?.reputation?.sample)  || 0;
  const showGold = repVisible >= 4.5 && repSample >= 1000 || !!userData?.badges?.gold;

  const totalCount = (posts?.length || 0) + (clips?.length || 0);

  return (
    <div className="kullanici-profili-overlay" role="dialog" aria-modal="true" aria-label="Kullanıcı profili">
      <div className="kullanici-profili-backdrop" onClick={onClose} />
      <div className="kullanici-profili-content">
        <div className="kullanici-profili-body">
          {/* Header */}
          <header className="profile-header">
            <div className={`profile-avatar-wrapper ${showGold ? "gold-ring" : ""}`}>
              <div className="avatar-inner">
                <img src={userData.profilFoto || "https://placehold.co/150x150/e0e0e0/e0e0e0?text=?"} alt="Profil" className="profile-avatar" />
                {showGold && (
                  <span className="gold-star" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="gold-star-svg">
                      <defs>
                        <linearGradient id="gold-grad-view" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#fff6bf"/><stop offset="45%" stopColor="#ffd458"/><stop offset="70%" stopColor="#e6b522"/><stop offset="100%" stopColor="#a8740f"/>
                        </linearGradient>
                      </defs>
                      <path d="M12 17.27 18.18 21 16.54 13.97 22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="url(#gold-grad-view)" stroke="#ffffff" strokeWidth="1.2"/>
                    </svg>
                  </span>
                )}
              </div>
            </div>

            <section className="profile-info">
              <div className="profile-info-top">
                <h2 className="profile-username">{userData.kullaniciAdi}</h2>

                <div className="profile-actions">
                  <button
                    type="button"
                    onClick={handleTakipToggle}
                    className={`profile-action-btn follow-btn ${isFollowing ? "following" : ""}`}
                    disabled={!aktifKullaniciId || aktifKullaniciId === userId}
                  >
                    {isFollowing ? "Takibi Bırak" : "Takip Et"}
                  </button>

                  <button
                    type="button"
                    className="profile-action-btn message-btn"
                    onClick={() => onSendMessage && onSendMessage(userId)}
                  >
                    Mesaj Gönder
                  </button>

                  <button type="button" className="profile-action-btn more-btn" title="Daha fazla" aria-label="Diğer seçenekler">…</button>
                </div>
              </div>

              <ul className="profile-stats" aria-label="İstatistikler">
                <li className="stat-item"><span>{totalCount}</span> gönderi</li>
                <li className="stat-item clickable" onClick={() => setListModal({ open: true, type: "takipciler" })}><span>{userData.takipciler?.length || 0}</span> takipçi</li>
                <li className="stat-item clickable" onClick={() => setListModal({ open: true, type: "takipEdilenler" })}><span>{userData.takipEdilenler?.length || 0}</span> takip</li>
              </ul>

              <div className="profile-bio">
                {userData.adSoyad && <div className="fullname">{userData.adSoyad}</div>}
                {userData.bio && <div className="bio-text">{userData.bio}</div>}
              </div>
            </section>
          </header>

          {/* Sekmeler */}
          <nav className="profile-tabs" role="tablist" aria-label="Profil sekmeleri">
            <button role="tab" aria-selected={activeTab === "posts"} title="Gönderiler" className={`profile-tab-btn ${activeTab === "posts" ? "active" : ""}`} onClick={() => setActiveTab("posts")}>
              <GridIcon /><span className="sr-only">Gönderiler</span>
            </button>
            <button role="tab" aria-selected={activeTab === "reels"} title="Reels" className={`profile-tab-btn ${activeTab === "reels" ? "active" : ""}`} onClick={() => setActiveTab("reels")}>
              <ReelsIcon /><span className="sr-only">Reels</span>
            </button>
            <button role="tab" aria-selected={activeTab === "tagged"} title="Etiketlenenler" className={`profile-tab-btn ${activeTab === "tagged" ? "active" : ""}`} onClick={() => setActiveTab("tagged")}>
              <TaggedIcon /><span className="sr-only">Etiketlenenler</span>
            </button>
          </nav>

          {/* İçerik */}
          <section className="tab-stage" role="tabpanel" aria-live="polite">
            {activeTab === "posts" && <UserPosts mode="posts" content={posts} onPostClick={(post) => setSelectedPost(post)} />}
            {activeTab === "reels" && <UserPosts mode="reels" content={clips} onPostClick={(post) => setSelectedPost(post)} />}
            {activeTab === "tagged" && <div className="tab-placeholder">Etiketlenenler yakında.</div>}
          </section>
        </div>

        {/* Kapat */}
        <button onClick={onClose} className="kullanici-profili-close-btn" aria-label="Kapat" type="button">&times;</button>

        {/* Takipçi / Takip Listesi – overlay içinde panel */}
        {listModal.open && (
          <div className="follow-overlay" role="dialog" aria-modal="true">
            <div className="follow-backdrop" onClick={() => setListModal({ open: false, type: "" })} />
            <div className="follow-panel">
              <TakipListesi
                userId={userId}
                tip={listModal.type}
                onClose={() => setListModal({ open: false, type: "" })}
                onUserClick={onUserClick}
              />
            </div>
          </div>
        )}

        {/* Gönderi Modalı */}
        {selectedPost && (
          <PostDetailModal
            post={selectedPost}
            onClose={() => setSelectedPost(null)}
            aktifKullaniciId={aktifKullaniciId}
            onUserClick={onUserClick}
          />
        )}
      </div>
    </div>
  );
}
