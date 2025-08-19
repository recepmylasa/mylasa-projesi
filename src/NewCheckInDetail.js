import React from 'react';

// Ayrı bileşenleri import et
import NewCheckInDetailDesktop from './NewCheckInDetailDesktop';
import NewCheckInDetailMobile from './NewCheckInDetailMobile';

// Ekran boyutunu algılamak için bir hook (App.js'den kopyalandı)
const useWindowSize = () => {
    const [size, setSize] = React.useState([window.innerWidth, window.innerHeight]);
    React.useEffect(() => {
        const handleResize = () => setSize([window.innerWidth, window.innerHeight]);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return size;
};

// Yönetici bileşen
function NewCheckInDetail(props) {
    const [width] = useWindowSize();
    const isMobile = width <= 768;

    if (isMobile) {
        return <NewCheckInDetailMobile {...props} />;
    } else {
        return <NewCheckInDetailDesktop {...props} />;
    }
}

export default NewCheckInDetail;