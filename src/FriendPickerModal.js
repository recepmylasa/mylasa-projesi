import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import './FriendPickerModal.css';

const CheckIcon = () => <svg height="16" viewBox="0 0 24 24" width="16" fill="white"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"></path></svg>;
const CloseIcon = () => <svg height="24" viewBox="0 0 24 24" width="24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>;

function FriendPickerModal({ currentUser, onSave, onClose }) {
    const [friends, setFriends] = useState([]);
    const [selectedFriends, setSelectedFriends] = useState(currentUser?.sharingWhitelist || []);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFriends = async () => {
            if (!currentUser) {
                setLoading(false);
                return;
            }

            const friendUIDs = Array.isArray(currentUser.takipEdilenler) ? currentUser.takipEdilenler : [];
            if (friendUIDs.length === 0) {
                setLoading(false);
                return;
            }

            // ÖNEMLİ GÜVENLİK GÜNCELLEMESİ: Firestore 'in' sorguları en fazla 10 argüman alabilir.
            // Hata almamak için listeyi ilk 10 ile sınırlıyoruz.
            const idsForQuery = friendUIDs.slice(0, 10);

            const friendsQuery = query(collection(db, "users"), where("uid", "in", idsForQuery));
            const querySnapshot = await getDocs(friendsQuery);
            const friendsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFriends(friendsData);
            setLoading(false);
        };
        fetchFriends();
    }, [currentUser]);

    const handleToggleFriend = (friendId) => {
        setSelectedFriends(prev => 
            prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId]
        );
    };

    const handleSave = () => {
        onSave(selectedFriends);
    };

    return (
        <div className="fp-modal-overlay">
            <div className="fp-modal-content" onClick={e => e.stopPropagation()}>
                <header className="fp-header">
                    <button onClick={onClose} className="fp-close-btn"><CloseIcon /></button>
                    <h3>Konumunu Paylaş</h3>
                    <div></div>
                </header>
                <div className="fp-friend-list">
                    {loading ? <p>Yükleniyor...</p> : friends.map(friend => (
                        <div 
                            key={friend.uid} 
                            className={`fp-friend-item ${selectedFriends.includes(friend.uid) ? 'selected' : ''}`}
                            onClick={() => handleToggleFriend(friend.uid)}
                        >
                            <img src={friend.profilFoto} alt={friend.kullaniciAdi} className="fp-friend-avatar" />
                            <div className="fp-friend-info">
                                <span>{friend.kullaniciAdi}</span>
                                <p>{friend.adSoyad}</p>
                            </div>
                            <div className="fp-checkbox">
                                {selectedFriends.includes(friend.uid) && <CheckIcon />}
                            </div>
                        </div>
                    ))}
                </div>
                <footer className="fp-footer">
                    <button onClick={handleSave} className="fp-save-btn">Bitti</button>
                </footer>
            </div>
        </div>
    );
}

export default FriendPickerModal;