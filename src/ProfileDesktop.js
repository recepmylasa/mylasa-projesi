import { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { signOut } from "firebase/auth";
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import UserPosts from "./UserPosts";
import SavedGrid from "./SavedGrid";
import PostDetailModal from "./PostDetailModal";
import TakipListesi from "./TakipListesi";
import ProfilDuzenle from "./ProfilDuzenle";
import "./ProfileDesktop.css";

/* ====== Sekme ikonları (IG masaüstüne yakın) ====== */
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

const SavedIcon = () => (
  <svg aria-hidden="true" height="24" viewBox="0 0 24 24" width="24">
    <polygon fill="none" points="20 21 12 13.44 4 21 4 3 20 3 20 21" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></polygon>
  </svg>
);

const TaggedIcon = () => (
  <svg aria-hidden="true" height="24" viewBox="0 0 24 24" width="24">
    <path d="M17 8.5a2.5 2.5 0 1 1-5.001.001A2.5 2.5 0 0 1 17 8.5Zm3.5 7.25c0 2.071-3.357 3.75-7.5 3.75s-7.5-1.679-7.5-3.75 3.357-3.75 7.5-3.75 7.5 1.679 7.5 3.75Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

export default function ProfileDesktop({ userId, onUserClick }) {
  const [userData, setUserData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [clips, setClips] = useState([]);
  const [saved, setSaved] = useState([]);

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [listModal, setListModal] = useState({ open: false, type: "" });
  const [activeTab, setActiveTab] = useState("posts");

  const savedUnsubRef = useRef(null);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true); setPosts([]); setClips([]); setSaved([]);

    const userDocRef = doc(db, "users", userId);
    const unsubUser = onSnapshot(userDocRef, snap => {
      setUserData(snap.exists() ? snap.data() : null);
      setLoading(false);
    });

    const postsQuery = query(collection(db, "posts"), where("authorId", "==", userId), orderBy("tarih", "desc"));
    const unsubPosts = onSnapshot(postsQuery, s => setPosts(s.docs.map(d => ({ id: d.id, type: "post", ...d.data() }))));

    const clipsQuery = query(collection(db, "clips"), where("authorId", "==", userId), orderBy("tarih", "desc"));
    const unsubClips = onSnapshot(clipsQuery, s => setClips(s.docs.map(d => ({ id: d.id, type: "clip", ...d.data() }))));

    if (auth.currentUser && auth.currentUser.uid === userId) {
      const savedColl = collection(db, "users", userId, "saved");
      const qSaved = query(savedColl, orderBy("createdAt", "desc"));
      savedUnsubRef.current = onSnapshot(qSaved, (s) => {
        const arr = s.docs.map(d => {
          const x = d.data();
          return {
            id: d.id,
            contentId: x.contentId || d.id,
            type: x.type || "post",
            mediaUrl: x.mediaUrl || "",
            authorId: x.authorId || null,
            caption: x.caption || "",
            createdAt: x.createdAt || null,
          };
        });
        setSaved(arr);
      });
    }

    return () => {
      unsubUser(); unsubPosts(); unsubClips();
      if (savedUnsubRef.current) { savedUnsubRef.current(); savedUnsubRef.current = null; }
    };
  }, [userId]);

  const handleLogout = () => { signOut(auth).catch(e => console.error("Çıkış hatası", e)); };
  const isCurrentUser = !!auth.currentUser && auth.currentUser.uid === userId;

  const fromDataVisible = Number(userData?.reputation?.visible);
  const fromDataSample  = Number(userData?.reputation?.sample);
  const repVisible = Number.isFinite(fromDataVisible) ? fromDataVisible : (isCurrentUser ? 4.8 : 0.0);
  const repSample  = Number.isFinite(fromDataSample)  ? fromDataSample  : (isCurrentUser ? 1500 : 0);
  const repText = repVisible.toFixed(1);
  const isGold =
    (repVisible >= 4.5 && repSample >= 1000) ||
    !!userData?.badges?.gold ||
    (isCurrentUser && repVisible >= 4.5);

  if (isEditing) return <ProfilDuzenle currentUserData={userData} onClose={() => setIsEditing(false)} />;
  if (loading) return <div className="profile-desktop loading-container">Profil Yükleniyor...</div>;
  if (!userData) return <div className="profile-desktop loading-container">Bu kullanıcı bulunamadı.</div>;

  const openSavedItem = (item) => {
    if (!item?.contentId) return;
    setSelectedPost({ id: item.contentId, type: item.type });
  };

  return (
    <div className="profile-desktop">
      <div className="profile-container">
        {/* ===== Header ===== */}
        <header className="profile-header">
          <div className={`profile-avatar-wrapper ${isGold ? "gold-ring" : ""}`}>
            <div className="avatar-inner">
              <img
                src={userData.profilFoto || "https://placehold.co/150x150/e0e0e0/e0e0e0?text=?"}
                alt="Profil"
                className="profile-avatar"
              />
              {isGold && (
                <span className="gold-star" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="gold-star-svg">
                    <defs>
                      <linearGradient id="gold-grad-dk" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fff6bf"/>
                        <stop offset="45%" stopColor="#ffd458"/>
                        <stop offset="70%" stopColor="#e6b522"/>
                        <stop offset="100%" stopColor="#a8740f"/>
                      </linearGradient>
                    </defs>
                    <path
                      d="M12 17.27 18.18 21 16.54 13.97 22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                      fill="url(#gold-grad-dk)"
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
              <h2 className="profile-username">{userData.kullaniciAdi || "bilinmeyen"}</h2>

              <span className={`rep-pill ${repVisible >= 4.5 ? "high" : ""}`} title={`Örneklem: ${repSample.toLocaleString()}`}>
                <span className="star">★</span> {repText}
              </span>

              {isCurrentUser && (
                <div className="profile-actions">
                  <button onClick={() => setIsEditing(true)} className="profile-edit-btn" type="button">Profili Düzenle</button>
                  <button onClick={handleLogout} className="profile-logout-btn" type="button">Çıkış Yap</button>
                </div>
              )}
            </div>

            <ul className="profile-stats" aria-label="İstatistikler">
              <li className="stat-item"><span>{posts.length + clips.length}</span> gönderi</li>
              <li className="stat-item clickable" onClick={() => setListModal({ open: true, type: "takipciler" })}><span>{userData.takipciler?.length || 0}</span> takipçi</li>
              <li className="stat-item clickable" onClick={() => setListModal({ open: true, type: "takipEdilenler" })}><span>{userData.takipEdilenler?.length || 0}</span> takip</li>
            </ul>

            <div className="profile-bio">
              {userData.adSoyad && <div className="fullname">{userData.adSoyad}</div>}
              {userData.bio && <div className="bio-text">{userData.bio}</div>}
            </div>
          </section>
        </header>

        {/* ===== Sekmeler: ikon-yalın ===== */}
        <nav className="profile-tabs" role="tablist" aria-label="Profil sekmeleri">
          <button
            role="tab"
            aria-selected={activeTab === "posts"}
            title="Gönderiler"
            className={`profile-tab-btn ${activeTab === "posts" ? "active" : ""}`}
            onClick={() => setActiveTab("posts")}
          >
            <GridIcon /><span className="sr-only">Gönderiler</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === "reels"}
            title="Reels"
            className={`profile-tab-btn ${activeTab === "reels" ? "active" : ""}`}
            onClick={() => setActiveTab("reels")}
          >
            <ReelsIcon /><span className="sr-only">Reels</span>
          </button>

          {isCurrentUser && (
            <button
              role="tab"
              aria-selected={activeTab === "saved"}
              title="Kaydedilenler"
              className={`profile-tab-btn ${activeTab === "saved" ? "active" : ""}`}
              onClick={() => setActiveTab("saved")}
            >
              <SavedIcon /><span className="sr-only">Kaydedilenler</span>
            </button>
          )}

          <button
            role="tab"
            aria-selected={activeTab === "tagged"}
            title="Etiketlenenler"
            className={`profile-tab-btn ${activeTab === "tagged" ? "active" : ""}`}
            onClick={() => setActiveTab("tagged")}
          >
            <TaggedIcon /><span className="sr-only">Etiketlenenler</span>
          </button>
        </nav>

        {/* ===== Sekme Sahnesi ===== */}
        <section className="tab-stage" role="tabpanel" aria-live="polite">
          {activeTab === "posts" && (
            <UserPosts mode="posts" content={posts} onPostClick={p => setSelectedPost(p)} />
          )}
          {activeTab === "reels" && (
            <UserPosts mode="reels" content={clips} onPostClick={p => setSelectedPost(p)} />
          )}
          {activeTab === "saved" && isCurrentUser && (
            <section className="saved-section">
              <header className="saved-header">
                <div className="saved-title">
                  <span className="saved-lock" aria-hidden="true">🔒</span>
                  <div>
                    <div className="saved-h1">Kaydedilenler</div>
                    <div className="saved-sub">Sadece sen görebilirsin</div>
                  </div>
                </div>
              </header>
              <SavedGrid items={saved} onItemClick={openSavedItem} />
            </section>
          )}
          {activeTab === "tagged" && (
            <div className="tab-placeholder">Etiketlenenler yakında.</div>
          )}
        </section>
      </div>

      {/* Takipçi / Takip: üstten overlay wrapper (Sprint 4’te içerisi yenilenecek) */}
      {listModal.open && (
        <div className="profile-overlay-modal" role="dialog" aria-modal="true">
          <div className="profile-overlay-backdrop" onClick={() => setListModal({ open: false, type: "" })} />
          <div className="profile-overlay-panel">
            <TakipListesi
              userId={userId}
              tip={listModal.type}
              onClose={() => setListModal({ open: false, type: "" })}
              onUserClick={onUserClick}
            />
          </div>
        </div>
      )}

      {/* Gönderi Modalı (mevcut sistem) */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onUserClick={onUserClick}
          aktifKullaniciId={auth.currentUser ? auth.currentUser.uid : null}
        />
      )}
    </div>
  );
}
