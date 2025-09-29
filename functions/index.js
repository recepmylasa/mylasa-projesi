// -----------------------------------------------------
// Mylasa Cloud Functions (Node 20, v2 API)
// - Video işleme
// - Rating agg + reputasyon
// - Blind Box (Labubu): incrementStars, openBlindBox, seedSeriesS1
// -----------------------------------------------------

const admin = require("firebase-admin");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const os = require("os");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpeg_static = require("ffmpeg-static");

// v2 imports
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp();
const db = admin.firestore();
const gcs = new Storage();
ffmpeg.setFfmpegPath(ffmpeg_static);

const REGION = "europe-west3";

// ================== 1) VIDEO İŞLEME ==================
exports.processUploadedVideo = onObjectFinalized(
  { region: REGION, timeoutSeconds: 540, memory: "1GiB" },
  async (event) => {
    const fileBucket = event.data.bucket;
    const filePath = event.data.name;
    const contentType = event.data.contentType || "";

    const bucket = gcs.bucket(fileBucket);
    const rawUploadsPrefix = "raw-uploads/";

    if (!filePath || !filePath.startsWith(rawUploadsPrefix) || !contentType.startsWith("video/")) {
      return;
    }

    const parts = filePath.split("/");
    if (parts.length !== 3) return;

    const userId = parts[1];
    const clipId = path.basename(filePath, path.extname(filePath));

    const tempFilePath = path.join(os.tmpdir(), `raw_${clipId}`);
    const targetTempFilePath = path.join(os.tmpdir(), `processed_${clipId}.mp4`);

    try {
      await bucket.file(filePath).download({ destination: tempFilePath });

      await new Promise((resolve, reject) => {
        ffmpeg(tempFilePath)
          .outputOptions([
            "-c:v libx264",
            "-preset fast",
            "-crf 24",
            "-c:a aac",
            "-b:a 128k",
            "-vf", "scale=-2:720",
            "-movflags", "faststart",
          ])
          .on("end", resolve)
          .on("error", reject)
          .save(targetTempFilePath);
      });

      const destinationPath = `clips_media/${userId}/processed_${clipId}.mp4`;
      const [uploadedFile] = await bucket.upload(targetTempFilePath, {
        destination: destinationPath,
        metadata: { contentType: "video/mp4" },
      });

      await uploadedFile.makePublic();
      const publicUrl = uploadedFile.publicUrl();

      await db.collection("clips").doc(clipId).set(
        { mediaUrl: publicUrl, status: "processed" },
        { merge: true }
      );
    } catch (error) {
      console.error("processUploadedVideo error:", error);
      await db.collection("clips").doc(clipId).set(
        { status: "error", errorMessage: String(error?.message || error) },
        { merge: true }
      );
    } finally {
      try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch {}
      try { if (fs.existsSync(targetTempFilePath)) fs.unlinkSync(targetTempFilePath); } catch {}
      try { await bucket.file(filePath).delete(); } catch {}
    }
  }
);

// ================== 2) RATING AGG + REPUTASYON ==================
const PRIOR_MEAN = 3.5;     // μ
const PRIOR_STRENGTH = 100; // K

function bayes(sum, count) {
  return (PRIOR_STRENGTH * PRIOR_MEAN + sum) / (PRIOR_STRENGTH + count);
}
function weightOf(count) {
  return Math.log(1 + count);
}

exports.onRatingWrite = onDocumentWritten(
  { region: REGION, document: "content/{contentId}/ratings/{raterId}" },
  async (event) => {
    const { contentId } = event.params || {};
    const after = event.data?.after;
    const before = event.data?.before;

    const ratingAfter = after?.exists ? after.data() : null;
    const ratingBefore = before?.exists ? before.data() : null;
    const authorId = ratingAfter?.authorId || ratingBefore?.authorId;
    if (!contentId || !authorId) return;

    // 1) İçeriğin tüm oylarını topla
    const ratingsSnap = await db.collection("content").doc(contentId).collection("ratings").get();

    let count = 0, sum = 0;
    const byStar = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };

    ratingsSnap.forEach((d) => {
      const v = Number(d.data()?.value || 0);
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
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

    // 2) Kullanıcının itibarını yeniden hesapla
    await recomputeUserReputationInternal(authorId);
  }
);

async function recomputeUserReputationInternal(uid) {
  const snap = await db.collection("content").where("authorId", "==", uid).get();

  let weightedSum = 0;
  let totalWeight = 0;
  let sample = 0;

  snap.forEach((d) => {
    const a = d.data()?.agg || {};
    const c = Number(a.count || 0);
    const s = Number(a.sum || 0);
    const b = (typeof a.bayes === "number" ? a.bayes : bayes(s, c));
    const w = (typeof a.weight === "number" ? a.weight : weightOf(c));
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
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      },
      badges: {
        gold,
        since: gold ? admin.firestore.FieldValue.serverTimestamp() : null,
      },
    },
    { merge: true }
  );

  return { raw, visible, progress, sample, gold };
}

