// src/App.js
// Tek overlay App’te, /p/:id ve /c/:id permalink uyumlu, profil sekmesi /u/<username> rotasına taşıyor.

import { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, updateDoc, getDoc } from "firebase/firestore";

import Auth from "./Auth";
import LogoBar from "./LogoBar";
import BottomNav from "./BottomNav";
import SideNav from "./SideNav";
import Profile from "./Profile";
import Feed from "./Feed";
import Hikayeler from "./Hikayeler";
import NewPost from "./NewPost";
import KullaniciProfili from "./KullaniciProfili";
import Messages from "./Messages";
import Bildirimler from "./Bildirimler";
import Explore from "./Explore";
import PostDetailModal from "./PostDetailModal";
import Clips from "./Clips";
import CreateMenu from "./CreateMenu";
import NewClip from "./NewClip";

import MapDesktop from "./MapDesktop";
import MapMobile from "./MapMobile";

import CheckInModal from "./CheckInModal";
import NewCheckInDetail from "./NewCheckInDetail";
import PlaceDetailModal from "./PlaceDetailModal";
import StoryModal from "./StoryModal";
import MapSettingsModal from "./MapSettingsModal";
import FriendPickerModal from "./FriendPickerModal";

// >>> NEW: Clips modal bileşenleri (Kural-6: ayrı dosyalar)
import ClipDetailModalDesktop from "./ClipDetailModalDesktop";
import ClipDetailModalMobile from "./ClipDetailModalMobile";

import "./App.css";

