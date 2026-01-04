// src/pages/RouteDetailMobile/hooks/useRouteDetailQuest.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  start as startGeoStream,
  stop as stopGeoStream,
  subscribe as subscribeGeoStream,
} from "../../../services/locationStream";
import { buildCheckpointsFromStops, computeGhostMetrics } from "../../../services/ghostQuestEngine";
import { normalizeLatLng } from "../../../services/geoUtils";
import { claimRouteDrop } from "../../../services/routeDropsClient";

export default function useRouteDetailQuest({ routeId, enabled, path, stops }) {
  const safeEnabled = !!enabled && !!routeId;

  const [questState, setQuestState] = useState("idle"); // "idle" | "active"
  const [questLocLine, setQuestLocLine] = useState("");
  const [ghostMetrics, setGhostMetrics] = useState(null);
  const [visited, setVisited] = useState(() => new Set());

  const unsubRef = useRef(null);
  const runningRef = useRef(false);
  const finishTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const claimInFlightRef = useRef(false);

  const checkpoints = useMemo(() => buildCheckpointsFromStops(stops || []), [stops]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearFinishTimer = useCallback(() => {
    try {
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    } catch {}
    finishTimerRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    clearFinishTimer();

    try {
      if (typeof unsubRef.current === "function") unsubRef.current();
    } catch {}
    unsubRef.current = null;

    try {
      stopGeoStream();
    } catch {}

    runningRef.current = false;
  }, [clearFinishTimer]);

  // enabled gate: kapalıysa her şeyi sıfırla, side-effect yok
  useEffect(() => {
    if (!safeEnabled) {
      cleanup();
      claimInFlightRef.current = false;
      setQuestState("idle");
      setQuestLocLine("");
      setGhostMetrics(null);
      setVisited(new Set());
      return;
    }

    return () => {
      cleanup();
      claimInFlightRef.current = false;
    };
  }, [safeEnabled, cleanup]);

  const startQuest = useCallback(() => {
    if (!safeEnabled) return;

    clearFinishTimer();
    claimInFlightRef.current = false;

    setQuestState((prev) => (prev === "active" ? prev : "active"));

    // start/reset
    setVisited(new Set());
    setGhostMetrics(null);
    setQuestLocLine("Konum bekleniyor…");

    if (runningRef.current) return;
    runningRef.current = true;

    try {
      startGeoStream({
        highAccuracy: true,
        minIntervalMs: 1200,
        maximumAgeMs: 1500,
        timeoutMs: 15000,
      });
    } catch {}

    try {
      unsubRef.current = subscribeGeoStream((payload) => {
        if (!runningRef.current) return;

        const lat = payload?.lat;
        const lng = payload?.lng;

        const pos = normalizeLatLng({ lat, lng });
        if (!pos) {
          if (payload?.error) setQuestLocLine("Konum hatası…");
          else setQuestLocLine("Konum bekleniyor…");
          return;
        }

        setVisited((prevSet) => {
          const metrics = computeGhostMetrics({
            pos,
            path: Array.isArray(path) ? path : [],
            checkpoints,
            visited: prevSet instanceof Set ? prevSet : new Set(),
            options: {
              offRouteThresholdM: 35,
              checkpointRadiusM: 25,
              completionTarget: 0.85,
            },
          });

          const nextVisited =
            metrics?.nextVisited instanceof Set ? metrics.nextVisited : new Set(prevSet);

          const total = Number(metrics?.totalCheckpoints) || 0;
          const visitedCount = Number(metrics?.visitedCount) || 0;

          const completion =
            typeof metrics?.completion === "number" && Number.isFinite(metrics.completion)
              ? metrics.completion
              : 0;

          const percent = Math.max(0, Math.min(1, completion));
          const pctText = Math.round(percent * 100);

          const dist = metrics?.distanceToRouteM;
          const distText =
            typeof dist === "number" && Number.isFinite(dist) ? `${Math.round(dist)}m` : "—";

          const base = `Sapma: ${distText} · Checkpoint: ${visitedCount}/${total} · %${pctText}`;

          if (metrics?.offRoute)
            setQuestLocLine(`SAPMA! ${distText} · Checkpoint: ${visitedCount}/${total} · %${pctText}`);
          else setQuestLocLine(base);

          setGhostMetrics({
            distanceToRouteM: metrics?.distanceToRouteM ?? null,
            offRoute: !!metrics?.offRoute,
            visitedCount,
            totalCheckpoints: total,
            completion: percent,
            canFinish: !!metrics?.canFinish,
            nearestCheckpointM: metrics?.nearestCheckpointM ?? null,
          });

          return nextVisited;
        });
      });
    } catch {
      setQuestLocLine("Konum bekleniyor…");
    }
  }, [safeEnabled, path, checkpoints, clearFinishTimer]);

  const stopQuest = useCallback(() => {
    clearFinishTimer();
    claimInFlightRef.current = false;

    setQuestState("idle");
    setQuestLocLine("");
    setGhostMetrics(null);
    setVisited(new Set());
    cleanup();
  }, [cleanup, clearFinishTimer]);

  const finishQuest = useCallback(async () => {
    if (!safeEnabled) return;
    if (!ghostMetrics?.canFinish) return;
    if (claimInFlightRef.current) return;

    claimInFlightRef.current = true;

    // Önce stream’i kes
    cleanup();

    // Quest kapanışı + ödül akışı mesajları
    setQuestState("idle");
    setGhostMetrics(null);
    setVisited(new Set());
    setQuestLocLine("Ödül alınıyor…");

    clearFinishTimer();

    try {
      const res = await claimRouteDrop(routeId);

      if (!mountedRef.current) return;

      if (res?.ok && res?.alreadyClaimed) {
        setQuestLocLine("Bu rotanın ödülünü daha önce aldın.");
      } else if (res?.ok) {
        setQuestLocLine("Kutu kazandın! (Profil → Koleksiyon)");
      } else {
        setQuestLocLine("Ödül alınamadı.");
      }
    } catch {
      if (!mountedRef.current) return;
      setQuestLocLine("Ödül alınamadı.");
    } finally {
      claimInFlightRef.current = false;

      clearFinishTimer();
      finishTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setQuestLocLine("");
        finishTimerRef.current = null;
      }, 2200);
    }
  }, [safeEnabled, ghostMetrics, cleanup, clearFinishTimer, routeId]);

  return {
    questState,
    startQuest,
    stopQuest,
    finishQuest,
    questLocLine,
    ghostMetrics,
  };
}
