import React, { useState, useEffect } from 'react';

// Artık hem mobil hem de masaüstü dosyalarını import ediyoruz.
import ClipsDesktop from './ClipsDesktop'; 
import ClipsMobile from './ClipsMobile';

// Ekran boyutunu dinlemek için basit bir fonksiyon
const useWindowSize = () => {
    const [size, setSize] = useState([window.innerWidth, window.innerHeight]);
    useEffect(() => {
        const handleResize = () => setSize([window.innerWidth, window.innerHeight]);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return { width: size[0], height: size[1] };
};

// YÖNETİCİ DOSYA
function Clips(props) {
    const { width } = useWindowSize();
    const isMobile = width <= 768;

    if (isMobile) {
        // Eğer ekran darsa, artık ClipsMobile dosyasını çağırıyoruz.
        return <ClipsMobile {...props} />;
    }

    // Eğer ekran genişse, ClipsDesktop dosyasını çağırmaya devam ediyoruz.
    return <ClipsDesktop {...props} />;
}

export default Clips;
