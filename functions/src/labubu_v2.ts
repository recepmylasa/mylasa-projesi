import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const REGION = "europe-west3";
const SERIES_ID = "S1";

// RNG: rarity seçildikten sonra pool eşit olasılık
const hashSeed = (s: string) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
};

const pickWeighted = (rng: number, weights: Record<string, number>) => {
  const arr = Object.entries(weights || {}).filter(([, w]) => Number(w) > 0);
  const total = arr.reduce((a, [, w]) => a + Number(w), 0);
  if (!arr.length || !total) return arr[0]?.[0] || "common";

  let r = rng * total;
  for (const [k, w] of arr) {
    r -= Number(w);
    if (r <= 0) return k;
  }
  return arr[arr.length - 1][0];
};

async function getSeriesOrThrow() {
  const s = await db.collection("series").doc(SERIES_ID).get();
  if (!s.exists) throw new HttpsError("not-found", "Series not found");
  return s.data() as any;
}

// 4.1 Seri tohumlama (tek seferlik)
export const seedSeriesS1 = onCall({ region: REGION }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Giriş yap.");

  const ref = db.collection("series").doc(SERIES_ID);
  const snap = await ref.get();
  if (snap.exists) return { ok: true, seeded: false, reason: "already-exists" };

  const data = {
    id: "S1",
    name: "Series 1",
    active: true,
    boxThreshold: 100,
    pityRareAt: 30,
    weights: {
      standardBox: { common: 0.88, rare: 0.12, legendaryHidden: 0.0 },
      milestoneBox: { common: 0.7, rare: 0.29, legendaryHidden: 0.01 }
    },
    legendaryCaps: { AURORA: 250, VOID: 100 },
    milestones: [5, 1000, 5000, 10000, 25000, 50000],
    milestoneRewards: { "5": 1, "1000": 1, "5000": 1, "10000": 1, "25000": 1, "50000": 2 },
    cards: [
      { code: "S1-LOVE", name: "LOVE", rarity: "common", asset: "/cards/S1/LOVE.png" },
      { code: "S1-HAPPINESS", name: "HAPPINESS", rarity: "common", asset: "/cards/S1/HAPPINESS.jpg.png" },
      { code: "S1-SERENITY", name: "SERENITY", rarity: "common", asset: "/cards/S1/SERENITY.jpg.png" },
      { code: "S1-HOPE", name: "HOPE", rarity: "common", asset: "/cards/S1/HOPE.png" },
      { code: "S1-LOYALTY", name: "LOYALTY", rarity: "rare", asset: "/cards/S1/LOYALTY.jpg.png" },
      { code: "S1-AURORA", name: "AURORA", rarity: "legendaryHidden", asset: "/cards/S1/AURORA.jpg.png", hidden: true },
      { code: "S1-VOID", name: "VOID", rarity: "legendaryHidden", asset: "/cards/S1/VOID.jpg.png", hidden: true }
    ]
  };

  await ref.set(data, { merge: true });
  return { ok: true, seeded: true };
});

// 4.2 Yıldız sayacı: oy verildikçe kutu kazandırır
export const incrementStars = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login required");

  const series = await getSeriesOrThrow();
  const userRef = db.collection("users").doc(uid);

  await db.runTransaction(async (tx) => {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const uSnap = await tx.get(userRef);
    const u = uSnap.exists ? (uSnap.data() as any) : { starsTotal: 0, boxesEarned: 0, boxesOpened: 0 };

    const starsTotal = (u.starsTotal || 0) + 1;
    let boxesEarned = u.boxesEarned || 0;

    if (starsTotal % (series.boxThreshold || 100) === 0) boxesEarned += 1;

    const milestones: number[] = series.milestones || [];
    const rewards: Record<string, number> = series.milestoneRewards || {};
    const prev = u.starsTotal || 0;

    for (const ms of milestones) {
      if (prev < ms && starsTotal >= ms) {
        boxesEarned += rewards[String(ms)] || 1;
        tx.set(userRef.collection("notifications").doc(), { type: "milestone_box", ms, at: now });
      }
    }

    tx.set(userRef, { starsTotal, boxesEarned, updatedAt: now }, { merge: true });
  });

  return { ok: true };
});

