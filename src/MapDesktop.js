import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, auth, storage } from './firebase';
import { collection, query, where, getDocs, doc, onSnapshot, updateDoc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import AvatarModal from './AvatarModal';
import { CgProfile } from 'react-icons/cg';
import { IoSettingsOutline, IoLayersOutline, IoLocationSharp } from 'react-icons/io5';
import CustomMarker from './CustomMarker';
import MapSettingsModal from './MapSettingsModal';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ✅ YENİ: Mekân detay modali
import PlaceDetailModal from './PlaceDetailModal';
import './PlaceDetailModal.css';

const MAPTILER_KEY = process.env.REACT_APP_MAPTILER_KEY;

const defaultCenter = { latitude: 39.0, longitude: 35.0, zoom: 5 };
const loadingStyle = { width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '18px', fontWeight: 'bold' };

const mapStyles = {
  'Sokaklar': `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
  'Uydu'    : `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
  'Topo'    : `https://api.maptiler.com/maps/topo-v2/style.json?key=${MAPTILER_KEY}`,
};

// --- TIKLANABİLİR PLACE MARKER ---
const PlaceMarker = ({ place, onOpen }) => {
  const handleClick = (e) => { e.stopPropagation(); onOpen?.(place); };
  const handlePointerDown = (e) => { e.stopPropagation(); };
  const handleKeyDown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(place); } };
  return (
    <div
      title={place?.properties?.name || 'İsimsiz Mekan'}
      style={{ cursor: 'pointer', display: 'inline-flex' }}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      aria-label={(place?.properties?.name || 'Mekan') + ' detayını aç'}
    >
      <IoLocationSharp size={28} color="#e74c3c" />
    </div>
  );
};

// Basit debounce
function debounce(func, wait) {
  let timeout;
  return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
}

// --- Overpass yardımcıları ---
function buildOverpassQL({ lat, lon, radius = 1200, limit = 40 }) {
  return `
[out:json][timeout:25];
(
  node["amenity"~"restaurant|cafe|bar|fast_food|pub"](around:${radius},${lat},${lon});
  way ["amenity"~"restaurant|cafe|bar|fast_food|pub"](around:${radius},${lat},${lon});
  relation["amenity"~"restaurant|cafe|bar|fast_food|pub"](around:${radius},${lat},${lon});

  node["shop"~"bakery|supermarket"](around:${radius},${lat},${lon});
  way ["shop"~"bakery|supermarket"](around:${radius},${lat},${lon});
  relation["shop"~"bakery|supermarket"](around:${radius},${lat},${lon});

  node["tourism"~"hotel|attraction"](around:${radius},${lat},${lon});
  way ["tourism"~"hotel|attraction"](around:${radius},${lat},${lon});
  relation["tourism"~"hotel|attraction"](around:${radius},${lat},${lon});
);
out center ${limit};
`;
}

function elementsToGeoJSON(elements) {
  if (!Array.isArray(elements)) return [];
  return elements
    .map((el) => {
      const id = `${el.type}/${el.id}`;
      const name =
        el.tags?.name ||
        el.tags?.['name:tr'] ||
        el.tags?.['brand'] ||
        'Bilinmeyen Mekan';

      const lon = el.lon ?? el.center?.lon;
      const lat = el.lat ?? el.center?.lat;
      if (typeof lon !== 'number' || typeof lat !== 'number') return null;

      const category =
        el.tags?.amenity ||
        el.tags?.shop ||
        el.tags?.tourism ||
        null;

      return {
        type: 'Feature',
        id,
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          name,
          category,
          osm_tags: el.tags || {},
          osm_type: el.type,
          osm_id: el.id
        }
      };
    })
    .filter(Boolean);
}

