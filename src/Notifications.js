import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc } from "firebase/firestore";

function Notifications({ userEmail, onClose }) {
  const [notifications, setNotifications] = useState([]);

  // Kullanıcının bildirimlerini dinle
  useEffect(() => {
    const q = query(
      collection(db, "notifications"),
      where("to", "==", userEmail),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
      setNotifications(arr);
    });
    return () => unsubscribe();
  }, [userEmail]);

  // Tüm bildirimleri "okundu" olarak işaretle
  useEffect(() => {
    notifications.forEach(n => {
      if (!n.read) {
        const ref = doc(db, "notifications", n.id);
        updateDoc(ref, { read: true });
      }
    });
  }, [notifications]);

  return (
    <div style={{maxWidth:400,margin:"0 auto",background:'#fff'}}>
      <button onClick={onClose} style={{float:'right',fontSize:'1.2em',color:'#af2323',background:'none',border:'none',cursor:'pointer',marginBottom:6}}>Kapat ✖️</button>
      <h2 style={{color:'#af2323',fontFamily:'monospace',marginBottom:10}}>Bildirimler</h2>
      <div style={{minHeight:120,maxHeight:300,overflowY:'auto',background:'#fafbfc',borderRadius:10,padding:12,marginBottom:14,border:'1px solid #eee'}}>
        {notifications.length === 0 ? (
          <div style={{color:'#aaa',textAlign:'center',marginTop:40}}>Hiç bildirim yok.</div>
        ) : notifications.map((n, i) => (
          <div key={n.id} style={{background:!n.read ? '#ffecec' : '#fff',padding:'9px 15px',borderRadius:12,marginBottom:8}}>
            <span>{n.text}</span>
            <div style={{fontSize:'0.85em',color:'#888',marginTop:2}}>{n.createdAt && n.createdAt.toDate().toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Notifications;
