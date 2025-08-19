import { useState, useEffect } from 'react';
import { db, storage, auth } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import './NewPost.css';

// --- İkonlar ---
const MediaIcon = () => ( <svg aria-label="Fotoğraf ve video ikonu" fill="currentColor" height="77" role="img" viewBox="0 0 96 77" width="96"><path d="M72.2,24.2H65.5L59.7,16H36.3l-5.8,8.2H23.8C15.1,24.2,8,31.3,8,40v19c0,8.7,7.1,15.8,15.8,15.8h48.5c8.7,0,15.8-7.1,15.8-15.8V40C88,31.3,80.9,24.2,72.2,24.2z M48,64.5c-8.5,0-15.3-6.8-15.3-15.3S39.5,33.9,48,33.9s15.3,6.8,15.3,15.3S56.5,64.5,48,64.5z M78.2,33.2h-4.6c-1.1,0-2-0.9-2-2s0.9-2,2-2h4.6c1.1,0,2,0.9,2,2S79.3,33.2,78.2,33.2z"></path></svg> );
const BackArrowIcon = () => ( <svg aria-label="Geri" height="24" role="img" viewBox="0 0 24 24" width="24"><path d="M21 11.3H5.7l6.2-6.2c.5-.5.5-1.3 0-1.8s-1.3-.5-1.8 0l-8.1 8.1c-.5.5-.5 1.3 0 1.8l8.1 8.1c.5.5 1.3.5 1.8 0s.5-1.3 0-1.8l-6.2-6.2H21c.7 0 1.3-.6 1.3-1.3s-.6-1.3-1.3-1.3z" fill="currentColor"></path></svg> );

