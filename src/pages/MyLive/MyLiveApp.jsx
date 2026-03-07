// FILE: src/pages/MyLive/MyLiveApp.jsx
import React, { useState, useCallback, useRef, useEffect } from "react";
import MyLiveHub from "./MyLiveHub";
import MyLiveBottomNav from "./MyLiveBottomNav";
import LoadingScreen from "./LoadingScreen";
import LiveStream from "./LiveStream";
import RatingScreen from "./RatingScreen";
import PremiumFilters from "./PremiumFilters";
import MyLiveHomeScreen from "./MyLiveHomeScreen";
import MyLiveExploreScreen from "./MyLiveExploreScreen";
import MyLiveNotificationsScreen from "./MyLiveNotificationsScreen";
import MyLiveProfileScreen from "./MyLiveProfileScreen";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {
  joinQueue,
  leaveQueue,
  tryAtomicMatch,
  listenMyQueue,
  getBlockedUsers,
} from "../../services/myLiveService";

async function fetchUserInfo(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const d = snap.data();
      return {
        userId: uid,
        displayName: d.adSoyad || d.kullaniciAdi || d.displayName || "Kullanıcı",
        username: d.kullaniciAdi || null,
        photoURL: d.profilFoto || d.photoURL || null,
      };
    }
  } catch {}
  return { userId: uid, displayName: "Kullanıcı", photoURL: null };
}

const STREAM_SCREENS = ["loading", "stream", "rating"];

