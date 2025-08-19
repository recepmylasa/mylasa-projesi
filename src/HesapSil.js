import { useState } from 'react';
import { auth, db } from './firebase';
import { deleteUser } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';

function HesapSil({ userEmail, onLogout }) {
  const [durum, setDurum] = useState('');

  const handleDelete = async () => {
    if (!window.confirm("Hesabınızı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;
    try {
      // Firebase Auth'dan sil
      if (auth.currentUser) {
        await deleteUser(auth.currentUser);
      }
      // Firestore'dan kullanıcı bilgilerini sil
      await deleteDoc(doc(db, "users", userEmail));
      setDurum("Hesabınız silindi. Oturum kapatılıyor...");
      setTimeout(() => {
        if (onLogout) onLogout();
      }, 1200);
    } catch (err) {
      setDurum("Hesap silme başarısız: " + err.message);
    }
  };

  return (
    <div style={{margin:'2rem 0'}}>
      <button onClick={handleDelete} style={{background:'#fff0f0',color:'#be3b3b',border:'1px solid #d19797',borderRadius:'7px',padding:'8px 18px',cursor:'pointer',fontWeight:'bold'}}>Hesabımı Sil</button>
      {durum && <p style={{color:'#be3b3b'}}>{durum}</p>}
    </div>
  );
}

export default HesapSil;
