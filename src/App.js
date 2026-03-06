// FILE: src/App.js

import { useState, useEffect, useRef, useCallback } from "react";
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

import ClipDetailModalDesktop from "./ClipDetailModalDesktop";
import ClipDetailModalMobile from "./ClipDetailModalMobile";

import RouteDetailMobile from "./pages/RouteDetailMobile";
import RoutesExploreMobile from "./pages/RoutesExploreMobile";

import AdminShareMetrics from "./pages/AdminShareMetrics";
import MyLiveApp from "./pages/MyLive/MyLiveApp";

import "./App.css";
import "./premium.css"; /* Premium CSS - Cyan-Pink, Glassmorphism */

const __DEV__ = process.env.NODE_ENV !== "production";
const __snapErrSeen = new Set();

function isPermDenied(err) {
  try {
    const code = String(err?.code || "").toLowerCase();
    const msg = String(err?.message || "").toLowerCase();
    return (
      code.includes("permission-denied") ||
      (code.includes("permission") && code.includes("denied")) ||
      (msg.includes("missing") && msg.includes("insufficient") && msg.includes("permission"))
    );
  } catch {
    return false;
  }
}

function logSnapErrOnce(label, path, err) {
  if (!__DEV__) return;
  const code = err?.code ? String(err.code) : "unknown";
  const msg = err?.message ? String(err.message) : "";
  const key = `${label}|${path}|${code}`;
  if (__snapErrSeen.has(key)) return;
  __snapErrSeen.add(key);
  // eslint-disable-next-line no-console
  console.warn("[snapshot-error]", { label, path, code, msg });
}