// 4.3 Kutu açma
export const openBlindBox = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login required");

  const boxType = String(req.data?.boxType || "standardBox");
  if (!["standardBox", "milestoneBox"].includes(boxType)) {
    throw new HttpsError("invalid-argument", "Invalid box type");
  }

  const series = await getSeriesOrThrow();
  const userRef = db.collection("users").doc(uid);
  const cardsCol = userRef.collection("cards");
  const dropsCol = userRef.collection("drops");

  const now = admin.firestore.Timestamp.now();
  const seed = `${uid}|${now.seconds}.${now.nanoseconds}|${boxType}`;
  const rng = hashSeed(seed);

  const result = await db.runTransaction(async (tx) => {
    const uSnap = await tx.get(userRef);
    const u = uSnap.exists ? (uSnap.data() as any) : null;

    const ready = (u?.boxesEarned || 0) - (u?.boxesOpened || 0);
    if (ready <= 0) throw new HttpsError("failed-precondition", "No boxes ready");

    const day = new Date().toISOString().slice(0, 10);
    const openedToday = u?.[`opened_${day}`] || 0;
    if (boxType === "standardBox" && openedToday >= 5) {
      throw new HttpsError("resource-exhausted", "Daily open limit");
    }

    const weights = (series.weights && series.weights[boxType]) || { common: 1 };
    let rarity = pickWeighted(rng, weights);
    let chosen: any = null;

    if (rarity === "legendaryHidden") {
      const order = [
        { code: "S1-AURORA", key: "AURORA" },
        { code: "S1-VOID", key: "VOID" }
      ];

      for (const o of order) {
        const capDoc = db.collection("global_legendary_caps").doc(o.code);
        const capSnap = await tx.get(capDoc);

        const initial = series.legendaryCaps?.[o.key] || 0;
        const left = capSnap.exists ? (capSnap.data() as any).left || 0 : initial;

        if (left > 0) {
          chosen = (series.cards || []).find((c: any) => c.code === o.code);
          tx.set(capDoc, { left: left - 1 }, { merge: true });
          break;
        }
      }

      if (!chosen) rarity = "rare";
    }

    if (!chosen) {
      const pool = (series.cards || []).filter((c: any) => c.rarity === rarity);
      if (!pool.length) {
        throw new HttpsError("failed-precondition", `No cards available in pool for rarity "${rarity}"`);
      }
      const idx = Math.min(pool.length - 1, Math.floor(rng * pool.length));
      chosen = pool[idx];
    }

    if (!chosen) throw new HttpsError("internal", "Drop selection failed");

    const cardRef = cardsCol.doc(chosen.code);
    const cardSnap = await tx.get(cardRef);
    const dupe = cardSnap.exists;

    const prevCount = cardSnap.exists ? Number((cardSnap.data() as any)?.count || 0) : 0;

    tx.set(
      cardRef,
      {
        seriesId: SERIES_ID,
        code: chosen.code,
        name: chosen.name,
        rarity,
        asset: chosen.asset,
        count: prevCount + 1,
        obtainedAt: now,
        lastSrc: boxType
      },
      { merge: true }
    );

    tx.set(
      userRef,
      {
        boxesOpened: (u?.boxesOpened || 0) + 1,
        [`opened_${day}`]: openedToday + 1
      },
      { merge: true }
    );

    tx.set(dropsCol.doc(), { seriesId: SERIES_ID, code: chosen.code, rarity, dupe, createdAt: now });

    return { ...chosen, rarity, dupe };
  });

  return { ok: true, drop: result };
});
