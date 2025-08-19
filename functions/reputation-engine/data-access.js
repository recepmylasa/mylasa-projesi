'use strict';

/**
 * Bu dosya SADECE veri erişimi içerir.
 * Buraya "db" DI (Dependency Injection) ile gelecek.
 * admin.initializeApp() çağrısı index.js'de olmalı (2.2'de kontrol edeceğiz).
 */

const paths = {
  content: (id) => `content/${id}`,
  contentRatings: (id, raterId) => `content/${id}/ratings/${raterId}`,
  userStats: (uid) => `userStats/${uid}`,
  users: (uid) => `users/${uid}`,
};

async function readContentAgg(db, contentId) {
  const snap = await db.doc(paths.content(contentId)).get();
  return snap.exists ? snap.data()?.agg : null;
}

async function writeContentAgg(db, contentId, aggPatch) {
  // agg.* alanlarını merge edecek şekilde yazar
  await db.doc(paths.content(contentId)).set({ agg: { ...aggPatch } }, { merge: true });
}

async function readUserStats(db, uid) {
  const snap = await db.doc(paths.userStats(uid)).get();
  return snap.exists ? snap.data() : null;
}

async function writeUserStats(db, uid, stats) {
  await db.doc(paths.userStats(uid)).set({ ...stats }, { merge: true });
}

async function writeUserReputation(db, uid, reputation, badges) {
  const payload = {};
  if (reputation) payload.reputation = reputation;
  if (badges) payload.badges = badges;
  await db.doc(paths.users(uid)).set(payload, { merge: true });
}

module.exports = {
  paths,
  readContentAgg,
  writeContentAgg,
  readUserStats,
  writeUserStats,
  writeUserReputation,
};
