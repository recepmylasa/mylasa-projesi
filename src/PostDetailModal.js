// src/PostDetailModal.js
import React, { useEffect, useState } from "react";

// Vale: Mobil/Masaüstü seçim
import PostDetailModalDesktop from "./PostDetailModalDesktop";
import PostDetailModalMobile from "./PostDetailModalMobile";

// Ekran boyutunu izleyen basit hook
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

export default function PostDetailModal(props) {
  const isMobile = useIsMobile(768);
  return isMobile ? (
    <PostDetailModalMobile {...props} />
  ) : (
    <PostDetailModalDesktop {...props} />
  );
}
