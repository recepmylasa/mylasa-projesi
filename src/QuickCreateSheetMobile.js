// FILE: src/QuickCreateSheetMobile.jsx
import React, { useEffect } from "react";
import "./QuickCreateSheetMobile.css";

/**
 * ✅ TEMİZLİK (EMİR 3/3)
 * Bu sheet artık kullanılmıyor.
 * Rota oluşturma akışı yalnızca: Profil → Rotalarım → FAB üzerinden.
 *
 * Geriye dönük import/compile kırmamak için dosya korunur;
 * Eğer bir yer yanlışlıkla açmaya çalışırsa, anında kapatır ve UI göstermez.
 */
export default function QuickCreateSheetMobile({ open = false, onClose = () => {} }) {
  useEffect(() => {
    if (!open) return;
    try {
      onClose?.();
    } catch {}
  }, [open, onClose]);

  return null;
}