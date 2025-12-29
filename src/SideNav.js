import React from 'react';
import './SideNav.css';

import { AiFillHome, AiOutlineHome } from 'react-icons/ai';
import { MdOutlineExplore, MdExplore } from 'react-icons/md';
import { IoLocationOutline, IoLocationSharp } from 'react-icons/io5';
import { RiMovieLine, RiMovieFill } from 'react-icons/ri';
import { FiSend } from 'react-icons/fi';
import { AiOutlineHeart, AiFillHeart } from 'react-icons/ai';
import { CgAddR } from 'react-icons/cg';
import { CgMoreO } from 'react-icons/cg';

const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const APP_LOGO_URL = `${PUBLIC_URL}/logo192.png`;

function SideNav({ activeTab, onTabChange, profilePic }) {
    
    const navLinks = [
        { id: 'home', text: 'Ana Sayfa', icon: <AiOutlineHome />, activeIcon: <AiFillHome /> },
        { id: 'explore', text: 'Keşfet', icon: <MdOutlineExplore />, activeIcon: <MdExplore /> },
        { id: 'map', text: 'Konumlar', icon: <IoLocationOutline />, activeIcon: <IoLocationSharp /> },
        { id: 'clips', text: 'Reels', icon: <RiMovieLine />, activeIcon: <RiMovieFill /> },
        { id: 'messages', text: 'Mesajlar', icon: <FiSend />, activeIcon: <FiSend style={{ transform: 'rotate(20deg)' }} /> },
        { id: 'notifications', text: 'Bildirimler', icon: <AiOutlineHeart />, activeIcon: <AiFillHeart /> },
        { id: 'createMenu', text: 'Oluştur', icon: <CgAddR />, activeIcon: <CgAddR /> },
        { id: 'profile', text: 'Profil', profile: true },
    ];

    return (
        <nav className="sidenav-container">
            <div className="sidenav-logo-container" onClick={() => window.location.reload()}>
                <img src={APP_LOGO_URL} alt="Mylasa İkon" className="sidenav-logo-icon" />
                <span className="sidenav-logo-text">mylasa</span>
            </div>

            <ul className="sidenav-links">
                {navLinks.map(link => (
                    <li key={link.id}>
                        <a onClick={() => onTabChange(link.id)} className={`sidenav-link ${activeTab === link.id ? 'active' : ''}`}>
                            <span className="sidenav-icon">
                                {link.profile ? (
                                    profilePic
                                        ? <img src={profilePic} alt="Profil" className="bottom-nav-profile-pic" />
                                        : <div className="bottom-nav-profile-pic" style={{ background: '#e0e0e0' }}></div>
                                ) : (
                                    activeTab === link.id ? link.activeIcon : link.icon
                                )}
                            </span>
                            <span className="sidenav-text">{link.text}</span>
                        </a>
                    </li>
                ))}
            </ul>

            <div className="sidenav-more">
                <a className="sidenav-link">
                    <span className="sidenav-icon"><CgMoreO /></span>
                    <span className="sidenav-text">Daha fazla</span>
                </a>
            </div>
        </nav>
    );
}

export default SideNav;
