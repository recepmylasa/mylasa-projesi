import React, { useState, useEffect, useRef } from 'react';
import { db, storage, auth } from './firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import './NewClipDesktop.css';

// İkonlar
const VideoIcon = () => (
  <svg aria-label="Video ikonu" fill="currentColor" height="77" role="img" viewBox="0 0 96 77" width="96"><path d="M72.2 24.2H65.5l-5.8-8.2H36.3l-5.8 8.2H23.8C15.1 24.2 8 31.3 8 40v19c0 8.7 7.1 15.8 15.8 15.8h48.5c8.7 0 15.8-7.1 15.8-15.8V40c0-8.7-7.1-15.8-15.8-15.8Zm-2.2 28.5L55 59.8V42.2l15 7.1a1 1 0 0 1 0 1.8Z"></path></svg>
);
const BackArrowIcon = () => (
  <svg aria-label="Geri" height="24" role="img" viewBox="0 0 24 24" width="24"><path d="M21 11.3H5.7l6.2-6.2c.5-.5.5-1.3 0-1.8s-1.3-.5-1.8 0l-8.1 8.1c.5.5-.5 1.3 0 1.8l8.1 8.1c.5.5 1.3 .5 1.8 0s.5-1.3 0-1.8l-6.2-6.2H21c.7 0 1.3-.6 1.3-1.3s-.6-1.3-1.3-1.3z" fill="currentColor"></path></svg>
);

function NewClipDesktop({ onClose }) {
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [step, setStep] = useState(1);
  const videoRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hataMesaji, setHataMesaji] = useState('');
  const [kullanici, setKullanici] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => { setKullanici(user); });
    return () => unsubscribe();
  }, []);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file); setVideoPreviewUrl(URL.createObjectURL(file)); setStep(2);
    } else {
      alert("Lütfen bir video dosyası seçin.");
    }
  };

  const handleGeri = () => { setStep(1); setVideoFile(null); setVideoPreviewUrl(''); };

  const handlePaylas = async () => {
    if (!kullanici || !videoFile) {
        setHataMesaji("Kullanıcı veya video dosyası bulunamadı."); return;
    }
    setIsUploading(true); setUploadProgress(0); setHataMesaji('');

    try {
        const newClipRef = doc(collection(db, "clips"));
        await setDoc(newClipRef, {
            authorId: kullanici.uid,
            aciklama: aciklama,
            tarih: serverTimestamp(),
            status: 'processing',
            begenenler: [],
            yorumlar: []
        });

        const fileExtension = videoFile.name.split('.').pop();
        
        // ***** ÇÖZÜM: Yolu güvenlik kuralına uygun hale getirmek için kullanıcı ID'si eklendi. *****
        const storagePath = `raw-uploads/${kullanici.uid}/${newClipRef.id}.${fileExtension}`;
        
        const fileRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(fileRef, videoFile);

        uploadTask.on('state_changed', 
            (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => {
                setHataMesaji(`Yükleme Hatası: ${error.code}`); setIsUploading(false);
            }, 
            () => {
                alert("Videonuz yüklendi ve arka planda işleniyor. Birkaç dakika içinde profilinizde görünecektir.");
                onClose();
            }
        );
    } catch (error) {
        setHataMesaji("Yükleme sırasında bir hata oluştu."); 
        setIsUploading(false);
    }
  };
  
  useEffect(() => { if(videoRef.current) { videoRef.current.load(); } }, [videoPreviewUrl]);

  return (
    <div className="new-clip-overlay" onClick={onClose}>
      <div className={`new-clip-modal-content step-${step}`} onClick={e => e.stopPropagation()}>
        <header className="new-clip-header">
          {step === 2 && <button onClick={handleGeri} className="header-btn back" disabled={isUploading}><BackArrowIcon /></button>}
          <h3>{step === 1 ? 'Yeni Clip Oluştur' : 'Yeni Reels videosu'}</h3>
          {step === 2 && <button onClick={handlePaylas} className="header-btn share" disabled={isUploading}>
            {isUploading ? `Yükleniyor %${uploadProgress.toFixed(0)}` : 'Paylaş'}
          </button>}
        </header>
        <div className="new-clip-body">
          {step === 1 && ( <div className="file-select-container"><input ref={fileInputRef} id="clip-upload" type="file" accept="video/*" onChange={handleFileSelect} style={{ display: 'none' }} /><VideoIcon /><p>Clips videolarını buraya sürükle</p><label onClick={() => fileInputRef.current.click()} className="file-select-btn">Bilgisayardan seç</label></div> )}
          {step === 2 && (
             <div className="clip-editor-container">
               <div className="clip-video-preview-wrapper">{videoPreviewUrl && ( <video ref={videoRef} className="clip-video-preview" autoPlay muted loop playsInline><source src={videoPreviewUrl} type={videoFile.type} /></video> )}</div>
               <div className="clip-form-section">
                   <textarea 
                       className="caption-textarea" 
                       placeholder="Açıklama ekle..." 
                       value={aciklama}
                       onChange={(e) => setAciklama(e.target.value)}
                       disabled={isUploading} 
                   />
                   {hataMesaji && <p style={{color: 'red', marginTop: '10px'}}>{hataMesaji}</p>}
               </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default NewClipDesktop;