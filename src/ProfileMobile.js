// src/ProfileMobile.js
// Mobil profil: header + highlights + sekmeler + içerik + CreateSheet + QR Modal + ActionsSheet + Saved + Labubu
// Adım 9: Takip Et / Takibi Bırak eklendi (followers/following sayaçları opsiyonel gösterim)

import React, { useEffect, useState, useCallback, useRef } from "react";
import "./ProfileMobile.css";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, query, where, orderBy, getDocs, limit,
  doc, onSnapshot, setDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";

import UserPosts from "./UserPosts";
import UserCheckIns from "./UserCheckIns";
import ProfilePostViewerMobile from "./ProfilePostViewerMobile";
import ProfileHeaderMobile from "./ProfileHeaderMobile";
import ProfileTabsMobile from "./ProfileTabsMobile";
import ProfileHighlightsMobile from "./ProfileHighlightsMobile";
import CreateSheet from "./CreateSheet";
import ProfileShareQRModal from "./ProfileShareQRModal";
import ProfileActionsSheetMobile from "./ProfileActionsSheetMobile";
import SavedGrid from "./SavedGrid";

// Saved API (HATA düzeltmesi: listSaved buradan geliyor)
import { listSaved } from "./savesClient";

// Labubu
import useLabubu from "./hooks/useLabubu";
import LabubuGridMobile from "./components/Labubu/LabubuGridMobile";
import LabubuOpenModalMobile from "./components/Labubu/LabubuOpenModalMobile";

