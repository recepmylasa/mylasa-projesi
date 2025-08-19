// src/Hikayeler.js — GÜNCEL
// KURAL 6: Mobil ve Masaüstü ayrı dosyalardan çalıştırılır.
// Değişiklik: StoryModal importu kaldırıldı; yerine StoryModalMobile/Desktop seçimi eklendi.

import { useEffect, useState, useMemo } from "react";
import { db, storage, auth } from "./firebase";
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  doc,
  runTransaction,
  arrayUnion,
  increment
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import imageCompression from "browser-image-compression";

// YENİ: KURAL 6 gereği ayrı modallar
import StoryModalMobile from "./StoryModalMobile";      // ← YENİ DOSYA (mobil)
import StoryModalDesktop from "./StoryModalDesktop";    // ← YENİ DOSYA (masaüstü)

import "./Hikayeler.css";

const readWatched = () => {
  try {
    const raw = localStorage.getItem("watchedStories");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

function Hikayeler({ currentUserProfile }) {
  const [storiesByUser, setStoriesByUser] = useState([]);
  const [isUploadingStory, setIsUploadingStory] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [modalAcik, setModalAcik] = useState(false);
  const [aktifKullaniciStories, setAktifKullaniciStories] = useState([]);
  const [izlenenHikayeler, setIzlenenHikayeler] = useState(readWatched());
  const [mevcutIzlenenKullanici, setMevcutIzlenenKullanici] = useState(null);

  // YENİ: Cihaz tipi (mobil/masaüstü) algılama — KURAL 6 merkezi seçim
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
  });
  useEffect(() => {
    const mm = window.matchMedia("(max-width: 767px)");
    const handler = (e) => setIsMobile(e.matches);
    try { mm.addEventListener("change", handler); } catch { mm.addListener(handler); }
    setIsMobile(mm.matches);
    return () => {
      try { mm.removeEventListener("change", handler); } catch { mm.removeListener(handler); }
    };
  }, []);

  // watched sync (diğer tablar)
  useEffect(() => {
    const refresh = () => setIzlenenHikayeler(readWatched());
    const storageListener = (e) => {
      if (e.key === "watchedStories") refresh();
    };
    window.addEventListener("mylasa-watched-updated", refresh);
    window.addEventListener("storage", storageListener);
    return () => {
      window.removeEventListener("mylasa-watched-updated", refresh);
      window.removeEventListener("storage", storageListener);
    };
  }, []);

  // 24 saatlik hikayeleri çek
  useEffect(() => {
    if (!currentUserProfile) {
      setStoriesByUser([]);
      return;
    }
    const currentUserId = currentUserProfile.uid;
    const takipEdilenler = currentUserProfile.takipEdilenler || [];
    const storyAuthors = [...new Set([currentUserId, ...takipEdilenler])];
    if (storyAuthors.length === 0) return;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const qy = query(
      collection(db, "hikayeler"),
      where("authorId", "in", storyAuthors.slice(0, 30)),
      where("tarih", ">=", twentyFourHoursAgo)
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const grouped = all.reduce((acc, s) => {
          (acc[s.authorId] ||= {
            authorId: s.authorId,
            authorUsername: s.authorUsername,
            authorProfilePic: s.authorProfilePic,
            stories: [],
          });
          acc[s.authorId].stories.push(s);
          acc[s.authorId].stories.sort(
            (a, b) => a.tarih?.toDate() - b.tarih?.toDate()
          );
          return acc;
        }, {});
        setStoriesByUser(Object.values(grouped));
      },
      (e) => console.error("Hikayeler snapshot hatası:", e)
    );

    return () => unsub();
  }, [currentUserProfile]);

  // Yükleme
  const handleHikayeEkle = async (e) => {
    const file = e.target.files?.[0];
    const kullanici = auth.currentUser;
    if (!file || !kullanici || !currentUserProfile) return;

    setIsUploadingStory(true);
    setUploadProgress(0);

    let fileToUpload = file;
    if (file.type.startsWith("image/")) {
      try {
        fileToUpload = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1080,
          useWebWorker: true,
        });
      } catch {
        // sıkıştırma başarısızsa orijinali yükle
      }
    }

    const sanitized = (fileToUpload.name || "media").replace(
      /[^a-zA-Z0-9.]/g,
      "_"
    );
    const path = `hikaye_media/${kullanici.uid}/${Date.now()}_${sanitized}`;
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, fileToUpload, {
      contentType: fileToUpload.type,
    });
    // input sıfırla
    e.target.value = null;

    uploadTask.on(
      "state_changed",
      (s) => setUploadProgress((s.bytesTransferred / s.totalBytes) * 100),
      (err) => {
        console.error("Storage Yükleme Hatası:", err);
        setIsUploadingStory(false);
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          const storagePath = uploadTask.snapshot.ref.fullPath;
          await addDoc(collection(db, "hikayeler"), {
            authorId: kullanici.uid,
            authorUsername: currentUserProfile.kullaniciAdi,
            authorProfilePic: currentUserProfile.profilFoto,
            mediaUrl: url,
            mediaType: fileToUpload.type,
            contentType: fileToUpload.type,
            storagePath,
            dosyaBoyutu: fileToUpload.size || null,
            tarih: serverTimestamp(),
            createdAt: serverTimestamp(),
            izleyenler: [],
            viewersCount: 0,
          });

          try {
            const arr = readWatched().filter((id) => id !== kullanici.uid);
            localStorage.setItem("watchedStories", JSON.stringify(arr));
            window.dispatchEvent(new Event("mylasa-watched-updated"));
          } catch {}
        } catch (err) {
          console.error("URL/Firestore hatası:", err);
        } finally {
          setIsUploadingStory(false);
        }
      }
    );
  };

  // watched yaz
  const markAuthorWatched = (authorId) => {
    if (!authorId) return;
    setIzlenenHikayeler((prev) => {
      if (prev.includes(authorId)) return prev;
      const next = [...prev, authorId];
      localStorage.setItem("watchedStories", JSON.stringify(next));
      window.dispatchEvent(new Event("mylasa-watched-updated"));
      return next;
    });
  };

  const handleStoryClick = (user) => {
    markAuthorWatched(user.authorId);

    // *** viewersCount & izleyenler ekleme ***
    const currentUser = auth.currentUser;
    if (currentUser && user.stories?.length > 0) {
      const firstStoryId = user.stories[0].id;
      const storyRef = doc(db, "hikayeler", firstStoryId);
      runTransaction(db, async (transaction) => {
        const storyDoc = await transaction.get(storyRef);
        if (!storyDoc.exists()) return;
        const data = storyDoc.data();
        if (!data.izleyenler?.includes(currentUser.uid)) {
          transaction.update(storyRef, {
            izleyenler: arrayUnion(currentUser.uid),
            viewersCount: increment(1),
          });
        }
      }).catch((err) => console.error("Viewers update hatası:", err));
    }

    setAktifKullaniciStories(user.stories);
    setMevcutIzlenenKullanici(user);
    setModalAcik(true);
  };

  const handleModalClose = () => {
    setModalAcik(false);
    if (mevcutIzlenenKullanici)
      markAuthorWatched(mevcutIzlenenKullanici.authorId);
  };

  const sortedStories = useMemo(() => {
    const me = currentUserProfile?.uid;
    return [...storiesByUser].sort((a, b) => {
      if (a.authorId === me) return -1;
      if (b.authorId === me) return 1;
      const aw = izlenenHikayeler.includes(a.authorId);
      const bw = izlenenHikayeler.includes(b.authorId);
      return aw === bw ? 0 : aw ? 1 : -1;
    });
  }, [storiesByUser, izlenenHikayeler, currentUserProfile]);

  const myGroup = useMemo(
    () => storiesByUser.find((g) => g.authorId === currentUserProfile?.uid),
    [storiesByUser, currentUserProfile]
  );
  const hasMyStory = !!myGroup && myGroup.stories.length > 0;
  const isMyWatched =
    !!currentUserProfile?.uid &&
    izlenenHikayeler.includes(currentUserProfile.uid);

  const handleMyStoryOpen = () => {
    if (isUploadingStory) return;
    if (!hasMyStory) return;
    handleStoryClick(myGroup);
  };

  const myRingClass = `story-ring ${
    isUploadingStory
      ? "uploading"
      : hasMyStory
      ? isMyWatched
        ? "watched"
        : "unwatched"
      : "no-gradient"
  }`;

  return (
    <>
      <div className="stories-container">
        <div className="stories-scroll-area">
          {/* Benim hikayem */}
          <div className="story-item add-story">
            <div className={myRingClass} onClick={handleMyStoryOpen}>
              <div className="story-inner">
                <img
                  className="story-avatar"
                  src={
                    currentUserProfile?.profilFoto ||
                    "https://placehold.co/66x66/EFEFEF/AAAAAA?text=P"
                  }
                  alt="Profil"
                />
              </div>

              {!isUploadingStory && (
                <>
                  <button
                    type="button"
                    className="add-story-plus-icon"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const el = document.getElementById("hikaye-upload");
                      if (el) el.click();
                    }}
                    aria-label="Hikaye ekle"
                  >
                    +
                  </button>
                  <input
                    id="hikaye-upload"
                    type="file"
                    accept="image/*,video/*"
                    style={{ display: "none" }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={handleHikayeEkle}
                    disabled={isUploadingStory}
                  />
                </>
              )}
            </div>
            <p className="story-username">Hikayen</p>
          </div>

          {/* Diğer kullanıcılar */}
          {sortedStories
            .filter((u) => u.authorId !== currentUserProfile?.uid)
            .map((user) => {
              const isWatched = izlenenHikayeler.includes(user.authorId);
              return (
                <div
                  key={user.authorId}
                  className="story-item"
                  onClick={() => handleStoryClick(user)}
                >
                  <div
                    className={`story-ring ${
                      isWatched ? "watched" : "unwatched"
                    }`}
                  >
                    <div className="story-inner">
                      <img
                        className="story-avatar"
                        src={
                          user.authorProfilePic ||
                          "https://placehold.co/66x66/EFEFEF/AAAAAA?text=P"
                        }
                        alt={user.authorUsername}
                      />
                    </div>
                  </div>
                  <p className="story-username">{user.authorUsername}</p>
                </div>
              );
            })}
        </div>
      </div>

      {modalAcik && (
        isMobile ? (
          <StoryModalMobile stories={aktifKullaniciStories} onClose={handleModalClose} />
        ) : (
          <StoryModalDesktop stories={aktifKullaniciStories} onClose={handleModalClose} />
        )
      )}
    </>
  );
}

export default Hikayeler;
