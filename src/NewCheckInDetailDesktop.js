import React, { useState } from 'react';
// DÜZELTME: Doğru CSS dosyasını import et
import './NewCheckInDetailDesktop.css'; 
import { db, storage } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';

// İkonlar
const CloseIcon = () => <svg height="24" viewBox="0 0 24 24" width="24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>;
const PhotoIcon = () => <svg height="48" viewBox="0 0 24 24" width="48"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor"></path></svg>;

function NewCheckInDetailDesktop({ selectedPlace, currentUser, onClose }) {
    const [comment, setComment] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleShare = async () => {
        if (!currentUser || !selectedPlace) {
            alert("Kullanıcı veya mekan bilgisi eksik.");
            return;
        }
        setIsSubmitting(true);
        try {
            let imageUrl = null;
            if (imageFile) {
                const options = {
                  maxSizeMB: 1,
                  maxWidthOrHeight: 1920,
                  useWebWorker: true,
                };
                const compressedFile = await imageCompression(imageFile, options);
                const storageRef = ref(storage, `checkins/${currentUser.uid}/${Date.now()}-${compressedFile.name}`);
                const snapshot = await uploadBytes(storageRef, compressedFile);
                imageUrl = await getDownloadURL(snapshot.ref);
            }
            await addDoc(collection(db, 'checkins'), {
                userId: currentUser.uid,
                placeId: selectedPlace.id,
                placeName: selectedPlace.name,
                placeAddress: selectedPlace.address,
                comment: comment,
                imageUrl: imageUrl,
                timestamp: serverTimestamp()
            });
            onClose();
        } catch (error) {
            console.error("Check-in paylaşılırken hata oluştu:", error);
            alert("Bir hata oluştu, check-in paylaşılamadı.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!selectedPlace) return null;

    return (
        <div className="new-checkin-detail-overlay" onClick={onClose}>
            <div className="new-checkin-detail-content" onClick={e => e.stopPropagation()}>
                <header className="new-checkin-detail-header">
                    <button onClick={onClose} className="new-checkin-detail-close-btn"><CloseIcon /></button>
                    <h2>Check-in</h2>
                    <button onClick={handleShare} className="new-checkin-detail-share-btn" disabled={isSubmitting || (!comment && !imageFile)}>
                        {isSubmitting ? 'Paylaşılıyor...' : 'Paylaş'}
                    </button>
                </header>
                
                <div className="new-checkin-detail-body">
                    <div className="place-info-header">
                        <div className="place-name-detail">{selectedPlace.name}</div>
                        <div className="place-address-detail">{selectedPlace.address}</div>
                    </div>
                    <textarea
                        className="comment-textarea"
                        placeholder="Bir şeyler söyle..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                    />
                    <div className="photo-upload-container">
                        {imagePreview ? (
                            <img src={imagePreview} alt="Önizleme" className="photo-preview" />
                        ) : (
                            <label htmlFor="photo-upload" className="photo-upload-label">
                                <PhotoIcon />
                                <span>Fotoğraf Ekle</span>
                            </label>
                        )}
                        <input
                            id="photo-upload"
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default NewCheckInDetailDesktop;