function MapDesktop({ currentUserProfile, onViewStory, onUserClick }) {
  const [viewState, setViewState] = useState(defaultCenter);
  const [userLocation, setUserLocation] = useState(null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [friendsOnMap, setFriendsOnMap] = useState([]);
  const [currentMapStyle, setCurrentMapStyle] = useState(mapStyles['Sokaklar']);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [places, setPlaces] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // ✅ YENİ: Mekân detay modal state
  const [isPlaceModalOpen, setIsPlaceModalOpen] = useState(false);
  const [placeModalData, setPlaceModalData] = useState(null);

  // Yorum + Fotoğraf state'leri
  const [comment, setComment] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // --- Mekanları Overpass ile getir ---
  const fetchPlaces = useCallback(async (currentViewState) => {
    if (!currentViewState) return;

    const { longitude: lon, latitude: lat, zoom } = currentViewState;
    if (zoom < 13) {
      setPlaces([]);
      return;
    }

    const queryText = buildOverpassQL({ lat, lon, radius: 1200, limit: 40 });

    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: queryText })
      });

      if (!res.ok) {
        setPlaces([]);
        return;
      }

      const data = await res.json();
      const features = elementsToGeoJSON(data.elements);
      setPlaces(features);
    } catch (err) {
      setPlaces([]);
    }
  }, []);

  const debouncedFetchPlaces = useMemo(() => debounce(fetchPlaces, 350), [fetchPlaces]);

  // --- FOTOĞRAF YÜKLEME yardımcı fonksiyonu ---
  async function uploadCheckinImage(userId, fileObj) {
    if (!fileObj) return null;
    if (!fileObj.type?.startsWith('image/')) {
      alert('Yalnızca görsel dosyaları yüklenebilir.');
      return null;
    }
    if (fileObj.size > 8 * 1024 * 1024) {
      alert('Dosya boyutu 8 MB’ı aşmamalı.');
      return null;
    }
    setUploading(true);
    try {
      const ext = fileObj.name?.split('.').pop() || 'jpg';
      const filePath = `post_media/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const storageRef = ref(storage, filePath);
      await uploadBytes(storageRef, fileObj, { contentType: fileObj.type });
      const url = await getDownloadURL(storageRef);
      return url;
    } finally {
      setUploading(false);
    }
  }

  // --- Check-in (yorum + foto destekli) ---
  const handleCheckIn = async (place) => {
    if (isCheckingIn || uploading) return;
    setIsCheckingIn(true);

    const user = auth.currentUser;
    if (!user || !currentUserProfile) {
      alert("Check-in yapabilmek için giriş yapmalısınız.");
      setIsCheckingIn(false);
      return;
    }

    const placeId =
      place.id ||
      place.properties?.maptiler_id ||
      place.properties?.osm_id ||
      `${place.geometry.coordinates.join(',')}`;

    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const checkinsRef = collection(db, "checkins");
      const qCheck = query(
        checkinsRef,
        where("userId", "==", user.uid),
        where("placeId", "==", placeId),
        where("timestamp", ">", fifteenMinutesAgo)
      );
      const existing = await getDocs(qCheck);
      if (!existing.empty) {
        alert("Yakın zamanda bu mekanda zaten check-in yaptın!");
        setIsCheckingIn(false);
        return;
      }

      let imageUrl = null;
      if (file) {
        imageUrl = await uploadCheckinImage(user.uid, file);
      }

      const checkInData = {
        userId: user.uid,
        userName: currentUserProfile.kullaniciAdi,
        userProfilePic: currentUserProfile.profilFoto,
        placeId,
        placeName: place.properties?.name || "Bilinmeyen Mekan",
        placeCategory: place.properties?.category || null,
        coordinates: place.geometry.coordinates,
        comment: comment?.trim() || null,
        imageUrl: imageUrl || null,
        timestamp: serverTimestamp(),
      };

      await addDoc(collection(db, "checkins"), checkInData);

      setSelectedPlace(null);
      setComment('');
      setFile(null);
    } catch (error) {
      console.error("Check-in sırasında hata:", error);
      alert("Check-in sırasında bir hata oluştu.");
    } finally {
      setIsCheckingIn(false);
    }
  };

  // ✅ YENİ: Seçili mekân için modalı aç
  const openPlaceModal = (place) => {
    if (!place) return;
    const placeId =
      place.id ||
      place.properties?.maptiler_id ||
      place.properties?.osm_id ||
      `${place.geometry.coordinates.join(',')}`;
    setPlaceModalData({
      placeId,
      placeName: place.properties?.name || 'Bilinmeyen Mekan',
    });
    setIsPlaceModalOpen(true);
  };

  // Konumu al ve ilk fetch
  useEffect(() => {
    const geoOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    const updateUserLocation = (position) => {
      const user = auth.currentUser;
      if (user) {
        const loc = { longitude: position.coords.longitude, latitude: position.coords.latitude };
        setUserLocation(loc);
        const newViewState = { ...defaultCenter, ...loc, zoom: 14 };
        setViewState(newViewState);
        fetchPlaces(newViewState);
        if (currentUserProfile?.isSharing !== false) {
          const locationRef = doc(db, "locations", user.uid);
          updateDoc(locationRef, { ...loc, timestamp: new Date() }).catch(() => {
            setDoc(locationRef, { ...loc, timestamp: new Date() });
          });
        }
      }
    };
    navigator.geolocation.getCurrentPosition(updateUserLocation, () => {
      setUserLocation(null);
      setViewState(defaultCenter);
    }, geoOptions);
  }, [currentUserProfile?.isSharing, fetchPlaces]);

  // --- Arkadaş konumları (izinli UID'lere göre dinle) ---
  useEffect(() => {
    let unsubscribes = [];

    const run = async () => {
      try {
        const myId = auth.currentUser?.uid;
        const followings = Array.isArray(currentUserProfile?.takipEdilenler)
          ? currentUserProfile.takipEdilenler
          : [];

        if (!myId || followings.length === 0) {
          setFriendsOnMap([]);
          return;
        }

        const batches = [];
        for (let i = 0; i < followings.length; i += 10) {
          batches.push(followings.slice(i, i + 10));
        }

        const profileMap = new Map();
        for (const batch of batches) {
          const snap = await getDocs(
            query(collection(db, "users"), where("uid", "in", batch))
          );
          snap.forEach(d => profileMap.set(d.id, { id: d.id, ...d.data() }));
        }

        const allowedUIDs = followings.filter(uid => {
          const p = profileMap.get(uid);
          if (!p || p.isSharing === false) return false;
          if (p.sharingMode === "all_friends") {
            return Array.isArray(p.takipEdilenler) && p.takipEdilenler.includes(myId);
          }
          if (p.sharingMode === "selected_friends") {
            return Array.isArray(p.sharingWhitelist) && p.sharingWhitelist.includes(myId);
          }
          return false;
        });

        if (allowedUIDs.length === 0) {
          setFriendsOnMap([]);
          return;
        }

        const locBatches = [];
        for (let i = 0; i < allowedUIDs.length; i += 10) {
          locBatches.push(allowedUIDs.slice(i, i + 10));
        }

        unsubscribes = locBatches.map(batch => {
          const qLoc = query(collection(db, "locations"), where("__name__", "in", batch));
          return onSnapshot(qLoc, snap => {
            const locs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
            const merged = locs
              .map(loc => {
                const prof = profileMap.get(loc.uid);
                if (!prof) return null;
                return { ...loc, ...prof };
              })
              .filter(Boolean);

            setFriendsOnMap(prev => {
              const map = new Map(prev.map(x => [x.uid, x]));
              merged.forEach(x => map.set(x.uid, x));
              return Array.from(map.values());
            });
          });
        });
      } catch (err) {
        console.error("[friends-on-map] error (desktop):", err);
        setFriendsOnMap([]);
      }
    };

    run();

    return () => { unsubscribes.forEach(u => { try { u(); } catch {} }); };
  }, [currentUserProfile]);

  if (!MAPTILER_KEY) {
    return <div style={loadingStyle}>Harita yapılandırma hatası: API anahtarı eksik.</div>;
  }
  if (!viewState) { return <div style={loadingStyle}>Harita Yükleniyor...</div>; }

  const selfMarkerData = { ...currentUserProfile, ...userLocation, hasStory: false };
  const buttonStyle = {
    backgroundColor: 'white', border: '1px solid #dbdbdb', borderRadius: '50%',
    width: '40px', height: '40px', display: 'flex', justifyContent: 'center',
    alignItems: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'auto' }}>
        <button style={buttonStyle} onClick={() => setIsAvatarModalOpen(true)} title="Avatarını Değiştir"> <CgProfile size={24} /> </button>
        <button style={buttonStyle} onClick={() => setIsSettingsModalOpen(true)} title="Konum Ayarları"> <IoSettingsOutline size={24} /> </button>
        <div style={{ position: 'relative' }}>
          <button style={buttonStyle} onClick={() => setIsStyleMenuOpen(!isStyleMenuOpen)} title="Harita Katmanları"> <IoLayersOutline size={24} /> </button>
          {isStyleMenuOpen && (
            <div style={{ position: 'absolute', top: '50px', right: '0', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', overflow: 'hidden', width: '150px' }}>
              {Object.keys(mapStyles).map(styleName => (
                <button key={styleName} onClick={() => { setCurrentMapStyle(mapStyles[styleName]); setIsStyleMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid #efefef' }}>
                  {styleName}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onMoveEnd={evt => debouncedFetchPlaces(evt.viewState)}
        style={{ width: '100%', height: '100%' }}
        mapStyle={currentMapStyle}
        mapLib={maplibregl}
        onClick={() => setSelectedPlace(null)}
      >
        {userLocation && (
          <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="bottom">
            <CustomMarker user={selfMarkerData} onProfileClick={onUserClick} onStoryClick={onViewStory} />
          </Marker>
        )}

        {friendsOnMap.map(friend => (
          friend.longitude && friend.latitude && (
            <Marker key={friend.uid} longitude={friend.longitude} latitude={friend.latitude} anchor="bottom">
              <CustomMarker user={friend} onProfileClick={onUserClick} onStoryClick={onViewStory} />
            </Marker>
          )
        ))}

        {places.map(place => (
          <Marker
            key={place.id || (place.geometry?.coordinates?.join(',') || Math.random().toString(36))}
            longitude={place.geometry.coordinates[0]}
            latitude={place.geometry.coordinates[1]}
            anchor="bottom"
          >
            <PlaceMarker place={place} onOpen={(p) => setSelectedPlace(p)} />
          </Marker>
        ))}

        {selectedPlace && (
          <Popup
            longitude={selectedPlace.geometry.coordinates[0]}
            latitude={selectedPlace.geometry.coordinates[1]}
            onClose={() => setSelectedPlace(null)}
            closeOnClick={false}
            anchor="bottom"
            offset={30}
          >
            <div style={{ padding: '8px', textAlign: 'center', maxWidth: 280 }}>
              <h4 style={{ margin: '0 0 6px 0' }}>{selectedPlace.properties?.name || 'İsimsiz Mekan'}</h4>

              {/* Yorum alanı */}
              <textarea
                placeholder="Yorum ekle (opsiyonel)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                style={{ width: '100%', resize: 'vertical', marginBottom: 8, padding: 6, borderRadius: 6, border: '1px solid #ddd' }}
              />

              {/* Fotoğraf seçimi */}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ marginBottom: 8 }}
              />

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleCheckIn(selectedPlace)}
                  disabled={isCheckingIn || uploading}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: 'none', backgroundColor: '#0095f6', color: 'white', cursor: (isCheckingIn || uploading) ? 'not-allowed' : 'pointer', opacity: (isCheckingIn || uploading) ? 0.6 : 1 }}
                  title={uploading ? 'Fotoğraf yükleniyor…' : 'Check-in Yap'}
                >
                  {(isCheckingIn || uploading) ? 'İşleniyor…' : 'Check-in Yap'}
                </button>

                {/* ✅ YENİ: Mekân Detayı butonu */}
                <button
                  onClick={() => openPlaceModal(selectedPlace)}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}
                  title="Son 24 saatte kim check-in yaptı?"
                >
                  Mekân Detayı
                </button>
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {/* Modaller */}
      {isAvatarModalOpen && <AvatarModal onClose={() => setIsAvatarModalOpen(false)} />}
      {isSettingsModalOpen && <MapSettingsModal onClose={() => setIsSettingsModalOpen(false)} />}

      {/* ✅ YENİ: PlaceDetailModal render */}
      {isPlaceModalOpen && placeModalData && (
        <PlaceDetailModal
          placeData={placeModalData}
          onClose={() => { setIsPlaceModalOpen(false); setPlaceModalData(null); }}
          onUserClick={(uid) => {
            // Profil açma davranışın burada (gerekirse prop'tan gelen fonksiyona yönlendir)
            if (typeof onUserClick === 'function') onUserClick({ uid });
          }}
        />
      )}
    </div>
  );
}

export default MapDesktop;