export default function MyLiveApp({ user, onNavChange, onBack }) {
  const [activeTab, setActiveTab] = useState("mylive");
  const [streamScreen, setStreamScreen] = useState(null);
  const [partner, setPartner] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("myLiveTheme");
    return saved !== null ? saved === "dark" : true;
  });
  const [filters, setFilters] = useState({});

  const searchingRef = useRef(false);
  const matchTimerRef = useRef(null);
  const queueListenerRef = useRef(null);

  const stopSearch = useCallback(async () => {
    searchingRef.current = false;
    clearInterval(matchTimerRef.current);
    if (queueListenerRef.current) {
      queueListenerRef.current();
      queueListenerRef.current = null;
    }
    if (user?.uid) await leaveQueue(user.uid).catch(() => {});
  }, [user]);

  const startSearch = useCallback(async (activeFilters = {}) => {
    if (!user?.uid) return;
    searchingRef.current = true;
    setStreamScreen("loading");

    try {
      const blockedIds = await getBlockedUsers(user.uid).catch(() => []);
      await joinQueue(user.uid, activeFilters);

      // Kendi kuyruk kaydını dinle — başka biri bizi eşleştirdiyse buradan öğreniriz
      if (queueListenerRef.current) queueListenerRef.current();
      queueListenerRef.current = listenMyQueue(user.uid, async (queueData) => {
        if (!searchingRef.current) return;
        if (queueData && queueData.status === "matched" && queueData.roomId) {
          // Başka biri bizi eşleştirdi — biz callee'yiz
          searchingRef.current = false;
          clearInterval(matchTimerRef.current);
          if (queueListenerRef.current) {
            queueListenerRef.current();
            queueListenerRef.current = null;
          }
          // Partner bilgisini Firestore'dan çek
          const partnerData = await fetchUserInfo(queueData.matchedWith);
          setRoomId(queueData.roomId);
          setPartner(partnerData);
          setIsInitiator(false);
          setStreamScreen("stream");
        }
      });

      // Biz de aktif olarak eşleştirmeye çalışalım (initiator tarafı)
      const tryMatch = async () => {
        if (!searchingRef.current) return;
        const match = await tryAtomicMatch(user.uid, activeFilters, blockedIds).catch(() => null);
        if (match && searchingRef.current) {
          searchingRef.current = false;
          clearInterval(matchTimerRef.current);
          if (queueListenerRef.current) {
            queueListenerRef.current();
            queueListenerRef.current = null;
          }
          // Initiator tarafı: partner bilgisini Firestore'dan çek
          const initiatorPartner = await fetchUserInfo(match.partner.userId || match.partner.matchedWith);
          setRoomId(match.roomId);
          setPartner(initiatorPartner);
          setIsInitiator(true);
          setStreamScreen("stream");
        }
      };

      // İlk deneme hemen, sonra her 3 saniyede bir
      await tryMatch();
      matchTimerRef.current = setInterval(tryMatch, 3000);
    } catch (err) {
      console.error("[MyLive] startSearch error:", err);
      await stopSearch();
      setStreamScreen(null);
    }
  }, [user, stopSearch]);

  const handleCancel = useCallback(async () => {
    await stopSearch();
    setStreamScreen(null);
  }, [stopSearch]);

  const handleEnd = useCallback((data) => {
    setSessionData(data);
    setStreamScreen("rating");
  }, []);

  const handleSkip = useCallback(async () => {
    setPartner(null);
    setRoomId(null);
    await startSearch(filters);
  }, [filters, startSearch]);

  const handleRatingDone = useCallback(() => {
    setSessionData(null);
    setPartner(null);
    setRoomId(null);
    setStreamScreen(null);
    setActiveTab("mylive");
  }, []);

  const handleFiltersOpen = useCallback(() => setStreamScreen("filters"), []);
  const handleFiltersSave = useCallback((f) => {
    setFilters(f);
    startSearch(f);
  }, [startSearch]);

  const handleThemeChange = useCallback((dark) => {
    setIsDark(dark);
  }, []);

  const handleNavTab = useCallback((tab) => {
    if (STREAM_SCREENS.includes(streamScreen)) return;
    if (streamScreen === "filters") setStreamScreen(null);
    setActiveTab(tab);
  }, [streamScreen]);

  useEffect(() => () => { stopSearch(); }, [stopSearch]);

  // Canlı yayın akış ekranları
  if (streamScreen === "loading") {
    return <LoadingScreen onCancel={handleCancel} user={user} />;
  }

  if (streamScreen === "stream") {
    return (
      <LiveStream
        roomId={roomId}
        isInitiator={isInitiator}
        partner={partner}
        user={user}
        onEnd={handleEnd}
        onSkip={handleSkip}
      />
    );
  }

  if (streamScreen === "rating") {
    return (
      <RatingScreen
        connectionId={sessionData?.connectionId}
        partner={sessionData?.partner ?? partner}
        user={user}
        duration={sessionData?.duration}
        onDone={handleRatingDone}
      />
    );
  }

  if (streamScreen === "filters") {
    return (
      <div style={{ position: "relative", minHeight: "100dvh", paddingBottom: "68px" }}>
        <PremiumFilters
          initialFilters={filters}
          onSave={handleFiltersSave}
          onBack={() => setStreamScreen(null)}
        />
        <MyLiveBottomNav activeTab="mylive" onTabChange={handleNavTab} isDark={isDark} />
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return (
          <MyLiveHomeScreen
            user={user}
            onStart={() => startSearch(filters)}
            onFilters={handleFiltersOpen}
            isDark={isDark}
          />
        );
      case "explore":
        return <MyLiveExploreScreen isDark={isDark} />;
      case "notifications":
        return <MyLiveNotificationsScreen user={user} isDark={isDark} />;
      case "profile":
        return <MyLiveProfileScreen user={user} isDark={isDark} />;
      case "mylive":
      default:
        return (
          <MyLiveHub
            user={user}
            onStart={() => startSearch(filters)}
            onFilters={handleFiltersOpen}
            onThemeChange={handleThemeChange}
          />
        );
    }
  };

  return (
    <div style={{ position: "relative", minHeight: "100dvh", paddingBottom: "68px" }}>
      {renderContent()}
      <MyLiveBottomNav activeTab={activeTab} onTabChange={handleNavTab} isDark={isDark} />
    </div>
  );
}