export default function ProfileMobile({ user = null }) {
  const u = user ?? {};
  const userId = u.id ?? u.uid ?? u.userId ?? u.accountId ?? u._id ?? null;
  const hasUserId = !!userId;

  const [mode, setMode] = useState("grid"); // grid | clips | checkins | collection | saved
  const [viewer, setViewer] = useState(null); // { items, index }
  const [createOpen, setCreateOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const [myUid, setMyUid] = useState(auth?.currentUser?.uid || null);
  const isSelf = !!myUid && !!userId && myUid === userId;

  // --- Adım 9: Following state ---
  const [isFollowing, setIsFollowing] = useState(false);
  useEffect(() => {
    if (!myUid || !userId || myUid === userId) { setIsFollowing(false); return; }
    const ref = doc(db, "follows", `${myUid}_${userId}`);
    const off = onSnapshot(ref, (snap) => setIsFollowing(snap.exists()), () => setIsFollowing(false));
    return () => off && off();
  }, [myUid, userId]);

  const toggleFollow = useCallback(async () => {
    if (!myUid || !userId || myUid === userId) return;
    const ref = doc(db, "follows", `${myUid}_${userId}`);
    if (isFollowing) {
      try { await deleteDoc(ref); } catch {}
    } else {
      try { await setDoc(ref, { followerId: myUid, followeeId: userId, createdAt: serverTimestamp() }); } catch {}
    }
  }, [myUid, userId, isFollowing]);

  // Labubu state (yalnız profil sahibi için kutu açma izni)
  const { cards, boxesReady, openBox } = useLabubu(isSelf ? myUid : userId);
  const [lastDrop, setLastDrop] = useState(null);

  // CHECK-IN state
  const [checkIns, setCheckIns] = useState([]);
  const [checkInsLoading, setCheckInsLoading] = useState(false);

  // Saved state
  const [savedItems, setSavedItems] = useState([]);
  const [savedCursor, setSavedCursor] = useState(null);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedEnd, setSavedEnd] = useState(false);
  const savedSentinelRef = useRef(null);
  const savedInitializedRef = useRef(false);

  const sheetPushedRef = useRef(false);

  const avatarUrl = u.photoURL || u.profilFoto || u.avatar || "/avatars/default.png";
  const username = typeof u.username === "string" ? u.username.toLowerCase() : "kullanıcı";

  useEffect(() => {
    const off = onAuthStateChanged(auth, (usr) => setMyUid(usr?.uid || null));
    return () => off && off();
  }, []);

  const onOpenFromGrid = useCallback((items, startIndex) => {
    if (!Array.isArray(items) || items.length === 0) return;
    setViewer({
      items,
      index: Math.max(0, Math.min(startIndex ?? 0, items.length - 1)),
    });
  }, []);

  const closeViewer = useCallback(() => setViewer(null), []);

  const handleShare = useCallback(() => {
    const shareData = { title: `${username} • Mylasa`, text: `${username} profilini gör`, url: typeof window !== "undefined" ? window.location.href : "" };
    if (navigator?.share) { navigator.share(shareData).catch(() => {}); return; }
    setQrOpen(true);
  }, [username]);

  const openActions = useCallback(() => {
    setActionsOpen(true);
    try { window.history.pushState({ sheet: "profile-actions" }, "", window.location.href); sheetPushedRef.current = true; } catch {}
  }, []);
  const closeActions = useCallback(() => {
    if (!actionsOpen) return;
    try { if (sheetPushedRef.current) { window.history.back(); } else { setActionsOpen(false); } } catch { setActionsOpen(false); }
  }, [actionsOpen]);

  useEffect(() => {
    const onPop = () => {
      if (actionsOpen) { setActionsOpen(false); sheetPushedRef.current = false; }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [actionsOpen]);

  const highlights = u.highlights || u.oneCikanlar || u.arsivOneCikanlar || [];
  const profileUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleActionSelect = useCallback((id) => {
    switch (id) {
      case "qr": setQrOpen(true); closeActions(); break;
      case "share_experience": handleShare(); closeActions(); break;
      case "saved": setMode("saved"); closeActions(); break;
      default: console.log("action:", id); closeActions(); break;
    }
  }, [closeActions, handleShare]);

  // CHECK-IN (tembel yükleme)
  useEffect(() => {
    if (mode !== "checkins" || !hasUserId) return;
    let alive = true;
    (async () => {
      try {
        setCheckInsLoading(true);
        const colNames = ["checkins", "checkinler", "yerBildirimleri"];
        let rows = [];
        for (const cn of colNames) {
          try {
            const qy = query(collection(db, cn), where("userId", "==", userId), orderBy("timestamp", "desc"), limit(50));
            const snap = await getDocs(qy);
            rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            if (rows.length) break;
          } catch {}
        }
        if (alive) setCheckIns(rows);
      } finally {
        if (alive) setCheckInsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [mode, hasUserId, userId]);

  // SAVED ilk sayfa
  useEffect(() => {
    if (mode !== "saved" || !isSelf || savedInitializedRef.current) return;
    let alive = true;
    (async () => {
      setSavedLoading(true);
      try {
        const { items, nextCursor } = await listSaved({ pageSize: 18 });
        if (!alive) return;
        setSavedItems(items);
        setSavedCursor(nextCursor);
        setSavedEnd(!nextCursor);
        savedInitializedRef.current = true;
      } finally {
        if (alive) setSavedLoading(false);
      }
    })();
    return () => { let _ = (alive = false); };
  }, [mode, isSelf]);

  // SAVED sonsuz
  useEffect(() => {
    if (mode !== "saved" || !isSelf || savedEnd) return;
    const el = savedSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (savedLoading || !savedCursor) return;
      setSavedLoading(true);
      try {
        const { items, nextCursor } = await listSaved({ pageSize: 18, cursor: savedCursor });
        setSavedItems((prev) => prev.concat(items));
        setSavedCursor(nextCursor);
        setSavedEnd(!nextCursor);
      } finally {
        setSavedLoading(false);
      }
    }, { rootMargin: "800px 0px 1200px 0px", threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [mode, isSelf, savedCursor, savedLoading, savedEnd]);

  const openFromSaved = useCallback((picked) => {
    const list = savedItems.map((s) => ({ id: s.contentId, type: s.type || "post", mediaUrl: s.mediaUrl || null, authorId: s.authorId || null, caption: s.caption || "" }));
    const idx = Math.max(0, list.findIndex((x) => x.id === picked.id));
    setViewer({ items: list, index: idx });
  }, [savedItems]);

  // Labubu: kutu aç
  const handleOpenStandard = useCallback(async () => {
    try {
      const d = await openBox("standardBox");
      setLastDrop(d);
    } catch (e) {
      console.warn("openBox failed", e?.message || e);
    }
  }, [openBox]);

  return (
    <div className="profile-mobile">
      <ProfileHeaderMobile
        user={u}
        isSelf={isSelf}
        onShare={handleShare}
        onEdit={() => {}}
        onMenu={openActions}
        onCreate={() => setCreateOpen(true)}
      />

      {/* Adım 9: Takip Et / Takibi Bırak + sayaçlar */}
      {!isSelf && hasUserId && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px" }}>
          <button
            onClick={toggleFollow}
            style={{
              padding: "8px 12px", borderRadius: 10, fontWeight: 800, cursor: "pointer",
              border: "1px solid #ddd", background: isFollowing ? "#111" : "#fff", color: isFollowing ? "#fff" : "#111"
            }}
          >
            {isFollowing ? "Takibi Bırak" : "Takip Et"}
          </button>
          <div style={{ fontSize: 12, opacity: .7 }}>
            <b>{Number(u.followersCount || 0)}</b> takipçi • <b>{Number(u.followingCount || 0)}</b> takip
          </div>
        </div>
      )}

      <ProfileHighlightsMobile
        items={u.highlights || u.oneCikanlar || u.arsivOneCikanlar || []}
        username={typeof u.username === "string" ? u.username.toLowerCase() : "kullanıcı"}
        onAdd={() => {}}
        onOpen={(item) => { console.log("highlight open:", item); }}
      />

      {/* Sekmeler: grid / clips / checkins / collection (+saved self ise ProfileTabsMobile içinde) */}
      <ProfileTabsMobile mode={mode} onChange={setMode} showSavedTab={isSelf} showCollectionTab />

      {/* Gönderiler */}
      <div id="tab-panel-grid" role="tabpanel" hidden={mode !== "grid"} className="tab-panel">
        {hasUserId ? (
          <div className="userposts-container">
            <UserPosts userId={userId} onOpen={onOpenFromGrid} />
          </div>
        ) : (
          <div className="userposts-container"><div className="user-posts-message">Profil yükleniyor…</div></div>
        )}
      </div>

      {/* Clips */}
      <div id="tab-panel-clips" role="tabpanel" hidden={mode !== "clips"} className="tab-panel">
        {hasUserId ? (
          <div className="userposts-container">
            <UserPosts userId={userId} onlyClips onOpen={onOpenFromGrid} />
          </div>
        ) : (
          <div className="userposts-container"><div className="user-posts-message">Profil yükleniyor…</div></div>
        )}
      </div>

      {/* Check-ins */}
      <div id="tab-panel-checkins" role="tabpanel" hidden={mode !== "checkins"} className="tab-panel">
        <div className="userposts-container">
          {checkInsLoading ? (
            <div className="user-posts-message">Check-in’ler yükleniyor…</div>
          ) : (
            <UserCheckIns checkIns={checkIns} />
          )}
        </div>
      </div>

      {/* Labubu Koleksiyon */}
      <div id="tab-panel-collection" role="tabpanel" hidden={mode !== "collection"} className="tab-panel">
        <div className="userposts-container">
          <LabubuGridMobile
            cards={cards}   
            boxesReady={isSelf ? boxesReady : 0}
            onOpenBox={isSelf ? handleOpenStandard : undefined}
            onOpenCard={(c)=>setLastDrop(c)}
          />
        </div>
      </div>

      {/* Saved */}
      <div id="tab-panel-saved" role="tabpanel" hidden={mode !== "saved"} className="tab-panel">
        {isSelf ? (
          <>
            <SavedGrid items={savedItems} onItemClick={openFromSaved} />
            {!savedEnd && <div ref={savedSentinelRef} style={{ height: 1 }} aria-hidden="true" />}
            {savedLoading && savedItems.length === 0 && (<div className="user-posts-message">Yükleniyor…</div>)}
          </>
        ) : (
          <div className="user-posts-message">Kaydedilenler yalnızca sana görünür.</div>
        )}
      </div>

      {/* Viewer */}
      {viewer && (
        <ProfilePostViewerMobile
          items={viewer.items}
          startIndex={viewer.index}
          onClose={closeViewer}
          viewerUser={{ name: typeof u.username === "string" ? u.username.toLowerCase() : "kullanıcı", avatar: avatarUrl }}
        />
      )}

      {/* Labubu modal */}
      {lastDrop && <LabubuOpenModalMobile drop={lastDrop} onClose={()=>setLastDrop(null)} />}

      {/* Create sheet */}
      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} onSelect={(t) => { setCreateOpen(false); }} />

      {/* QR Modal */}
      <ProfileShareQRModal open={qrOpen} onClose={() => setQrOpen(false)} url={profileUrl} username={typeof u.username === "string" ? u.username.toLowerCase() : "kullanıcı"} />

      {/* Actions sheet */}
      <ProfileActionsSheetMobile open={actionsOpen} onClose={closeActions} onSelect={(id) => {
        switch (id) {
          case "qr": setQrOpen(true); closeActions(); break;
          case "share_experience": handleShare(); closeActions(); break;
          case "saved": setMode("saved"); closeActions(); break;
          default: console.log("action:", id); closeActions(); break;
        }
      }} />
    </div>
  );
}
