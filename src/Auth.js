import React, { useState } from 'react';
import { auth, db } from './firebase';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    updateProfile,
    deleteUser // DÜZELTME: Kullanıcı silme fonksiyonu eklendi
} from 'firebase/auth';
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'; // DÜZELTME: deleteDoc eklendi
import './Auth.css';

function Auth() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [kullaniciAdi, setKullaniciAdi] = useState('');
    const [adSoyad, setAdSoyad] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (isLogin) {
            // Giriş mantığı (basit ve doğru)
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (err) {
                setError("Giriş yapılamadı. E-posta ve şifrenizi kontrol edin.");
                console.error("Giriş Hatası: ", err);
            }
        } else {
            // DÜZELTME: Kayıt olma mantığı tamamen yeniden yazıldı
            if (password.length < 6) {
                setError("Şifre en az 6 karakter olmalıdır.");
                setLoading(false);
                return;
            }
            if (!adSoyad || !kullaniciAdi) {
                setError("Ad Soyad ve Kullanıcı Adı alanları zorunludur.");
                setLoading(false);
                return;
            }

            let tempUser = null; // Geçici olarak oluşturulan kullanıcıyı tutmak için
            const usernameDocRef = doc(db, "usernames", kullaniciAdi.toLowerCase());

            try {
                // 1. Önce kullanıcı adının alınıp alınmadığını kontrol et.
                // Bu sorgu, güvenlik kurallarımız gereği hata verecek. Bu yüzden bu mantığı değiştiriyoruz.
                
                // YENİ MANTIK:
                // 1. Önce kullanıcıyı Auth sisteminde geçici olarak oluştur.
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                tempUser = userCredential.user; // Kullanıcıyı geçici değişkene ata

                // 2. Şimdi kullanıcı "giriş yapmış" sayıldığı için, kullanıcı adını kontrol etme yetkimiz var.
                const usernameDoc = await getDoc(usernameDocRef);
                if (usernameDoc.exists()) {
                    // Bu kullanıcı adı zaten alınmış.
                    // Hatayı ayarla ve işlemi geri al.
                    setError("Bu kullanıcı adı zaten alınmış. Lütfen farklı bir ad seçin.");
                    // ÖNEMLİ: Oluşturulan geçici kullanıcıyı silerek işlemi geri al.
                    await deleteUser(tempUser);
                    setLoading(false);
                    return; // Fonksiyonu burada durdur.
                }

                // 3. Kullanıcı adı boşta. Kayıt işlemine devam et.
                // Auth profiline temel bilgileri ekle
                await updateProfile(tempUser, {
                    displayName: kullaniciAdi,
                    photoURL: "" // Başlangıçta boş
                });

                // Firestore'da 'users' koleksiyonuna profil belgesini oluştur
                const userDocRef = doc(db, "users", tempUser.uid);
                await setDoc(userDocRef, {
                    uid: tempUser.uid,
                    kullaniciAdi: kullaniciAdi,
                    adSoyad: adSoyad,
                    email: tempUser.email,
                    profilFoto: "", // Başlangıçta boş
                    bio: "",
                    takipciler: [],
                    takipEdilenler: [],
                    kayitTarihi: serverTimestamp()
                });

                // 'usernames' koleksiyonuna bu kullanıcı adını kaydet
                await setDoc(usernameDocRef, { uid: tempUser.uid });

                // Kayıt başarılı, artık tempUser'a gerek yok. Sistem zaten giriş yapmış durumda.

            } catch (err) {
                // Hata oluşursa, oluşturulmuş geçici kullanıcıyı silmeyi dene.
                if (tempUser) {
                    await deleteUser(tempUser).catch(delErr => console.error("Geçici kullanıcı silinirken hata:", delErr));
                }

                if (err.code === 'auth/email-already-in-use') {
                    setError('Bu e-posta adresi zaten kullanılıyor.');
                } else {
                    setError('Kayıt olurken bir hata oluştu. Lütfen tekrar deneyin.');
                    console.error("Kayıt Hatası: ", err);
                }
            }
        }
        setLoading(false);
    };

    return (
        <div className="auth-container">
            <link href="https://fonts.googleapis.com/css2?family=Cookie&display=swap" rel="stylesheet" />
            <div className="auth-form-wrapper">
                <h1 className="auth-logo-text">Mylasa</h1>
                <form onSubmit={handleSubmit} className="auth-form">
                    {isLogin ? (
                        <>
                            <input type="email" className="auth-input" placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            <input type="password" className="auth-input" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </>
                    ) : (
                        <>
                            <input type="email" className="auth-input" placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            <input type="text" className="auth-input" placeholder="Ad Soyad" value={adSoyad} onChange={(e) => setAdSoyad(e.target.value)} required />
                            <input type="text" className="auth-input" placeholder="Kullanıcı adı" value={kullaniciAdi} onChange={(e) => setKullaniciAdi(e.target.value)} required />
                            <input type="password" className="auth-input" placeholder="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </>
                    )}
                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? 'İşleniyor...' : (isLogin ? 'Giriş Yap' : 'Kaydol')}
                    </button>
                    {error && <p className="auth-error">{error}</p>}
                </form>
            </div>
            <div className="auth-toggle-wrapper">
                <p>
                    {isLogin ? "Hesabın yok mu? " : "Hesabın var mı? "}
                    <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="auth-toggle-button">
                        {isLogin ? "Kaydol" : "Giriş Yap"}
                    </button>
                </p>
            </div>
        </div>
    );
}

export default Auth;
