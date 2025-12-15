// src/NewClipMobile.js
import React, { useState, useEffect, useRef } from "react";
import { db, storage, auth } from "./firebase";
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import "./NewClipMobile.css";

// --- İkonlar ---
const BackArrowIcon = () => (
  <svg aria-label="Geri" fill="#262626" height="24" role="img" viewBox="0 0 24 24" width="24">
    <path d="M21 11.3H5.7l6.2-6.2c.5-.5.5-1.3 0-1.8s-1.3-.5-1.8 0l-8.1 8.1c.5.5-.5 1.3 0 1.8l8.1 8.1c.5.5 1.3 .5 1.8 0s.5-1.3 0-1.8l-6.2-6.2H21c.7 0 1.3-.6 1.3-1.3s-.6-1.3-1.3-1.3z" />
  </svg>
);
const ChevronRightIcon = () => (
  <svg aria-label="İleri" fill="#c7c7c7" height="16" role="img" viewBox="0 0 24 24" width="16">
    <path d="M9 18l6-6-6-6" stroke="#c7c7c7" strokeWidth="2" />
  </svg>
);
const TagPeopleIcon = () => (
  <svg aria-label="Kişileri etiketle" height="24" role="img" viewBox="0 0 24 24" width="24">
    <path d="M12 12a3 3 0 100-6 3 3 0 000 6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M18.7 20.3a9.5 9.5 0 00-13.4 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M21.5 12.5a9.5 9.5 0 10-19 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const LocationIcon = () => (
  <svg aria-label="Konum" height="24" role="img" viewBox="0 0 24 24" width="24">
    <path
      d="M12 2a8 8 0 00-8 8c0 5.4 6.3 11.4 7.3 12.3a.9.9 0 001.4 0C13.7 21.4 20 15.4 20 10a8 8 0 00-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function guessExt(file) {
  const fromName = (file?.name || "").split(".").pop();
  if (fromName && fromName !== file?.name) return fromName.toLowerCase();
  const fromType = (file?.type || "").split("/")[1];
  return (fromType || "mp4").toLowerCase();
}

function NewClipMobile({ onClose }) {
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [step, setStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hataMesaji, setHataMesaji] = useState("");
  const [kullanici, setKullanici] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const hasOpenedFileDialog = useRef(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => setKullanici(user));
    return () => unsubscribe();
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type?.startsWith("video/")) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoPreviewUrl(url);
      setStep(2);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    setVideoFile(null);
    setVideoPreviewUrl("");
    setAciklama("");
    setStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
    hasOpenedFileDialog.current = false;
    onClose();
  };

  const handlePaylas = async () => {
    if (!kullanici || !videoFile || isUploading) {
      setHataMesaji("Kullanıcı, video dosyası bulunamadı veya zaten yükleniyor.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setHataMesaji("");

    try {
      const newClipRef = doc(collection(db, "clips"));
      const fileExtension = guessExt(videoFile);

      // İstenen uyum: docId == clipId, upload path raw-uploads/{uid}/{clipId}.ext
      const storagePath = `raw-uploads/${kullanici.uid}/${newClipRef.id}.${fileExtension}`;

      // Firestore doc: pipeline/debug için rawPath bilgilerini de kaydediyoruz (tetiklemeyi bozmaz)
      await setDoc(newClipRef, {
        authorId: kullanici.uid,
        aciklama: aciklama,
        tarih: serverTimestamp(),
        status: "processing",
        begenenler: [],
        yorumlar: [],
        rawPath: storagePath,
        rawExt: fileExtension,
        rawContentType: videoFile.type || null,
        rawOriginalName: videoFile.name || null,
      });

      const fileRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(fileRef, videoFile);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          setHataMesaji(`Yükleme Hatası: ${error.code || "unknown"}`);
          setIsUploading(false);
        },
        () => {
          alert("Videonuz yüklendi ve arka planda işleniyor. Birkaç dakika içinde profilinizde görünecektir.");
          handleClose();
        }
      );
    } catch (error) {
      setHataMesaji("Yükleme sırasında bir veritabanı hatası oluştu.");
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (fileInputRef.current && !hasOpenedFileDialog.current) {
      fileInputRef.current.click();
      hasOpenedFileDialog.current = true;
    }
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.currentTime = 1;
  }, [videoPreviewUrl]);

  return (
    <div className="new-clip-overlay" style={{ display: step === 2 ? "flex" : "none" }}>
      <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} style={{ display: "none" }} />
      {step === 2 && (
        <div className="new-clip-mobile-container">
          <header className="new-clip-mobile-header">
            {isUploading && <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }} />}
            <button onClick={handleClose} className="header-icon-btn" disabled={isUploading}>
              <BackArrowIcon />
            </button>
            <h3 className="header-title">Yeni Reels Videosu</h3>
            <button onClick={handlePaylas} className="header-text-btn" disabled={isUploading}>
              {isUploading ? "Paylaşılıyor..." : "Paylaş"}
            </button>
          </header>

          <main className="share-screen-content">
            <div className="cover-and-caption-section">
              <div className="video-cover-container">
                <video ref={videoRef} src={videoPreviewUrl} muted playsInline className="video-cover-thumb" />
                <button className="edit-cover-btn">Kapağı düzenle</button>
              </div>
              <textarea
                className="caption-textarea"
                placeholder="Bir açıklama yaz..."
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                disabled={isUploading}
              />
            </div>

            <div className="options-list">
              <button className="option-row" onClick={() => alert("Kişileri etiketle yakında!")}>
                <div className="option-icon-text">
                  <TagPeopleIcon />
                  <span>Kişileri etiketle</span>
                </div>
                <ChevronRightIcon />
              </button>

              <button className="option-row" onClick={() => alert("Konum ekle yakında!")}>
                <div className="option-icon-text">
                  <LocationIcon />
                  <span>Konum ekle</span>
                </div>
                <ChevronRightIcon />
              </button>
            </div>

            {hataMesaji && <p className="error-message">{hataMesaji}</p>}
          </main>

          <footer className="share-screen-footer">
            <button className="footer-btn" disabled={isUploading}>
              Taslağı Kaydet
            </button>
            <button className="footer-btn primary" onClick={handlePaylas} disabled={isUploading}>
              Paylaş
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}

export default NewClipMobile;
