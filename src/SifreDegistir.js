import { useState } from 'react';
import { auth } from './firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

function SifreDegistir({ email }) {
  const [gonderildi, setGonderildi] = useState(false);
  const [hata, setHata] = useState('');

  const handleSifreReset = async (e) => {
    e.preventDefault();
    setHata('');
    try {
      await sendPasswordResetEmail(auth, email);
      setGonderildi(true);
    } catch (err) {
      setHata('Hata: ' + err.message);
    }
  };

  if (gonderildi) {
    return <p style={{color:'green'}}>Şifre sıfırlama e-postası gönderildi! (Lütfen e-postanı kontrol et)</p>;
  }

  return (
    <form onSubmit={handleSifreReset} style={{margin:'1.3rem 0',display:'flex',gap:'1rem',alignItems:'center'}}>
      <button type="submit" style={{background:'#f7e1c8',color:'#b7521e',border:'1px solid #e7c8b1',borderRadius:'7px',padding:'6px 18px',cursor:'pointer',fontWeight:'bold'}}>Şifremi Sıfırla</button>
      {hata && <span style={{color:'red'}}>{hata}</span>}
    </form>
  );
}

export default SifreDegistir;
