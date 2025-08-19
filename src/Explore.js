import { useEffect, useState, useCallback } from 'react';
import { db } from './firebase';
import { collection, query, getDocs, where, orderBy, limit } from 'firebase/firestore';
import PostDetailModal from './PostDetailModal';
import './Explore.css';

// --- İkonlar ---
const LikeIconOverlay = () => ( <svg aria-label="Beğen" height="20" role="img" viewBox="0 0 48 48" width="20" fill="white"><path d="M34.3 3.5C27.2 3.5 24 8.25 24 8.25S20.8 3.5 13.7 3.5C8.5 3.5 0 9.8 0 17.5 0 25.8 12 34.8 24 44.2 36 34.8 48 25.8 48 17.5 48 9.8 39.5 3.5 34.3 3.5Z" /></svg> );
const CommentIconOverlay = () => ( <svg aria-label="Yorum" height="20" role="img" viewBox="0 0 24 24" width="20" fill="white"><path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" stroke="white" strokeWidth="2" strokeLinejoin="round"></path></svg> );
// ----------------

function Explore({ aktifKullaniciId, onUserClick }) {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPost, setSelectedPost] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // --- NİHAİ VE SAĞLAM ARAMA ALGORİTMASI ---
    useEffect(() => {
        const searchUsers = async () => {
            if (searchTerm.trim() === '') {
                setSearchResults([]);
                setIsSearching(false);
                return;
            }
            setIsSearching(true);
            
            try {
                const usersRef = collection(db, "users");
                // Arama metninin sadece ilk kelimesini alıyoruz, çünkü Firestore sadece baştan arama yapabilir.
                const ilkKelime = searchTerm.split(' ')[0];
                const aramaMetniLower = ilkKelime.toLowerCase();
                const aramaMetniCapitalized = ilkKelime.charAt(0).toUpperCase() + ilkKelime.slice(1).toLowerCase();
                
                // Map kullanarak sonuçları birleştirmek daha güvenli ve verimli.
                const allResults = new Map();

                // Sorgu 1: Kullanıcı adına göre (küçük harf)
                try {
                    const usernameQuery = query(
                        usersRef, 
                        where("kullaniciAdi", ">=", aramaMetniLower),
                        where("kullaniciAdi", "<=", aramaMetniLower + '\uf8ff'),
                        limit(10)
                    );
                    const usernameSnapshot = await getDocs(usernameQuery);
                    usernameSnapshot.docs.forEach(doc => {
                        const data = doc.data();
                        allResults.set(data.uid, { id: doc.id, ...data });
                    });
                } catch (error) {
                    console.error("Kullanıcı adı araması başarısız, ama devam ediliyor:", error);
                }

                // Sorgu 2: Ad Soyada göre (Büyük harfle başlayabilir)
                try {
                    const fullNameQuery = query(
                        usersRef,
                        where("adSoyad", ">=", aramaMetniCapitalized),
                        where("adSoyad", "<=", aramaMetniCapitalized + '\uf8ff'),
                        limit(10)
                    );
                    const fullNameSnapshot = await getDocs(fullNameQuery);
                    fullNameSnapshot.docs.forEach(doc => {
                        const data = doc.data();
                        allResults.set(data.uid, { id: doc.id, ...data });
                    });
                } catch (error) {
                    console.error("Ad Soyad araması başarısız, ama devam ediliyor:", error);
                }

                // Map'teki birleştirilmiş ve tekilleştirilmiş sonuçları diziye çevir
                setSearchResults(Array.from(allResults.values()));

            } catch (error) {
                console.error("Genel arama hatası:", error);
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        const delayDebounceFn = setTimeout(() => { searchUsers(); }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm]);


    // Keşfet gönderilerini yükleme
    const fetchInitialPosts = useCallback(async () => {
        setLoading(true);
        const postsRef = collection(db, "posts");
        const q = query(postsRef, orderBy("tarih", "desc"), limit(21));
        const documentSnapshots = await getDocs(q);
        const initialPosts = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPosts(initialPosts);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchInitialPosts();
    }, [fetchInitialPosts]);

    return (
        <>
            <div className="explore-container">
                <div className="search-bar-wrapper">
                    <div className="search-bar-container">
                        <input 
                            type="text" 
                            placeholder="Ara..." 
                            className="search-input" 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                        />
                    </div>
                </div>

                {searchTerm.trim() !== '' ? (
                    <div className="search-results-container">
                        {isSearching ? (
                            <p className="search-message">Aranıyor...</p>
                        ) : searchResults.length > 0 ? (
                            searchResults.map(user => (
                                <div key={user.uid} className="search-result-item" onClick={() => onUserClick(user.uid)}>
                                    <img src={user.profilFoto || 'https://placehold.co/44x44/e0e0e0/e0e0e0?text=?'} alt={user.kullaniciAdi} />
                                    <div className="search-result-info">
                                        <span className="username">{user.kullaniciAdi}</span>
                                        <span className="fullname">{user.adSoyad}</span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="search-message">Sonuç bulunamadı.</p>
                        )}
                    </div>
                ) : (
                    <>
                        {loading ? ( <p style={{ textAlign: 'center', marginTop: 40 }}>Keşfet yükleniyor...</p> ) : 
                         posts.length > 0 ? (
                            <div className="explore-grid">
                                {posts.map(post => (
                                    <div key={post.id} className="explore-grid-item" onClick={() => setSelectedPost(post)}>
                                        <img src={post.mediaUrl} alt="Keşfet gönderisi" className="explore-grid-image" />
                                        <div className="explore-grid-overlay">
                                            <div className="explore-overlay-stat"><LikeIconOverlay /><span>{post.begenenler?.length || 0}</span></div>
                                            <div className="explore-overlay-stat"><CommentIconOverlay /><span>{post.yorumlar?.length || 0}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (<p style={{ textAlign: 'center', marginTop: 40 }}>Keşfedecek yeni bir şey yok.</p>)}
                    </>
                )}
            </div>

            {selectedPost && (
                <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} aktifKullaniciId={aktifKullaniciId} />
            )}
        </>
    );
}

export default Explore;
