import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { signOut } from "firebase/auth";
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  getDoc,
} from "firebase/firestore";
import UserPosts from "./UserPosts";
import PostDetailModal from "./PostDetailModal";
import TakipListesi from "./TakipListesi";
import ProfilDuzenle from "./ProfilDuzenle";
import UserCheckIns from "./UserCheckIns";
import "./Profile.css";

/* ================== ICONS ================== */
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
    <path d="M16 9V6a4 4 0 10-8 0v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/* ============== SAVED GRID (inline) ============== */
function SavedGrid({ items, onOpen }) {
  if (!items) {
    return (
      <div className="saved-grid">
        {Array.from({ length: 9 }).map((_, i) => <div key={i} className="saved-item skel" />)}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="saved-empty">
        <div className="saved-empty-ico">🔖</div>
        <h3>Henüz kaydın yok</h3>
        <p>Gönderilerdeki yer imine dokunarak burada topla.</p>
      </div>
    );
  }
  return (
    <div className="saved-grid">
      {items.map((it) => (
        <button
          key={it.id}
          className="saved-item"
          title={it.caption || ""}
          onClick={() => onOpen({ id: it.contentId, type: it.type })}
        >
          {it.type === "clip" ? (
            <video className="saved-media" src={it.mediaUrl || ""} preload="metadata" muted playsInline />
          ) : (
            <img
              className="saved-media"
              src={it.mediaUrl || "https://placehold.co/600x600/EFEFEF/AAAAAA?text=Saved"}
              alt=""
              loading="lazy"
            />
          )}
          {it.type === "clip" && <span className="saved-badge">▶</span>}
        </button>
      ))}
    </div>
  );
}

function Profile({ userId, onUserClick, onPlaceClick }) {
  const [userData, setUserData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [clips, setClips] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [savedItems, setSavedItems] = useState(null); // null=loading
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [listModal, setListModal] = useState({ open: false, type: "" });
  const [activeTab, setActiveTab] = useState("posts");

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true); setPosts([]); setClips([]); setCheckIns([]); setSavedItems(null);

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

    // Saved sadece profil sahibi için (IG davranışı)
    const isCurrentUser = !!auth.currentUser && auth.currentUser.uid === userId;
    let unsubSaved = null;
    if (isCurrentUser) {
      const savedCol = collection(db, "users", userId, "saved");
      const savedQuery = query(savedCol, orderBy("createdAt", "desc"));
      unsubSaved = onSnapshot(savedQuery, async (snap) => {
        const base = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Eksik mediaUrl'leri tamamla (eski kayıtlar için)
        const filled = await Promise.all(base.map(async it => {
          if (it.mediaUrl) return it;
          try {
            const coll = it.type === "clip" ? "clips" : "posts";
            const ds = await getDoc(doc(db, coll, it.contentId));
            if (ds.exists()) {
              const d = ds.data();
              return { ...it, mediaUrl: d.mediaUrl || it.mediaUrl || null };
            }
          } catch (_) {}
          return it;
        }));
        setSavedItems(filled);
      });
    } else {
      setSavedItems([]); // başkalarının profilinde sekme görünmeyecek ama state boş olsun
    }

    return () => { unsubUser(); unsubPosts(); unsubClips(); unsubCheck(); unsubSaved && unsubSaved(); };
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
  if (loading) return <div className="loading-container">Profil Yükleniyor...</div>;
  if (!userData) return <div className="loading-container">Bu kullanıcı bulunamadı.</div>;

  return (
    <>
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
                      <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fff6bf"/>
                        <stop offset="45%" stopColor="#ffd458"/>
                        <stop offset="70%" stopColor="#e6b522"/>
                        <stop offset="100%" stopColor="#a8740f"/>
                      </linearGradient>
                    </defs>
                    <path
                      d="M12 17.27 18.18 21 16.54 13.97 22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                      fill="url(#gold-grad)"
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

          {/* IG davranışı: Kaydedilenler sadece sahibi görür */}
          {isCurrentUser && (
            <button className={`profile-tab-btn ${activeTab === "saved" ? "active" : ""}`} onClick={() => setActiveTab("saved")}>
              <SavedIcon /> KAYDEDİLENLER
            </button>
          )}
        </div>

        {(() => {
          switch (activeTab) {
            case "posts": return <UserPosts content={posts} onPostClick={p => setSelectedPost(p)} />;
            case "clips": return <UserPosts content={clips} onPostClick={p => setSelectedPost(p)} />;
            case "checkins": return <UserCheckIns checkIns={checkIns} onPlaceClick={onPlaceClick} />;
            case "saved": return <SavedGrid items={savedItems} onOpen={(stub) => setSelectedPost(stub)} />;
            default: return null;
          }
        })()}
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
          post={selectedPost}               // { id, type } yeterli — modal doc'u canlı çeker
          onClose={() => setSelectedPost(null)}
          onUserClick={onUserClick}
          aktifKullaniciId={auth.currentUser ? auth.currentUser.uid : null}
        />
      )}
    </>
  );
}

export default Profile;
