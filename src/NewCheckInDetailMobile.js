// src/NewCheckInDetailMobile.js — TAM DOSYA

import React, { useState, useEffect } from 'react';
import './NewCheckInDetailMobile.css';
import { db, storage } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';

// İkonlar
const BackIcon = () => (
  <svg height="24" viewBox="0 0 24 24" width="24">
    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"></path>
  </svg>
);
const PhotoIcon = () => (
  <svg height="32" viewBox="0 0 24 24" width="32">
    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor"></path>
  </svg>
);

function NewCheckInDetailMobile({ selectedPlace, currentUser, onClose }) {
  const [comment, setComment] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dayanıklılık: resumable upload ilerleme/ip­tal
  const [uploadTask, setUploadTask] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Nazik geri bildirim
  const [inlineError, setInlineError] = useState('');

  // Koordinatlar: {lat, lng}
  const [coords, setCoords] = useState(null);

  // Seçilen yerden (veya cihazdan) koordinatları çıkar
  useEffect(() => {
    let revokedUrl;
    if (imagePreview) {
      revokedUrl = imagePreview;
    }
    return () => {
      try {
        if (revokedUrl) URL.revokeObjectURL(revokedUrl);
      } catch {}
      try {
        uploadTask?.cancel();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const extractCoords = async () => {
      setInlineError('');
      let c = null;
      const p = selectedPlace || {};

      // 1) Sık alan adları
      if (typeof p.lat === 'number' && typeof p.lng === 'number') {
        c = { lat: p.lat, lng: p.lng };
      } else if (
        p.location &&
        typeof p.location.lat === 'number' &&
        typeof p.location.lng === 'number'
      ) {
        c = { lat: p.location.lat, lng: p.location.lng };
      }
      // 2) Google Places detay: geometry.location
      else if (p.geometry && p.geometry.location) {
        try {
          const glat =
            typeof p.geometry.location.lat === 'function'
              ? p.geometry.location.lat()
              : p.geometry.location.lat;
        const glng =
            typeof p.geometry.location.lng === 'function'
              ? p.geometry.location.lng()
              : p.geometry.location.lng;
          if (typeof glat === 'number' && typeof glng === 'number') {
            c = { lat: glat, lng: glng };
          }
        } catch {}
      }

      // 3) Fallback: cihaz konumu
      if (!c && navigator.geolocation) {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        });
      }

      setCoords(c || null);
    };

    extractCoords();
  }, [selectedPlace]);

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const safeFileName = (name = '') =>
    String(name).replace(/\s+/g, '-').replace(/[^\w.\-]/g, '').slice(0, 120);

  const handleShare = async () => {
    setInlineError('');
    if (!currentUser) return;

    // Firestore rules gereği: placeId + coordinates zorunlu
    const placeId = (selectedPlace && (selectedPlace.place_id || selectedPlace.id)) || null;
    if (!placeId) {
      setInlineError('Yer bilgisi eksik. Lütfen aramadan bir yer seçin.');
      return;
    }
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      setInlineError('Konum alınamadı. Lütfen yeniden deneyin.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1) Opsiyonel fotoğraf yükleme (resumable + progress + iptal)
      let imageUrl = null;
      if (imageFile) {
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        };

        const compressedFile = await imageCompression(imageFile, options);
        const storageRef = ref(
          storage,
          `checkins/${currentUser.uid}/${Date.now()}-${safeFileName(compressedFile.name)}`
        );

        const task = uploadBytesResumable(storageRef, compressedFile, {
          cacheControl: 'public,max-age=31536000,immutable',
          contentType: compressedFile.type || 'image/jpeg',
        });
        setUploadTask(task);
        setUploadProgress(0);

        await new Promise((resolve, reject) => {
          task.on(
            'state_changed',
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setUploadProgress(pct);
            },
            (err) => reject(err),
            async () => {
              try {
                imageUrl = await getDownloadURL(task.snapshot.ref);
                resolve();
              } catch (e) {
                reject(e);
              }
            }
          );
        });
      }

      // 2) Firestore kaydı — rules ile birebir uyumlu
      await addDoc(collection(db, 'checkins'), {
        userId: currentUser.uid,
        placeId: String(placeId),
        placeName: selectedPlace?.name || '',
        placeAddress: selectedPlace?.address || selectedPlace?.formatted_address || '',
        // Rules: [lng, lat] sıra zorunlu
        coordinates: [coords.lng, coords.lat],
        comment: comment || '',
        imageUrl: imageUrl,
        timestamp: serverTimestamp(),
      });

      onClose && onClose();
    } catch (error) {
      console.error('Check-in paylaşılırken hata:', error);
      setInlineError('Bir hata oluştu, check-in paylaşılamadı.');
      alert('Bir hata oluştu, check-in paylaşılamadı.');
    } finally {
      try {
        uploadTask?.cancel(); // olası açık taskı kapat
      } catch {}
      setUploadTask(null);
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  const cancelUpload = () => {
    try {
      uploadTask?.cancel();
      setUploadTask(null);
      setUploadProgress(0);
    } catch {}
  };

  if (!selectedPlace) return null;

  const canShare =
    !isSubmitting &&
    (comment.trim().length > 0 || !!imageFile) &&
    !!coords &&
    !!(selectedPlace?.place_id || selectedPlace?.id);

  return (
    <div className="new-checkin-mobile-container">
      <header className="new-checkin-mobile-header">
        <button onClick={onClose} className="mobile-header-btn back-btn">
          <BackIcon />
        </button>
        <h2>Check-in</h2>
        <div className="share-wrap">
          {uploadTask && (
            <button onClick={cancelUpload} className="mobile-header-btn cancel-btn" title="Yüklemeyi iptal et">
              İptal
            </button>
          )}
          <button
            onClick={handleShare}
            className="mobile-header-btn share-btn"
            disabled={!canShare}
          >
            {isSubmitting ? 'Paylaşılıyor…' : 'Paylaş'}
          </button>
        </div>
      </header>

      <div className="new-checkin-mobile-body">
        <div className="mobile-place-info">
          <div className="place-name-detail">{selectedPlace?.name}</div>
          <div className="place-address-detail">
            {selectedPlace?.address || selectedPlace?.formatted_address}
          </div>
          {!coords && (
            <div className="coords-hint">Konum alınıyor… Lütfen birkaç saniye bekleyin.</div>
          )}
        </div>

        {inlineError && <div className="inline-error">{inlineError}</div>}

        <textarea
          className="mobile-comment-textarea"
          placeholder="Bir şeyler söyle..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        <label htmlFor="mobile-photo-upload" className="mobile-photo-upload-label">
          {imagePreview ? (
            <img src={imagePreview} alt="Önizleme" className="mobile-photo-preview" />
          ) : (
            <div className="photo-placeholder">
              <PhotoIcon />
              <span>Fotoğraf Ekle</span>
            </div>
          )}
        </label>
        <input
          id="mobile-photo-upload"
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          style={{ display: 'none' }}
        />

        {/* Yükleme ilerlemesi */}
        {uploadTask && (
          <div className="mobile-progress-wrap" aria-label="Yükleniyor">
            <div className="mobile-progress-bar" style={{ width: `${uploadProgress}%` }} />
            <div className="mobile-progress-text">%{uploadProgress}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default NewCheckInDetailMobile;
