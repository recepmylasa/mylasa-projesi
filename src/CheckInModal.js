import React, { useState, useEffect, useRef } from 'react';
import './CheckInModal.css';

// İkonlar
const CloseIcon = () => <svg height="24" viewBox="0 0 24 24" width="24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>;
const DefaultIcon = () => <svg height="24" viewBox="0 0 24 24" width="24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"></path></svg>;

// YENİ: onPlaceSelect prop'u eklendi
function CheckInModal({ onClose, currentUser, onPlaceSelect }) {
    const [status, setStatus] = useState('loading_location');
    const [nearbyPlaces, setNearbyPlaces] = useState([]);
    const [searchPlaces, setSearchPlaces] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    
    const autocompleteService = useRef(null);
    const searchTimeoutRef = useRef(null);
    const userLocation = useRef(null);

    useEffect(() => {
        const watchdogTimer = setTimeout(() => {
            if (status === 'loading_location') {
                setStatus('ready');
            }
        }, 12000);

        if (window.google && window.google.maps && window.google.maps.places) {
            autocompleteService.current = new window.google.maps.places.AutocompleteService();
            const placesService = new window.google.maps.places.PlacesService(document.createElement('div'));
            
            const geoOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    clearTimeout(watchdogTimer);
                    userLocation.current = new window.google.maps.LatLng(position.coords.latitude, position.coords.longitude);
                    const request = { location: userLocation.current, radius: '1500', type: ['establishment'] };
                    placesService.nearbySearch(request, (results, serviceStatus) => {
                        if (serviceStatus === window.google.maps.places.PlacesServiceStatus.OK && results) {
                            const formatted = results.map(p => ({ id: p.place_id, name: p.name, address: p.vicinity })).filter(p => p.name);
                            setNearbyPlaces(formatted);
                        }
                        setStatus('ready');
                    });
                },
                (error) => {
                    clearTimeout(watchdogTimer);
                    console.error("Konum hatası:", error);
                    setStatus('ready'); 
                },
                geoOptions
            );
        } else {
            clearTimeout(watchdogTimer);
            console.error("Google Maps script'i yüklenemedi.");
            setStatus('error');
        }
        return () => clearTimeout(watchdogTimer);
    }, []);

    useEffect(() => {
        clearTimeout(searchTimeoutRef.current);
        if (searchQuery.trim().length < 3) {
            setSearchPlaces([]);
            return;
        }
        if (!autocompleteService.current) return;
        
        searchTimeoutRef.current = setTimeout(() => {
            setStatus('loading_places');
            const request = { input: searchQuery, componentRestrictions: { country: 'tr' }, location: userLocation.current, radius: 50000 };
            autocompleteService.current.getPlacePredictions(request, (predictions, serviceStatus) => {
                if (serviceStatus === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
                    const formatted = predictions.map(p => ({ id: p.place_id, name: p.structured_formatting.main_text, address: p.structured_formatting.secondary_text }));
                    setSearchPlaces(formatted);
                } else {
                    setSearchPlaces([]);
                }
                setStatus('ready');
            });
        }, 300);
    }, [searchQuery]);

    // handleCheckIn fonksiyonu artık yok. Direkt onPlaceSelect çağrılıyor.

    const renderContent = () => {
        const showSearchResults = searchQuery.trim().length >= 3;
        const placesToRender = showSearchResults ? searchPlaces : nearbyPlaces;
        const listTitle = showSearchResults ? "Arama Sonuçları" : "Yakınındaki Mekanlar";
        if (status === 'loading_location') return <p className="status-text">Konumunuz alınıyor...</p>;
        if (status === 'error') return <p className="status-text">Mekanlar getirilemedi. Lütfen daha sonra tekrar deneyin.</p>;
        if (status === 'loading_places' && placesToRender.length === 0) return <p className="status-text">Mekanlar aranıyor...</p>;
        
        return (
            <>
                {placesToRender.length > 0 && <h3 className="places-list-header">{listTitle}</h3>}
                <div className="places-list">
                    {placesToRender.map(place => (
                        // Tıklandığında direkt App.js'e haber veriyor
                        <button key={place.id} className="place-item" onClick={() => onPlaceSelect(place)}>
                            <div className="place-icon-wrapper"><DefaultIcon /></div>
                            <div className="place-info">
                                <span className="place-name">{place.name}</span>
                                <span className="place-category">{place.address}</span>
                            </div>
                        </button>
                    ))}
                    {status === 'ready' && placesToRender.length === 0 && searchQuery.trim().length >= 3 && <p className="status-text">Aramanızla eşleşen mekan bulunamadı.</p>}
                    {status === 'ready' && placesToRender.length === 0 && searchQuery.trim().length < 3 && <p className="status-text">Check-in yapmak için bir mekan arayın.</p>}
                </div>
            </>
        );
    };

    return (
        <div className="checkin-modal-overlay" onClick={onClose}>
            <div className="checkin-modal-content" onClick={e => e.stopPropagation()}>
                <header className="checkin-header">
                    <h2>Bir Yer Seç</h2>
                    <button onClick={onClose} className="checkin-close-btn"><CloseIcon /></button>
                </header>
                <div className="search-container">
                    <input type="text" className="search-input" placeholder="Bulunduğun şehri veya mekanı ara..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <div className="checkin-body">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}

export default CheckInModal;