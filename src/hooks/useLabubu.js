// src/hooks/useLabubu.js
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";

const SERIES_ID = "S1";

function normalizeDrop(resData) {
  const data = resData || {};
  const drop = data.drop || data || {};

  return {
    seriesId: drop.seriesId || data.seriesId || SERIES_ID,
    code: drop.code || drop.id || drop.cardId || drop.cardCode || "",
    name: drop.name || drop.title || "",
    rarity: drop.rarity || "",
    asset: drop.asset || drop.imageUrl || drop.image || "",
    dupe: Boolean(drop.dupe),
    counts: drop.counts || data.counts || null,
  };
}

export default function useLabubu(uid) {
  const [user, setUser] = useState(null);
  const [series, setSeries] = useState(null);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (!uid) return;

    const offUser = onSnapshot(doc(db, "users", uid), (d) => setUser(d.data() || {}));
    const offSeries = onSnapshot(doc(db, "series", SERIES_ID), (d) => setSeries(d.data() || null));
    const offCards = onSnapshot(collection(db, "users", uid, "cards"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const an = (a.name || a.title || a.code || a.id || "").toString();
        const bn = (b.name || b.title || b.code || b.id || "").toString();
        return an.localeCompare(bn);
      });
      setCards(list);
    });

    return () => {
      offUser && offUser();
      offSeries && offSeries();
      offCards && offCards();
    };
  }, [uid]);

  const boxesReady = useMemo(() => {
    if (!user) return 0;
    return (user.boxesEarned || 0) - (user.boxesOpened || 0);
  }, [user]);

  const openBox = async (type = "standardBox") => {
    const fn = httpsCallable(functions, "openBlindBox");
    const res = await fn({ boxType: type });

    const normalized = normalizeDrop(res?.data);
    // UI eski davranışı bozulmasın diye “drop objesi” döndürüyoruz
    return normalized;
  };

  const incStar = async () => {
    const fn = httpsCallable(functions, "incrementStars");
    await fn({});
  };

  return { series, cards, boxesReady, openBox, incStar };
}
