import { useState, useEffect } from "react";
import {
  Waves,
  Mountain,
  Play,
  Pause,
  RotateCcw,
  Droplets,
  Activity,
  AlertTriangle,
  Satellite,
  MapPin,
} from "lucide-react";
import CesiumGlobe from "./CesiumGlobe";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
function buildLocationPayload(station) {
  if (!station) return null;
  const lat = station.lat || station.latitude;
  const lng = station.lng || station.longitude;
  if (!lat || !lng) return null;

  return {
    lat,
    lng,
    height: 24000,
    name: station.name || station.station_name || "Target Station",
    district: station.district || "Assam",
    stationId: station.id || station.station_code || "N/A",
  };
}

function DigitalTwin() {
  const [waterLevel, setWaterLevel] = useState(50);
  const [terrainMode, setTerrainMode] = useState("Elevation");

  /* DYNAMIC BACKEND TRACKING */
  const [stations, setStations] = useState([]);
  const [activeStation, setActiveStation] = useState(null);

  const [simulationRunning, setSimulationRunning] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [error, setError] = useState(null);
  const [activeLocation, setActiveLocation] = useState(null);

  /* FETCH STATIONS FROM BACKEND ON LOAD */
  useEffect(() => {
    fetch(API_BASE_URL + "/api/river/stations")
      .then((res) => res.json())
      .then((data) => {
        if (data.stations && data.stations.length > 0) {
          setStations(data.stations);
          const defaultStation = data.stations[0];
          setActiveStation(defaultStation);
          setActiveLocation(buildLocationPayload(defaultStation));
        }
      })
      .catch((err) => console.error("Failed to load stations:", err));
  }, []);

  const handleRunSimulation = async () => {
    if (!activeStation) return;
    setSimulationRunning(true);
    setError(null);

    const targetLat = activeStation.lat || activeStation.latitude;
    const targetLng = activeStation.lng || activeStation.longitude;
    const stationId = activeStation.id || activeStation.station_code;

    try {
      const response = await fetch(API_BASE_URL + "/api/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": import.meta.env.VITE_DASHBOARD_API_KEY,
        },
        body: JSON.stringify({
          station_id: stationId,
          latitude: targetLat,
          longitude: targetLng,
          rainfall_intensity_mm: waterLevel * 0.5,
          brahmaputra_backwater_m: 75.0,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to connect to AI Backend. Verify your API Key.");
      }

      const data = await response.json();
      setForecastData(data);

      /* Focus the 3D globe and rectangular box on the simulated station */
      setActiveLocation(buildLocationPayload(activeStation));
    } catch (err) {
      console.error("AI Engine Error:", err);
      setError("Failed to reach FastAPI backend or unauthorized API key.");
    } finally {
      setSimulationRunning(false);
    }
  };

  const resetSimulation = () => {
    setWaterLevel(50);
    setSimulationRunning(false);
    setTerrainMode("Elevation");
    setForecastData(null);
    setError(null);
    setActiveLocation(null);
  };

  const getAlertCardStyle = () => {
    const status = forecastData?.forecast?.alert_status;
    if (status === "Red") {
      return {
        backgroundColor: "rgba(239, 68, 68, 0.16)",
        border: "1px solid #ef4444",
        color: "#fecaca",
      };
    }
    if (status === "Orange") {
      return {
        backgroundColor: "rgba(245, 158, 11, 0.16)",
        border: "1px solid #f59e0b",
        color: "#fde68a",
      };
    }
    if (status === "Green") {
      return {
        backgroundColor: "rgba(34, 197, 94, 0.16)",
        border: "1px solid #22c55e",
        color: "#bbf7d0",
      };
    }
    return {
      backgroundColor: "#0f1c2e",
      border: "1px solid #293e59",
      color: "#f8fafc",
    };
  };

  return (
    <section className="digital-twin-page">
      <div className="dashboard-welcome">
        <h2>Assam Digital Twin</h2>
        <p>Interactive river basin and PyTorch-driven flood simulation</p>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ marginBottom: "12px" }}>3D Terrain Viewer</h3>
        <CesiumGlobe targetLocation={activeLocation} />
      </div>

      <div className="twin-summary">
        <div className="twin-stat">
          <Waves size={22} />
          <span>Predicted Water Level (+6 Hrs)</span>
          <strong>
            {forecastData ? forecastData.forecast.water_level_m + " m" : "Pending..."}
          </strong>
        </div>

        <div className="twin-stat">
          <AlertTriangle size={22} />
          <span>Embankment Breach Risk</span>
          <strong className={"twin-risk " + (forecastData?.forecast.alert_status?.toLowerCase() || "")}>
            {forecastData ? forecastData.forecast.breach_probability_pct + " percent" : "Pending..."}
          </strong>
        </div>

        <div className="twin-stat">
          <Satellite size={22} />
          <span>Active ISRO Radar Link</span>
          <span style={{ fontSize: "0.7rem", marginTop: "4px" }}>
            {forecastData
              ? forecastData.satellite.latest_image_id.substring(0, 25) + "..."
              : "Disconnected"}
          </span>
        </div>
      </div>

      <div className="twin-workspace">
        <div className="twin-visualization">
          <div className="twin-visual-heading">
            <div>
              <h3>River Basin Simulation ({activeStation?.name || "Loading..."})</h3>
              <p>PINN Architecture + ISRO Bhoonidhi Client</p>
            </div>
            <span className="simulation-label">
              {simulationRunning ? "AI Processing..." : "Ready for Input"}
            </span>
          </div>

          <div className="river-simulation">
            {error && (
              <div
                style={{
                  color: "#fecaca",
                  padding: "10px",
                  backgroundColor: "rgba(239, 68, 68, 0.2)",
                  border: "1px solid #ef4444",
                  borderRadius: "6px",
                  marginBottom: "10px",
                }}
              >
                {error}
              </div>
            )}

            <div className="terrain-label">
              <Mountain size={17} />
              <span>{terrainMode} View</span>
            </div>

            <div className="terrain-land">
              <div className="terrain-hill hill-one"></div>
              <div className="terrain-hill hill-two"></div>
              <div className="terrain-hill hill-three"></div>
              <div
                className="simulation-river"
                style={{ height: String(25 + waterLevel * 0.55) + "%" }}
              >
                <div className="river-wave"></div>
              </div>
              <div className="river-label">
                <Waves size={16} />
                River Flow
              </div>
              {waterLevel >= 75 && (
                <div className="flood-overlay">
                  <AlertTriangle size={20} />
                  Potential Inundation Zone
                </div>
              )}
            </div>
          </div>

          <div className="simulation-controls">
            <button
              className="simulation-button primary"
              onClick={handleRunSimulation}
              disabled={simulationRunning || !activeStation}
            >
              {simulationRunning ? <Pause size={17} /> : <Play size={17} />}
              {simulationRunning ? "Running AI Pass..." : "Run AI Simulation"}
            </button>
            <button className="simulation-button secondary" onClick={resetSimulation}>
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </div>

        <div className="twin-control-panel">
          <h3>Simulation Parameters</h3>
          <p>Select a location and adjust rainfall to test the AI Engine.</p>

          <div className="control-group">
            <div className="control-label">
              <span>
                <MapPin size={16} />
                Target River Station
              </span>
            </div>
            <select
              value={activeStation?.id || activeStation?.station_code || ""}
              onChange={(e) => {
                const selected = stations.find(
                  (s) => s.id === e.target.value || s.station_code === e.target.value
                );
                setActiveStation(selected);
                setForecastData(null);

                /* Immediately fly the 3D globe and draw the rectangular selection box */
                setActiveLocation(buildLocationPayload(selected));
              }}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "6px",
                backgroundColor: "#1e293b",
                color: "white",
                border: "1px solid #334155",
                marginTop: "8px",
              }}
              disabled={stations.length === 0}
            >
              {stations.length === 0 ? <option>Loading stations...</option> : null}
              {stations.map((station, index) => (
                <option
                  key={station.id || station.station_code || index}
                  value={station.id || station.station_code}
                >
                  {station.name || station.station_name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>
                <Droplets size={16} />
                Simulated Rainfall (mm/hr)
              </span>
              <strong>{(waterLevel * 0.5).toFixed(1)} mm</strong>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={waterLevel}
              onChange={(event) => setWaterLevel(Number(event.target.value))}
            />
            <div className="range-labels">
              <span>Dry</span>
              <span>Extreme Cloudburst</span>
            </div>
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>
                <Mountain size={16} />
                Terrain Mode
              </span>
            </div>
            <div className="terrain-options">
              <button
                className={terrainMode === "Elevation" ? "active" : ""}
                onClick={() => setTerrainMode("Elevation")}
              >
                Elevation
              </button>
              <button
                className={terrainMode === "Flood" ? "active" : ""}
                onClick={() => setTerrainMode("Flood")}
              >
                Flood View
              </button>
            </div>
          </div>

          <div className="scenario-result" style={getAlertCardStyle()}>
            <Activity size={20} color="#38bdf8" />
            <div>
              <span style={{ color: "#94a3b8", display: "block", fontSize: "12px" }}>
                AI Alert Status
              </span>
              <strong style={{ color: getAlertCardStyle().color, fontSize: "15px" }}>
                {forecastData ? forecastData.forecast.alert_status : "Awaiting Simulation"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <p className="twin-disclaimer">
        Powered by PyTorch PINN Architecture and Live ISRO Sentinel-1A Radar Telemetry.
      </p>
    </section>
  );
}

export default DigitalTwin;