// FILE: src/pages/MyLive/MyLiveApp.jsx
// MyLive ana akış yöneticisi: hub → loading → stream → rating
import React, { useState, useEffect, useRef, useCallback } from "react";
import MyLiveHub from "./MyLiveHub";
import LoadingScreen from "./LoadingScreen";
import LiveStream from "./LiveStream";
import RatingScreen from "./RatingScreen";
import PremiumFilters from "./PremiumFilters";
import MyLiveBottomNav from "./MyLiveBottomNav";
import {
  joinQueue, leaveQueue, findMatch, getBlockedUsers,
} from "../../services/myLiveService";

// Basit nanoid benzeri yardımcı (utils.js yoksa inline)
function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const SCREENS = {
  HUB: "hub",
  FILTERS: "filters",
  LOADING: "loading",
  STREAM: "stream",
  RATING: "rating",
};

export default function MyLiveApp({ user, onBack }) {
  const [screen, setScreen] = useState(SCREENS.HUB);
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
    setScreen(SCREENS.LOADING);

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
          setScreen(SCREENS.STREAM);
        }
      };

      await tryMatch();
      matchTimerRef.current = setInterval(tryMatch, 3000);
    } catch (err) {
      console.error("[MyLive] startSearch error:", err);
      await stopSearch();
      setScreen(SCREENS.HUB);
    }
  }, [user, stopSearch]);

  const handleCancel = useCallback(async () => {
    await stopSearch();
    setScreen(SCREENS.HUB);
  }, [stopSearch]);

  const handleEnd = useCallback((data) => {
    setSessionData(data);
    setScreen(SCREENS.RATING);
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
    setScreen(SCREENS.HUB);
  }, []);

  const handleFiltersOpen = useCallback(() => setScreen(SCREENS.FILTERS), []);

  const handleFiltersSave = useCallback((f) => {
    setFilters(f);
    startSearch(f);
  }, [startSearch]);

  useEffect(() => () => { stopSearch(); }, [stopSearch]);

  // MyLive nav'dan başka bir sekmeye geçince App.js'e bildir
  const handleNavChange = useCallback((tab) => {
    if (tab === "mylive") return; // Zaten buradayız
    // App.js'e custom event ile hangi tab'a geçileceğini bildir
    try {
      window.dispatchEvent(new CustomEvent("mylive-nav", { detail: { tab } }));
    } catch {}
    onBack?.();
  }, [onBack]);

  switch (screen) {
    case SCREENS.FILTERS:
      return (
        <div style={{ position: "relative", minHeight: "100dvh" }}>
          <PremiumFilters
            initialFilters={filters}
            onSave={handleFiltersSave}
            onBack={() => setScreen(SCREENS.HUB)}
          />
          <MyLiveBottomNav activeTab="mylive" onTabChange={handleNavChange} />
        </div>
      );

    case SCREENS.LOADING:
      return <LoadingScreen onCancel={handleCancel} user={user} />;

    case SCREENS.STREAM:
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

    case SCREENS.RATING:
      return (
        <RatingScreen
          connectionId={sessionData?.connectionId}
          partner={sessionData?.partner ?? partner}
          user={user}
          duration={sessionData?.duration}
          onDone={handleRatingDone}
        />
      );

    default:
      return (
        <div style={{ position: "relative", minHeight: "100dvh" }}>
          <MyLiveHub
            user={user}
            onStart={() => startSearch(filters)}
            onFilters={handleFiltersOpen}
          />
          <MyLiveBottomNav activeTab="mylive" onTabChange={handleNavChange} />
        </div>
      );
  }
}
