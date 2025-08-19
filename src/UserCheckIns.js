import React, { useMemo } from 'react';

// --- Helpers ---
const IST_TZ = 'Europe/Istanbul';

// Firestore Timestamp, {seconds}, ISO string veya Date -> Date
function toDate(ts) {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  if (typeof ts === 'number') return new Date(ts);
  return new Date(ts);
}

// YYYY-MM-DD key üret (Europe/Istanbul)
function ymdKey(date) {
  const f = new Intl.DateTimeFormat('tr-TR', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = f.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// "Bugün/Dün/gg ay yyyy" etiketini üret
function dateLabel(date, todayKey, yesterdayKey) {
  const key = ymdKey(date);
  if (key === todayKey) return 'Bugün';
  if (key === yesterdayKey) return 'Dün';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: IST_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

const LocationPinIcon = () => (
  <svg height="20" viewBox="0 0 24 24" width="20" aria-hidden="true">
    <path
      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
      fill="currentColor"
    />
  </svg>
);

function UserCheckIns({ checkIns, onPlaceClick }) {
  const handlePlaceClick = onPlaceClick || (() => {});

  const grouped = useMemo(() => {
    if (!Array.isArray(checkIns) || checkIns.length === 0) return [];
    const now = new Date();
    const todayKey = ymdKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayKey = ymdKey(yesterday);
    const map = new Map();

    for (const raw of checkIns) {
      const d = toDate(raw?.timestamp);
      if (!d || isNaN(d)) continue;
      const key = ymdKey(d);
      const label = dateLabel(d, todayKey, yesterdayKey);
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key).items.push(raw);
    }

    for (const g of map.values()) {
      g.items.sort((a, b) => {
        const da = toDate(a?.timestamp)?.getTime() ?? 0;
        const db = toDate(b?.timestamp)?.getTime() ?? 0;
        return db - da;
      });
    }

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [checkIns]);

  if (!grouped || grouped.length === 0) {
    return (
      <div className="no-content-container">
        <h3>Henüz Check-in Yok</h3>
        <p>Yaptığın yer bildirimleri burada görünecek.</p>
      </div>
    );
  }

  const timeFormatter = new Intl.DateTimeFormat('tr-TR', {
    timeZone: IST_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <div className="timeline-container" role="list">
        {grouped.map(({ key, label, items }) => (
          <div key={key} className="timeline-date-group">
            <div className="timeline-date-header">{label}</div>
            <div className="timeline-items-wrapper">
              {items.map((checkin, index) => {
                const dt = toDate(checkin?.timestamp);
                const timeText = dt ? timeFormatter.format(dt) : '';
                const itemKey =
                  checkin?.id ||
                  (checkin?.userId && dt
                    ? `${checkin.userId}-${dt.getTime()}`
                    : `${key}-${index}`);

                return (
                  <div key={itemKey} className="timeline-item" role="listitem">
                    <div className="timeline-connector">
                      <div className="timeline-dot" />
                      {index < items.length - 1 && <div className="timeline-line" />}
                    </div>
                    <div className="timeline-content">
                      <button
                        type="button"
                        className="timeline-place-info"
                        onClick={() => handlePlaceClick(checkin)}
                        aria-label={`${checkin?.placeName || 'Yer'} detayını aç`}
                      >
                        <div className="timeline-place-name">
                          <span className="timeline-icon-wrapper"><LocationPinIcon /></span>
                          <span>{checkin?.placeName || 'Yer'}</span>
                        </div>
                        {!!checkin?.placeAddress && (
                          <div className="timeline-place-address">{checkin.placeAddress}</div>
                        )}
                      </button>
                      {!!checkin?.comment && <p className="timeline-comment">{checkin.comment}</p>}
                      {!!checkin?.imageUrl && (
                        <div className="timeline-image-container">
                          <img
                            src={checkin.imageUrl}
                            alt={checkin?.placeName || 'Check-in görseli'}
                            className="timeline-image"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="timeline-time">{timeText}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* CSS */}
      <style>{`
        .timeline-container { padding: 20px; max-width: 600px; margin: 0 auto; }
        .timeline-date-group { margin-bottom: 24px; }
        .timeline-date-header { font-size: 14px; font-weight: 600; color: #262626; margin-bottom: 16px; padding-left: 40px; }
        .timeline-items-wrapper { position: relative; }
        .timeline-item { display: flex; position: relative; margin-bottom: 16px; }
        .timeline-item:last-child .timeline-line { display: none; }
        .timeline-connector { display: flex; flex-direction: column; align-items: center; width: 40px; flex-shrink: 0; }
        .timeline-dot { width: 14px; height: 14px; background-color: #f5b301; border: 2px solid #fff; border-radius: 50%; z-index: 1; box-shadow: 0 0 0 2px #dbdbdb; }
        .timeline-line { width: 2px; background-color: #dbdbdb; flex-grow: 1; }
        .timeline-content { background-color: #fff; border: 1px solid #dbdbdb; border-radius: 8px; padding: 16px; width: 100%; }
        .timeline-place-info { background: transparent; border: 0; padding: 0; text-align: left; width: 100%; cursor: pointer; margin-bottom: 8px; }
        .timeline-place-info:hover .timeline-place-name span:not(.timeline-icon-wrapper),
        .timeline-place-info:focus-visible .timeline-place-name span:not(.timeline-icon-wrapper) { text-decoration: underline; }
        .timeline-place-name { font-weight: 600; color: #262626; display: flex; align-items: center; gap: 6px; }
        .timeline-icon-wrapper { display: inline-flex; align-items: center; vertical-align: middle; color: #8e8e8e; }
        .timeline-place-address { font-size: 14px; color: #8e8e8e; margin-top: 4px; padding-left: 26px; }
        .timeline-comment { font-size: 14px; color: #262626; margin: 12px 0; white-space: pre-wrap; word-wrap: break-word; }

        /* === Görsel Alanı — Instagram gibi KARE === */
        .timeline-image-container { width: 100%; border-radius: 12px; overflow: hidden; margin: 12px 0; }
        .timeline-image { width: 100%; height: auto; display: block; aspect-ratio: 1 / 1; object-fit: cover; object-position: center; border-radius: 12px; }
        @supports not (aspect-ratio: 1 / 1) {
          .timeline-image { width: 100%; height: 300px; object-fit: cover; object-position: center; }
        }

        .timeline-time { font-size: 12px; color: #8e8e8e; text-align: right; margin-top: 8px; }
        .no-content-container { text-align: center; padding: 60px 20px; color: #8e8e8e; }
        .no-content-container h3 { margin: 0 0 8px 0; font-size: 22px; font-weight: 600; color: #262626; }
      `}</style>
    </>
  );
}

export default UserCheckIns;
