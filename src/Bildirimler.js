// FILE: src/Bildirimler.js
import { useEffect, useState, useRef } from "react";
import { db } from "./firebase";
import { collection, query, where } from "firebase/firestore";
import { safeOnSnapshot } from "./utils/safeSnapshot";
import "./Bildirimler.css";

const CloseIcon = () => (
  <svg aria-label="Kapat" height="18" role="img" viewBox="0 0 24 24" width="18">
    <path
      d="M18 6L6 18M6 6l12 12"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    ></path>
  </svg>
);

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "";
  const date = timestamp.toDate();
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  let interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "g";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "s";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "d";
  return Math.floor(seconds) + "sn";
};

function Bildirimler({ aktifKullanici, onClose }) {
  const [bildirimler, setBildirimler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!aktifKullanici) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(collection(db, "notifications"), where("to", "==", aktifKullanici));

    const unsub = safeOnSnapshot(
      q,
      (snap) => {
        const fetchedBildirimler = (snap?.docs || []).map((d) => ({ id: d.id, ...(d.data() || {}) }));

        fetchedBildirimler.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || 0;
          const dateB = b.createdAt?.toDate?.() || 0;
          return dateB - dateA;
        });

        setBildirimler(fetchedBildirimler);
        setLoading(false);
      },
      (err) => {
        // Hata UI (safeOnSnapshot: throw'u da engeller)
        try {
          // eslint-disable-next-line no-console
          console.error("Bildirimleri çekerken Firestore hatası: ", err);
        } catch {}
        setError({ message: "Bildirimler yüklenemedi." });
        setLoading(false);
      },
      {
        label: "notifications:watch",
        path: `notifications(to==${aktifKullanici})`,
        autoUnsubscribeOnPermissionDenied: true,
      }
    );

    return () => {
      try {
        unsub?.();
      } catch {
        // no-op
      }
    };
  }, [aktifKullanici]);

  const handleTouchStart = (e) => {
    setIsDragging(true);
    startPosRef.current = {
      x: e.touches[0].clientX - position.x,
      y: e.touches[0].clientY - position.y,
    };
    if (panelRef.current) panelRef.current.style.transition = "none";
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.touches[0].clientX - startPosRef.current.x,
      y: e.touches[0].clientY - startPosRef.current.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (panelRef.current) panelRef.current.style.transition = "transform 0.3s ease-out, opacity 0.3s ease-out";

    if (Math.abs(position.x) > 100 || Math.abs(position.y) > 120) {
      onClose();
    } else {
      setPosition({ x: 0, y: 0 });
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="bildirimler-overlay" onClick={handleOverlayClick}>
      <div
        ref={panelRef}
        className="bildirimler-content"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="bildirimler-close-btn">
          <CloseIcon />
        </button>

        <div
          className="bildirimler-header-container"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <h2 className="bildirimler-header">Bildirimler</h2>
        </div>

        <div className="bildirimler-body">
          {loading && <div className="bildirimler-message">Yükleniyor...</div>}
          {error && <div className="bildirimler-message bildirimler-error">{error.message}</div>}
          {!loading && !error && bildirimler.length === 0 && (
            <div className="bildirimler-message">Henüz bildiriminiz yok.</div>
          )}
          {!loading && !error && bildirimler.length > 0 && (
            <ul className="bildirimler-list">
              {bildirimler.map((b) => (
                <li key={b.id} className="bildirim-item">
                  <img
                    src={b.fromAvatar || "https://placehold.co/44x44/e0e0e0/e0e0e0?text=?"}
                    alt={b.fromUsername}
                    className="bildirim-avatar"
                  />
                  <div className="bildirimler-text-content">
                    <p>
                      <strong>{b.fromUsername || "Biri"}</strong> {b.text}{" "}
                      <span className="bildirim-time">{formatTimeAgo(b.createdAt)}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default Bildirimler;
