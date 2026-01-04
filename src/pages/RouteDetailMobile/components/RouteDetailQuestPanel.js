// src/pages/RouteDetailMobile/components/RouteDetailQuestPanel.js
import React, { useMemo } from "react";
import "./RouteDetailQuestPanel.css";

export default function RouteDetailQuestPanel({
  questState,
  startQuest,
  stopQuest,
  finishQuest,
  questLocLine,
  ghostMetrics,
}) {
  const isActive = questState === "active";

  const ui = useMemo(() => {
    const m = ghostMetrics || null;

    const completion = typeof m?.completion === "number" && Number.isFinite(m.completion) ? m.completion : 0;
    const clamped = Math.max(0, Math.min(1, completion));
    const percent = Math.round(clamped * 100);

    const visitedCount = Number.isFinite(m?.visitedCount) ? m.visitedCount : 0;
    const total = Number.isFinite(m?.totalCheckpoints) ? m.totalCheckpoints : 0;

    const distanceToRouteM =
      typeof m?.distanceToRouteM === "number" && Number.isFinite(m.distanceToRouteM) ? m.distanceToRouteM : null;

    const offRoute = !!m?.offRoute;
    const canFinish = !!m?.canFinish;

    return {
      percent,
      visitedCount,
      total,
      distanceToRouteM,
      offRoute,
      canFinish,
      progressWidthPct: `${Math.max(0, Math.min(100, percent))}%`,
    };
  }, [ghostMetrics]);

  const onFinishClick = () => {
    if (typeof finishQuest !== "function") return;
    finishQuest();
  };

  return (
    <div className="rdq-panel" role="region" aria-label="Quest paneli">
      <div className="rdq-top">
        <span className="rdq-pill">Quest modu (beta)</span>
      </div>

      {!isActive ? (
        <div className="rdq-idle">
          <button type="button" className="rdq-btn rdq-btn-primary" onClick={startQuest}>
            Rotayı başlat
          </button>

          {questLocLine === "Tamamlandı" && <div className="rdq-idle-note">Tamamlandı</div>}
        </div>
      ) : (
        <div className="rdq-active">
          <div className="rdq-status-row">
            <div className="rdq-status-left">
              <span className="rdq-dot" aria-hidden="true" />
              <span className="rdq-status-text">Devam ediyor</span>
            </div>

            <div className="rdq-actions">
              <button type="button" className="rdq-btn rdq-btn-ghost" onClick={stopQuest}>
                Durdur
              </button>

              <button
                type="button"
                className="rdq-btn rdq-btn-primary"
                onClick={onFinishClick}
                disabled={!ui.canFinish}
                aria-disabled={!ui.canFinish}
                title={!ui.canFinish ? "Bitirmek için %85 tamamla" : "Bitir"}
              >
                Bitir
              </button>
            </div>
          </div>

          {questLocLine ? <div className="rdq-locline">{questLocLine}</div> : null}

          {ui.offRoute && (
            <div className="rdq-warning" role="alert">
              <strong>Uyarı</strong>
              <span className="rdq-warning-sep">·</span>
              <span>Rotadan saptın</span>
              <span className="rdq-warning-sep">·</span>
              <span>{ui.distanceToRouteM != null ? `${Math.round(ui.distanceToRouteM)}m` : "—"}</span>
            </div>
          )}

          <div className="rdq-progress">
            <div className="rdq-progress-head">
              <div className="rdq-progress-left">
                <div className="rdq-bar" aria-label="İlerleme">
                  <div className="rdq-bar-fill" style={{ width: ui.progressWidthPct }} />
                </div>
                <div className="rdq-percent">%{ui.percent}</div>
              </div>

              <span className="rdq-chip" title="Tamamlamak için hedef">
                Hedef: %85
              </span>
            </div>

            <div className="rdq-progress-sub">
              <div className="rdq-sub-left">
                Checkpoint: {ui.total > 0 ? `${ui.visitedCount}/${ui.total}` : "—"}
              </div>

              {!ui.canFinish && (
                <div className="rdq-sub-right">Bitirmek için en az %85 tamamla.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