exports.recomputeUserReputation = onCall(
  { region: REGION },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Giriş yap.");
    const uid = req.data?.uid || req.auth.uid;
    const res = await recomputeUserReputationInternal(uid);
    return { ok: true, ...res };
  }
);

// ================== 3) BACKFILL (idempotent) ==================
exports.backfillContentStubs = onCall(
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
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };

    async function backfill(collName, type) {
      const snap = await db.collection(collName).limit(limitPerType).get();

      let n = 0;
      let batch = db.batch();

      for (const docSnap of snap.docs) {
        const id = docSnap.id;
        const data = docSnap.data() || {};
        const authorId = data.authorId || data.userId || data.uid;
        if (!authorId) continue;

        const contentRef = db.collection("content").doc(id);
        batch.set(
          contentRef,
          {
            authorId,
            type, // 'post' | 'story' | 'clip'
            createdAt: data.createdAt || data.tarih || admin.firestore.FieldValue.serverTimestamp(),
            agg: defAgg,
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

    return { ok: true, created: { posts: createdPosts, hikayeler: createdStories, clips: createdClips } };
  }
);

// ================== 4) BLIND BOX (Labubu) ==================
const SERIES_ID = "S1";

/* helpers */
const hashSeed = (s) => { let h = 2166136261>>>0; for (let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return (h>>>0)/4294967295; };
const pickWeighted = (rng, weights) => {
  const arr = Object.entries(weights).filter(([,w])=>w>0);
  const total = arr.reduce((a,[,w])=>a+w,0);
  let r = rng*total; for (const [k,w] of arr){ if((r-=w)<=0) return k; }
  return arr[arr.length-1][0];
};

async function getSeriesOrThrow() {
  const s = await db.collection("series").doc(SERIES_ID).get();
  if (!s.exists) throw new HttpsError("not-found","Series not found");
  return s.data();
}

// 4.1 Seri tohumlama (tek seferlik)
exports.seedSeriesS1 = onCall({ region: REGION }, async (req) => {
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
      milestoneBox: { common: 0.70, rare: 0.29, legendaryHidden: 0.01 }
    },
    legendaryCaps: { AURORA: 250, VOID: 100 },
    milestones: [5, 1000, 5000, 10000, 25000, 50000],
    milestoneRewards: { "5": 1, "1000": 1, "5000": 1, "10000": 1, "25000": 1, "50000": 2 },
    cards: [
      { code:"S1-LOVE", "name":"LOVE", "rarity":"common", "asset":"/cards/S1/LOVE.jpg" },
      { code:"S1-HAPPINESS", "name":"HAPPINESS", "rarity":"common", "asset":"/cards/S1/HAPPINESS.jpg" },
      { code:"S1-SERENITY", "name":"SERENITY", "rarity":"common", "asset":"/cards/S1/SERENITY.jpg" },
      { code:"S1-HOPE", "name":"HOPE", "rarity":"common", "asset":"/cards/S1/HOPE.jpg" },
      { code:"S1-LOYALTY", "name":"LOYALTY", "rarity":"rare", "asset":"/cards/S1/LOYALTY.jpg" },
      { code:"S1-AURORA", "name":"AURORA", "rarity":"legendaryHidden", "asset":"/cards/S1/AURORA.jpg", "hidden":true },
      { code:"S1-VOID", "name":"VOID", "rarity":"legendaryHidden", "asset":"/cards/S1/VOID.jpg", "hidden":true }
    ]
  };

  await ref.set(data, { merge: true });
  return { ok: true, seeded: true };
});

// 4.2 Yıldız sayacı: oy verildikçe kutu kazandırır
exports.incrementStars = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated","Login required");

  const series = await getSeriesOrThrow();
  const userRef = db.collection("users").doc(uid);

  await db.runTransaction(async (tx)=>{
    const now = admin.firestore.FieldValue.serverTimestamp();
    const uSnap = await tx.get(userRef);
    const u = uSnap.exists ? uSnap.data() : { starsTotal:0, boxesEarned:0, boxesOpened:0 };
    const starsTotal = (u.starsTotal||0) + 1;
    let boxesEarned = u.boxesEarned||0;

    // 100 yıldızda bir standart kutu
    if (starsTotal % (series.boxThreshold||100) === 0) boxesEarned += 1;

    // milestone kutuları
    const milestones = series.milestones||[];
    const rewards = series.milestoneRewards||{};
    const prev = u.starsTotal||0;
    for (const ms of milestones) if (prev < ms && starsTotal >= ms) {
      boxesEarned += (rewards[String(ms)]||1);
      tx.set(userRef.collection("notifications").doc(), { type:"milestone_box", ms, at: now });
    }

    tx.set(userRef, { starsTotal, boxesEarned, updatedAt: now }, { merge: true });
  });

  return { ok:true };
});

