// src/components/MapErrorBoundary.js
import React from "react";
import "./MapErrorBoundary.css";

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
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
  }

  handleRetry() {
    const { onRetry } = this.props;

    this.setState({
      hasError: false,
      error: null,
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
    const { hasError } = this.state;
    const { children, compact } = this.props;

    if (hasError) {
      const rootClassName = compact
        ? "map-error-fallback map-error-fallback-compact"
        : "map-error-fallback";

      return (
        <div className={rootClassName}>
          <div className="map-error-card">
            <div className="map-error-title">Harita yüklenemedi</div>
            <div className="map-error-text">
              Harita servisine şu anda erişilemiyor. Biraz sonra tekrar
              deneyebilirsin.
            </div>
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
