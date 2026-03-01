/* FILE: src/Map.js */
import React, { useState, useEffect } from "react";
import MapDesktop from "./MapDesktop";
import MapMobile from "./MapMobile";

// Bu yardımcı fonksiyon, pencere boyutunu dinler
const useWindowSize = () => {
  const [size, setSize] = useState([window.innerWidth, window.innerHeight]);
  useEffect(() => {
    const handleResize = () => setSize([window.innerWidth, window.innerHeight]);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return size;
};

function Map(props) {
  const [width] = useWindowSize();
  const isMobile = width <= 768;

  // Eğer mobil ise MapMobile'ı, değilse MapDesktop'ı göster
  if (isMobile) {
    return <MapMobile {...props} />;
  }
  return <MapDesktop {...props} />;
}

export default Map;