import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import './MapSettingsModal.css';

// İkonlar
const CloseIcon = () => <svg height="24" viewBox="0 0 24 24" width="24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>;
const RadioCheckedIcon = () => <svg height="24" viewBox="0 0 24 24" width="24"><circle cx="12" cy="12" r="10" stroke="#0095f6" strokeWidth="2" fill="none" /><circle cx="12" cy="12" r="5" fill="#0095f6" /></svg>;
const RadioUncheckedIcon = () => <svg height="24" viewBox="0 0 24 24" width="24"><circle cx="12" cy="12" r="10" stroke="#dbdbdb" strokeWidth="2" fill="none" /></svg>;

function MapSettingsModal({ onClose, onOpenFriendPicker }) { 
    const [sharingMode, setSharingMode] = useState('all_friends'); 
    const [isSharing, setIsSharing] = useState(true);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) { setLoading(false); return; }

        const userDocRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(userDocRef, (doc) => {
            if (doc.exists()) {
                const userData = doc.data();
                setIsSharing(userData.isSharing !== false);
                setSharingMode(userData.sharingMode || 'all_friends');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleModeChange = async (newMode) => {
        const user = auth.currentUser;
        if (!user) return;
        const userDocRef = doc(db, 'users', user.uid);

        try {
            await updateDoc(userDocRef, {
                sharingMode: newMode,
                isSharing: true, 
                sharingWhitelist: [] 
            });
            setSharingMode(newMode);
            setIsSharing(true);
        } catch (error) {
            console.error("Paylaşım modu güncellenirken hata:", error);
        }
    };
    
    const handleToggleSharing = async () => {
        const user = auth.currentUser;
        if (!user) return;
        const userDocRef = doc(db, 'users', user.uid);

        try {
            await updateDoc(userDocRef, { isSharing: !isSharing });
            setIsSharing(!isSharing);
        } catch (error) {
            console.error("Konum paylaşımı güncellenirken hata:", error);
        }
    };
    
    const isGhostMode = !isSharing;

    return (
        <div className="map-settings-overlay" onClick={onClose}>
            <div className="map-settings-modal" onClick={e => e.stopPropagation()}>
                <header className="ms-header">
                    <h2>Konum Ayarları</h2>
                    <button onClick={onClose} className="ms-close-btn"><CloseIcon /></button>
                </header>
                <div className="ms-content">
                    {loading ? <p>Yükleniyor...</p> : (
                        <>
                            <div className="ms-option-row ghost-mode">
                                <div className="option-text">
                                    <h3>Hayalet Modu</h3>
                                    <p>Etkinleştirirsen, konumun kimseyle paylaşılmaz.</p>
                                </div>
                                <label className="switch">
                                    <input type="checkbox" checked={isGhostMode} onChange={handleToggleSharing} />
                                    <span className="slider round"></span>
                                </label>
                            </div>

                            <div className={`sharing-options-container ${isGhostMode ? 'disabled' : ''}`}>
                                <button className="sharing-option" disabled={isGhostMode} onClick={() => handleModeChange('all_friends')}>
                                    <span>Arkadaşlarım</span>
                                    {sharingMode === 'all_friends' ? <RadioCheckedIcon /> : <RadioUncheckedIcon />}
                                </button>
                                <button className="sharing-option" disabled={isGhostMode} onClick={onOpenFriendPicker}>
                                    <span>Sadece Şu Arkadaşlarım...</span>
                                    {sharingMode === 'selected_friends' ? <RadioCheckedIcon /> : <RadioUncheckedIcon />}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default MapSettingsModal;