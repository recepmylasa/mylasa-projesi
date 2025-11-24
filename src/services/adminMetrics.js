// src/services/adminMetrics.js
import { db, functions } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  documentId,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

/**
 * Verilen tarih aralığı için günlük agg dokümanlarını çeker.
 * Kaynak: metrics_share_agg/daily/{YYYY-MM-DD}
 */
export async function fetchDailyAgg(from, to) {
  const colRef = collection(db, "metrics_share_agg", "daily");

  const q = query(
    colRef,
    where(documentId(), ">=", from),
    where(documentId(), "<=", to),
    orderBy(documentId(), "asc")
  );

  const snap = await getDocs(q);

  const days = [];
  snap.forEach((doc) => {
    const d = doc.data() || {};
    days.push({
      date: doc.id,
      total_clicks: Number(d.total_clicks || 0),
      by_mode: d.by_mode || {},
      by_platform: d.by_platform || {},
      routes_top: d.routes_top || [],
      first_ts:
        d.first_ts && d.first_ts.toDate
          ? d.first_ts.toDate().toISOString()
          : "",
      last_ts:
        d.last_ts && d.last_ts.toDate
          ? d.last_ts.toDate().toISOString()
          : "",
    });
  });

  return days;
}

/**
 * exportShareAggCsv callable'ını çağırır ve
 * CSV dosyasını share-metrics-YYYYMMDD-YYYYMMDD.csv olarak indirir.
 */
export async function downloadAggCsv(from, to) {
  const callable = httpsCallable(functions, "exportShareAggCsv");
  const res = await callable({ from, to });
  const data = res.data || {};
  const csvBase64 = data.csvBase64;
  if (!csvBase64) return;

  const csvText = atob(csvBase64);
  const blob = new Blob([csvText], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `share-metrics-${from}-${to}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
