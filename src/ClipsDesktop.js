import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import './Clips.css'; // Masaüstü de aynı stil dosyasını kullanacak

// --- İkonlar ---
const LikeIcon = () => <svg aria-label="Beğen" height="24" role="img" viewBox="0 0 24 24" width="24"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-6.03 8.318-3.377 3.358-4.996 4.977-5.47 5.449a.748.748 0 0 1-1.06 0c-.474-.472-1.593-2.09-4.97-5.449-3.378-3.359-6.03-5.246-6.03-8.318a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 4.23 2.91 6.226 6.745 9.885.38.365.455.44.515.483a1.748 1.748 0 0 0 2.48 0c.06-.043.135-.118.515-.483 3.835-3.659 6.745-5.655 6.745-9.885A6.985 6.985 0 0 0 16.792 1.904Z" fill="currentColor"></path></svg>;
const CommentIcon = () => <svg aria-label="Yorum Yap" height="24" role="img" viewBox="0 0 24 24" width="24"><path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></path></svg>;
const ShareIcon = () => <svg aria-label="Gönder" height="24" role="img" viewBox="0 0 24 24" width="24"><line fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" x1="22" x2="9.218" y1="3" y2="10.083"></line><polygon fill="none" points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334" stroke="currentColor" strokeLinejoin="round" strokeWidth="2"></polygon></svg>;

function Clip({ clipData }) {
    const [isPlaying, setIsPlaying] = useState(true);
    const [author, setAuthor] = useState(null);
    const videoRef = useRef(null);

    useEffect(() => {
        const fetchAuthorData = async () => {
            if (clipData.authorId) {
                const userDocRef = doc(db, "users", clipData.authorId);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    setAuthor(userDocSnap.data());
                }
            }
        };
        fetchAuthorData();
    }, [clipData.authorId]);

    const handleVideoClick = () => {
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play();
            setIsPlaying(true);
        }
    };

    return (
        <div className="clip-video-container">
            <video
                ref={videoRef}
                className="clip-video"
                src={clipData.mediaUrl}
                autoPlay
                muted
                loop
                playsInline
                onClick={handleVideoClick}
            />
            {/* Masaüstünde bu arayüz gizli olacak (CSS ile) */}
            <div className="clip-ui-overlay">
                <div className="clip-actions">
                    <button className="clip-action-btn"><LikeIcon /></button>
                    <button className="clip-action-btn"><CommentIcon /></button>
                    <button className="clip-action-btn"><ShareIcon /></button>
                </div>
                <div className="clip-info">
                    <div className="clip-author-info">
                        <img src={author?.profilFoto || 'https://placehold.co/40x40/e0e0e0/e0e0e0?text=?'} alt={author?.kullaniciAdi} className="clip-author-avatar" />
                        <span className="clip-author-username">{author?.kullaniciAdi || '...'}</span>
                    </div>
                    <p className="clip-description">{clipData.aciklama}</p>
                </div>
            </div>
        </div>
    );
}

function ClipsDesktop() {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "clips"), orderBy("tarih", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedClips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setClips(fetchedClips);
        setLoading(false);
    }, (error) => {
        console.error("Clips çekilirken hata oluştu!", error);
        setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="clips-loading">Yükleniyor...</div>;
  }

  return (
    <div className="clips-container">
        {clips.length > 0 ? (
            clips.map(clip => <Clip key={clip.id} clipData={clip} />)
        ) : (
            <div className="clips-placeholder">
                <h1>Henüz Clip Yok</h1>
                <p>İlk Clip'i yüklemeyi dene!</p>
            </div>
        )}
    </div>
  );
}

export default ClipsDesktop;
