// src/App.js
// Tek overlay App’te, /p/:id - /c/:id - /r/:id (?follow=1) permalink uyumlu,
// profil sekmesi /u/<username> rotasına taşıyor.

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

// Clips modal bileşenleri
import ClipDetailModalDesktop from "./ClipDetailModalDesktop";
import ClipDetailModalMobile from "./ClipDetailModalMobile";

// Rota: detay modal ve keşfet listesi
import RouteDetailMobile from "./pages/RouteDetailMobile";
import RoutesExploreMobile from "./pages/RoutesExploreMobile";

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

  // Post/Clip/Route modallarında pushState bizim mi yaptı?
  const pushedByAppRef = useRef(false);

  // SW update toast state
  const [swWaiting, setSwWaiting] = useState(null);
  const [showUpdateToast, setShowUpdateToast] = useState(false);

  /* ===== Service Worker update toast ===== */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let regUnsub = null;
    let refreshing = false;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      if (reg.waiting) {
        setSwWaiting(reg.waiting);
        setShowUpdateToast(true);
      }
      const onUpdateFound = () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setSwWaiting(newWorker);
            setShowUpdateToast(true);
          }
        });
      };
      reg.addEventListener("updatefound", onUpdateFound);
      regUnsub = () => reg.removeEventListener("updatefound", onUpdateFound);
    });

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
    try { swWaiting?.postMessage?.("SKIP_WAITING"); } catch {}
    setShowUpdateToast(false);
  };

  // Modal varken body scroll kilidi
  useEffect(() => {
    if (!modalContent) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [modalContent]);

  // Kimlik + profil dinleyicisi
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
          () => setLoading(false)
        );
      } else {
        setCurrentUserProfile(null);
        setLoading(false);
      }
    });
    return () => { unsubscribeAuth(); unsubscribeProfile(); };
  }, []);

  const urlFollowFlag = () => {
    try {
      const u = new URL(window.location.href);
      const v = u.searchParams.get("follow");
      return v === "1" || v === "true";
    } catch { return false; }
  };

  /* ====== DEEP LINKS on mount: /p/:id , /c/:id , /r/:id (?follow=1)  +  /explore , /explore/routes ====== */
  useEffect(() => {
    if (loading || !user) return;

    const openPostFromUrl = async (id) => {
      try {
        const snap = await getDoc(doc(db, "posts", id));
        if (snap.exists()) {
          setModalData({ id: snap.id, type: "post", ...snap.data() });
          setModalContent("viewingComments");
          pushedByAppRef.current = false;
        } else {
          window.history.replaceState({}, "", "/");
        }
      } catch {
        window.history.replaceState({}, "", "/");
      }
    };

    const openClipFromUrl = async (id) => {
      try {
        const snap = await getDoc(doc(db, "clips", id));
        if (snap.exists()) {
          setModalData({ id: snap.id, type: "clip", ...snap.data() });
          setModalContent("viewingClip");
          pushedByAppRef.current = false;
        } else {
          window.history.replaceState({}, "", "/");
        }
      } catch {
        window.history.replaceState({}, "", "/");
      }
    };

    const openRouteFromUrl = async (id) => {
      try {
        const snap = await getDoc(doc(db, "routes", id));
        if (!snap.exists()) { window.history.replaceState({}, "", "/"); return; }
        const d = snap.data() || {};
        const isOwner = d.ownerId === auth.currentUser?.uid;
        const canRead = d.visibility === "public" || isOwner;
        if (!canRead) {
          setModalData({ error: "Erişim yok veya rota bulunamadı." });
          setModalContent("viewingRouteError");
          pushedByAppRef.current = false;
          return;
        }
        setModalData({ id: snap.id, follow: urlFollowFlag() });
        setModalContent("viewingRoute");
        pushedByAppRef.current = false;
      } catch {
        window.history.replaceState({}, "", "/");
      }
    };

    const path = window.location.pathname;
    const mPost  = path.match(/^\/p\/([A-Za-z0-9_-]+)$/);
    const mClip  = path.match(/^\/c\/([A-Za-z0-9_-]+)$/);
    const mRoute = path.match(/^\/r\/([A-Za-z0-9_-]+)$/);
    const mProfile = path.match(/^\/u\/([^/]+)\/?$/);
    const mExploreRoutes = path.match(/^\/explore\/routes\/?$/);
    const mExplore = path.match(/^\/explore\/?$/);

    if (mPost)  { openPostFromUrl(mPost[1]);  return; }
    if (mClip)  { openClipFromUrl(mClip[1]);  return; }
    if (mRoute) { openRouteFromUrl(mRoute[1]); return; }

    // /u/:username ise Profile aktif
    if (mProfile) { setActivePage("profile"); return; }

    // /explore veya /explore/routes ise Keşfet aktif
    if (mExploreRoutes || mExplore) { setActivePage("explore"); return; }
  }, [loading, user]);

  /* ====== POPSTATE (geri/ileri) ====== */
  useEffect(() => {
    const onPop = async () => {
      const path = window.location.pathname;
      const matchPost     = path.match(/^\/p\/([A-Za-z0-9_-]+)$/);
      const matchClip     = path.match(/^\/c\/([A-Za-z0-9_-]+)$/);
      const matchRoute    = path.match(/^\/r\/([A-Za-z0-9_-]+)$/);
      const matchProfile  = path.match(/^\/u\/([^/]+)\/?$/);
      const matchExploreRoutes = path.match(/^\/explore\/routes\/?$/);
      const matchExplore = path.match(/^\/explore\/?$/);

      const openPost = async (id) => {
        try {
          const snap = await getDoc(doc(db, "posts", id));
          if (snap.exists()) {
            setModalData({ id: snap.id, type: "post", ...snap.data() });
            setModalContent("viewingComments");
            pushedByAppRef.current = false;
          } else {
            window.history.replaceState({}, "", "/");
          }
        } catch {
          window.history.replaceState({}, "", "/");
        }
      };
      const openClip = async (id) => {
        try {
          const snap = await getDoc(doc(db, "clips", id));
          if (snap.exists()) {
            setModalData({ id: snap.id, type: "clip", ...snap.data() });
            setModalContent("viewingClip");
            pushedByAppRef.current = false;
          } else {
            window.history.replaceState({}, "", "/");
          }
        } catch {
          window.history.replaceState({}, "", "/");
        }
      };
      const openRoute = async (id) => {
        try {
          const snap = await getDoc(doc(db, "routes", id));
          if (!snap.exists()) { window.history.replaceState({}, "", "/"); return; }
          const d = snap.data() || {};
          const isOwner = d.ownerId === auth.currentUser?.uid;
          const canRead = d.visibility === "public" || isOwner;
          if (!canRead) {
            setModalData({ error: "Erişim yok veya rota bulunamadı." });
            setModalContent("viewingRouteError");
            pushedByAppRef.current = false;
            return;
          }
          setModalData({ id: snap.id, follow: urlFollowFlag() });
          setModalContent("viewingRoute");
          pushedByAppRef.current = false;
        } catch {
          window.history.replaceState({}, "", "/");
        }
      };

      if (matchPost)  { await openPost(matchPost[1]);  return; }
      if (matchClip)  { await openClip(matchClip[1]);  return; }
      if (matchRoute) { await openRoute(matchRoute[1]); return; }

      // Modal açıkken ve permalinkte değilsek → kapat
      if (["viewingComments","viewingClip","viewingRoute","viewingRouteError"].includes(modalContent)) {
        setModalContent(null);
        setModalData(null);
        pushedByAppRef.current = false;
      }

      if (matchProfile) { setActivePage("profile"); return; }
      if (matchExploreRoutes || matchExplore) { setActivePage("explore"); return; }
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [modalContent]);

  /* ===== Custom event: Route kart tık → modal aç ===== */
  useEffect(() => {
    const handler = (e) => {
      const routeId = e?.detail?.routeId;
      const follow = !!e?.detail?.follow;
      if (!routeId) return;
      setModalData({ id: routeId, follow });
      setModalContent("viewingRoute");
      // follow paramını da URL'ye yaz
      const url = follow ? `/r/${routeId}?follow=1` : `/r/${routeId}`;
      window.history.pushState({ modal: "route", id: routeId }, "", url);
      pushedByAppRef.current = true;
    };
    window.addEventListener("open-route-modal", handler);
    return () => window.removeEventListener("open-route-modal", handler);
  }, []);

  /* ===== Nav değişimi ===== */
  const handleNavChange = (tab) => {
    const path = window.location.pathname;
    const isPermalink = /^\/(p|c|r)\/[A-Za-z0-9_-]+/.test(path);
    if (isPermalink) {
      if (pushedByAppRef.current) window.history.back();
      else window.history.replaceState({}, "", "/");
      pushedByAppRef.current = false;
    }

    if (["createMenu", "messages", "notifications", "checkin"].includes(tab)) {
      setModalContent(tab);
      return;
    }

    // Keşfet sekmesi: varsayılan hedef /explore
    if (tab === "explore") {
      const target = "/explore";
      if (window.location.pathname !== target) {
        window.history.pushState({}, "", target);
      }
    } else if (tab === "profile" && currentUserProfile?.kullaniciAdi) {
      const target = `/u/${encodeURIComponent(currentUserProfile.kullaniciAdi)}`;
      if (window.location.pathname !== target) window.history.pushState({}, "", target);
    } else if (!/^\/(p|c|r|u|explore(\/routes)?)/.test(window.location.pathname)) {
      // explore ve explore/routes izinli
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

  const handleViewComments = (post) => {
    if (!post?.id) return;
    setModalData(post);
    setModalContent("viewingComments");
    window.history.pushState({ modal: "post", id: post.id }, "", `/p/${post.id}`);
    pushedByAppRef.current = true;
  };

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
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);
    try {
      await updateDoc(userDocRef, {
        sharingWhitelist: selectedFriendIds,
        sharingMode: "selected_friends",
        isSharing: true,
      });
      setModalContent("mapSettings");
    } catch {}
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
      case "explore": {
        // Basit derin link: /explore/routes ise rota keşfet sayfasını göster
        const path = window.location.pathname;
        if (/^\/explore\/routes\/?$/.test(path)) {
          return <RoutesExploreMobile />;
        }
        return <Explore onUserClick={handleViewProfile} />;
      }
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
      // /p/:id /c/:id /r/:id üzerindeysek URL’i temizle
      const path = window.location.pathname + window.location.search;
      const isPermalink = /^\/(p|c|r)\/[A-Za-z0-9_-]+/.test(path);
      if (isPermalink) {
        if (pushedByAppRef.current) window.history.back();
        else window.history.replaceState({}, "", "/");
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

          {/* CLIP */}
          {modalContent === "viewingClip" && (
            <>
              {isMobile ? (
                <ClipDetailModalMobile clip={modalData} onClose={closeModal} />
              ) : (
                <ClipDetailModalDesktop clip={modalData} onClose={closeModal} />
              )}
            </>
          )}

          {/* ROUTE DETAIL */}
          {modalContent === "viewingRoute" && (
            <RouteDetailMobile
              routeId={modalData?.id}
              followInitially={!!modalData?.follow}
              onClose={closeModal}
            />
          )}
          {modalContent === "viewingRouteError" && (
            <div style={{
              width: "min(100vw, 520px)", background:"#fff", borderRadius:12, padding:"16px 14px",
              boxShadow:"0 10px 28px rgba(0,0,0,.35)"
            }}>
              <div style={{fontWeight:800, marginBottom:6}}>Erişim yok</div>
              <div style={{color:"#444"}}>Bu rota ya özel ya da bulunamadı.</div>
              <div style={{marginTop:12, display:"flex", justifyContent:"flex-end"}}>
                <button onClick={closeModal} style={{border:"1px solid #ddd", borderRadius:10, padding:"8px 12px", fontWeight:700, cursor:"pointer"}}>Kapat</button>
              </div>
            </div>
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

  // Update toast render
  const renderUpdateToast = () => {
    if (!showUpdateToast) return null;
    const wrap = {
      position: "fixed",
      left: 12,
      right: 12,
      bottom: 12,
      zIndex: 5000,
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