// 4.3 Kutu açma
exports.openBlindBox = onCall({ region: REGION }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated","Login required");

  const { boxType="standardBox" } = req.data || {};
  if (!["standardBox","milestoneBox"].includes(boxType)) {
    throw new HttpsError("invalid-argument","Invalid box type");
  }

  const series = await getSeriesOrThrow();
  const userRef = db.collection("users").doc(uid);
  const cardsCol = userRef.collection("cards");
  const dropsCol = userRef.collection("drops");

  const now = admin.firestore.Timestamp.now();
  const seed = `${uid}|${now.seconds}.${now.nanoseconds}|${boxType}`;
  const rng = hashSeed(seed);

  const result = await db.runTransaction(async (tx)=>{
    const uSnap = await tx.get(userRef);
    const u = uSnap.exists ? uSnap.data() : null;
    const ready = (u?.boxesEarned||0) - (u?.boxesOpened||0);
    if (ready <= 0) throw new HttpsError("failed-precondition","No boxes ready");

    // günlük limit (opsiyonel): standard için 5
    const day = new Date().toISOString().slice(0,10);
    const openedToday = u?.[`opened_${day}`]||0;
    if (boxType==="standardBox" && openedToday>=5) throw new HttpsError("resource-exhausted","Daily open limit");

    let rarity = pickWeighted(rng, series.weights[boxType]);
    let chosen = null;

    // Legendary-Hidden ise, global cap kontrolü
    if (rarity === "legendaryHidden") {
      const order = [{code:"S1-AURORA",key:"AURORA"},{code:"S1-VOID",key:"VOID"}];
      for (const o of order) {
        const capDoc = db.collection("global_legendary_caps").doc(o.code);
        const capSnap = await tx.get(capDoc);
        const initial = series.legendaryCaps[o.key]||0;
        const left = capSnap.exists ? (capSnap.data().left||0) : initial;
        if (left > 0) { chosen = series.cards.find(c=>c.code===o.code); tx.set(capDoc, { left: left-1 }, { merge:true }); break; }
      }
      if (!chosen) rarity = "rare";
    }

    if (!chosen) {
      const pool = series.cards.filter(c=>c.rarity===rarity);
      chosen = pool[Math.floor(rng*pool.length)];
    }

    const cardRef = cardsCol.doc(chosen.code);
    const cardSnap = await tx.get(cardRef);
    const dupe = cardSnap.exists;

    tx.set(cardRef, {
      seriesId: SERIES_ID, code: chosen.code, name: chosen.name, rarity,
      asset: chosen.asset, count: (cardSnap.data()?.count||0) + 1,
      obtainedAt: now, lastSrc: boxType
    }, { merge:true });

    tx.set(userRef, { boxesOpened: (u?.boxesOpened||0)+1, [`opened_${day}`]: openedToday+1 }, { merge:true });
    tx.set(dropsCol.doc(), { seriesId: SERIES_ID, code: chosen.code, rarity, dupe, createdAt: now });

    return { ...chosen, rarity, dupe };
  });

  return { ok:true, drop: result };
});
