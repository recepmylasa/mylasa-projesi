// src/ProfileMobile.js
// Mobil profil: header + highlights + sekmeler + içerik + CreateSheet + QR Modal + ActionsSheet + Saved
import React, { useEffect, useState, useCallback, useRef } from "react";
import "./ProfileMobile.css";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { listSaved } from "./savesClient";

import UserPosts from "./UserPosts";
import ProfilePostViewerMobile from "./ProfilePostViewerMobile";
import ProfileHeaderMobile from "./ProfileHeaderMobile";
import ProfileTabsMobile from "./ProfileTabsMobile";
import ProfileHighlightsMobile from "./ProfileHighlightsMobile";
import CreateSheet from "./CreateSheet";
import ProfileShareQRModal from "./ProfileShareQRModal";
import ProfileActionsSheetMobile from "./ProfileActionsSheetMobile";
import SavedGrid from "./SavedGrid";

export default function ProfileMobile({ user = null }) {
  const u = user ?? {};
  const userId = u.id ?? u.uid ?? u.userId ?? u.accountId ?? u._id ?? null;
  const hasUserId = !!userId;

  const [mode, setMode] = useState("grid");
  const [viewer, setViewer] = useState(null); // { items, index }
  const [createOpen, setCreateOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const [myUid, setMyUid] = useState(auth?.currentUser?.uid || null);
  const isSelf = !!myUid && !!userId && myUid === userId;

  // Saved state
  const [savedItems, setSavedItems] = useState([]);
  const [savedCursor, setSavedCursor] = useState(null);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedEnd, setSavedEnd] = useState(false);
  const savedSentinelRef = useRef(null);
  const savedInitializedRef = useRef(false);

  const sheetPushedRef = useRef(false); // History push durumunu izlemek için

  const avatarUrl =
    u.photoURL || u.profilFoto || u.avatar || "/avatars/default.png";
  const username = u.username || u.kullaniciAdi || "kullanıcı";

  // auth state dinle
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
    const shareData = {
      title: `${username} • Mylasa`,
      text: `${username} profilini gör`,
      url: typeof window !== "undefined" ? window.location.href : "",
    };
    if (navigator?.share) {
      navigator.share(shareData).catch(() => {});
      return;
    }
    // Fallback: QR modal
    setQrOpen(true);
  }, [username]);

  // ≡ menü: aç/kapat + History API entegrasyonu
  const openActions = useCallback(() => {
    setActionsOpen(true);
    try {
      window.history.pushState({ sheet: "profile-actions" }, "", window.location.href);
      sheetPushedRef.current = true;
    } catch {}
  }, []);
  const closeActions = useCallback(() => {
    if (!actionsOpen) return;
    try {
      if (sheetPushedRef.current) {
        window.history.back();
      } else {
        setActionsOpen(false);
      }
    } catch {
      setActionsOpen(false);
    }
  }, [actionsOpen]);

  // Geri tuşu (popstate) => sheet kapansın
  useEffect(() => {
    const onPop = () => {
      if (actionsOpen) {
        setActionsOpen(false);
        sheetPushedRef.current = false;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [actionsOpen]);

  // Highlights veri kaynağı
  const highlights =
    u.highlights || u.oneCikanlar || u.arsivOneCikanlar || []; // [{id, title, coverUrl}]

  const profileUrl = typeof window !== "undefined" ? window.location.href : "";

  // ≡ menü seçimleri
  const handleActionSelect = useCallback(
    (id) => {
      switch (id) {
        case "qr":
          setQrOpen(true);
          closeActions();
          break;
        case "share_experience":
          handleShare();
          closeActions();
          break;
        default:
          // Bu sprintte: görsel & akış entegrasyonu
          console.log("action:", id);
          closeActions();
          break;
      }
    },
    [closeActions, handleShare]
  );

  // ---- SAVED: ilk sayfa (mode 'saved' olduğunda ve self iken) ----
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
    return () => { alive = false; };
  }, [mode, isSelf]);

  // ---- SAVED: sonsuz kaydırma ----
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

  // Saved grid'den viewer aç
  const openFromSaved = useCallback((picked) => {
    const list = savedItems.map((s) => ({
      id: s.contentId,
      type: s.type || "post",
      mediaUrl: s.mediaUrl || null,
      authorId: s.authorId || null,
      caption: s.caption || "",
    }));
    const idx = Math.max(0, list.findIndex((x) => x.id === picked.id));
    setViewer({ items: list, index: idx });
  }, [savedItems]);

  return (
    <div className="profile-mobile">
      <ProfileHeaderMobile
        user={u}
        onShare={handleShare}
        onEdit={() => {}}
        onMenu={openActions}
        onCreate={() => setCreateOpen(true)}
      />

      {/* Öne Çıkanlar (yatay scroll) */}
      <ProfileHighlightsMobile
        items={highlights}
        username={username}
        onAdd={() => {}}
        onOpen={(item) => { console.log("highlight open:", item); }}
      />

      <ProfileTabsMobile mode={mode} onChange={setMode} showSavedTab={isSelf} />

      {/* İçerik panelleri */}
      <div id="tab-panel-grid" role="tabpanel" hidden={mode !== "grid"} className="tab-panel">
        {hasUserId ? (
          <div className="userposts-container">
            <UserPosts userId={userId} onOpen={onOpenFromGrid} />
          </div>
        ) : (
          <div className="userposts-container">
            <div className="user-posts-message">Profil yükleniyor…</div>
          </div>
        )}
      </div>

      <div id="tab-panel-clips" role="tabpanel" hidden={mode !== "clips"} className="tab-panel">
        {hasUserId ? (
          <div className="userposts-container">
            <UserPosts userId={userId} onlyClips onOpen={onOpenFromGrid} />
          </div>
        ) : (
          <div className="userposts-container">
            <div className="user-posts-message">Profil yükleniyor…</div>
          </div>
        )}
      </div>

      <div id="tab-panel-tagged" role="tabpanel" hidden={mode !== "tagged"} className="tab-panel">
        <div className="empty-tab">
          <div className="empty-tab__icon">🏷️</div>
          <div className="empty-tab__title">Etiketlendiğin fotoğraflar</div>
          <div className="empty-tab__desc">
            Başkaları sizi gönderilerine etiketlediğinde burada görünecek.
          </div>
        </div>
      </div>

      {/* Kaydedilenler */}
      <div id="tab-panel-saved" role="tabpanel" hidden={mode !== "saved"} className="tab-panel">
        {isSelf ? (
          <>
            <SavedGrid items={savedItems} onItemClick={openFromSaved} />
            {!savedEnd && <div ref={savedSentinelRef} style={{ height: 1 }} aria-hidden="true" />}
            {savedLoading && savedItems.length === 0 && (
              <div className="user-posts-message">Yükleniyor…</div>
            )}
          </>
        ) : (
          <div className="user-posts-message">Kaydedilenler yalnızca sana görünür.</div>
        )}
      </div>

      {/* Tam ekran mobil viewer */}
      {viewer && (
        <ProfilePostViewerMobile
          items={viewer.items}
          startIndex={viewer.index}
          onClose={closeViewer}
          viewerUser={{ name: username, avatar: avatarUrl }}
        />
      )}

      {/* Oluştur sheet */}
      <CreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSelect={(t) => {
          setCreateOpen(false);
          console.log("create:", t);
        }}
      />

      {/* QR Paylaş modal */}
      <ProfileShareQRModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        url={profileUrl}
        username={username}
      />

      {/* ≡ Profil Aksiyonları bottom-sheet */}
      <ProfileActionsSheetMobile
        open={actionsOpen}
        onClose={closeActions}
        onSelect={handleActionSelect}
      />
    </div>
  );
}
