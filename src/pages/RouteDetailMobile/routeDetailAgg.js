// src/pages/RouteDetailMobile/routeDetailAgg.js
import { db } from "../../firebase";
import {
  collection,
  getDocs,
  limit as qlimit,
  query,
  where,
} from "firebase/firestore";

export async function getRouteStarsAgg(routeId, max = 1000) {
  const col = collection(db, "route_ratings");
  const q = query(col, where("routeId", "==", routeId), qlimit(Math.max(1, max)));
  const snap = await getDocs(q);

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;

  snap.forEach((d) => {
    const v = Number(d.data()?.value);
    if (v >= 1 && v <= 5) {
      counts[v] = (counts[v] || 0) + 1;
      sum += v;
      total += 1;
    }
  });

  const avg = total ? sum / total : 0;
  return { counts, total, avg };
}

export async function getStopsStarsAgg(routeId, max = 1000) {
  const col = collection(db, "stop_ratings");
  const q = query(col, where("routeId", "==", routeId), qlimit(Math.max(1, max)));
  const snap = await getDocs(q);

  const map = {};
  snap.forEach((d) => {
    const data = d.data() || {};
    const sid = String(data.stopId || "");
    if (!sid) return;
    const v = Number(data.value);
    if (!(v >= 1 && v <= 5)) return;

    if (!map[sid]) {
      map[sid] = {
        counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        total: 0,
        avg: 0,
        __sum: 0,
      };
    }

    map[sid].counts[v] += 1;
    map[sid].__sum += v;
    map[sid].total += 1;
  });

  Object.keys(map).forEach((sid) => {
    const it = map[sid];
    it.avg = it.total ? it.__sum / it.total : 0;
    delete it.__sum;
  });

  return map;
}
