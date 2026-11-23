import { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Popup,
  GeoJSON,
  Marker,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import assamDistricts from "../data/assam-districts.json";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const districtStatusColors = {
  Danger: "#ef4444",
  Warning: "#f59e0b",
  Normal: "#22c55e",
  "Limited data": "#64748b",
  "Insufficient data": "#64748b",
};

function normalizeDistrictName(name) {
  return (name || "")
    .toString()
    .trim()
    .replaceAll("_", " ")
    .toLowerCase();
}

const stationColors = {
  Danger: "#ef4444",
  Warning: "#f59e0b",
  Normal: "#22c55e",
  "Threshold unavailable": "#64748b",
};

const createStationIcon = (color) => {
  return L.divIcon({
    className: "custom-station-marker",
    html: `
      <div style="
        width: 17px;
        height: 17px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 1px 5px rgba(0,0,0,0.5);
      "></div>
    `,
    iconSize: [21, 21],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
};

function getStationStatus(station) {
  const level = station.current_level_m;
  const warning = station.warning_level;
  const danger = station.danger_level;

  if (level === null || level === undefined) {
    return "Threshold unavailable";
  }

  if (danger !== null && danger !== undefined && level >= danger) {
    return "Danger";
  }

  if (warning !== null && warning !== undefined && level >= warning) {
    return "Warning";
  }

  if (
    (warning === null || warning === undefined) &&
    (danger === null || danger === undefined)
  ) {
    return "Threshold unavailable";
  }

  return "Normal";
}

function getDistrictStatus(district, allStations) {
  const districtStations = allStations.filter(
    (station) =>
      normalizeDistrictName(station.district) ===
      normalizeDistrictName(district)
  );

  if (districtStations.length === 0) {
    return "Insufficient data";
  }

  const statuses = districtStations.map(getStationStatus);

  if (statuses.includes("Danger")) {
    return "Danger";
  }

  if (statuses.includes("Warning")) {
    return "Warning";
  }

  if (statuses.includes("Threshold unavailable")) {
    return "Limited data";
  }

  return "Normal";
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "Unavailable";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function AssamMap() {
  const [selectedRisk, setSelectedRisk] = useState("All");
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [monitoringDistrict, setMonitoringDistrict] = useState("All");
  const [showStations, setShowStations] = useState(true);

  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        // Fetch stations list and the dynamic levels simultaneously
        const [stationsRes, levelsRes] = await Promise.all([
          fetch(API_BASE_URL + "/api/river/stations"),
          fetch(API_BASE_URL + "/api/river/levels")
        ]);

        if (!stationsRes.ok || !levelsRes.ok) {
          throw new Error("Unable to retrieve river monitoring data.");
        }

        const stationsData = await stationsRes.json();
        const levelsData = await levelsRes.json();

        if (isActive) {
          // Merge static location data with dynamic water levels
          const baseStations = stationsData.stations || [];
          const activeLevels = levelsData.data || [];

          const mergedStations = baseStations.map(station => {
            const levelInfo = activeLevels.find(l => l.station_id === station.id) || {};
            return {
              ...station,
              ...levelInfo,
              station_code: station.id,
              station_name: station.name,
              latitude: station.lat,
              longitude: station.lng
            };
          });

          setStations(mergedStations);
        }
      } catch (err) {
        if (isActive) {
          setError(err.message);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isActive = false;
    };
  }, []);

  const districts = [
    ...new Set(
      stations
        .map((station) => station.district)
        .filter(
          (district) =>
            district &&
            district !== "DRAINAGE"
        )
    ),
  ].sort();

  const districtStations = stations.filter((station) => {
    if (monitoringDistrict === "All") return true;

    return (
      normalizeDistrictName(station.district) ===
      normalizeDistrictName(monitoringDistrict)
    );
  });

  const validLevels = districtStations
    .map((station) => Number(station.current_level_m))
    .filter((level) => Number.isFinite(level));

  const districtStats = {
    total: districtStations.length,

    danger: districtStations.filter(
      (station) => getStationStatus(station) === "Danger"
    ).length,

    warning: districtStations.filter(
      (station) => getStationStatus(station) === "Warning"
    ).length,

    normal: districtStations.filter(
      (station) => getStationStatus(station) === "Normal"
    ).length,

    unavailable: districtStations.filter(
      (station) =>
        getStationStatus(station) === "Threshold unavailable"
    ).length,

    averageLevel:
      validLevels.length > 0
        ? validLevels.reduce((sum, level) => sum + level, 0) /
          validLevels.length
        : null,

    highestLevel:
      validLevels.length > 0
        ? Math.max(...validLevels)
        : null,
  };

  const latestUpdate = new Date().toISOString(); 

  const filteredStations = districtStations.filter((station) => {
    const status = getStationStatus(station);

    if (selectedRisk === "All") return true;
    if (selectedRisk === "High") return status === "Danger";
    if (selectedRisk === "Moderate") return status === "Warning";
    if (selectedRisk === "Low") return status === "Normal";

    return true;
  });

  return (
    <div className="risk-map-container">

      <section
        style={{
          background: "#15243a",
          border: "1px solid #293e59",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "22px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "15px",
            marginBottom: "20px",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 6px" }}>
              District-wise River Monitoring
            </h2>

            <p style={{ margin: 0, color: "#94a3b8" }}>
              Monitoring statistics based on SMART AXOM station data
            </p>
          </div>

          <div>
            <label
              htmlFor="monitoring-district"
              style={{
                display: "block",
                marginBottom: "7px",
                fontSize: "13px",
                color: "#94a3b8",
              }}
            >
              Select District
            </label>

            <select
              id="monitoring-district"
              value={monitoringDistrict}
              onChange={(e) => setMonitoringDistrict(e.target.value)}
              style={{
                padding: "10px 14px",
                borderRadius: "7px",
                border: "1px solid #40546c",
                background: "#0f1c2e",
                color: "#ffffff",
                minWidth: "200px",
                cursor: "pointer",
              }}
            >
              <option value="All">All Districts</option>

              {districts.map((district) => (
                <option key={district} value={district}>
                  {district.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
            gap: "12px",
          }}
        >
          {[
            {
              title: "Monitoring Stations",
              value: districtStats.total,
              color: "#38bdf8",
            },
            {
              title: "Danger",
              value: districtStats.danger,
              color: "#ef4444",
            },
            {
              title: "Warning",
              value: districtStats.warning,
              color: "#f59e0b",
            },
            {
              title: "Normal",
              value: districtStats.normal,
              color: "#22c55e",
            },
            {
              title: "Threshold Unavailable",
              value: districtStats.unavailable,
              color: "#94a3b8",
            },
            {
              title: "Average Water Level",
              value:
                districtStats.averageLevel !== null
                  ? `${districtStats.averageLevel.toFixed(2)} m`
                  : "--",
              color: "#a78bfa",
            },
            {
              title: "Highest Water Level",
              value:
                districtStats.highestLevel !== null
                  ? `${districtStats.highestLevel.toFixed(2)} m`
                  : "--",
              color: "#fb923c",
            },
          ].map((item) => (
            <div
              key={item.title}
              style={{
                background: "#0f1c2e",
                border: "1px solid #293e59",
                borderRadius: "9px",
                padding: "15px",
              }}
            >
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "12px",
                  margin: "0 0 10px",
                }}
              >
                {item.title}
              </p>

              <h2
                style={{
                  color: item.color,
                  fontSize: "23px",
                  margin: 0,
                }}
              >
                {item.value}
              </h2>
            </div>
          ))}
        </div>

        <p
          style={{
            color: "#94a3b8",
            fontSize: "12px",
            margin: "15px 0 0",
          }}
        >
          Latest station update:{" "}
          {latestUpdate
            ? formatTimestamp(latestUpdate)
            : "Unavailable"}
        </p>
      </section>

      <div className="map-controls">

        <div className="map-filter-group">
          <span>Filter by Risk:</span>

          {["All", "High", "Moderate", "Low"].map((risk) => (
            <button
              key={risk}
              className={`map-filter-button ${
                selectedRisk === risk ? "selected" : ""
              }`}
              onClick={() => {
                setSelectedRisk(risk);
                setSelectedDistrict(null);
              }}
            >
              {risk}
            </button>
          ))}
        </div>

        <button
          className={`station-toggle ${
            showStations ? "selected" : ""
          }`}
          onClick={() => setShowStations(!showStations)}
        >
          {showStations ? "Hide Stations" : "Show Stations"}
        </button>

      </div>

      <div style={{ margin: "10px 0", fontSize: "13px" }}>
        {loading && <span>Loading monitoring stations...</span>}

        {error && (
          <span style={{ color: "#ef4444" }}>
            {error} Check that your FastAPI backend is running.
          </span>
        )}

        {!loading && !error && (
          <span>
            <strong>{stations.length}</strong> monitoring stations retrieved
            {" | "}
            <strong>{filteredStations.length}</strong> displayed
            {" | "}
            Source: SMART AXOM
          </span>
        )}
      </div>

      <div className="map-wrapper">

        <MapContainer
          center={[26.3, 92.8]}
          zoom={7.5}
          minZoom={6}
          maxZoom={13}
          scrollWheelZoom={true}
          className="assam-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <GeoJSON
            key={`${selectedRisk}-${stations.length}`}
            data={assamDistricts}
            style={(feature) => {
              const district = feature.properties.district;
              const status = getDistrictStatus(district, stations);

              const matchesFilter =
                selectedRisk === "All" ||
                (selectedRisk === "High" && status === "Danger") ||
                (selectedRisk === "Moderate" && status === "Warning") ||
                (selectedRisk === "Low" && status === "Normal");

              return {
                color: "#94a3b8",
                weight: 1.5,
                fillColor: districtStatusColors[status] || "#64748b",
                fillOpacity: matchesFilter ? 0.65 : 0.08,
                opacity: matchesFilter ? 1 : 0.25,
              };
            }}
            onEachFeature={(feature, layer) => {
              const district = feature.properties.district;
              const status = getDistrictStatus(district, stations);

              const districtStationCount = stations.filter(
                (station) =>
                  normalizeDistrictName(station.district) ===
                  normalizeDistrictName(district)
              ).length;

              layer.bindPopup(`
                <div style="min-width:180px;">
                  <h3>${district}</h3>
                  <p>
                    Monitoring Status:
                    <strong style="color:${districtStatusColors[status]}">
                      ${status}
                    </strong>
                  </p>
                  <p>Monitoring stations: ${districtStationCount}</p>
                  <small>
                    Assessment based on available SMART AXOM station readings.
                  </small>
                </div>
              `);

              layer.on("click", () => {
                setSelectedDistrict({
                  name: district,
                  status,
                  stationCount: districtStationCount,
                });
              });
            }}
          />

          {showStations && !loading && (
            <MarkerClusterGroup
              chunkedLoading
              showCoverageOnHover={false}
              spiderfyOnMaxZoom={true}
              maxClusterRadius={45}
              zoomToBoundsOnClick={true}
            >
              {filteredStations.map((station) => {
                const status = getStationStatus(station);
                const color = stationColors[status];

                return (
                  <Marker
                    key={station.station_code}
                    position={[
                      station.latitude,
                      station.longitude,
                    ]}
                    icon={createStationIcon(color)}
                  >
                    <Popup>
                      <div style={{ minWidth: "210px" }}>
                        <h3 style={{ marginBottom: "8px" }}>
                          {station.station_name}
                        </h3>

                        <p>
                          <strong>Station Code:</strong>{" "}
                          {station.station_code}
                        </p>

                        <p>
                          <strong>River:</strong>{" "}
                          {station.river === "-" || !station.river
                            ? "Not specified"
                            : station.river}
                        </p>

                        <p>
                          <strong>District:</strong>{" "}
                          {station.district === "DRAINAGE"
                            ? "Not specified (Drainage)"
                            : station.district}
                        </p>

                        <hr />

                        <p>
                          <strong>Current Water Level:</strong>{" "}
                          {station.current_level_m !== null &&
                          station.current_level_m !== undefined
                            ? `${station.current_level_m.toFixed(2)} m`
                            : "Unavailable"}
                        </p>

                        <p>
                          <strong>Warning Level:</strong>{" "}
                          {station.warning_level !== null &&
                          station.warning_level !== undefined
                            ? `${station.warning_level} m`
                            : "Unavailable"}
                        </p>

                        <p>
                          <strong>Danger Level:</strong>{" "}
                          {station.danger_level !== null &&
                          station.danger_level !== undefined
                            ? `${station.danger_level} m`
                            : "Unavailable"}
                        </p>

                        <p>
                          <strong>Status:</strong>{" "}
                          <span
                            style={{
                              color,
                              fontWeight: "bold",
                            }}
                          >
                            {status}
                          </span>
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MarkerClusterGroup>
          )}

        </MapContainer>

      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "18px",
          marginTop: "18px",
          marginBottom: "12px",
          fontSize: "13px",
        }}
      >
        <strong style={{ color: "#94a3b8" }}>
          Map Legend:
        </strong>

        {[
          { label: "Danger", color: "#ef4444" },
          { label: "Warning", color: "#f59e0b" },
          { label: "Normal", color: "#22c55e" },
          {
            label: "Limited / Unavailable Data",
            color: "#64748b",
          },
          {
            label: "Insufficient Data",
            color: "#64748b",
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
            }}
          >
            <span
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "3px",
                backgroundColor: item.color,
                display: "inline-block",
              }}
            />

            {item.label}
          </div>
        ))}
      </div>

      <p
        style={{
          color: "#94a3b8",
          fontSize: "12px",
          marginTop: "5px",
        }}
      >
        Legend applies to both district polygons and monitoring station markers.
      </p>

      {selectedDistrict && (
        <div className="selected-district-card">
          <div>
            <span>SELECTED DISTRICT</span>
            <h3>{selectedDistrict.name}</h3>
          </div>

          <div>
            <span>MONITORING STATUS</span>
            <strong
              style={{
                color:
                  districtStatusColors[selectedDistrict.status] || "#64748b",
              }}
            >
              {selectedDistrict.status}
            </strong>
          </div>

          <div>
            <span>MONITORING STATIONS</span>
            <strong>{selectedDistrict.stationCount}</strong>
          </div>

          <button
            onClick={() => setSelectedDistrict(null)}
          >
            Clear Selection
          </button>
        </div>
      )}

      <p className="map-data-note">
        District colours are calculated from available SMART AXOM station
        readings and their warning/danger thresholds. Danger takes priority
        over Warning. Districts with missing threshold information are marked
        Limited data; districts without monitoring stations are marked
        Insufficient data. These colours indicate monitored station status,
        not a complete district-wide flood forecast.
      </p>
    </div>
  );
}

export default AssamMap;