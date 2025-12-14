import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

const REGION = "europe-west3";

const PRIOR_MEAN = 3.5;

export const backfillContentStubs = onCall(
  { region: REGION, timeoutSeconds: 540 },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Giriş yap.");
    const limitPerType = Number(req.data?.maxPerType || 1000);

    const defAgg = {
      count: 0,
      sum: 0,
      byStar: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
      bayes: PRIOR_MEAN,
      weight: 0,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    async function backfill(collName: string, type: "post" | "story" | "clip") {
      const snap = await db.collection(collName).limit(limitPerType).get();

      let n = 0;
      let batch = db.batch();

      for (const docSnap of snap.docs) {
        const id = docSnap.id;
        const data = (docSnap.data() as any) || {};
        const authorId = data.authorId || data.userId || data.uid;
        if (!authorId) continue;

        const contentRef = db.collection("content").doc(id);
        batch.set(
          contentRef,
          {
            authorId,
            type,
            createdAt:
              data.createdAt ||
              data.tarih ||
              admin.firestore.FieldValue.serverTimestamp(),
            agg: defAgg
          },
          { merge: true }
        );

        n++;
        if (n % 400 === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }

      if (n % 400 !== 0) await batch.commit();
      return n;
    }

    const createdPosts = await backfill("posts", "post");
    const createdStories = await backfill("hikayeler", "story");
    const createdClips = await backfill("clips", "clip");

    return {
      ok: true,
      created: { posts: createdPosts, hikayeler: createdStories, clips: createdClips }
    };
  }
);
