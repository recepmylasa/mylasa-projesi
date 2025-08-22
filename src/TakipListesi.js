import { useEffect, useMemo, useState, useRef } from "react";
import { db } from "./firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import "./TakipListesi.css";

/**
 * TakipListesi
 * NOT: Overlay/backdrop bu bileşenin DIŞINDA (parent) yönetilir.
 * Bu component yalnızca MERKEZ PANELİN içeriğini renderlar.
 *
 * Props:
 * - userId: Profil sahibi UID
 * - tip: "takipciler" | "takipEdilenler"
 * - onClose: paneli kapat
 * - onUserClick(uid): seçilen kullanıcının profiline git
 */
export default function TakipListesi({ userId, tip, onClose, onUserClick }) {
  const [kullanicilar, setKullanicilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const closeBtnRef = useRef(null);
  const searchRef = useRef(null);

  // ESC ile kapama
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // İlk odak: arama → yoksa kapat butonu
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchRef.current) searchRef.current.focus();
      else if (closeBtnRef.current) closeBtnRef.current.focus();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function fetchList() {
      setLoading(true);
      try {
        // 1) Profil sahibini doğrudan doc id ile çek (UID = doc id varsayımı proje genelinde kullanılıyor)
        const ownerSnap = await getDoc(doc(db, "users", userId));
        if (!ownerSnap.exists()) {
          if (mounted) { setKullanicilar([]); setLoading(false); }
          return;
        }

        const arrUids = Array.isArray(ownerSnap.data()?.[tip])
          ? ownerSnap.data()[tip]
          : [];

        if (arrUids.length === 0) {
          if (mounted) { setKullanicilar([]); setLoading(false); }
          return;
        }

        // 2) Büyük listeler için 30'luk parçalara bölüp in-sorguları yap
        const MAX_IN = 30;
        const chunks = [];
        for (let i = 0; i < arrUids.length; i += MAX_IN) {
          chunks.push(arrUids.slice(i, i + MAX_IN));
        }

        const results = [];
        for (const c of chunks) {
          const qUsers = query(
            collection(db, "users"),
            where("uid", "in", c)
          );
          const snap = await getDocs(qUsers);
          for (const d of snap.docs) results.push(d.data());
        }

        // 3) Görsel tutarlılık: kullanıcı adı (yoksa adSoyad) ile A→Z sırala
        results.sort((a, b) => {
          const ax = (a.kullaniciAdi || a.adSoyad || "").toLowerCase();
          const bx = (b.kullaniciAdi || b.adSoyad || "").toLowerCase();
          return ax.localeCompare(bx, "tr");
        });

        if (mounted) setKullanicilar(results);
      } catch (err) {
        console.error("Takip listesi alınırken hata:", err);
        if (mounted) setKullanicilar([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchList();
    return () => { mounted = false; };
  }, [userId, tip]);

  // Arama filtresi
  const filtered = useMemo(() => {
    if (!search) return kullanicilar;
    const s = search.trim().toLowerCase();
    return kullanicilar.filter((u) => {
      const uname = (u.kullaniciAdi || "").toLowerCase();
      const fname = (u.adSoyad || "").toLowerCase();
      return uname.includes(s) || fname.includes(s);
    });
  }, [kullanicilar, search]);

  const title =
    tip === "takipciler" ? "Takipçiler" : "Takip Edilenler";
  const count = kullanicilar.length;

  const handleUserClick = (uid) => {
    try { onClose?.(); } finally { onUserClick?.(uid); }
  };

  return (
    <div className="takip-listesi-content" role="dialog" aria-modal="true" aria-label={title}>
      <header className="takip-listesi-header">
        <h3 className="takip-listesi-title">
          {title}
          <span className="takip-listesi-count">{count}</span>
        </h3>
        <button
          ref={closeBtnRef}
          onClick={onClose}
          className="takip-listesi-close-btn"
          aria-label="Kapat"
          type="button"
        >
          &times;
        </button>
      </header>

      <div className="takip-listesi-search">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ara"
          aria-label="Listede ara"
        />
      </div>

      <div className="takip-listesi-body">
        {loading ? (
          <div className="takip-listesi-message">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="takip-listesi-message">Hiç kullanıcı yok.</div>
        ) : (
          <ul className="takip-listesi-list" role="listbox" aria-label={title}>
            {filtered.map((user) => (
              <li
                key={user.uid}
                className="takip-listesi-item"
                role="option"
                aria-label={user.kullaniciAdi || user.adSoyad || "Kullanıcı"}
                onClick={() => handleUserClick(user.uid)}
              >
                <img
                  src={user.profilFoto || "https://placehold.co/44x44/e0e0e0/e0e0e0?text=?"}
                  alt=""
                  className="takip-listesi-avatar"
                />
                <div className="takip-listesi-user-info">
                  <div className="takip-listesi-username">{user.kullaniciAdi}</div>
                  {user.adSoyad && (
                    <div className="takip-listesi-fullname">{user.adSoyad}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
