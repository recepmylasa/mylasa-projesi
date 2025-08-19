// src/KonumIzinSec.js
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { doc, updateDoc, getDoc, onSnapshot, collection } from "firebase/firestore";

function KonumIzinSec({ userEmail }) {
  const [tumKullanicilar, setTumKullanicilar] = useState([]);
  const [izinliler, setIzinliler] = useState([]);

  useEffect(() => {
    if (!userEmail) return;
    // Tüm kullanıcıları çek
    const unsub = onSnapshot(collection(db, "users"), snap => {
      const arr = [];
      snap.forEach(docu => {
        const d = docu.data();
        if (d.email && d.email !== userEmail) arr.push({ email: d.email, adSoyad: d.adSoyad || d.email });
      });
      setTumKullanicilar(arr);
    });
    return () => unsub();
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) return;
    // Mevcut izinlileri çek
    getDoc(doc(db, "users", userEmail)).then(snap => {
      if (snap.exists()) {
        setIzinliler(snap.data().konumIzinleri || []);
      }
    });
  }, [userEmail]);

  async function toggleIzin(email) {
    if (!userEmail || !email) return;
    const yeni = izinliler.includes(email)
      ? izinliler.filter(e => e !== email)
      : [...izinliler, email];
    setIzinliler(yeni);
    await updateDoc(doc(db, "users", userEmail), {
      konumIzinleri: yeni
    });
  }

  return (
    <div style={{margin:'18px 0',padding:'20px',background:'#f8f8ff',borderRadius:17,boxShadow:'0 2px 16px #f6e6fe',maxWidth:440}}>
      <div style={{fontWeight:'bold',marginBottom:12,color:'#af2323'}}>Konumumu Kimler Görebilir?</div>
      {tumKullanicilar.length === 0 && <div>Başka kullanıcı yok.</div>}
      <ul style={{listStyle:'none',padding:0,margin:0}}>
        {tumKullanicilar.map(u=>(
          <li key={u.email} style={{display:'flex',alignItems:'center',gap:9,marginBottom:10}}>
            <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              <input
                type="checkbox"
                checked={izinliler.includes(u.email)}
                onChange={()=>toggleIzin(u.email)}
                style={{width:18,height:18,accentColor:'#fa7e1e'}}
              />
              <span style={{color:'#892a92',fontWeight:'bold'}}>{u.adSoyad}</span>
              <span style={{color:'#999',marginLeft:3,fontSize:'.99em'}}>({u.email})</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default KonumIzinSec;
