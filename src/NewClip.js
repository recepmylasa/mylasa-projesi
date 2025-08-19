import React, { useState, useEffect } from 'react';
import NewClipMobile from './NewClipMobile';
import NewClipDesktop from './NewClipDesktop';

const useWindowSize = () => {
    // DÜZELTME: İlk renderda 'undefined' yerine gerçek pencere boyutunu al
    const [windowSize, setWindowSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });

    useEffect(() => {
        function handleResize() {
            setWindowSize({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        }
        
        window.addEventListener("resize", handleResize);
        
        // Component kaldırıldığında event listener'ı temizle
        return () => window.removeEventListener("resize", handleResize);
    }, []); 

    return windowSize;
};


function NewClip(props) {
    const { width } = useWindowSize();
    
    // DÜZELTME: Genişlik 'undefined' olsa bile doğru çalışacak kontrol
    if (width === undefined) {
        // Genişlik henüz bilinmiyorsa hiçbir şey render etme
        return null; 
    }
    
    const isMobile = width <= 768; 

    if (isMobile) {
        return <NewClipMobile {...props} />;
    } else {
        return <NewClipDesktop {...props} />;
    }
}

export default NewClip;