import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import './LogoBar.css';
import { AiOutlineHeart } from 'react-icons/ai';
import { RiMessengerLine } from 'react-icons/ri';
import { IoLocationOutline } from 'react-icons/io5';

const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const APP_LOGO_URL = `${PUBLIC_URL}/logo192.png`;

function LogoBar({ onNotificationClick, onMessageClick, onLocationClick }) {
    const [hasUnread, setHasUnread] = useState(false);

    useEffect(() => {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        const q = query(
            collection(db, "notifications"),
            where("to", "==", currentUser.uid),
            where("read", "==", false)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setHasUnread(!snapshot.empty);
        });
        return () => unsubscribe();
    }, []);

    return (
        <header className="logobar-container">
            <div className="logobar-logo-container" onClick={() => window.location.reload()}>
                <img src={APP_LOGO_URL} alt="Mylasa İkon" className="logobar-logo-icon" />
                <span className="logobar-logo-text">mylasa</span>
            </div>
            
            <div className="logobar-icons-container">
                <div className="logobar-icon-wrapper">
                    <button className="logobar-icon-btn" onClick={onNotificationClick} title="Bildirimler">
                        <AiOutlineHeart className="logobar-icon" />
                    </button>
                    {hasUnread && <span className="notification-dot"></span>}
                </div>
                <button className="logobar-icon-btn" onClick={onMessageClick} title="Mesajlar">
                    <RiMessengerLine className="logobar-icon" />
                </button>
                <button className="logobar-icon-btn" onClick={onLocationClick} title="Konumlar">
                    <IoLocationOutline className="logobar-icon" />
                </button>
            </div>
        </header>
    );
}

export default LogoBar;
