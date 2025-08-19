import React from 'react';
import './UserPosts.css';

const LikeIconOverlay = () => ( <svg aria-label="Beğen" height="20" role="img" viewBox="0 0 48 48" width="20" fill="white"><path d="M34.3 3.5C27.2 3.5 24 8.25 24 8.25S20.8 3.5 13.7 3.5C8.5 3.5 0 9.8 0 17.5 0 25.8 12 34.8 24 44.2 36 34.8 48 25.8 48 17.5 48 9.8 39.5 3.5 34.3 3.5Z" /></svg> );
const CommentIconOverlay = () => ( <svg aria-label="Yorum" height="20" role="img" viewBox="0 0 24 24" width="20" fill="white"><path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" stroke="white" strokeWidth="2" strokeLinejoin="round"></path></svg> );
const ClipIconGrid = () => ( <svg aria-label="Reels" color="rgb(255, 255, 255)" fill="rgb(255, 255, 255)" height="18" role="img" viewBox="0 0 24 24" width="18"><path d="M12.003 2.001a2.75 2.75 0 0 1 2.75 2.75v14.5a2.75 2.75 0 0 1-5.5 0V4.75a2.75 2.75 0 0 1 2.75-2.75Zm0-2a4.75 4.75 0 0 0-4.75 4.75v14.5a4.75 4.75 0 0 0 9.5 0V4.75a4.75 4.75 0 0 0-4.75-4.75Z"></path><path d="M9.252 19.752a2.75 2.75 0 0 1-2.75-2.75V4.75a2.75 2.75 0 0 1 5.5 0v12.252a2.75 2.75 0 0 1-2.75 2.75Zm0-17.5a4.75 4.75 0 0 0-4.75 4.75v12.252a4.75 4.75 0 0 0 9.5 0V4.75a4.75 4.75 0 0 0-4.75-4.75Z" transform="rotate(90 12.002 12.002)"></path></svg> );

// Video dosyası mı diye kontrol fonksiyonu
function isVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
}

function UserPosts({ content, onPostClick }) {
    if (!content) {
        return <div className="user-posts-message"><span>Yükleniyor...</span></div>;
    }

    if (content.length === 0) {
        return (
            <div className="user-posts-message">
                <span className="icon">📷</span>
                <div>Henüz Paylaşım Yok</div>
            </div>
        );
    }

    return (
        <div className="user-posts-grid">
            {content.map(item => {
                // **YAPISAL DÜZELTME:** Hem 'mediaUrl' (klipler için) hem de 'imageUrl' (gönderiler için) alanlarını kontrol et.
                const url = item.mediaUrl || item.imageUrl;
                
                // Güvenlik kontrolü: Eğer bir sebepten ötürü URL bulunamazsa, o öğeyi render etme.
                if (!url) {
                    return null;
                }

                // Geliştirilmiş kontrol: Hem veritabanı tipine hem de URL uzantısına bakarak karar ver.
                const isClip = item.type === 'clip' || isVideoUrl(url);

                return (
                    <div 
                        key={item.id} 
                        className="post-grid-item"
                        onClick={() => onPostClick && onPostClick(item)} 
                        title="İçeriği gör"
                    >
                        {isClip ? (
                            <video 
                                src={url} 
                                className="post-grid-image" 
                                muted 
                                playsInline 
                                preload="metadata"
                            >
                                Tarayıcınız video formatını desteklemiyor.
                            </video>
                        ) : (
                            <img src={url} alt={item.aciklama || 'gönderi'} className="post-grid-image" />
                        )}

                        {isClip && (
                            <div className="post-grid-icon-wrapper">
                                <ClipIconGrid />
                            </div>
                        )}

                        <div className="post-grid-overlay">
                            <div className="overlay-stat">
                                <LikeIconOverlay />
                                <span>{item.begenenler?.length || 0}</span>
                            </div>
                            <div className="overlay-stat">
                                <CommentIconOverlay />
                                <span>{item.yorumlar?.length || 0}</span>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    );
}

export default UserPosts;