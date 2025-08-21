// src/Profile.js
import { useEffect, useState } from "react";
import ProfileDesktop from "./ProfileDesktop";
import ProfileMobile from "./ProfileMobile";

/** Basit ekran genişliği dinleyicisi (IG eşik ~736px) */
function useIsMobile(breakpoint = 736) {
  const get = () => (typeof window !== "undefined" ? window.innerWidth <= breakpoint : false);
  const [isMobile, setIsMobile] = useState(get());
  useEffect(() => {
    const onResize = () => setIsMobile(get());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

/** Wrapper: Mobil ↔ Desktop seçim */
export default function Profile(props) {
  const isMobile = useIsMobile(736);
  return isMobile ? <ProfileMobile {...props} /> : <ProfileDesktop {...props} />;
}
