// src/components/BadgesBarMobile.js
// Kaydırılabilir rozet barı + yeni rozet toast
import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebase";
import { fetchBadgeCatalog, watchUserBadges } from "../services/badges";
import BadgeDetailModal from "./BadgeDetailModal";
import newBadgeToast from "../toast/newBadgeToast";

export default function BadgesBarMobile({ userId }) {
  const [catalog, setCatalog] = useState([]);
  const [earned, setEarned] = useState([]); // [{id, earnedAt, ...}]
  const [detail, setDetail] = useState(null);

  // catalog cache
  useEffect(() => {
    let mounted = true;
    fetchBadgeCatalog().then((arr) => mounted && setCatalog(arr)).catch(()=>{});
    return () => { mounted = false; };
  }, []);

  // earned listener
  useEffect(() => {
    if (!userId) return;
    let prevIds = new Set();
    const unsub = watchUserBadges(userId, (arr) => {
      const ids = new Set(arr.map((x) => x.id));
      // yeni rozet yakala (sadece kendi hesabı için toast)
      const me = auth.currentUser?.uid;
      if (me && me === userId) {
        arr.forEach((b) => {
          if (!prevIds.has(b.id)) {
            // yeni rozete toast
            const cat = catalog.find((c) => c.id === b.id);
            newBadgeToast({
              icon: cat?.icon || "🏅",
              title: "Yeni rozet!",
              text: cat?.name || b.id,
            });
          }
        });
      }
      prevIds = ids;
      setEarned(arr);
    });
    return () => unsub && unsub();
  }, [userId, catalog]);

  const mapEarned = useMemo(() => {
    const set = new Set(earned.map((e) => e.id));
    return set;
  }, [earned]);

  if (!catalog.length) return null;

  const bar = {
    display: "flex", gap: 10, overflowX: "auto", padding: "6px 10px",
    margin: "6px 0 4px",
  };
  const item = (active) => ({
    flex: "0 0 auto",
    width: 54, height: 54, borderRadius: 12,
    display: "grid", placeItems: "center",
    background: active ? "#111" : "#e5e7eb",
    color: active ? "#fff" : "#444",
    fontSize: 26, cursor: "pointer"
  });
  const name = {
    fontSize: 11, textAlign: "center", maxWidth: 64, whiteSpace: "nowrap",
    overflow: "hidden", textOverflow: "ellipsis", marginTop: 4
  };

  return (
    <div style={{padding:"6px 8px"}}>
      <div style={{fontWeight:800, fontSize:13, margin:"0 2px 6px", opacity:.8}}>
        Rozetler
      </div>
      <div style={bar} aria-label="Rozetler">
        {catalog.map((b) => {
          const active = mapEarned.has(b.id);
          return (
            <div key={b.id} style={{display:"flex", flexDirection:"column", alignItems:"center"}}>
              <div
                style={item(active)}
                onClick={() => setDetail(b)}
                title={b.name}
                role="button"
                aria-label={b.name}
              >
                <span aria-hidden>{b.icon || "🏅"}</span>
              </div>
              <div style={name}>{b.name}</div>
            </div>
          );
        })}
      </div>

      {detail && <BadgeDetailModal badge={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