function NewPost({ onClose }) {
    console.log("--- [TEŞHİS] NewPost penceresi render edildi. ---");
    const [step, setStep] = useState(1);
    const [mesaj, setMesaj] = useState('');
    const [file, setFile] = useState(null);
    const [filePreview, setFilePreview] = useState(null);
    const [yukleniyor, setYukleniyor] = useState(false);
    const [hataMesaji, setHataMesaji] = useState('');
    const [kullanici, setKullanici] = useState(null);

    useEffect(() => {
        console.log("[TEŞHİS] Kullanıcı durumu dinleniyor...");
        const unsubscribe = auth.onAuthStateChanged(user => {
            if (user) {
                console.log("[TEŞHİS] KULLANICI GİRİŞ YAPMIŞ:", user.uid);
                setKullanici(user);
            } else {
                console.error("[TEŞHİS] !!! HATA: KULLANICI GİRİŞ YAPMAMIŞ VEYA OTURUM KAPANMIŞ!");
                setKullanici(null);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleFileSec = (e) => {
        console.log("[TEŞHİS] Dosya seçme işlemi başladı.");
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            console.log("[TEŞHİS] Dosya başarıyla seçildi:", selectedFile.name);
            setFile(selectedFile);
            setFilePreview(URL.createObjectURL(selectedFile));
            setHataMesaji('');
            setStep(2);
            console.log("[TEŞHİS] Adım 2'ye geçildi.");
        } else {
            console.warn("[TEŞHİS] Dosya seçilmeden işlem iptal edildi.");
        }
    };

    const handleGeri = () => {
        console.log("[TEŞHİS] Geri butonuna basıldı, Adım 1'e dönülüyor.");
        setStep(1);
        setFile(null);
        setFilePreview(null);
    };

    const handleSubmit = () => {
        console.log("--- [TEŞHİS] GÖNDERİ YÜKLEME SÜRECİ BAŞLADI ---");
        
        if (!kullanici) {
            console.error("[TEŞHİS] !!! KRİTİK HATA: Kullanıcı (user) state'i boş (null). Yükleme durduruldu.");
            setHataMesaji("Kullanıcı bilgisi alınamadı. Lütfen tekrar giriş yapın.");
            return;
        }
        if (!file) {
            console.error("[TEŞHİS] !!! KRİTİK HATA: Dosya (file) state'i boş (null). Yükleme durduruldu.");
            setHataMesaji("Yüklenecek dosya bulunamadı.");
            return;
        }
        
        console.log(`[TEŞHİS] 1. KONTROL BAŞARILI: Kullanıcı ID: ${kullanici.uid}, Dosya Adı: ${file.name}`);
        
        setYukleniyor(true);
        const storagePath = `post_media/${kullanici.uid}/${Date.now()}_${file.name}`;
        const fileRef = ref(storage, storagePath);
        
        console.log(`[TEŞHİS] 2. STORAGE YOLU OLUŞTURULDU: ${storagePath}`);
        console.log("[TEŞHİS] 3. YÜKLEME GÖREVİ (uploadTask) BAŞLATILIYOR...");
        
        const uploadTask = uploadBytesResumable(fileRef, file);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                // console.log(`[TEŞHİS] Yükleme ilerlemesi: ${progress}%`); // Bu çok fazla log üretebilir, şimdilik kapalı.
            }, 
            (error) => {
                console.error("[TEŞHİS] !!! KRİTİK HATA: Yükleme sırasında Firebase Storage hatası!", error.code, error.message);
                setHataMesaji(`Yükleme Hatası: ${error.code}`);
                setYukleniyor(false);
            }, 
            () => {
                console.log("[TEŞHİS] 4. YÜKLEME BAŞARILI. İndirme URL'si (downloadURL) isteniyor...");
                getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
                    console.log("[TEŞHİS] 5. URL BAŞARIYLA ALINDI:", downloadURL);
                    console.log("[TEŞHİS] 6. FIRESTORE'A KAYIT İŞLEMİ BAŞLATILIYOR...");
                    try {
                        await addDoc(collection(db, "posts"), {
                            mesaj: mesaj,
                            mediaUrl: downloadURL,
                            tarih: serverTimestamp(),
                            authorId: kullanici.uid,
                            // Diğer veriler...
                        });
                        console.log("[TEŞHİS] 7. BAŞARILI! Gönderi Firestore'a kaydedildi.");
                        onClose();
                    } catch (firestoreError) {
                        console.error("[TEŞHİS] !!! KRİTİK HATA: Firestore'a yazılırken hata oluştu!", firestoreError);
                        setHataMesaji("Veritabanına kaydederken hata oluştu.");
                        setYukleniyor(false);
                    }
                }).catch((urlError) => {
                    console.error("[TEŞHİS] !!! KRİTİK HATA: İndirme URL'si alınırken hata oluştu!", urlError);
                    setHataMesaji("Dosya URL'si alınamadı.");
                    setYukleniyor(false);
                });
            }
        );
    };

    return (
        <div className={`new-post-modal-content step-${step}`}>
            <header className="new-post-header">
                {step === 2 && <button onClick={handleGeri} className="header-btn back"><BackArrowIcon /></button>}
                <h3>Yeni gönderi oluştur</h3>
                {step === 2 && <button onClick={handleSubmit} className="header-btn share" disabled={yukleniyor}>{yukleniyor ? `Yükleniyor...` : 'Paylaş'}</button>}
            </header>
            <div className="new-post-body">
                {step === 1 ? (
                    <div className="file-select-container">
                        <MediaIcon />
                        <p>Fotoğrafları ve videoları buraya sürükle</p>
                        <label htmlFor="file-upload" className="file-select-btn">Bilgisayardan seç</label>
                        <input id="file-upload" type="file" accept="image/*,video/*" onChange={handleFileSec} style={{ display: 'none' }} />
                    </div>
                ) : (
                    <div className="caption-container">
                        <div className="caption-image-preview">
                            <img src={filePreview} alt="Önizleme" />
                        </div>
                        <div className="caption-form-section">
                            <textarea className="caption-textarea" placeholder="Açıklama yaz..." value={mesaj} onChange={(e) => setMesaj(e.target.value)} />
                            {hataMesaji && <p className="error-message">{hataMesaji}</p>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default NewPost;
