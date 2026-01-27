/* FILE: src/components/MapErrorBoundary.js */
import React from "react";
import "./MapErrorBoundary.css";

function isNonFatalPermissionError(err) {
  try {
    const msg = String(err?.message || err || "").toLowerCase();
    return (
      msg.includes("permission-denied") ||
      msg.includes("permission denied") ||
      msg.includes("missing or insufficient permissions") ||
      msg.includes("insufficient permissions") ||
      msg.includes("firebaseerror") && msg.includes("permission")
    );
  } catch {
    return false;
  }
}

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      didAutoRecoverOnce: false,
    };

    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("MapErrorBoundary caught an error:", error, errorInfo);
    }

    // ✅ “permission-denied” gibi opsiyonel/izin hatalarında:
    // 1 kere otomatik toparlama dene (bazı race'lerde bir sonraki render’da geçiyor)
    try {
      if (isNonFatalPermissionError(error) && !this.state.didAutoRecoverOnce) {
        setTimeout(() => {
          try {
            this.setState({
              hasError: false,
              error: null,
              didAutoRecoverOnce: true,
            });
          } catch {}
        }, 0);
      }
    } catch {}
  }

  handleRetry() {
    const { onRetry } = this.props;

    this.setState({
      hasError: false,
      error: null,
      didAutoRecoverOnce: true,
    });

    if (typeof onRetry === "function") {
      try {
        onRetry();
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.error("MapErrorBoundary onRetry error:", err);
        }
      }
    }
  }

  render() {
    const { hasError, error } = this.state;
    const { children, compact } = this.props;

    if (hasError) {
      const nonFatal = isNonFatalPermissionError(error);

      const rootClassName = compact
        ? "map-error-fallback map-error-fallback-compact"
        : "map-error-fallback";

      const title = nonFatal ? "Bazı veriler için izin yok" : "Harita yüklenemedi";
      const text = nonFatal
        ? "Bu içerikte bazı konum/veri alanlarına erişim izni olmadığı için ek bilgiler gösterilemeyebilir. Tekrar deneyebilirsin."
        : "Harita servisine şu anda erişilemiyor. Biraz sonra tekrar deneyebilirsin.";

      return (
        <div className={rootClassName}>
          <div className="map-error-card">
            <div className="map-error-title">{title}</div>
            <div className="map-error-text">{text}</div>
            <button
              type="button"
              className="map-error-retry-button"
              onClick={this.handleRetry}
            >
              Tekrar dene
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default MapErrorBoundary;
