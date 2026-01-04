// src/pages/RouteDetailMobile/components/RouteDetailAccessSheet.js
import React, { useCallback, useMemo } from "react";
import { auth } from "../../../firebase";

export default function RouteDetailAccessSheet({
  kind,
  followInitially = false,
  ownerIdForProfile = null,
  ownerPreview = null,
  onRetry = null,
  onClose = () => {
    try {
      window.history.back();
    } catch {}
  },
}) {
  const openProfile = useCallback((userId) => {
    if (!userId) return;
    try {
      window.dispatchEvent(new CustomEvent("open-profile-modal", { detail: { userId } }));
    } catch {}
  }, []);

  const { headerTitle, desc } = useMemo(() => {
    let headerTitle2 = "Rota";
    let desc2 = "Bu rota şu anda görüntülenemiyor.";
    if (kind === "not-found") {
      headerTitle2 = "Rota bulunamadı";
      desc2 = "Bağlantı hatalı olabilir veya rota kaldırılmış olabilir.";
    } else if (kind === "private") {
      headerTitle2 = "Bu rota özel";
      desc2 = "Bu rota yalnızca sahibi tarafından görüntülenebilir.";
    } else if (kind === "forbidden") {
      headerTitle2 = "Bu rota sınırlı";
      desc2 = followInitially
        ? "Rotayı görüntülemek için rota sahibini takip etmen gerekebilir."
        : "Rotayı görüntülemek için izin gerekiyor (rota özel veya takipçilere açık olabilir).";
    }
    return { headerTitle: headerTitle2, desc: desc2 };
  }, [kind, followInitially]);

  const loggedIn = !!auth.currentUser;
  const loginNote = loggedIn ? null : "Devam etmek için giriş yapman gerekebilir.";

  const btnRow = { marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" };
  const primaryBtn = {
    flex: "1 1 160px",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    padding: followInitially ? "14px 12px" : "12px 12px",
    fontWeight: 900,
    cursor: ownerIdForProfile ? "pointer" : "not-allowed",
    opacity: ownerIdForProfile ? 1 : 0.55,
  };
  const secondaryBtn = {
    flex: "1 1 160px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "#fff",
    color: "#111",
    padding: "12px 12px",
    fontWeight: 900,
    cursor: "pointer",
  };

  return (
    <div className="route-detail-backdrop" onClick={onClose}>
      <div className="route-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="route-detail-grab" />
        <div className="route-detail-header">
          <div className="route-detail-header-top">
            <div className="route-detail-header-main">
              <div className="route-detail-title">{headerTitle}</div>
            </div>
          </div>
        </div>

        <div className="route-detail-body">
          <div className="route-detail-tabpanel">
            <div style={{ fontSize: 14, padding: "6px 4px", fontWeight: 800 }}>{desc}</div>
            {loginNote && <div style={{ fontSize: 12, padding: "4px 4px 0", opacity: 0.75 }}>{loginNote}</div>}

            {ownerPreview && (
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 10px",
                  border: "1px solid #eee",
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                {ownerPreview.photoURL || ownerPreview.profilFoto || ownerPreview.avatar ? (
                  <img
                    src={ownerPreview.photoURL || ownerPreview.profilFoto || ownerPreview.avatar}
                    alt=""
                    style={{ width: 34, height: 34, borderRadius: 999, objectFit: "cover" }}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: 999, background: "#eee" }} />
                )}

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 13, color: "#111" }}>
                    {ownerPreview.username ||
                      ownerPreview.userName ||
                      ownerPreview.handle ||
                      ownerPreview.name ||
                      "Profil"}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {ownerIdForProfile ? `ID: ${ownerIdForProfile}` : "Profil bilgisi bulunamadı"}
                  </div>
                </div>
              </div>
            )}

            <div style={btnRow}>
              <button
                type="button"
                style={primaryBtn}
                onClick={() => {
                  if (!ownerIdForProfile) return;
                  openProfile(ownerIdForProfile);
                }}
              >
                Profili aç
              </button>

              {(kind === "forbidden" || kind === "private") && typeof onRetry === "function" && (
                <button type="button" style={secondaryBtn} onClick={onRetry}>
                  Yeniden dene
                </button>
              )}

              <button type="button" style={secondaryBtn} onClick={onClose}>
                Kapat
              </button>
            </div>
          </div>
        </div>

        <div className="route-detail-footer">
          <button type="button" className="route-detail-close-btn" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
