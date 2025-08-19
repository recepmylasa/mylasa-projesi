import React from 'react';
import './BottomNav.css';

import { AiFillHome, AiOutlineHome } from 'react-icons/ai';
import { RiSearchLine, RiSearchFill } from 'react-icons/ri';
import { MdOutlineAddBox } from 'react-icons/md';
import { RiMovieLine, RiMovieFill } from 'react-icons/ri';

function BottomNav({ activeTab, onTabChange, profilePic }) {
    return (
        <nav className="bottom-nav-container">
            <button onClick={() => onTabChange("home")} className="bottom-nav-btn" title="Ana Sayfa">
                {activeTab === "home" ? <AiFillHome className="nav-icon" /> : <AiOutlineHome className="nav-icon" />}
            </button>
            
            <button onClick={() => onTabChange("explore")} className="bottom-nav-btn" title="Keşfet">
                {activeTab === "explore" ? <RiSearchFill className="nav-icon" /> : <RiSearchLine className="nav-icon" />}
            </button>
            
            <button onClick={() => onTabChange("createMenu")} className="bottom-nav-btn" title="Oluştur">
                <MdOutlineAddBox className="nav-icon" />
            </button>
            
            <button onClick={() => onTabChange("clips")} className="bottom-nav-btn" title="Clips">
                {activeTab === "clips" ? <RiMovieFill className="nav-icon" /> : <RiMovieLine className="nav-icon" />}
            </button>
            
            <button onClick={() => onTabChange("profile")} className="bottom-nav-btn" title="Profil">
                {profilePic ? (
                    <img 
                        src={profilePic} 
                        alt="Profil" 
                        className={`bottom-nav-profile-pic ${activeTab === "profile" ? 'active' : ''}`} 
                    />
                ) : (
                    <div 
                        className={`bottom-nav-profile-pic ${activeTab === 'profile' ? 'active' : ''}`}
                        style={{ background: '#e0e0e0' }}
                    ></div>
                )}
            </button>
        </nav>
    );
}

export default BottomNav;
