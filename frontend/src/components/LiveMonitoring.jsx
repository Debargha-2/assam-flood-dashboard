import { useState, useEffect } from "react";

import {
  Activity,
  Waves,
  Radio,
  MapPin,
  Clock,
  AlertTriangle,
  Info,
  RefreshCw,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function getStationStatus(station) {
  const level = Number(station.current_level_m); 
  const warning = station.warning_level;
  const danger = station.danger_level;

  if (danger !== null && danger !== undefined && level >= Number(danger)) {
    return {
      label: "Danger",
      type: "danger",
    };
  }

  if (warning !== null && warning !== undefined && level >= Number(warning)) {
    return {
      label: "Warning",
      type: "warning",
    };
  }

  if (
    warning !== null &&
    warning !== undefined &&
    danger !== null &&
    danger !== undefined
  ) {
    return {
      label: "Within Thresholds",
      type: "online",
    };
  }

  return {
    label: "Threshold Unavailable",
    type: "offline",
  };
}

function formatTimestamp(timestamp) {
  if (!timestamp || timestamp === "-") {
    return "Not available";
  }
  return timestamp;
}

function LiveMonitoring() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastFetched, setLastFetched] = useState(null);

  const fetchStations = async (signal) => {
    try {
      setLoading(true);
      setError("");

      const [stationsRes, levelsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/river/stations`, { signal }),
        fetch(`${API_BASE_URL}/api/river/levels`, { signal })
      ]);

      if (!stationsRes.ok || !levelsRes.ok) {
        throw new Error(
          `Unable to retrieve station data. HTTP ${stationsRes.status}`
        );
      }

      const stationsData = await stationsRes.json();
      const levelsData = await levelsRes.json();

      if (!Array.isArray(stationsData.stations)) {
        throw new Error("Invalid station data received from backend.");
      }

      const mergedData = stationsData.stations.map((station) => {
        const levelData = levelsData.data?.find(l => l.station_id === station.id) || {};
        return {
          ...station,
          ...levelData,
          station_name: station.name,
          station_code: station.id,
          river: station.name.split("(")[0].trim() 
        };
      });

      setStations(mergedData);
      setLastFetched(new Date());
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();

    fetchStations(controller.signal);

    return () => controller.abort();
  }, []);

  const stationStatuses = stations.map((station) => ({
    ...station,
    assessment: getStationStatus(station),
  }));

  const dangerCount = stationStatuses.filter(
    (station) => station.assessment.type === "danger"
  ).length;

  const warningCount = stationStatuses.filter(
    (station) => station.assessment.type === "warning"
  ).length;

  const unavailableCount = stationStatuses.filter(
    (station) => station.assessment.type === "offline"
  ).length;

  return (
    <section className="monitoring-page">

      <div className="dashboard-welcome">
        <h2>Live Monitoring Centre</h2>
        <p>
          River-level monitoring stations across Assam
        </p>
      </div>

      <div className="monitoring-summary">

        <div className="monitoring-stat">
          <Radio size={23} />
          <span>Total Stations</span>
          <strong>{loading ? "..." : stations.length}</strong>
        </div>

        <div className="monitoring-stat">
          <AlertTriangle size={23} />
          <span>Danger Stations</span>
          <strong>{loading ? "..." : dangerCount}</strong>
        </div>

        <div className="monitoring-stat">
          <Waves size={23} />
          <span>Warning Stations</span>
          <strong>{loading ? "..." : warningCount}</strong>
        </div>

        <div className="monitoring-stat">
          <Info size={23} />
          <span>Threshold Unavailable</span>
          <strong>{loading ? "..." : unavailableCount}</strong>
        </div>

      </div>

      <div className="monitoring-table-card">

        <div className="monitoring-table-heading">
          <div>
            <h3>Monitoring Stations</h3>
            <p>
              SMART AXOM station-wise river-level observations
            </p>
          </div>

          <span className="monitoring-live-label">
            SMART AXOM Data
          </span>
        </div>

        {loading && (
          <div className="weather-message">
            Fetching monitoring station records...
          </div>
        )}

        {error && (
          <div className="weather-error">
            {error}
            <button
              type="button"
              onClick={() => {
                const controller = new AbortController();
                fetchStations(controller.signal);
              }}
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        )}

        {!loading && !error && stations.length === 0 && (
          <p className="weather-message">
            No monitoring station records are currently available.
          </p>
        )}

        {!loading && !error && stations.length > 0 && (
          <div className="monitoring-table-wrapper">
            <table className="monitoring-table">

              <thead>
                <tr>
                  <th>Station</th>
                  <th>District</th>
                  <th>River</th>
                  <th>Water Level</th>
                  <th>Warning Level</th>
                  <th>Danger Level</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                </tr>
              </thead>

              <tbody>
                {stationStatuses.map((station) => (
                  <tr key={station.station_code}>

                    <td>
                      <div className="station-name">
                        <MapPin size={15} />
                        {station.station_name}
                      </div>
                    </td>

                    <td>{station.district || "Not available"}</td>

                    <td>{station.river || "Not available"}</td>

                    <td>
                      {station.current_level_m != null
                        ? `${station.current_level_m} m`
                        : "Not available"}
                    </td>

                    <td>
                      {station.warning_level != null
                        ? `${station.warning_level} m`
                        : "Unavailable"}
                    </td>

                    <td>
                      {station.danger_level != null
                        ? `${station.danger_level} m`
                        : "Unavailable"}
                    </td>

                    <td>
                      <span
                        className={`station-status ${station.assessment.type}`}
                      >
                        <span className="status-dot"></span>
                        {station.assessment.label}
                      </span>
                    </td>

                    <td>
                      <div className="station-time">
                        <Clock size={13} />
                        {formatTimestamp(station.last_update)}
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        )}

        {!loading && !error && (
          <div className="monitoring-data-footer">
            <span>
              Source: SMART AXOM
            </span>

            <span>
              {stations.length} station records retrieved
            </span>

            <span>
              {lastFetched
                ? `Fetched: ${lastFetched.toLocaleTimeString()}`
                : ""}
            </span>
          </div>
        )}

      </div>

      <p className="monitoring-disclaimer">
        Source: SMART AXOM. These records represent the available
        dataset snapshot, not necessarily continuous real-time
        telemetry. Danger and warning classifications are based
        on the thresholds supplied with each station record.
        Missing thresholds are not interpreted as normal conditions.
      </p>

    </section>
  );
}

export default LiveMonitoring;