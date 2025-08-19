import React from 'react';

// Birebir Instagram logosu (Yazı tipi yerine SVG)
// Bu, her ekranda ve cihazda mükemmel görünmesini sağlar.
export const InstagramLogo = () => (
    <svg aria-label="Instagram" fill="currentColor" height="30" role="img" viewBox="0 0 176 51" width="103">
        <path d="M116.2 0h-13.8c-7.3 0-10.4 2.2-13.1 6.3s-3.9 9.3-3.9 15.2v.1c0 6 1.2 11.1 3.9 15.2s5.8 6.3 13.1 6.3h13.8c7.3 0 10.4-2.2 13.1-6.3s3.9-9.3 3.9-15.2v-.1c0-6-1.2-11.1-3.9-15.2S123.5 0 116.2 0zm7.6 28.2c-1.8 3.2-3.6 4.1-7.6 4.1h-13.8c-4 0-5.8-1-7.6-4.1s-2.7-6.5-2.7-10.9v-.1c0-4.4.9-7.8 2.7-10.9s3.6-4.1 7.6-4.1h13.8c4 0 5.8 1 7.6 4.1s2.7 6.5 2.7 10.9v.1c0 4.4-.9 7.8-2.7 10.9zM78.3 1.6h-11v41.3h11V1.6zM53.2 1.6c-7.3 0-13.1 5.8-13.1 13.1v13.6c0 7.3 5.8 13.1 13.1 13.1s13.1-5.8 13.1-13.1V14.7c0-7.3-5.8-13.1-13.1-13.1zm0 33.7c-3.9 0-7-3.1-7-7V14.7c0-3.9 3.1-7 7-7s7 3.1 7 7v13.6c0 3.9-3.1 7-7 7zM24.8 14.7C24.8 6.6 19.3 0 12.4 0S0 6.6 0 14.7v13.5c0 8.2 5.5 14.7 12.4 14.7s12.4-6.5 12.4-14.7V14.7zm-12.4 22c-3.2 0-5.8-3.3-5.8-7.8V14.7c0-4.5 2.6-7.8 5.8-7.8s5.8 3.3 5.8 7.8v14.2c0 4.5-2.6 7.8-5.8 7.8zM153.7 1.6h-11v16.1h-1.2c-2.3-3.2-5.3-4.8-9.2-4.8-6.1 0-11.2 5.1-11.2 11.8s5.1 11.8 11.2 11.8c3.9 0 6.9-1.6 9.2-4.8h1.2v4.1h11V1.6zm-10.4 28.1c-2.5 0-4.6-2.1-4.6-4.6s2.1-4.6 4.6-4.6 4.6 2.1 4.6 4.6-2.1 4.6-4.6 4.6z"></path>
    </svg>
);


// İkonlar: Aktif durumda içi dolu, pasif durumda sadece dış çizgi.
// Bu, Instagram'ın davranışıyla birebir aynıdır.

export const HomeIcon = ({ isActive }) => (
    <svg aria-label="Ana Sayfa" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
        {isActive ? (
            <path d="M9.005 16.545a2.997 2.997 0 0 1 2.997-2.997A2.997 2.997 0 0 1 15 16.545V22h7V11.543L12 2 2 11.543V22h7.005Z"></path>
        ) : (
            <path d="M9.005 16.545a2.997 2.997 0 0 1 2.997-2.997h0A2.997 2.997 0 0 1 15 16.545V22h7V11.543l-9.5-7.125L2 11.543V22h7z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></path>
        )}
    </svg>
);

export const ExploreIcon = ({ isActive }) => (
    <svg aria-label="Keşfet" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
        {isActive ? (
             <path d="M12 18.5A6.5 6.5 0 1 1 18.5 12 6.507 6.507 0 0 1 12 18.5Zm0-11.818A5.318 5.318 0 1 0 17.318 12 5.324 5.324 0 0 0 12 6.682Z"></path>
        ) : (
            <path d="M19 10.5A8.5 8.5 0 1 1 10.5 2a8.5 8.5 0 0 1 8.5 8.5Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
        )}
    </svg>
);

export const MessagesIcon = () => (
    <svg aria-label="Mesajlar" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
        <path d="M12.003 2.001a9.99 9.99 0 1 1 0 19.98 9.99 9.99 0 0 1 0-19.98Zm-3.415 12.432 4.483-4.483a1.001 1.001 0 0 0-1.417-1.416l-4.483 4.483a1.001 1.001 0 0 0 1.417 1.416Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></path>
    </svg>
);


export const NotificationsIcon = ({ isActive }) => (
    <svg aria-label="Bildirimler" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
        {isActive ? (
            <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.227-5.004 4.406-7.504 4.406S.204 19.42.204 16.643s2.59-4.959 5.224-4.959a4.96 4.96 0 0 1 3.708 1.588 4.96 4.96 0 0 1 3.708-1.588Z"></path>
        ) : (
            <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.227-5.004 4.406-7.504 4.406-2.634 0-5.224-2.173-5.224-4.959s2.59-4.959 5.224-4.959a4.96 4.96 0 0 1 3.708 1.588 4.96 4.96 0 0 1 3.708-1.588Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></path>
        )}
    </svg>
);

export const CreateIcon = () => (
    <svg aria-label="Oluştur" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
        <path d="M2 12h20M12 2v20" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
    </svg>
);

export const ProfileIcon = ({ profilePic, isActive }) => (
    profilePic ?
    <img 
        src={profilePic} 
        alt="Profil" 
        style={{
            width: 28, 
            height: 28, 
            borderRadius: '50%', 
            outline: isActive ? '2px solid #262626' : 'none',
            outlineOffset: '2px'
        }} 
    /> :
    <svg aria-label="Profil" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
        <circle cx="12" cy="12" fill="none" r="10.5" stroke="currentColor" strokeWidth="2"></circle>
        <path d="M18.793 20.014a6 6 0 0 0-13.586 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2"></path>
    </svg>
);