const useWindowSize = () => {
  const [size, setSize] = useState([window.innerWidth, window.innerHeight]);
  useEffect(() => {
    const handleResize = () => setSize([window.innerWidth, window.innerHeight]);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return size;
};

// Permalink helper'ları (query'yi değil pathname'i baz alır)
const isPostOrClipPermalinkPath = (pathname) =>
  /^\/(p|c)\/[A-Za-z0-9_-]+$/.test(pathname || "");

const isRoutePermalinkPath = (pathname) =>
  /^\/r\/[A-Za-z0-9_-]+$/.test(pathname || "") ||
  /^\/s\/r\/[A-Za-z0-9_-]+$/.test(pathname || "");

const isAnyPermalinkPath = (pathname) =>
  isPostOrClipPermalinkPath(pathname) || isRoutePermalinkPath(pathname);

/**
 * EMİR 40 — DRY normalize helper:
 * /open-route?query=...  -> /r/:id?follow=1&from=protocol(&owner=...)
 * /s/r/:id               -> /r/:id?follow=1&from=share(&owner=...)
 *
 * Not: Davranış aynı kalsın diye sadece bu iki path’i normalize eder.
 */
const normalizeRouteLink = ({ pathname, search }) => {
  const path = pathname || "";
  const searchStr = search || "";

  // /open-route
  if (/^\/open-route\/?$/.test(path)) {
    try {
      const sp = new URLSearchParams(searchStr);
      const raw = sp.get("query") || "";
      const decoded = decodeURIComponent(raw || "");

      let work = decoded;
      const colonIdx = work.indexOf(":");
      if (colonIdx !== -1 && work.startsWith("web+mylasa")) {
        work = work.slice(colonIdx + 1); // "route?id=..."
      }

      const qIdx = work.indexOf("?");
      let queryPart = work;
      if (qIdx !== -1) queryPart = work.slice(qIdx + 1);

      const qs = new URLSearchParams(queryPart);
      const rid = qs.get("id") || qs.get("routeId");

      const followRaw = qs.get("follow") || sp.get("follow") || "";
      const follow =
        followRaw === "1" || followRaw === "true" || followRaw === "yes";

      const owner =
        qs.get("owner") ||
        qs.get("o") ||
        sp.get("owner") ||
        sp.get("o") ||
        "";

      if (!rid) {
        return { kind: "open-route", rid: null, dest: null, goHome: true };
      }

      const params = new URLSearchParams();
      if (follow) params.set("follow", "1");
      if (owner) params.set("owner", String(owner));
      params.set("from", "protocol");

      const dest = `/r/${encodeURIComponent(rid)}?${params.toString()}`;
      return { kind: "open-route", rid, dest, goHome: false };
    } catch {
      return { kind: "open-route", rid: null, dest: null, goHome: true };
    }
  }

  // /s/r/:id
  const mShareRoute = path.match(/^\/s\/r\/([A-Za-z0-9_-]+)$/);
  if (mShareRoute) {
    const rid = mShareRoute[1];
    try {
      const sp = new URLSearchParams(searchStr);
      const owner = sp.get("owner") || sp.get("o");

      const params = new URLSearchParams();
      params.set("follow", "1");
      params.set("from", "share");
      if (owner) params.set("owner", String(owner));

      const dest = `/r/${encodeURIComponent(rid)}?${params.toString()}`;
      return { kind: "share-route", rid, dest };
    } catch {
      const dest = `/r/${encodeURIComponent(rid)}?follow=1&from=share`;
      return { kind: "share-route", rid, dest };
    }
  }

  return null;
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

  const pushedByAppRef = useRef(false);

  // Profil modalını, route modalından açınca geri dönüş için küçük “return stack”
  const modalReturnRef = useRef(null);

  // Event handler’larda güncel modal state’e erişmek için ref
  const modalStateRef = useRef({ content: null, data: null });
  useEffect(() => {
    modalStateRef.current = { content: modalContent, data: modalData };
  }, [modalContent, modalData]);

  // Profil modalından çıkınca “return stack” tüketildiyse / gereksizse temizle
  useEffect(() => {
    if (modalContent !== "viewingProfile") {
      modalReturnRef.current = null;
    }
  }, [modalContent]);

  const [swWaiting, setSwWaiting] = useState(null);
  const [showUpdateToast, setShowUpdateToast] = useState(false);

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
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
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
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    return () => {
      if (regUnsub) regUnsub();
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  const acceptUpdateAndReload = () => {
    try {
      swWaiting?.postMessage?.("SKIP_WAITING");
    } catch {}
    setShowUpdateToast(false);
  };

  useEffect(() => {
    if (!modalContent) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalContent]);

  // ✅ EMİR 02 (REV-5) — App seviyesinde permission-denied spam kırıcı
  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      try {
        unsubscribeProfile?.();
      } catch {}
      unsubscribeProfile = null;

      setUser(currentUser || null);

      if (!currentUser) {
        setCurrentUserProfile(null);
        setLoading(false);
        return;
      }

      const userDocRef = doc(db, "users", currentUser.uid);
      const path = userDocRef?.path ? String(userDocRef.path) : `users/${currentUser.uid}`;

      unsubscribeProfile = onSnapshot(
        userDocRef,
        (docSnap) => {
          try {
            if (docSnap.exists()) {
              setCurrentUserProfile({ id: docSnap.id, ...docSnap.data() });
            } else {
              setCurrentUserProfile(null);
            }
          } catch {
            setCurrentUserProfile(null);
          }
          setLoading(false);
        },
        (err) => {
          // permission-denied (ve benzeri) → spam yok, UI çökmesin
          logSnapErrOnce("AppUserProfile", path, err);

          // listener’ı kapat (özellikle permission-denied’de tekrar tekrar denemesin)
          if (isPermDenied(err)) {
            try {
              unsubscribeProfile?.();
            } catch {}
            unsubscribeProfile = null;
          }

          setCurrentUserProfile(null);
          setLoading(false);
        }
      );
    });

    return () => {
      try {
        unsubscribeAuth?.();
      } catch {}
      try {
        unsubscribeProfile?.();
      } catch {}
    };
  }, []);

  const urlFollowFlag = () => {
    try {
      const u = new URL(window.location.href);
      const v = u.searchParams.get("follow");
      return v === "1" || v === "true";
    } catch {
      return false;
    }
  };

  const urlOwnerHint = () => {
    try {
      const u = new URL(window.location.href);
      const o = u.searchParams.get("owner") || u.searchParams.get("o");
      return o ? String(o) : null;
    } catch {
      return null;
    }
  };

  // DEEP LINKS (mount): /p/:id , /c/:id , /r/:id , /s/r/:id , /explore , /explore/routes , /admin/share-metrics , /open-route
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

    // /r/:id → App hiçbir izin/visibility kontrolü yapmadan modal açar (UI RouteDetailMobile içinde)
    const openRouteFromUrl = (id) => {
      if (!id) {
        window.history.replaceState({}, "", "/");
        return;
      }
      setModalData({
        id: String(id),
        follow: urlFollowFlag(),
        owner: urlOwnerHint(),
      });
      setModalContent("viewingRoute");
      pushedByAppRef.current = false;
    };

    const path = window.location.pathname;

    // EMİR 40: /open-route + /s/r normalize tek helper’dan
    const norm = normalizeRouteLink({
      pathname: path,
      search: window.location.search || "",
    });

    if (norm?.kind === "open-route") {
      if (norm.rid && norm.dest) {
        try {
          window.history.replaceState({}, "", norm.dest);
          openRouteFromUrl(norm.rid);
          return;
        } catch {
          try {
            window.history.replaceState({}, "", "/");
          } catch {}
          return;
        }
      }
      if (norm.goHome) {
        try {
          window.history.replaceState({}, "", "/");
        } catch {}
        // Not: eski davranış gibi burada return şart değil.
      }
    }

    if (norm?.kind === "share-route") {
      try {
        window.history.replaceState({}, "", norm.dest);
      } catch {}
      openRouteFromUrl(norm.rid);
      return;
    }

    const mPost = path.match(/^\/p\/([A-Za-z0-9_-]+)$/);
    const mClip = path.match(/^\/c\/([A-Za-z0-9_-]+)$/);
    const mRoute = path.match(/^\/r\/([A-Za-z0-9_-]+)$/);
    const mProfile = path.match(/^\/u\/([^/]+)\/?$/);
    const mExploreRoutes = path.match(/^\/explore\/routes\/?$/);
    const mExplore = path.match(/^\/explore\/?$/);
    const mAdminShareMetrics = path.match(/^\/admin\/share-metrics\/?$/);

    if (mPost) {
      openPostFromUrl(mPost[1]);
      return;
    }
    if (mClip) {
      openClipFromUrl(mClip[1]);
      return;
    }
    if (mRoute) {
      openRouteFromUrl(mRoute[1]);
      return;
    }

    if (mProfile) {
      setActivePage("profile");
      return;
    }
    if (mAdminShareMetrics) {
      setActivePage("adminShareMetrics");
      return;
    }
    if (mExploreRoutes || mExplore) {
      setActivePage("explore");
      return;
    }
  }, [loading, user]);

  // POPSTATE (geri/ileri)
  useEffect(() => {
    const onPop = async () => {
      const path = window.location.pathname;
      const matchPost = path.match(/^\/p\/([A-Za-z0-9_-]+)$/);
      const matchClip = path.match(/^\/c\/([A-Za-z0-9_-]+)$/);
      const matchRoute = path.match(/^\/r\/([A-Za-z0-9_-]+)$/);
      const matchProfile = path.match(/^\/u\/([^/]+)\/?$/);
      const matchExploreRoutes = path.match(/^\/explore\/routes\/?$/);
      const matchExplore = path.match(/^\/explore\/?$/);
      const matchAdminShareMetrics = path.match(/^\/admin\/share-metrics\/?$/);

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

      // /r/:id → direkt modal aç (Firestore ön kontrol yok)
      const openRoute = (id) => {
        if (!id) return;
        setModalData({
          id: String(id),
          follow: urlFollowFlag(),
          owner: urlOwnerHint(),
        });
        setModalContent("viewingRoute");
        pushedByAppRef.current = false;
      };

      // EMİR 40: /open-route + /s/r normalize tek helper’dan
      const norm = normalizeRouteLink({
        pathname: path,
        search: window.location.search || "",
      });

      if (norm?.kind === "open-route") {
        if (norm.rid && norm.dest) {
          try {
            window.history.replaceState({}, "", norm.dest);
            openRoute(norm.rid);
            return;
          } catch {
            try {
              window.history.replaceState({}, "", "/");
            } catch {}
            return;
          }
        }
        if (norm.goHome) {
          try {
            window.history.replaceState({}, "", "/");
          } catch {}
          // Not: Eski davranış gibi burada return yok; aşağıdaki “modal kapatma” vs. çalışsın.
        }
      }

      if (norm?.kind === "share-route") {
        try {
          window.history.replaceState({}, "", norm.dest);
        } catch {}
        openRoute(norm.rid);
        return;
      }

      if (matchPost) {
        await openPost(matchPost[1]);
        return;
      }
      if (matchClip) {
        await openClip(matchClip[1]);
        return;
      }
      if (matchRoute) {
        openRoute(matchRoute[1]);
        return;
      }

      if (
        [
          "viewingComments",
          "viewingClip",
          "viewingRoute",
          "viewingRouteError",
        ].includes(modalContent)
      ) {
        setModalContent(null);
        setModalData(null);
        pushedByAppRef.current = false;
      }

      if (matchProfile) {
        setActivePage("profile");
        return;
      }
      if (matchAdminShareMetrics) {
        setActivePage("adminShareMetrics");
        return;
      }
      if (matchExploreRoutes || matchExplore) {
        setActivePage("explore");
        return;
      }
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [modalContent]);

  // Route kart tık → modal aç
  useEffect(() => {
    const handler = (e) => {
      const routeId = e?.detail?.routeId;
      const follow = !!e?.detail?.follow;
      const initialRoute = e?.detail?.route || null;
      const source = e?.detail?.source || null;

      const ownerHint =
        e?.detail?.ownerId ||
        e?.detail?.ownerUid ||
        initialRoute?.ownerId ||
        initialRoute?.owner ||
        null;

      if (!routeId) return;

      setModalData({
        id: routeId,
        follow,
        initialRoute,
        source,
        owner: ownerHint || null,
      });
      setModalContent("viewingRoute");

      const params = new URLSearchParams();
      if (follow) params.set("follow", "1");
      if (follow && ownerHint) params.set("owner", String(ownerHint));

      const url = params.toString()
        ? `/r/${routeId}?${params.toString()}`
        : `/r/${routeId}`;

      window.history.pushState({ modal: "route", id: routeId }, "", url);
      pushedByAppRef.current = true;
    };
    window.addEventListener("open-route-modal", handler);
    return () => window.removeEventListener("open-route-modal", handler);
  }, []);

  // Global event → profil modal aç
  useEffect(() => {
    const handler = (e) => {
      const userId = e?.detail?.userId;
      if (!userId) return;

      const pathname = window.location.pathname;
      const currentModal = modalStateRef.current?.content;
      const currentData = modalStateRef.current?.data;

      const cameFromRouteModal =
        currentModal === "viewingRoute" && !!currentData?.id;

      if (cameFromRouteModal || isRoutePermalinkPath(pathname)) {
        modalReturnRef.current = {
          modalContent: "viewingRoute",
          modalData: currentData,
          pushedByApp: pushedByAppRef.current,
          url: window.location.pathname + window.location.search,
        };
      } else {
        try {
          if (isPostOrClipPermalinkPath(pathname)) {
            window.history.replaceState({}, "", "/");
          }
        } catch {
          try {
            window.history.replaceState({}, "", "/");
          } catch {}
        }
      }

      setModalData(String(userId));
      setModalContent("viewingProfile");
      pushedByAppRef.current = false;
    };

    window.addEventListener("open-profile-modal", handler);
    return () => window.removeEventListener("open-profile-modal", handler);
  }, []);

  const handleNavChange = useCallback((tab) => {
    modalReturnRef.current = null;

    const path = window.location.pathname;
    const isPermalink = isAnyPermalinkPath(path);
    if (isPermalink) {
      if (pushedByAppRef.current) window.history.back();
      else window.history.replaceState({}, "", "/");
      pushedByAppRef.current = false;
    }

    if (["createMenu", "messages", "notifications", "checkin"].includes(tab)) {
      // Modal açılırken MyLive'dan çıkılsın
      if (activePage === "mylive") setActivePage("home");
      setModalContent(tab);
      return;
    }

    if (tab === "explore") {
      // ✅ EMİR 32 (FINAL): Mobilde Explore tab'ı direkt RoutesExploreMobile'e gitsin
      const target = isMobile ? "/explore/routes" : "/explore";
      if (window.location.pathname !== target) {
        window.history.pushState({}, "", target);
      }
    } else if (tab === "profile" && currentUserProfile?.kullaniciAdi) {
      const target = `/u/${encodeURIComponent(
        currentUserProfile.kullaniciAdi
      )}`;
      if (window.location.pathname !== target)
        window.history.pushState({}, "", target);
    } else if (
      !/^\/(p|c|r|u|explore(\/routes)?|admin\/share-metrics)/.test(
        window.location.pathname
      )
    ) {
      window.history.replaceState({}, "", "/");
    }

    setModalContent(null);
    setModalData(null);
    setActivePage(tab);
  }, [isMobile, currentUserProfile, activePage]);

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
      case "mylive":
        return (
          <MyLiveApp
            user={user}
            onBack={() => setActivePage("home")}
            onNavChange={handleNavChange}
          />
        );
      case "adminShareMetrics":
        return <AdminShareMetrics />;
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
      if (modalContent === "viewingProfile" && modalReturnRef.current) {
        const ret = modalReturnRef.current;
        modalReturnRef.current = null;

        try {
          if (ret.url) window.history.replaceState({}, "", ret.url);
        } catch {}

        setModalContent(ret.modalContent || "viewingRoute");
        setModalData(ret.modalData || null);
        pushedByAppRef.current = !!ret.pushedByApp;
        return;
      }

      const pathname = window.location.pathname;
      const isPermalink = isAnyPermalinkPath(pathname);

      if (isPermalink) {
        if (pushedByAppRef.current) window.history.back();
        else window.history.replaceState({}, "", "/");
      }
      setModalContent(null);
      setModalData(null);
      pushedByAppRef.current = false;
    };

    const handleCreateSelect = (creationType) => {
      if (creationType === "mylive") {
        closeModal();
        setActivePage("mylive");
        return;
      }
      setModalContent(creationType);
    };

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

          {modalContent === "viewingClip" && (
            <>
              {isMobile ? (
                <ClipDetailModalMobile clip={modalData} onClose={closeModal} />
              ) : (
                <ClipDetailModalDesktop clip={modalData} onClose={closeModal} />
              )}
            </>
          )}

          {modalContent === "viewingRoute" && (
            <RouteDetailMobile
              routeId={modalData?.id}
              initialRoute={modalData?.initialRoute || null}
              source={modalData?.source || null}
              followInitially={!!modalData?.follow}
              ownerFromLink={modalData?.owner || null}
              onClose={closeModal}
            />
          )}

          {modalContent === "viewingRouteError" && (
            <div
              style={{
                width: "min(100vw, 520px)",
                background: "#fff",
                borderRadius: 12,
                padding: "16px 14px",
                boxShadow: "0 10px 28px rgba(0,0,0,.35)",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Erişim yok</div>
              <div style={{ color: "#444" }}>
                Bu rota ya özel ya da bulunamadı.
              </div>
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={closeModal}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Kapat
                </button>
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
          <span role="img" aria-label="update">
            ⬆️
          </span>
          <div style={{ fontSize: 14 }}>
            Yeni bir sürüm hazır. Uygulamayı güncellemek için “Yenile”ye dokun.
          </div>
          <button style={btn} onClick={acceptUpdateAndReload}>
            Yenile
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`app-container ${!isMobile ? "desktop-layout" : ""}`}>
      {isMobile && activePage !== "mylive" && (
        <LogoBar
          onNotificationClick={() => handleNavChange("notifications")}
          onMessageClick={() => handleNavChange("messages")}
          onLocationClick={() => handleNavChange("map")}
        />
      )}
      {activePage !== "mylive" && (
        isMobile ? (
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
        )
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