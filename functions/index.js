// -----------------------------------------------------
// Mylasa Cloud Functions (Node 20, v2 API)
// - Video işleme
// - Rating agg + reputasyon
// - Backfill + Labubu Series S1 seeding
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

/* =====================================================
 * 1) VIDEO İŞLEME
 * ===================================================== */
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

/* =====================================================
 * 2) RATING AGG + REPUTASYON
 * ===================================================== */
const PRIOR_MEAN = 3.5;      // μ
const PRIOR_STRENGTH = 100;  // K

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

/* =====================================================
 * 3) BACKFILL (idempotent)
 * ===================================================== */
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

/* =====================================================
 * 4) Labubu Series S1 – SEED callable
 * ===================================================== */
exports.seedSeriesS1 = onCall(
  { region: REGION },
  async (req) => {
    // Basit yetkilendirme: sadece giriş yapmış kullanıcı
    // (İstersen custom claims ile admin kontrolü ekleyebilirsin)
    if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Giriş yap.");

    const SERIES_ID = "S1";
    const assetsBase = "cards/S1/"; // Storage path kökü

    const seriesDoc = {
      id: SERIES_ID,
      name: "Series 1",
      active: true,
      boxThreshold: 100,
      pityRareAt: 30,
      weights: {
        standardBox: { common: 0.88, rare: 0.12, legendaryHidden: 0.0 },
        milestoneBox: { common: 0.70, rare: 0.29, legendaryHidden: 0.01 },
      },
      legendaryCaps: { AURORA: 250, VOID: 100 },
      milestones: [5, 1000, 5000, 10000, 25000, 50000],
      milestoneRewards: { "5": 1, "1000": 1, "5000": 1, "10000": 1, "25000": 1, "50000": 2 },
      cards: [
        { code:"S1-LOVE",       name:"LOVE",       rarity:"common",           asset: assetsBase + "LOVE.jpg" },
        { code:"S1-HAPPINESS",  name:"HAPPINESS",  rarity:"common",           asset: assetsBase + "HAPPINESS.jpg" },
        { code:"S1-SERENITY",   name:"SERENITY",   rarity:"common",           asset: assetsBase + "SERENITY.jpg" },
        { code:"S1-HOPE",       name:"HOPE",       rarity:"common",           asset: assetsBase + "HOPE.jpg" },
        { code:"S1-LOYALTY",    name:"LOYALTY",    rarity:"rare",             asset: assetsBase + "LOYALTY.jpg" },
        { code:"S1-AURORA",     name:"AURORA",     rarity:"legendaryHidden",  asset: assetsBase + "AURORA.jpg", hidden: true },
        { code:"S1-VOID",       name:"VOID",       rarity:"legendaryHidden",  asset: assetsBase + "VOID.jpg",   hidden: true },
      ],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("series").doc(SERIES_ID).set(seriesDoc, { merge: true });

    // Legendary global cap dokümanlarını hazırla
    const capsCol = db.collection("global_legendary_caps");
    const capDocs = [
      { id: "S1-AURORA", left: 250 },
      { id: "S1-VOID",   left: 100 },
    ];
    for (const c of capDocs) {
      await capsCol.doc(c.id).set({ left: c.left }, { merge: true });
    }

    return { ok: true, series: SERIES_ID, cards: seriesDoc.cards.length };
  }
);
