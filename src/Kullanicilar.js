import { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, query, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp } from "firebase/firestore";

function Kullanicilar({ aktifKullanici, onUserClick }) {
  const [users, setUsers] = useState([]);
  const [takipEdilenler, setTakipEdilenler] = useState([]);
  const [arama, setArama] = useState("");

  useEffect(() => {
    const q = query(collection(db, "users"));
    const unsub = onSnapshot(q, snap => {
      const arr = [];
      snap.forEach(doc => arr.push({ email: doc.data().email, adSoyad: doc.data().adSoyad, profilFoto: doc.data().profilFoto }));
      setUsers(arr.filter(u => u.email !== aktifKullanici));
    });
    return () => unsub();
  }, [aktifKullanici]);

  useEffect(() => {
    if (!aktifKullanici) return;
    const q = query(collection(db, "users"));
    const unsub = onSnapshot(q, snap => {
      snap.forEach(doc => {
        if (doc.data().email === aktifKullanici) {
          setTakipEdilenler(doc.data().takipEdilenler || []);
        }
      });
    });
    return () => unsub();
  }, [aktifKullanici]);

  async function toggleFollow(userEmail) {
    if (!aktifKullanici || !userEmail) return;
    if (typeof aktifKullanici !== "string" || typeof userEmail !== "string") return;
    const aktifRef = doc(db, "users", aktifKullanici);
    const alreadyFollowing = takipEdilenler.includes(userEmail);
    if (alreadyFollowing) {
      await updateDoc(aktifRef, {
        takipEdilenler: arrayRemove(userEmail)
      });
    } else {
      await updateDoc(aktifRef, {
        takipEdilenler: arrayUnion(userEmail)
      });
      if (
        aktifKullanici &&
        userEmail &&
        aktifKullanici !== userEmail &&
        typeof aktifKullanici === "string" &&
        typeof userEmail === "string"
      ) {
        await addDoc(collection(db, "notifications"), {
          to: userEmail,
          from: aktifKullanici,
          type: "follow",
          text: `${aktifKullanici} seni takip etmeye başladı!`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    }
  }

  const filtreli = users.filter(u =>
    (u.adSoyad || "").toLowerCase().includes(arama.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(arama.toLowerCase())
  );

  return (
    <div style={{
      background:'linear-gradient(112deg,#fff,#faf9fa 100%,#ffeaea 145%)',
      padding:'2.5rem 2.3rem 1.5rem',
      borderRadius:22,
      boxShadow:'0 4px 26px #f0eeee',
      marginTop:28,
      maxWidth:500,
      marginLeft:'auto',
      marginRight:'auto',
      border:'1.7px solid #ffeaea',
      minHeight:350
    }}>
      <h3 style={{color:'#af2323',fontFamily:'monospace',marginBottom:19,fontSize:'1.22em',textAlign:'center',letterSpacing:'.12em'}}>Kullanıcılar</h3>
      <input
        type="text"
        placeholder="Kullanıcı ara..."
        value={arama}
        onChange={e => setArama(e.target.value)}
        style={{width:'100%',padding:'12px',marginBottom:'19px',border:'1.6px solid #ffd2d2',borderRadius:'11px',fontSize:'1.09em',background:'#fcf6f6',boxShadow:'0 1px 8px #fde6e6',outline:'none'}}
      />
      {users.length === 0 && <div style={{color:'#aaa',fontSize:'1.06em',textAlign:'center',marginTop:28}}>Henüz başka kullanıcı yok.</div>}
      <ul style={{listStyle:'none',padding:0,margin:0}}>
        {filtreli.map(user => (
          <li key={user.email} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:13,gap:11,background:'#fff',borderRadius:15,padding:'13px 8px 13px 6px',boxShadow:'0 2px 10px #faeded',transition:'0.18s',minHeight:62}}>
            <div style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',flex:1}} onClick={()=>onUserClick && onUserClick(user.email)}>
              {user.profilFoto ? (
                <img src={user.profilFoto} alt="profil" style={{width:44,height:44,borderRadius:'50%',objectFit:'cover',border:'2px solid #ffebeb',boxShadow:'0 2px 6px #f9dede'}} />
              ) : (
                <div style={{width:44,height:44,borderRadius:'50%',background:'#faeded',display:'flex',alignItems:'center',justifyContent:'center',color:'#af2323',fontWeight:700,fontSize:'1.25em',boxShadow:'0 1px 4px #ffeaea'}}>{user.adSoyad?.[0]?.toUpperCase()||"U"}</div>
              )}
              <div>
                <div style={{fontWeight:700,color:'#af2323',fontSize:'1.09em',letterSpacing:'0.03em'}}>{user.adSoyad || <span style={{color:'#bbb'}}>Kullanıcı</span>}</div>
                <div style={{fontSize:'0.96em',color:'#888'}}>{user.email}</div>
              </div>
            </div>
            <button
              onClick={()=>toggleFollow(user.email)}
              style={{
                background: takipEdilenler.includes(user.email)?'#fff':'linear-gradient(97deg,#af2323,#e05252 80%)',
                color: takipEdilenler.includes(user.email)?'#af2323':'#fff',
                border:'1.3px solid #af2323',
                borderRadius:'10px',
                padding:'8px 22px',
                fontWeight:'bold',
                cursor:'pointer',
                fontSize:'1.08em',
                minWidth:100,
                boxShadow: takipEdilenler.includes(user.email)?'0 1px 5px #f2dede':'0 1px 10px #f8bcbc',
                transition:'0.18s',
                outline:'none',
                letterSpacing:'0.04em'
              }}
            >{takipEdilenler.includes(user.email)?'Takipten Çık':'Takip Et'}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Kullanicilar;
