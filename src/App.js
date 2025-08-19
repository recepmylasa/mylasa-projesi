// App.js (GÜNCEL)

import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";

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

// ❌ Eski tek harita importu
// import Map from "./Map";

// ✅ Ayrıştırılmış haritalar
import MapDesktop from "./MapDesktop";
import MapMobile from "./MapMobile";

import CheckInModal from "./CheckInModal";
import NewCheckInDetail from "./NewCheckInDetail";
import PlaceDetailModal from "./PlaceDetailModal";
import StoryModal from './StoryModal';
import MapSettingsModal from './MapSettingsModal';
import FriendPickerModal from './FriendPickerModal';
import "./App.css";

const useWindowSize = () => {
  const [size, setSize] = useState([window.innerWidth, window.innerHeight]);
  useEffect(() => {
    const handleResize = () => setSize([window.innerWidth, window.innerHeight]);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return size;
};

function App() {
  const [user, setUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('home');
  const [modalContent, setModalContent] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [width] = useWindowSize();
  const isMobile = width <= 768;

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

  const handleNavChange = (tab) => {
    if (['createMenu', 'messages', 'notifications', 'checkin'].includes(tab)) {
      setModalContent(tab);
    } else {
      setModalContent(null);
      setActivePage(tab);
    }
  };

  const handleViewProfile = (userId) => {
    setModalData(userId);
    setModalContent('viewingProfile');
  };

  const handleViewComments = (post) => {
    setModalData(post);
    setModalContent('viewingComments');
  };

  const handleViewClip = () => {
    setActivePage('clips');
  };

  const handleStartMessage = (targetUserId) => {
    setModalData(targetUserId);
    setModalContent('messages');
  };

  const handlePlaceSelectForCheckIn = (place) => {
    setModalData(place);
    setModalContent('newCheckInDetail');
  };

  const handleViewPlaceDetail = (checkinData) => {
    setModalData(checkinData);
    setModalContent('placeDetail');
  };

  const handleViewUserFromPlace = (userId) => {
    setModalContent(null);
    setModalData(null);
    setTimeout(() => {
      handleViewProfile(userId);
    }, 50);
  };

  const handleViewStory = (userWithStories) => {
    setModalData(userWithStories);
    setModalContent('viewingStory');
  };

  const handleOpenMapSettings = () => {
    setModalContent('mapSettings');
  };

  const handleOpenFriendPicker = () => {
    setModalContent('friendPicker');
  };

  const handleSaveFriendSelection = async (selectedFriendIds) => {
    if (!user) {
      console.error("Kullanıcı bulunamadı!");
      return;
    }
    const userDocRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userDocRef, {
        sharingWhitelist: selectedFriendIds,
        sharingMode: 'selected_friends',
        isSharing: true
      });
      console.log("Paylaşım listesi başarıyla güncellendi.");
      setModalContent('mapSettings');
    } catch (error) {
      console.error("Hata: Arkadaş seçim listesi güncellenemedi.", error);
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
    const closeModal = () => { setModalContent(null); setModalData(null); };
    const handleCreateSelect = (creationType) => { setModalContent(creationType); };

    if (modalContent === 'createMenu') return <CreateMenu onClose={closeModal} onSelect={handleCreateSelect} />;
    if (modalContent === 'newclip') return <NewClip onClose={closeModal} />;
    if (modalContent === 'notifications') return <Bildirimler aktifKullaniciId={user.uid} onClose={closeModal} />;
    if (modalContent === 'checkin') return <CheckInModal onClose={closeModal} currentUser={user} onPlaceSelect={handlePlaceSelectForCheckIn} />;
    if (modalContent === 'newCheckInDetail') return <NewCheckInDetail selectedPlace={modalData} currentUser={user} onClose={closeModal} />;
    if (modalContent === 'placeDetail') return <PlaceDetailModal placeData={modalData} onClose={closeModal} onUserClick={handleViewUserFromPlace} />;

    if (modalContent === 'mapSettings') return <MapSettingsModal onClose={closeModal} onOpenFriendPicker={handleOpenFriendPicker} />;
    if (modalContent === 'friendPicker') return <FriendPickerModal currentUser={currentUserProfile} onSave={handleSaveFriendSelection} onClose={() => setModalContent('mapSettings')} />;

    if (modalContent === 'viewingStory') {
      const storiesWithAuthorInfo = modalData.stories.map(story => ({
        ...story,
        authorUsername: modalData.kullaniciAdi,
        authorProfilePic: modalData.profilFoto,
      }));
      return <StoryModal stories={storiesWithAuthorInfo} onClose={closeModal} />;
    }

    const modalStyle = {
      display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%',
      height: '100%', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.65)', zIndex: 2000
    };
    const commentsModalStyle = { ...modalStyle, alignItems: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)' };
    const isCommentModal = modalContent === 'viewingComments';
    const currentStyle = isCommentModal ? commentsModalStyle : modalStyle;

    return (
      <div style={currentStyle} onClick={closeModal}>
        <div onClick={e => e.stopPropagation()}>
          {modalContent === 'newpost' && <NewPost onClose={closeModal} />}
          {modalContent === 'messages' && <Messages aktifKullaniciInfo={currentUserProfile} initialUserId={modalData} onClose={closeModal} />}
          {modalContent === 'viewingProfile' && (
            <KullaniciProfili
              userId={modalData}
              aktifKullaniciId={user.uid}
              onClose={closeModal}
              onUserClick={handleViewProfile}
              onSendMessage={handleStartMessage}
            />
          )}
          {modalContent === 'viewingComments' && (
            <PostDetailModal
              post={modalData}
              onClose={closeModal}
              aktifKullaniciId={user.uid}
              onUserClick={(uid) => { closeModal(); handleViewProfile(uid); }}
            />
          )}
        </div>
      </div>
    );
  };

  if (loading) { return <div className="loading-container">Yükleniyor...</div>; }
  if (!user) { return <Auth />; }

  const mainContentClass =
    (activePage === 'explore' || activePage === 'clips' || activePage === 'map')
      ? 'main-content-wide'
      : 'main-content-narrow';

  return (
    <div className={`app-container ${!isMobile ? 'desktop-layout' : ''}`}>
      {isMobile && (
        <LogoBar
          onNotificationClick={() => handleNavChange('notifications')}
          onMessageClick={() => handleNavChange('messages')}
          onLocationClick={() => handleNavChange('map')}
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
        {/* HİKAYELER: HEM MOBİL HEM MASAÜSTÜ */}
        {activePage === 'home' && (
          <Hikayeler currentUserProfile={currentUserProfile} />
        )}
        {renderPageContent()}
      </main>
      {renderModal()}
    </div>
  );
}

export default App;
