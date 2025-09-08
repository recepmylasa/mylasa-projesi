// src/ClipsGrid.js
// Kullanıcının "video" (Clips) içeriklerini 9:16 grid olarak gösterir.
// ► Düzeltme: Kart tıklayınca artık /c/:id (clip permalink) açılır.
// ► Üç nokta menüsü BODY portalına çizilir (üst üste binmez), tekil menü mantığı vardır.

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import "./ClipsGrid.css";
import { db } from "./firebase";
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";

/* === İkonlar === */
const PlayBadge = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="#fff">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const DotsIcon = ({ size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <circle cx="5" cy="12" r="2" fill="currentColor" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <circle cx="19" cy="12" r="2" fill="currentColor" />
  </svg>
);

/* === Yardımcılar === */
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const isVideoUrl = (url = "") => /(\.(mp4|webm|mov|ogg))(\?|$)/i.test(url);

// esnek tarih alanları
const TS = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v < 2e12 ? v * 1000 : v;
  if (v.seconds) return v.seconds * 1000;
  if (v._seconds) return v._seconds * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
};

// Esnek kaynak: farklı koleksiyon/alan adlarına uyumlu okur
async function fetchUserClipsFlexible(userId) {
  // olası koleksiyon adları
  const colNames = ["clips", "reels", "posts", "gonderiler", "paylasimlar"];
  // kullanıcı id alanları
  const idFields = [
    "userId",
    "uid",
    "ownerId",
    "kullaniciId",
    "authorId",
    "createdBy",
    "olusturanId",
    "user.uid",
    "author.uid",
  ];

  // Top-level
  for (const cn of colNames) {
    for (const f of idFields) {
      try {
        const qy = query(collection(db, cn), where(f, "==", userId), limit(150));
        const snap = await getDocs(qy);
        if (!snap.empty) {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          return arr.filter((x) => {
            const url =
              x.videoUrl || x.mediaUrl || x.url || x.imageUrl || x.photoUrl || "";
            return x.type === "clip" || isVideoUrl(url);
          });
        }
      } catch (_) {}
    }
  }

  // Collection group (ör: users/<uid>/clips veya users/<uid>/posts)
  for (const cn of colNames) {
    for (const f of idFields) {
      try {
        const qy = query(collectionGroup(db, cn), where(f, "==", userId), limit(150));
        const snap = await getDocs(qy);
        if (!snap.empty) {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          return arr.filter((x) => {
            const url =
              x.videoUrl || x.mediaUrl || x.url || x.imageUrl || x.photoUrl || "";
            return x.type === "clip" || isVideoUrl(url);
          });
        }
      } catch (_) {}
    }
  }

  return [];
}

/* === Portal kökü === */
function useBodyPortal(attr = "clips-menu") {
  const ref = useRef(null);
  if (!ref.current) {
    const el = document.createElement("div");
    el.setAttribute("data-portal", attr);
    ref.current = el;
  }
  useEffect(() => {
    const el = ref.current;
    document.body.appendChild(el);
    return () => {
      try {
        document.body.removeChild(el);
      } catch {}
    };
  }, []);
  return ref.current;
}

