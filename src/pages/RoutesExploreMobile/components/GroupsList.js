// src/pages/RoutesExploreMobile/components/GroupsList.jsx
// makeGroups + RouteCardMobile + selected scrollIntoView mantığı burada toplanır.

import React, { useEffect, useRef } from "react";
import RouteCardMobile from "../../../components/RouteCardMobile";
import { makeGroups } from "../utils/grouping";

function GroupsList({
  items,
  group,
  selectedRouteId,
  onRouteClick,
  highlightQuery,
}) {
  const cardRefs = useRef({});

  const groups = makeGroups(items || [], group);

  // Seçilen kartı liste içinde ortaya kaydır
  useEffect(() => {
    if (!selectedRouteId) return;
    const selId = String(selectedRouteId);
    const el = cardRefs.current[selId];
    if (el && typeof el.scrollIntoView === "function") {
      try {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      } catch {
        // no-op
      }
    }
  }, [selectedRouteId, items]);

  return (
    <>
      {groups.map((g) => (
        <section
          key={g.key}
          className="ExploreGroup"
          style={{ marginBottom: 8 }}
        >
          {g.label && (
            <header
              className="ExploreGroupHeader"
              style={{
                position: "sticky",
                top: 0,
                zIndex: 5,
                background: "#fff",
                padding: "4px 2px 4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #eee",
              }}
            >
              <span
                className="ExploreGroupHeaderTitle"
                style={{ fontSize: 13, fontWeight: 700 }}
              >
                {g.label}
              </span>
              <span
                className="ExploreGroupHeaderBadge"
                style={{
                  minWidth: 22,
                  padding: "2px 6px",
                  borderRadius: 999,
                  background: "#f3f4f6",
                  fontSize: 11,
                  textAlign: "center",
                }}
              >
                {g.items.length}
              </span>
            </header>
          )}
          <div
            className="ExploreGroupBody"
            style={{ paddingTop: g.label ? 6 : 0 }}
          >
            {g.items.map((r) => (
              <div
                key={r.id}
                style={{ marginBottom: 8 }}
                ref={(el) => {
                  if (!el) {
                    delete cardRefs.current[r.id];
                  } else {
                    cardRefs.current[r.id] = el;
                  }
                }}
              >
                <RouteCardMobile
                  route={r}
                  selected={
                    !!selectedRouteId &&
                    String(selectedRouteId) === String(r.id)
                  }
                  onClick={() => onRouteClick(r)}
                  highlightQuery={highlightQuery || ""}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default GroupsList;
