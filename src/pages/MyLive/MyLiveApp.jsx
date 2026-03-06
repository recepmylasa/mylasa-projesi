// FILE: src/pages/MyLive/MyLiveApp.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import MyLiveHub from "./MyLiveHub";
import MyLiveHomeScreen from "./MyLiveHomeScreen";
import MyLiveExploreScreen from "./MyLiveExploreScreen";
import MyLiveNotificationsScreen from "./MyLiveNotificationsScreen";
import MyLiveProfileScreen from "./MyLiveProfileScreen";
import LoadingScreen from "./LoadingScreen";
import LiveStream from "./LiveStream";
import RatingScreen from "./RatingScreen";
import PremiumFilters from "./PremiumFilters";
import MyLiveBottomNav from "./MyLiveBottomNav";
import {
  joinQueue, leaveQueue, findMatch, getBlockedUsers,
} from "../../services/myLiveService";

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Canlı yayın akış ekranları (nav gizlenir)
const STREAM_SCREENS = ["loading", "stream", "rating"];

export default function MyLiveApp({ user, onBack }) {
  // Aktif MyLive sekmesi: "home" | "explore" | "mylive" | "notifications" | "profile"
  const [activeTab, setActiveTab] = useState("mylive");

  // Canlı yayın akış ekranı: null | "filters" | "loading" | "stream" | "rating"
  const [streamScreen, setStreamScreen] = useState(null);

  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("myLiveTheme");
    return saved !== null ? saved === "dark" : true;
  });
  const [filters, setFilters] = useState({});
  const [partner, setPartner] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const matchTimerRef = useRef(null);
  const searchingRef = useRef(false);

  const stopSearch = useCallback(async () => {
    searchingRef.current = false;
    clearInterval(matchTimerRef.current);
    if (user?.uid) await leaveQueue(user.uid).catch(() => {});
  }, [user]);

  const startSearch = useCallback(async (activeFilters = {}) => {
    if (!user?.uid) return;
    searchingRef.current = true;
    setStreamScreen("loading");

    try {
      const blockedIds = await getBlockedUsers(user.uid).catch(() => []);
      await joinQueue(user.uid, activeFilters);

      const tryMatch = async () => {
        if (!searchingRef.current) return;
        const match = await findMatch(user.uid, activeFilters, blockedIds).catch(() => null);
        if (match && searchingRef.current) {
          searchingRef.current = false;
          clearInterval(matchTimerRef.current);
          const room = `room_${genId()}`;
          setRoomId(room);
          setPartner(match);
          setIsInitiator(true);
          await leaveQueue(user.uid).catch(() => {});
          setStreamScreen("stream");
        }
      };

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

  // Nav tab değişimi - MyLive içinde gezin
  const handleNavTab = useCallback((tab) => {
    if (STREAM_SCREENS.includes(streamScreen)) {
      // Canlı yayın sırasında nav değişimine izin verme
      return;
    }
    if (streamScreen === "filters") {
      setStreamScreen(null);
    }
    setActiveTab(tab);
  }, [streamScreen]);

  useEffect(() => () => { stopSearch(); }, [stopSearch]);

  // Canlı yayın akış ekranları - nav gizlenir
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

  // Filtreler ekranı
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

  // Ana içerik - tab'a göre ekran göster
  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return (
          <MyLiveHomeScreen
            user={user}
            onStart={() => startSearch(filters)}
            onFilters={handleFiltersOpen}
          />
        );
      case "explore":
        return <MyLiveExploreScreen />;
      case "notifications":
        return <MyLiveNotificationsScreen user={user} />;
      case "profile":
        return <MyLiveProfileScreen user={user} />;
      case "mylive":
      default:
        return (
          <MyLiveHub
            user={user}
            onStart={() => startSearch(filters)}
            onFilters={handleFiltersOpen}
            onThemeChange={setIsDark}
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