export default function ClipsGrid({ userId }) {
  const [items, setItems] = useState(null);

  // PORTAL menü durumu (tekil menü)
  const [openMenu, setOpenMenu] = useState(null); // { id, x, y, permalink }
  const portalRoot = useBodyPortal("clips-menu");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchUserClipsFlexible(userId);
        if (!cancelled) setItems(rows);
      } catch (e) {
        console.error("ClipsGrid fetch error:", e);
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const list = useMemo(() => {
    const arr = Array.isArray(items) ? items.slice() : [];
    arr.sort(
      (a, b) =>
        TS(
          b.createdAt ||
            b.created_at ||
            b.tarih ||
            b.timestamp ||
            b.time ||
            b.date
        ) -
        TS(
          a.createdAt ||
            a.created_at ||
            a.tarih ||
            a.timestamp ||
            a.time ||
            a.date
        )
    );
    return arr;
  }, [items]);

  // Kart tıklanınca CLIP permalink (/c/:id)
  const openClip = useCallback((it) => {
    if (!it?.id) return;
    try {
      window.history.pushState({ modal: "clip", id: it.id }, "", `/c/${it.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (e) {
      console.error("open clip error:", e);
    }
  }, []);

  // Üç nokta butonu
  const onMoreClick = useCallback((it, ev) => {
    ev.stopPropagation();
    const r = ev.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuW = 184;
    const menuH = 96;
    const x = clamp(r.left + r.width - menuW, 8, vw - menuW - 8);
    const y = clamp(r.top + r.height + 8, 8, vh - menuH - 8);
    setOpenMenu({ id: it.id, x, y, permalink: `${window.location.origin}/c/${it.id}` });
  }, []);

  // Dış tık / ESC ile menü kapatma
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e) => {
      const menuEl = document.querySelector('[data-clips-menu="true"]');
      if (menuEl && menuEl.contains(e.target)) return;
      setOpenMenu(null);
    };
    const onKey = (e) => e.key === "Escape" && setOpenMenu(null);
    document.addEventListener("pointerdown", onDown, { capture: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, { capture: true });
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const copyOrShare = async (url) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mylasa", url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      setOpenMenu(null);
    } catch (e) {
      console.error("share/copy failed", e);
    }
  };

  const renderMenu = () => {
    if (!openMenu || !portalRoot) return null;
    const style = {
      position: "fixed",
      left: `${openMenu.x}px`,
      top: `${openMenu.y}px`,
      zIndex: 2600, // Clips.css ile uyumlu (menü katmanı)
      background: "#fff",
      color: "#111",
      border: "1px solid rgba(0,0,0,.15)",
      borderRadius: 12,
      boxShadow: "0 8px 24px rgba(0,0,0,.2)",
      padding: 6,
      minWidth: 184,
    };
    const itemStyle = {
      display: "block",
      width: "100%",
      background: "transparent",
      border: 0,
      textAlign: "left",
      padding: "10px 12px",
      borderRadius: 8,
      cursor: "pointer",
      fontWeight: 600,
    };
    const itemHover = (e, on) => (e.currentTarget.style.background = on ? "#f7f7f7" : "transparent");

    return createPortal(
      <div style={style} data-clips-menu="true" role="menu">
        <button
          role="menuitem"
          style={itemStyle}
          onMouseEnter={(e) => itemHover(e, true)}
          onMouseLeave={(e) => itemHover(e, false)}
          onClick={() => copyOrShare(openMenu.permalink)}
        >
          Bağlantıyı Kopyala
        </button>
        <button
          role="menuitem"
          style={itemStyle}
          onMouseEnter={(e) => itemHover(e, true)}
          onMouseLeave={(e) => itemHover(e, false)}
          onClick={() => setOpenMenu(null)}
        >
          İptal
        </button>
      </div>,
      portalRoot
    );
  };

  if (!items) {
    return <div className="clips-placeholder">Yükleniyor…</div>;
  }
  if (list.length === 0) {
    return <div className="clips-placeholder">Henüz Clips yok</div>;
  }

  return (
    <div className="clips-grid" role="list">
      {list.map((it) => {
        const url =
          it.videoUrl || it.mediaUrl || it.url || it.imageUrl || it.photoUrl || "";
        if (!url) return null;
        return (
          <button
            key={it.id}
            type="button"
            className="clips-card"
            onClick={() => openClip(it)}
            aria-label="Clips'i aç"
            role="listitem"
          >
            <video
              src={url}
              className="clips-media"
              muted
              playsInline
              preload="metadata"
            />
            <div className="clips-badge">
              <PlayBadge />
            </div>

            {/* Üç nokta menüsü (portal tetikleyici) */}
            <button
              type="button"
              aria-label="Daha fazla"
              onClick={(e) => onMoreClick(it, e)}
              style={{
                position: "absolute",
                right: 8,
                top: 8,
                width: 30,
                height: 30,
                borderRadius: 8,
                border: 0,
                background: "rgba(255,255,255,.85)",
                color: "#111",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,.2)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.95)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.85)")}
            >
              <DotsIcon />
            </button>
          </button>
        );
      })}
      {renderMenu()}
    </div>
  );
}
