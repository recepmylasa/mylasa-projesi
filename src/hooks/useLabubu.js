// src/hooks/useLabubu.js
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";

const SERIES_ID = "S1";

export default function useLabubu(uid) {
  const [user, setUser] = useState(null);
  const [series, setSeries] = useState(null);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const offUser = onSnapshot(doc(db, "users", uid), d => setUser(d.data() || {}));
    const offSeries = onSnapshot(doc(db, "series", SERIES_ID), d => setSeries(d.data() || null));
    const offCards = onSnapshot(collection(db, "users", uid, "cards"), snap =>
      setCards(snap.docs.map(d => d.data()).sort((a,b)=>a.name.localeCompare(b.name)))
    );
    return () => { offUser && offUser(); offSeries && offSeries(); offCards && offCards(); };
  }, [uid]);

  const boxesReady = useMemo(() => {
    if (!user) return 0;
    return (user.boxesEarned || 0) - (user.boxesOpened || 0);
  }, [user]);

  const openBox = async (type = "standardBox") => {
    const fn = httpsCallable(functions, "openBlindBox");
    const res = await fn({ boxType: type });
    return res.data.drop;
  };

  const incStar = async () => {
    const fn = httpsCallable(functions, "incrementStars");
    await fn({});
  };

  return { series, cards, boxesReady, openBox, incStar };
}
