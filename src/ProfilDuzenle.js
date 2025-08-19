import React, { useState, useEffect, useRef } from 'react';
import { auth, db, storage } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
// YENİ: Fotoğraf sıkıştırma kütüphanesini import ediyoruz.
import imageCompression from 'browser-image-compression';
import './ProfilDuzenle.css';

// Menü ikonları
const EditProfileIcon = () => <svg aria-label="Profili Düzenle" height="24" role="img" viewBox="0 0 24 24" width="24"><path d="M12 1a4 4 0 1 0 4 4 4 4 0 0 0-4-4Zm0 7a3 3 0 1 1 3-3 3 3 0 0 1-3 3Zm6.5 2.5a5.5 5.5 0 1 0-5.5 5.5h1.1a5.5 5.5 0 0 0 4.4-2.2 5.4 5.4 0 0 0 0-6.6Z"></path></svg>;
const ChangePasswordIcon = () => <svg aria-label="Şifre Değiştir" height="24" role="img" viewBox="0 0 24 24" width="24"><path d="M18 7.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1V6a5 5 0 0 1 10 0v1.5h1Zm-2 0V6a3 3 0 0 0-6 0v1.5h6Z"></path></svg>;

// Ana Bileşen
function ProfilDuzenle({ currentUserData, onClose }) {
    const [activeTab, setActiveTab] = useState('editProfile'); 
    const [adSoyad, setAdSoyad] = useState("");
    const [kullaniciAdi, setKullaniciAdi] = useState("");
    const [website, setWebsite] = useState("");
    const [bio, setBio] = useState("");
    const [profilFotoDosyasi, setProfilFotoDosyasi] = useState(null);
    const [profilFotoOnizleme, setProfilFotoOnizleme] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    // YENİ: Sıkıştırma durumu için state
    const [isCompressing, setIsCompressing] = useState(false);

    const fileInputRef = useRef(null);

    useEffect(() => {
        if (currentUserData) {
            setAdSoyad(currentUserData.adSoyad || "");
            setKullaniciAdi(currentUserData.kullaniciAdi || "");
            setWebsite(currentUserData.website || "");
            setBio(currentUserData.bio || "");
            setProfilFotoOnizleme(currentUserData.profilFoto || null);
        }
    }, [currentUserData]);

    // YENİ: Fonksiyon 'async' oldu ve sıkıştırma mantığı eklendi.
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        console.log(`Orijinal profil fotoğrafı seçildi: ${file.name}, Boyut: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
        setIsCompressing(true);
        setSaveMessage(''); // Mesajları temizle

        const options = {
            maxSizeMB: 0.5, // Profil fotoğrafları daha küçük olabilir, 0.5MB yeterli
            maxWidthOrHeight: 800, // 800px ideal
            useWebWorker: true,
        };

        try {
            const compressedFile = await imageCompression(file, options);
            console.log(`Sıkıştırılmış profil fotoğrafı hazır: ${compressedFile.name}, Boyut: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
            
            setProfilFotoDosyasi(compressedFile); // Kaydedilecek dosya olarak SIKIŞTIRILMIŞ olanı ayarla
            setProfilFotoOnizleme(URL.createObjectURL(compressedFile)); // Önizlemeyi de güncelle
        } catch (error) {
            console.error("Profil fotoğrafı sıkıştırılırken hata:", error);
            setSaveMessage("Fotoğraf işlenemedi.");
            setProfilFotoDosyasi(file); // Hata olursa orijinali kullan
            setProfilFotoOnizleme(URL.createObjectURL(file));
        } finally {
            setIsCompressing(false);
        }
    };

    const handleKaydet = async (e) => {
        e.preventDefault();
        if (!currentUserData) return;
        
        setIsSaving(true);
        setSaveMessage('');

        try {
            let fotoURL = profilFotoOnizleme || "";
            // Sadece yeni bir dosya seçildiyse (yani profilFotoDosyasi state'i doluysa) yükleme yap
            if (profilFotoDosyasi) {
                console.log(`Profil fotoğrafı yükleniyor. Boyut: ${(profilFotoDosyasi.size / 1024 / 1024).toFixed(2)} MB`);
                const storageRef = ref(storage, `profile_photos/${currentUserData.uid}/profile_photo_${Date.now()}`);
                // Yüklenecek dosya artık sıkıştırılmış dosya
                await uploadBytes(storageRef, profilFotoDosyasi);
                fotoURL = await getDownloadURL(storageRef);
            }
            
            const userDocRef = doc(db, "users", currentUserData.uid);
            const guncelVeri = { 
                ...currentUserData, 
                adSoyad, 
                kullaniciAdi, 
                website,
                bio, 
                profilFoto: fotoURL 
            };
            await setDoc(userDocRef, guncelVeri, { merge: true });

            if (auth.currentUser) {
                await updateProfile(auth.currentUser, { 
                    displayName: kullaniciAdi,
                    photoURL: fotoURL 
                });
            }

            setSaveMessage("Profil başarıyla güncellendi!");
            setTimeout(() => {
                setSaveMessage('');
                onClose();
            }, 1500);

        } catch (err) {
            console.error("Profil güncelleme hatası:", err);
            setSaveMessage('Hata oluştu: ' + err.message);
        } finally {
            setTimeout(() => setIsSaving(false), 1500);
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'editProfile':
                return (
                    <form onSubmit={handleKaydet} className="pe-form">
                        <div className="pe-form-group photo-group">
                            <div className="pe-label">
                                <img 
                                    src={profilFotoOnizleme || 'https://placehold.co/40x40/e0e0e0/e0e0e0?text=?'} 
                                    alt="Profil" 
                                    className="pe-avatar"
                                />
                            </div>
                            <div className="pe-input">
                                <span className="pe-username">{currentUserData?.kullaniciAdi || "Kullanıcı"}</span>
                                <button type="button" className="pe-photo-change-btn" onClick={() => fileInputRef.current.click()} disabled={isCompressing}>
                                    {isCompressing ? 'İşleniyor...' : 'Profil fotoğrafını değiştir'}
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{display: 'none'}}/>
                            </div>
                        </div>

                        <div className="pe-form-group">
                            <label htmlFor="website" className="pe-label">İnternet sitesi</label>
                            <div className="pe-input">
                                <input id="website" type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="İnternet sitesi" />
                                <p className="pe-helper-text">Bağlantıların yalnızca mobil cihazlarda tıklanabilir olacaktır.</p>
                            </div>
                        </div>

                        <div className="pe-form-group">
                            <label htmlFor="bio" className="pe-label">Biyografi</label>
                            <div className="pe-input">
                                <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows="3" />
                            </div>
                        </div>

                        <div className="pe-form-group">
                            <label htmlFor="adSoyad" className="pe-label">Ad Soyad</label>
                            <div className="pe-input">
                                <input id="adSoyad" type="text" value={adSoyad} onChange={(e) => setAdSoyad(e.target.value)} placeholder="Ad Soyad" />
                                <p className="pe-helper-text">İnsanların ad, soyad veya takma ad gibi bilinen adlarını kullanarak hesabını bulmasına yardımcı ol.</p>
                            </div>
                        </div>
                        
                        <div className="pe-form-group submit-group">
                            <div className="pe-label"></div>
                            <div className="pe-input">
                                <button type="submit" className="pe-submit-btn" disabled={isSaving || isCompressing}>
                                    {isSaving ? 'Kaydediliyor...' : 'Gönder'}
                                </button>
                                {saveMessage && <span className="pe-save-message">{saveMessage}</span>}
                            </div>
                        </div>
                    </form>
                );
            case 'changePassword':
                return (
                    <div className="pe-placeholder-content">
                        <h2>Şifre Değiştir</h2>
                        <p>Bu özellik yakında eklenecektir.</p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="pe-overlay" onClick={onClose}>
            <div className="pe-container" onClick={e => e.stopPropagation()}>
                <div className="pe-mobile-header">
                    <button onClick={onClose} className="pe-mobile-header-btn cancel">Vazgeç</button>
                    <h1 className="pe-mobile-header-title">Profili Düzenle</h1>
                    <button onClick={handleKaydet} className="pe-mobile-header-btn done" disabled={isSaving || isCompressing}>
                        {isSaving ? '...' : 'Bitti'}
                    </button>
                </div>

                <div className="pe-sidebar">
                    <button 
                        className={`pe-menu-item ${activeTab === 'editProfile' ? 'active' : ''}`}
                        onClick={() => setActiveTab('editProfile')}
                    >
                        <EditProfileIcon />
                        <span>Profili Düzenle</span>
                    </button>
                    <button 
                        className={`pe-menu-item ${activeTab === 'changePassword' ? 'active' : ''}`}
                        onClick={() => setActiveTab('changePassword')}
                    >
                        <ChangePasswordIcon />
                        <span>Şifre Değiştir</span>
                    </button>
                </div>

                <div className="pe-content">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}

export default ProfilDuzenle;
