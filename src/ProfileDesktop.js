// src/ProfileDesktop.js
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
import PostDetailModal from "./PostDetailModal";
import TakipListesi from "./TakipListesi";
import ProfilDuzenle from "./ProfilDuzenle";
import UserCheckIns from "./UserCheckIns";
import "./ProfileDesktop.css";

/* ====== Sekme ikonları ====== */
const GridIcon = () => (
  <svg aria-label="Gönderiler" height="24" role="img" viewBox="0 0 24 24" width="24">
    <rect fill="none" height="18" rx="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" width="18" x="3" y="3"></rect>
    <line fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" x1="9.015" x2="9.015" y1="3" y2="21"></line>
    <line fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" x1="14.985" x2="14.985" y1="3" y2="21"></line>
    <line fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" x1="21" x2="3" y1="9.015" y2="9.015"></line>
    <line fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" x1="21" x2="3" y1="14.985" y2="14.985"></line>
  </svg>
);

const ClipsIcon = () => (
  <svg aria-label="Clips" height="24" role="img" viewBox="0 0 24 24" width="24">
    <g fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2">
      <path d="M2.001 7.877a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8.246a2 2 0 0 1-2-2h-16a2 2 0 0 1-2-2Z" />
      <path d="m15.945 12.42-4.13 2.383a.5.5 0 0 1-.75-.434v-4.764a.5.5 0 0 1 .75-.434l4.13 2.383a.5.5 0 0 1 0 .868Z" />
    </g>
  </svg>
);

const CheckInIcon = () => (
  <svg aria-label="Check-in'ler" height="24" fill="currentColor" role="img" viewBox="0 0 24 24" width="24">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"></path>
  </svg>
);

const SavedIcon = () => (
  <svg aria-label="Kaydedilenler" height="24" role="img" viewBox="0 0 24 24" width="24">
    <polygon fill="none" points="20 21 12 13.44 4 21 4 3 20 3 20 21" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></polygon>
  </svg>
);

export default function ProfileDesktop({ userId, onUserClick, onPlaceClick }) {
  const [userData, setUserData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [clips, setClips] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [saved, setSaved] = useState([]);

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [listModal, setListModal] = useState({ open: false, type: "" });
  const [activeTab, setActiveTab] = useState("posts");

  const savedUnsubRef = useRef(null);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true); setPosts([]); setClips([]); setCheckIns([]); setSaved([]);

    const userDocRef = doc(db, "users", userId);
    const unsubUser = onSnapshot(userDocRef, snap => {
      setUserData(snap.exists() ? snap.data() : null);
      setLoading(false);
    });

    const postsQuery = query(collection(db, "posts"), where("authorId", "==", userId), orderBy("tarih", "desc"));
    const unsubPosts = onSnapshot(postsQuery, s => setPosts(s.docs.map(d => ({ id: d.id, type: "post", ...d.data() }))));

    const clipsQuery = query(collection(db, "clips"), where("authorId", "==", userId), orderBy("tarih", "desc"));
    const unsubClips = onSnapshot(clipsQuery, s => setClips(s.docs.map(d => ({ id: d.id, type: "clip", ...d.data() }))));

    const checkInsQuery = query(collection(db, "checkins"), where("userId", "==", userId), orderBy("timestamp", "desc"));
    const unsubCheck = onSnapshot(checkInsQuery, s => setCheckIns(s.docs.map(d => ({ id: d.id, ...d.data() }))));

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
      unsubUser(); unsubPosts(); unsubClips(); unsubCheck();
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
                  <button onClick={() => setIsEditing(true)} className="profile-edit-btn">Profili Düzenle</button>
                  <button onClick={handleLogout} className="profile-logout-btn">Çıkış Yap</button>
                </div>
              )}
            </div>

            <ul className="profile-stats">
              <li><span>{posts.length + clips.length}</span> gönderi</li>
              <li onClick={() => setListModal({ open: true, type: "takipciler" })}><span>{userData.takipciler?.length || 0}</span> takipçi</li>
              <li onClick={() => setListModal({ open: true, type: "takipEdilenler" })}><span>{userData.takipEdilenler?.length || 0}</span> takip</li>
            </ul>

            <div className="profile-bio">
              <div className="fullname">{userData.adSoyad}</div>
              <div className="bio-text">{userData.bio}</div>
            </div>
          </section>
        </header>

        <div className="profile-tabs">
          <button className={`profile-tab-btn ${activeTab === "posts" ? "active" : ""}`} onClick={() => setActiveTab("posts")}><GridIcon /> GÖNDERİLER</button>
          <button className={`profile-tab-btn ${activeTab === "clips" ? "active" : ""}`} onClick={() => setActiveTab("clips")}><ClipsIcon /> CLIPS</button>
          <button className={`profile-tab-btn ${activeTab === "checkins" ? "active" : ""}`} onClick={() => setActiveTab("checkins")}><CheckInIcon /> CHECK-IN'LER</button>
          {isCurrentUser && (
            <button className={`profile-tab-btn ${activeTab === "saved" ? "active" : ""}`} onClick={() => setActiveTab("saved")}>
              <SavedIcon /> KAYDEDİLENLER
            </button>
          )}
        </div>

        {activeTab === "posts" && <UserPosts content={posts} onPostClick={p => setSelectedPost(p)} />}
        {activeTab === "clips" && <UserPosts content={clips} onPostClick={p => setSelectedPost(p)} />}
        {activeTab === "checkins" && <UserCheckIns checkIns={checkIns} onPlaceClick={onPlaceClick} />}

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

            {saved.length === 0 ? (
              <div className="saved-empty">Henüz kaydedilen yok.</div>
            ) : (
              <div className="saved-grid">
                {saved.map((it) => (
                  <button
                    key={`${it.contentId}:${it.type}`}
                    className="saved-card"
                    onClick={() => openSavedItem(it)}
                    title={it.caption || ''}
                    aria-label="Kaydedilen içeriği aç"
                  >
                    {it.mediaUrl ? (
                      <img src={it.mediaUrl} alt="Kaydedilen" />
                    ) : (
                      <div className="saved-placeholder" />
                    )}
                    {it.type === 'clip' && <span className="saved-badge">CLIP</span>}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {listModal.open && (
        <TakipListesi
          userId={userId}
          tip={listModal.type}
          onClose={() => setListModal({ open: false, type: "" })}
          onUserClick={onUserClick}
        />
      )}

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
