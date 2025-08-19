import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import './AvatarModal.css';

// Liste 9 avatara güncellendi
const avatarOptions = [
    '/avatars/avatar 1.png', '/avatars/avatar 2.png', '/avatars/avatar 3.png',
    '/avatars/avatar 4.png', '/avatars/avatar 5.png', '/avatars/avatar 6.png',
    '/avatars/avatar 7.png', '/avatars/avatar 8.png', '/avatars/avatar 9.png'
];

function AvatarModal({ onClose }) {
    const [isSaving, setIsSaving] = useState(false);
    const [currentUserAvatar, setCurrentUserAvatar] = useState('');

    // YENİ: Kullanıcının mevcut avatarını veritabanından dinle
    useEffect(() => {
        const currentUser = auth.currentUser;
        if (currentUser) {
            const userDocRef = doc(db, "users", currentUser.uid);
            const unsubscribe = onSnapshot(userDocRef, (doc) => {
                if (doc.exists() && doc.data().avatarUrl) {
                    setCurrentUserAvatar(doc.data().avatarUrl);
                }
            });
            return () => unsubscribe(); // Component kapandığında dinleyiciyi kaldır
        }
    }, []);

    const handleAvatarSelect = async (avatarUrl) => {
        const currentUser = auth.currentUser;
        if (!currentUser || isSaving) return;

        setIsSaving(true);
        try {
            const userDocRef = doc(db, "users", currentUser.uid);
            await updateDoc(userDocRef, {
                avatarUrl: avatarUrl
            });
            onClose();
        } catch (error) {
            console.error("Avatar güncellenirken hata oluştu:", error);
            alert("Bir hata oluştu, lütfen tekrar deneyin.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="avatar-modal-overlay" onClick={onClose}>
            <div className="avatar-modal-content" onClick={e => e.stopPropagation()}>
                <h3>Avatarını Seç</h3>
                <div className="avatar-gallery">
                    {avatarOptions.map(avatar => (
                        // YENİ: Seçili avatara özel 'selected' class'ı ekleniyor
                        <div 
                            key={avatar} 
                            className={`avatar-option-wrapper ${currentUserAvatar === avatar ? 'selected' : ''}`} 
                            onClick={() => handleAvatarSelect(avatar)}
                        >
                            <img
                                src={avatar}
                                alt="Avatar Seçeneği"
                                className="avatar-option-image"
                            />
                        </div>
                    ))}
                </div>
                {isSaving && <p className="saving-text">Kaydediliyor...</p>}
            </div>
        </div>
    );
}

export default AvatarModal;