const useWindowSize = () => {
  const [size, setSize] = useState([window.innerWidth, window.innerHeight]);
  useEffect(() => {
    const handleResize = () => setSize([window.innerWidth, window.innerHeight]);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return size;
};

function App() {
  const [user, setUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState("home");
  const [modalContent, setModalContent] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [width] = useWindowSize();
  const isMobile = width <= 768;

  // Post/Clip modallarında pushState bizim mi yaptı?
  const pushedByAppRef = useRef(false);

  // === NEW: Service Worker update toast state (mevcut düzeni bozmaz) ===
  const [swWaiting, setSwWaiting] = useState(null);
  const [showUpdateToast, setShowUpdateToast] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let regUnsub = null;
    let refreshing = false;

    // Yeni worker kontrol & dinleme
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      // Eğer yüklenmiş ve bekleyen bir worker varsa doğrudan bildir
      if (reg.waiting) {
        setSwWaiting(reg.waiting);
        setShowUpdateToast(true);
      }

      // install → installed → waiting
      const onUpdateFound = () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          // controller varsa ve yeni worker "installed" ise güncelleme hazır
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setSwWaiting(newWorker);
            setShowUpdateToast(true);
          }
        });
      };

      reg.addEventListener("updatefound", onUpdateFound);
      regUnsub = () => reg.removeEventListener("updatefound", onUpdateFound);
    });

    // SkipWaiting sonrası controller değişip yeni sürüm aktif olunca otomatik yenile
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      if (regUnsub) regUnsub();
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const acceptUpdateAndReload = () => {
    try {
      swWaiting?.postMessage?.("SKIP_WAITING");
    } catch {}
    // UI gizle; controllerchange dinleyicisi reload edecek
    setShowUpdateToast(false);
  };

  // Modal varken body scroll kilidi
  useEffect(() => {
    if (modalContent) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [modalContent]);

  // Kimlik + kullanıcı profili dinleyicisi
  useEffect(() => {
    let unsubscribeProfile = () => {};
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      unsubscribeProfile();
      setUser(currentUser);
      if (currentUser) {
        const userDocRef = doc(db, "users", currentUser.uid);
        unsubscribeProfile = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              setCurrentUserProfile({ id: docSnap.id, ...docSnap.data() });
            } else {
              setCurrentUserProfile(null);
            }
            setLoading(false);
          },
          (error) => {
            console.error("Profil dinlenirken hata:", error);
            setLoading(false);
          }
        );
      } else {
        setCurrentUserProfile(null);
        setLoading(false);
      }
    });
    return () => {
      unsubscribeAuth();
      unsubscribeProfile();
    };
  }, []);

  // URL doğrudan /p/:id ise post modalı aç
  useEffect(() => {
    if (loading || !user) return;
    const match = window.location.pathname.match(/^\/p\/([A-Za-z0-9_-]+)$/);
    if (!match) return;

    const openFromUrl = async () => {
      const id = match[1];
      try {
        const postSnap = await getDoc(doc(db, "posts", id));
        if (postSnap.exists()) {
          setModalData({ id: postSnap.id, type: "post", ...postSnap.data() });
          setModalContent("viewingComments");
          pushedByAppRef.current = false; // doğrudan geldi
        } else {
          window.history.replaceState({}, "", "/");
        }
      } catch (e) {
        console.error("Permalink yüklenirken hata:", e);
        window.history.replaceState({}, "", "/");
      }
    };
    openFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  // >>> NEW: URL doğrudan /c/:id ise clip modalı aç
  useEffect(() => {
    if (loading || !user) return;
    const match = window.location.pathname.match(/^\/c\/([A-Za-z0-9_-]+)$/);
    if (!match) return;

    const openClipFromUrl = async () => {
      const id = match[1];
      try {
        const clipSnap = await getDoc(doc(db, "clips", id));
        if (clipSnap.exists()) {
          setModalData({ id: clipSnap.id, type: "clip", ...clipSnap.data() });
          setModalContent("viewingClip");
          pushedByAppRef.current = false; // doğrudan geldi
        } else {
          window.history.replaceState({}, "", "/");
        }
      } catch (e) {
        console.error("Clip permalink yüklenirken hata:", e);
        window.history.replaceState({}, "", "/");
      }
    };
    openClipFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  // App ilk açılışta /u/:username ise Profile sayfasını aktive et
  useEffect(() => {
    if (loading || !user) return;
    const m = window.location.pathname.match(/^\/u\/([^/]+)\/?$/);
    if (m) {
      setActivePage("profile");
    }
  }, [loading, user]);

  // Geri tuşu / URL değişimleri
  useEffect(() => {
    const onPop = async () => {
      const path = window.location.pathname;
      const matchPost = path.match(/^\/p\/([A-Za-z0-9_-]+)$/);
      const matchClip = path.match(/^\/c\/([A-Za-z0-9_-]+)$/);
      const matchProfile = path.match(/^\/u\/([^/]+)\/?$/);

      // Post permalink -> modal aç
      if (matchPost) {
        if (modalContent !== "viewingComments") {
          try {
            const id = matchPost[1];
            const postSnap = await getDoc(doc(db, "posts", id));
            if (postSnap.exists()) {
              setModalData({ id: postSnap.id, type: "post", ...postSnap.data() });
              setModalContent("viewingComments");
              pushedByAppRef.current = false;
            } else {
              window.history.replaceState({}, "", "/");
            }
          } catch (e) {
            console.error("Popstate yüklenirken hata (post):", e);
            window.history.replaceState({}, "", "/");
          }
        }
        return;
      }

      // >>> NEW: Clip permalink -> modal aç
      if (matchClip) {
        if (modalContent !== "viewingClip") {
          try {
            const id = matchClip[1];
            const clipSnap = await getDoc(doc(db, "clips", id));
            if (clipSnap.exists()) {
              setModalData({ id: clipSnap.id, type: "clip", ...clipSnap.data() });
              setModalContent("viewingClip");
              pushedByAppRef.current = false;
            } else {
              window.history.replaceState({}, "", "/");
            }
          } catch (e) {
            console.error("Popstate yüklenirken hata (clip):", e);
            window.history.replaceState({}, "", "/");
          }
        }
        return;
      }

      // Post/Clip değilse modalı kapat
      if (modalContent === "viewingComments" || modalContent === "viewingClip") {
        setModalContent(null);
        setModalData(null);
        pushedByAppRef.current = false;
      }

      // Profil URL'sindeysek sol menü de Profile aktif kalsın
      if (matchProfile) {
        setActivePage("profile");
      }
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [modalContent]);

  // ► Nav değişiminde URL’yi normalize et
  const handleNavChange = (tab) => {
    const path = window.location.pathname;
    const isPermalink = /^\/(p|c)\/[A-Za-z0-9_-]+$/.test(path);
    if (isPermalink) {
      if (pushedByAppRef.current) {
        window.history.back();
      } else {
        window.history.replaceState({}, "", "/");
      }
      pushedByAppRef.current = false;
    }

    // Modal açılan sekmeler
    if (["createMenu", "messages", "notifications", "checkin"].includes(tab)) {
      setModalContent(tab);
      return;
    }

    // PROFiL sekmesi → /u/<kullanıcı>
    if (tab === "profile" && currentUserProfile?.kullaniciAdi) {
      const target = `/u/${encodeURIComponent(currentUserProfile.kullaniciAdi)}`;
      if (window.location.pathname !== target) {
        window.history.pushState({}, "", target);
      }
    } else if (!/^\/(p|c|u)\//.test(window.location.pathname)) {
      // Diğer sekmelerde ana sayfa path'ine dön
      window.history.replaceState({}, "", "/");
    }

    setModalContent(null);
    setModalData(null);
    setActivePage(tab);
  };

  const handleViewProfile = (userId) => {
    setModalData(userId);
    setModalContent("viewingProfile");
  };

  // Yorum modalını aç → pushState /p/:id
  const handleViewComments = (post) => {
    if (!post?.id) return;
    setModalData(post);
    setModalContent("viewingComments");
    window.history.pushState({ modal: "post", id: post.id }, "", `/p/${post.id}`);
    pushedByAppRef.current = true;
  };

  // Feed’den Clips sekmesine geçiş (eski davranışı koruyoruz)
  const handleViewClip = () => setActivePage("clips");

  const handleStartMessage = (targetUserId) => {
    setModalData(targetUserId);
    setModalContent("messages");
  };

  const handlePlaceSelectForCheckIn = (place) => {
    setModalData(place);
    setModalContent("newCheckInDetail");
  };

  const handleViewPlaceDetail = (checkinData) => {
    setModalData(checkinData);
    setModalContent("placeDetail");
  };

  const handleViewUserFromPlace = (userId) => {
    setModalContent(null);
    setModalData(null);
    setTimeout(() => handleViewProfile(userId), 50);
  };

  const handleViewStory = (userWithStories) => {
    setModalData(userWithStories);
    setModalContent("viewingStory");
  };

  const handleOpenMapSettings = () => setModalContent("mapSettings");
  const handleOpenFriendPicker = () => setModalContent("friendPicker");

  const handleSaveFriendSelection = async (selectedFriendIds) => {
    if (!user) return console.error("Kullanıcı bulunamadı!");
    const userDocRef = doc(db, "users", user.uid);
    try {
      await updateDoc(userDocRef, {
        sharingWhitelist: selectedFriendIds,
        sharingMode: "selected_friends",
        isSharing: true,
      });
      setModalContent("mapSettings");
    } catch (error) {
      console.error("Arkadaş seçim listesi güncellenemedi:", error);
    }
  };

  const renderPageContent = () => {
    if (!user) return null;
    switch (activePage) {
      case "home":
        return (
          <Feed
            onUserClick={handleViewProfile}
            onCommentClick={handleViewComments}
            onViewClip={handleViewClip}
            aktifKullaniciId={user.uid}
          />
        );
      case "explore":
        return <Explore onUserClick={handleViewProfile} />;
      case "map":
        return isMobile ? (
          <MapMobile
            currentUserProfile={currentUserProfile}
            onViewStory={handleViewStory}
            onUserClick={handleViewProfile}
          />
        ) : (
          <MapDesktop
            currentUserProfile={currentUserProfile}
            onViewStory={handleViewStory}
            onUserClick={handleViewProfile}
          />
        );
      case "clips":
        return <Clips onNavChange={handleNavChange} />;
      case "profile":
        return (
          <Profile
            userId={user.uid}
            onUserClick={handleViewProfile}
            onPlaceClick={handleViewPlaceDetail}
          />
        );
      default:
        return (
          <Feed
            onUserClick={handleViewProfile}
            onCommentClick={handleViewComments}
            onViewClip={handleViewClip}
            aktifKullaniciId={user.uid}
          />
        );
    }
  };

  const renderModal = () => {
    if (!modalContent) return null;

    const closeModal = () => {
      // /p/:id veya /c/:id üzerindeysek URL’i temizle
      const path = window.location.pathname;
      const isPermalink = /^\/(p|c)\/[A-Za-z0-9_-]+$/.test(path);
      if (isPermalink) {
        if (pushedByAppRef.current) {
          window.history.back();
        } else {
          window.history.replaceState({}, "", "/");
        }
      }
      setModalContent(null);
      setModalData(null);
      pushedByAppRef.current = false;
    };

    const handleCreateSelect = (creationType) => setModalContent(creationType);

    if (modalContent === "createMenu")
      return <CreateMenu onClose={closeModal} onSelect={handleCreateSelect} />;
    if (modalContent === "newclip") return <NewClip onClose={closeModal} />;
    if (modalContent === "notifications")
      return <Bildirimler aktifKullaniciId={user.uid} onClose={closeModal} />;
    if (modalContent === "checkin")
      return (
        <CheckInModal
          onClose={closeModal}
          currentUser={user}
          onPlaceSelect={handlePlaceSelectForCheckIn}
        />
      );
    if (modalContent === "newCheckInDetail")
      return (
        <NewCheckInDetail
          selectedPlace={modalData}
          currentUser={user}
          onClose={closeModal}
        />
      );
    if (modalContent === "placeDetail")
      return (
        <PlaceDetailModal
          placeData={modalData}
          onClose={closeModal}
          onUserClick={handleViewUserFromPlace}
        />
      );

    if (modalContent === "mapSettings")
      return (
        <MapSettingsModal
          onClose={closeModal}
          onOpenFriendPicker={handleOpenFriendPicker}
        />
      );
    if (modalContent === "friendPicker")
      return (
        <FriendPickerModal
          currentUser={currentUserProfile}
          onSave={handleSaveFriendSelection}
          onClose={() => setModalContent("mapSettings")}
        />
      );

    if (modalContent === "viewingStory") {
      const storiesWithAuthorInfo = modalData.stories.map((story) => ({
        ...story,
        authorUsername: modalData.kullaniciAdi,
        authorProfilePic: modalData.profilFoto,
      }));
      return <StoryModal stories={storiesWithAuthorInfo} onClose={closeModal} />;
    }

    // Overlay stilleri
    const modalStyle = {
      display: "flex",
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.65)",
      zIndex: 2000,
    };
    const commentsModalStyle = {
      ...modalStyle,
      alignItems: "flex-end",
      backgroundColor: "rgba(0, 0, 0, 0.5)",
    };

    const isCommentModal = modalContent === "viewingComments";
    const currentStyle =
      isCommentModal && isMobile ? commentsModalStyle : modalStyle;

    return (
      <div style={currentStyle} onMouseDown={closeModal}>
        <div onMouseDown={(e) => e.stopPropagation()}>
          {modalContent === "newpost" && <NewPost onClose={closeModal} />}
          {modalContent === "messages" && (
            <Messages
              aktifKullaniciInfo={currentUserProfile}
              initialUserId={modalData}
              onClose={closeModal}
            />
          )}
          {modalContent === "viewingProfile" && (
            <KullaniciProfili
              userId={modalData}
              aktifKullaniciId={user.uid}
              onClose={closeModal}
              onUserClick={handleViewProfile}
              onSendMessage={handleStartMessage}
            />
          )}
          {modalContent === "viewingComments" && (
            <PostDetailModal
              post={modalData}
              onClose={closeModal}
              aktifKullaniciId={user.uid}
              onUserClick={(uid) => {
                closeModal();
                handleViewProfile(uid);
              }}
            />
          )}
          {/* >>> NEW: Clips modal (desktop/mobile ayrı dosya) */}
          {modalContent === "viewingClip" && (
            <>
              {isMobile ? (
                <ClipDetailModalMobile clip={modalData} onClose={closeModal} />
              ) : (
                <ClipDetailModalDesktop clip={modalData} onClose={closeModal} />
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <div className="loading-container">Yükleniyor...</div>;
  if (!user) return <Auth />;

  const mainContentClass =
    activePage === "explore" || activePage === "clips" || activePage === "map"
      ? "main-content-wide"
      : "main-content-narrow";

  // === NEW: Update toast render ===
  const renderUpdateToast = () => {
    if (!showUpdateToast) return null;
    const wrap = {
      position: "fixed",
      left: 12,
      right: 12,
      bottom: 12,
      zIndex: 5000, // overlay'in üstünde
      display: "flex",
      justifyContent: "center",
      pointerEvents: "none",
    };
    const card = {
      pointerEvents: "auto",
      maxWidth: 560,
      width: "100%",
      background: "#111",
      color: "#fff",
      padding: "12px 14px",
      borderRadius: 12,
      boxShadow: "0 8px 24px rgba(0,0,0,.35)",
      display: "flex",
      alignItems: "center",
      gap: 10,
    };
    const btn = {
      marginLeft: "auto",
      background: "#6b5cff",
      color: "#fff",
      border: "none",
      borderRadius: 10,
      padding: "10px 14px",
      fontWeight: 700,
      cursor: "pointer",
    };
    return (
      <div style={wrap}>
        <div style={card}>
          <span role="img" aria-label="update">⬆️</span>
          <div style={{fontSize: 14}}>
            Yeni bir sürüm hazır. Uygulamayı güncellemek için “Yenile”ye dokun.
          </div>
          <button style={btn} onClick={acceptUpdateAndReload}>Yenile</button>
        </div>
      </div>
    );
  };

  return (
    <div className={`app-container ${!isMobile ? "desktop-layout" : ""}`}>
      {isMobile && (
        <LogoBar
          onNotificationClick={() => handleNavChange("notifications")}
          onMessageClick={() => handleNavChange("messages")}
          onLocationClick={() => handleNavChange("map")}
        />
      )}
      {isMobile ? (
        <BottomNav
          activeTab={activePage}
          onTabChange={handleNavChange}
          profilePic={currentUserProfile?.profilFoto}
        />
      ) : (
        <SideNav
          activeTab={activePage}
          onTabChange={handleNavChange}
          profilePic={currentUserProfile?.profilFoto}
        />
      )}
      <main className={mainContentClass}>
        {activePage === "home" && (
          <Hikayeler currentUserProfile={currentUserProfile} />
        )}
        {renderPageContent()}
      </main>
      {renderModal()}
      {renderUpdateToast()}
    </div>
  );
}

export default App;
