import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const REGION = "europe-west3";

const PRIOR_MEAN = 3.5;     // μ
const PRIOR_STRENGTH = 100; // K

function bayes(sum: number, count: number) {
  return (PRIOR_STRENGTH * PRIOR_MEAN + sum) / (PRIOR_STRENGTH + count);
}
function weightOf(count: number) {
  return Math.log(1 + count);
}

export const onRatingWrite = onDocumentWritten(
  { region: REGION, document: "content/{contentId}/ratings/{raterId}" },
  async (event) => {
    const contentId = String(event.params?.contentId || "");
    const after = event.data?.after;
    const before = event.data?.before;

    const ratingAfter = after?.exists ? (after.data() as any) : null;
    const ratingBefore = before?.exists ? (before.data() as any) : null;

    const authorId = ratingAfter?.authorId || ratingBefore?.authorId;
    if (!contentId || !authorId) return;

    const ratingsSnap = await db
      .collection("content")
      .doc(contentId)
      .collection("ratings")
      .get();

    let count = 0;
    let sum = 0;
    const byStar: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };

    ratingsSnap.forEach((d) => {
      const v = Number((d.data() as any)?.value || 0);
      if (v >= 1 && v <= 5) {
        count += 1;
        sum += v;
        byStar[String(v)] += 1;
      }
    });

    const bayesScore = bayes(sum, count);
    const weight = weightOf(count);

    await db.collection("content").doc(contentId).set(
      {
        agg: {
          count,
          sum,
          byStar,
          bayes: bayesScore,
          weight,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }
      },
      { merge: true }
    );

    await recomputeUserReputationInternal(String(authorId));
  }
);

async function recomputeUserReputationInternal(uid: string) {
  const snap = await db.collection("content").where("authorId", "==", uid).get();

  let weightedSum = 0;
  let totalWeight = 0;
  let sample = 0;

  snap.forEach((d) => {
    const a = (d.data() as any)?.agg || {};
    const c = Number(a.count || 0);
    const s = Number(a.sum || 0);
    const b = typeof a.bayes === "number" ? a.bayes : bayes(s, c);
    const w = typeof a.weight === "number" ? a.weight : weightOf(c);

    sample += c;
    if (w > 0) {
      weightedSum += b * w;
      totalWeight += w;
    }
  });

  const raw = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const visible = Math.floor(raw * 10) / 10;
  const progress = raw * 10 - Math.floor(raw * 10);
  const gold = visible >= 4.5 && sample >= 1000;

  await db.collection("users").doc(uid).set(
    {
      reputation: {
        raw,
        visible,
        progress,
        sample,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      },
      badges: {
        gold,
        since: gold ? admin.firestore.FieldValue.serverTimestamp() : null
      }
    },
    { merge: true }
  );

  return { raw, visible, progress, sample, gold };
}

export const recomputeUserReputation = onCall(
  { region: REGION },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Giriş yap.");
    const uid = String(req.data?.uid || req.auth.uid);
    const res = await recomputeUserReputationInternal(uid);
    return { ok: true, ...res };
  }
);
