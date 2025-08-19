// src/LiveMap.js
// Mapbox’sız, tamamen ücretsiz Leaflet.js ile canlı konum haritası
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { doc, getDoc, updateDoc, onSnapshot, collection } from "firebase/firestore";
// Leaflet map
import "leaflet/dist/leaflet.css";
import L from "leaflet";

function LiveMap({ userEmail }) {
  const [users, setUsers] = useState([]);
  const [map, setMap] = useState(null);
  const [markers, setMarkers] = useState([]);

  // Konum iste & Firestore'a güncelle
  async function handleKonumPaylas() {
    if (!navigator.geolocation) {
      alert("Tarayıcınız konum paylaşımını desteklemiyor.");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      await updateDoc(doc(db, "users", userEmail), {
        canliKonum: {
          lat: latitude,
          lng: longitude,
          updatedAt: Date.now(),
        }
      });
      alert("Konum güncellendi!");
    }, (err) => {
      alert("Konum alınamadı: " + err.message);
    });
  }

  // Canlı izinli kullanıcıların konumlarını çek
  useEffect(() => {
    if (!userEmail) return;
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const izinli = [];
      snap.forEach(docu => {
        const d = docu.data();
        // Sadece SENİN konum iznin olanları ve takip ettiklerini göster
        if (
          d.konumIzinleri &&
          d.konumIzinleri.includes(userEmail) &&
          d.canliKonum &&
          d.canliKonum.lat &&
          d.canliKonum.lng
        ) {
          izinli.push({
            email: d.email,
            adSoyad: d.adSoyad,
            lat: d.canliKonum.lat,
            lng: d.canliKonum.lng,
            updatedAt: d.canliKonum.updatedAt
          });
        }
      });
      setUsers(izinli);
    });
    return () => unsub();
  }, [userEmail]);

  // Harita başlat
  useEffect(() => {
    if (map) return;
    // Basit Leaflet map (Mapbox gerektirmez)
    const _map = L.map("mapbox", {
      center: [37.2, 27.7], // Milas çevresi
      zoom: 12
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(_map);
    setMap(_map);
  }, [map]);

  // Markerları güncelle
  useEffect(() => {
    if (!map) return;
    // Eski markerları kaldır
    markers.forEach(m => map.removeLayer(m));
    const yeniMarkers = users.map(u => {
      const marker = L.marker([u.lat, u.lng])
        .addTo(map)
        .bindPopup(`<b>${u.adSoyad || u.email}</b><br/>${u.email}`);
      return marker;
    });
    setMarkers(yeniMarkers);
    // En son kendi konumun da varsa ona zoomla
    const ben = users.find(u => u.email === userEmail);
    if (ben) {
      map.setView([ben.lat, ben.lng], 15);
    }
    // eslint-disable-next-line
  }, [users, map]);

  return (
    <div style={{ width: "100%", height: 410, position: "relative", margin: "0 auto", marginTop: 14, borderRadius: 22, overflow: "hidden", boxShadow: "0 4px 26px #d7b7ed"}}>
      <div id="mapbox" style={{ width: "100%", height: "100%" }} />
      <button
        onClick={handleKonumPaylas}
        style={{
          position: "absolute",
          bottom: 24,
          right: 24,
          zIndex: 1000,
          background: "linear-gradient(90deg,#fdc468,#fa7e1e,#d62976,#962fbf,#4f5bd5)",
          color: "#fff",
          padding: "12px 22px",
          borderRadius: 13,
          border: "none",
          fontWeight: "bold",
          fontSize: "1.1em",
          boxShadow: "0 2px 14px #ceb9ff",
          cursor: "pointer"
        }}
      >
        Konumumu Paylaş
      </button>
    </div>
  );
}

export default LiveMap;
