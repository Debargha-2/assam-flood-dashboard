import { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  Marker,
  Popup,
  Rectangle,
  useMap,
} from "react-leaflet";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  Waves,
  CloudRain,
  Layers,
  Activity,
  Sliders,
  AlertTriangle,
  MapPin,
  Send,
  Radio,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const ALERT_BADGE_STYLES = {
  Danger: { background: "rgba(239, 68, 68, 0.18)", color: "#ef4444", border: "1px solid #ef4444" },
  Warning: { background: "rgba(245, 158, 11, 0.18)", color: "#f59e0b", border: "1px solid #f59e0b" },
  Normal: { background: "rgba(34, 197, 94, 0.18)", color: "#22c55e", border: "1px solid #22c55e" },
};

const LAYER_DISPLAY_LABELS = {
  dynamic_predicted: "Projected Flood Extent",
  pinn_predicted: "Baseline Flood Risk Zone",
  sar_2022: "June 2022 Peak Flood (SAR Satellite)",
  sar_2024: "June 2024 Peak Flood (SAR Satellite)",
};

const FOCUS_LOCATIONS = {
  cachar_basin: {
    name: "Full Cachar Basin",
    code: "CACHAR_BASIN_01",
    district: "Cachar",
    state: "Assam",
    center: [24.80, 92.75],
    bounds: [
      [24.50, 92.30],
      [25.05, 93.10],
    ],
  },
  silchar: {
    name: "Silchar Urban Core",
    code: "SILCHAR_BARAK_01",
    district: "Cachar",
    state: "Assam",
    center: [24.8333, 92.7789],
    bounds: [
      [24.77, 92.71],
      [24.89, 92.85],
    ],
  },
  badarpur: {
    name: "Badarpur Confluence",
    code: "BADARPUR_01",
    district: "Cachar / Karimganj Border",
    state: "Assam",
    center: [24.875, 92.565],
    bounds: [
      [24.82, 92.49],
      [24.93, 92.64],
    ],
  },
  katigorah: {
    name: "Katigorah Floodplain",
    code: "KATIGORAH_01",
    district: "Cachar",
    state: "Assam",
    center: [24.90, 92.61],
    bounds: [
      [24.84, 92.53],
      [24.97, 92.70],
    ],
  },
  lakhipur: {
    name: "Lakhipur Valley",
    code: "LAKHIPUR_01",
    district: "Cachar",
    state: "Assam",
    center: [24.805, 93.015],
    bounds: [
      [24.74, 92.93],
      [24.87, 93.09],
    ],
  },
};

function MapFocusController({ bounds, focusKey }) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
    }
  }, [focusKey, map]);

  return null;
}

function CacharBasinDashboard() {
  const [inputMode, setInputMode] = useState("custom");
  const [selectedDate, setSelectedDate] = useState("2024-06-28");
  const [rainMultiplier, setRainMultiplier] = useState(1.0);
  const [selectedZoneKey, setSelectedZoneKey] = useState("cachar_basin");

  /* Custom new-data form fields */
  const [customDischarge, setCustomDischarge] = useState("1250");
  const [customSilcharRain, setCustomSilcharRain] = useState("75");
  const [customHaflongRain, setCustomHaflongRain] = useState("125");
  const [customJiribamRain, setCustomJiribamRain] = useState("100");
  const [customTipaimukhRain, setCustomTipaimukhRain] = useState("85");

  const [forecastData, setForecastData] = useState(null);
  const [validationSeries, setValidationSeries] = useState([]);
  const [spatialMeta, setSpatialMeta] = useState(null);

  const [activeLayer, setActiveLayer] = useState("dynamic_predicted");
  const [overlayOpacity, setOverlayOpacity] = useState(0.78);
  const [overlayCacheBust, setOverlayCacheBust] = useState(Date.now());

  const [loadingForecast, setLoadingForecast] = useState(false);
  const [loadingSpatial, setLoadingSpatial] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  /* Load baseline 2024 validation series and spatial layers once */
  useEffect(() => {
    let isMounted = true;

    const fetchInitialData = async () => {
      try {
        setLoadingSpatial(true);
        const [valRes, spatialRes, initForecastRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/cachar/validation-2024`),
          fetch(`${API_BASE_URL}/api/cachar/spatial-layers`),
          fetch(`${API_BASE_URL}/api/cachar/forecast?date=2024-06-28&rain_multiplier=1.0`),
        ]);

        if (valRes.ok) {
          const valJson = await valRes.json();
          if (isMounted) setValidationSeries(valJson.series || []);
        }

        if (spatialRes.ok) {
          const spatialJson = await spatialRes.json();
          if (isMounted) setSpatialMeta(spatialJson.spatial || null);
        }

        if (initForecastRes.ok) {
          const initJson = await initForecastRes.json();
          if (isMounted) {
            setForecastData(initJson.data);
            setOverlayCacheBust(Date.now());
          }
        }
      } catch (err) {
        if (isMounted) {
          setErrorMsg(err.message || "Unable to connect to the flood forecasting backend.");
        }
      } finally {
        if (isMounted) setLoadingSpatial(false);
      }
    };

    fetchInitialData();
    return () => {
      isMounted = false;
    };
  }, []);

  /* Auto-fetch historical replay only when Historical mode is active */
  useEffect(() => {
    if (inputMode !== "historical") return;
    let isMounted = true;

    const fetchHistorical = async () => {
      try {
        setLoadingForecast(true);
        setErrorMsg("");
        const params = new URLSearchParams({
          date: selectedDate,
          rain_multiplier: String(rainMultiplier),
        });
        const res = await fetch(`${API_BASE_URL}/api/cachar/forecast?${params.toString()}`);
        if (!res.ok) throw new Error(`Historical forecast failed (${res.status})`);
        const json = await res.json();
        if (isMounted) {
          setForecastData(json.data);
          setActiveLayer("dynamic_predicted");
          setOverlayCacheBust(Date.now());
        }
      } catch (err) {
        if (isMounted) setErrorMsg(err.message || "Unable to run historical replay.");
      } finally {
        if (isMounted) setLoadingForecast(false);
      }
    };

    fetchHistorical();
    return () => {
      isMounted = false;
    };
  }, [inputMode, selectedDate, rainMultiplier]);

  /* Submit new manual readings */
  const handleCustomPredict = async (e) => {
    e.preventDefault();
    try {
      setLoadingForecast(true);
      setErrorMsg("");
      const res = await fetch(`${API_BASE_URL}/api/cachar/predict-custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_discharge_m3s: parseFloat(customDischarge) || 0,
          silchar_rain_mm: parseFloat(customSilcharRain) || 0,
          haflong_rain_mm: parseFloat(customHaflongRain) || 0,
          jiribam_rain_mm: parseFloat(customJiribamRain) || 0,
          tipaimukh_rain_mm: parseFloat(customTipaimukhRain) || 0,
        }),
      });
      if (!res.ok) throw new Error(`Forecast calculation failed (${res.status})`);
      const json = await res.json();
      setForecastData(json.data);
      setActiveLayer("dynamic_predicted");
      setOverlayCacheBust(Date.now());
    } catch (err) {
      setErrorMsg(err.message || "Unable to generate forecast from custom data.");
    } finally {
      setLoadingForecast(false);
    }
  };

  /* Pull live rainfall and river discharge from Open-Meteo */
  const handleLiveFetchPredict = async () => {
    try {
      setLoadingForecast(true);
      setErrorMsg("");
      const res = await fetch(`${API_BASE_URL}/api/cachar/predict-live`);
      if (!res.ok) throw new Error(`Live Open-Meteo fetch failed (${res.status})`);
      const json = await res.json();
      setForecastData(json.data);
      setActiveLayer("dynamic_predicted");
      setOverlayCacheBust(Date.now());
    } catch (err) {
      setErrorMsg(err.message || "Unable to fetch live Open-Meteo data. Try Enter New Data mode.");
    } finally {
      setLoadingForecast(false);
    }
  };

  const combinedTrajectory = (() => {
    if (!forecastData) return [];
    const historyPoints = (forecastData.recent_30d_history || []).map((item) => ({
      date: item.date,
      observed: item.actual_discharge_m3s,
      forecast: null,
    }));

    if (historyPoints.length > 0) {
      historyPoints[historyPoints.length - 1].forecast =
        historyPoints[historyPoints.length - 1].observed;
    }

    const futurePoints = (forecastData.forecast_3day || []).map((item) => ({
      date: item.date,
      observed: null,
      forecast: item.predicted_discharge_m3s,
    }));

    return [...historyPoints, ...futurePoints];
  })();

  const rasterBounds = spatialMeta?.bounds || [
    [24.50, 92.30],
    [25.05, 93.10],
  ];

  const selectedZone = FOCUS_LOCATIONS[selectedZoneKey] || FOCUS_LOCATIONS.cachar_basin;
  const activeBoxBounds =
    selectedZoneKey === "cachar_basin" ? rasterBounds : selectedZone.bounds;

  const warningThreshold = forecastData?.thresholds?.warning_m3s ?? 1105.62;
  const dangerThreshold = forecastData?.thresholds?.danger_m3s ?? 1486.31;
  const modelR2 = forecastData?.model_meta?.r2_day1 ?? 0;
  const minDate = forecastData?.model_meta?.min_date || "2020-01-15";
  const maxDate = forecastData?.model_meta?.max_date || "2024-12-31";
  const currentBadge =
    ALERT_BADGE_STYLES[forecastData?.current_alert_status] || ALERT_BADGE_STYLES.Normal;

  const layerOptions = [
    { key: "dynamic_predicted", title: "Projected Flood Extent", color: "#22c55e" },
    { key: "pinn_predicted", title: "Baseline Flood Risk", color: "#0ea5e9" },
    { key: "sar_2022", title: "June 2022 Flood (SAR)", color: "#ef4444" },
    { key: "sar_2024", title: "June 2024 Flood (SAR)", color: "#f59e0b" },
  ];

  const activeLayerStats =
    activeLayer === "dynamic_predicted"
      ? forecastData?.dynamic_spatial
      : spatialMeta?.layers?.[activeLayer];

  const activeLayerDisplayName =
    LAYER_DISPLAY_LABELS[activeLayer] || activeLayerStats?.label || "Flood Layer";

  const inputStyle = {
    width: "100%",
    padding: "9px 11px",
    borderRadius: "7px",
    border: "1px solid #40546c",
    background: "#0f1c2e",
    color: "#ffffff",
    fontSize: "14px",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px", textAlign: "left" }}>
      {/* Header Banner */}
      <section
        style={{
          background: "#15243a",
          border: "1px solid #293e59",
          borderRadius: "12px",
          padding: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 6px", color: "#f8fafc", display: "flex", alignItems: "center", gap: "10px" }}>
            <Waves size={22} color="#38bdf8" />
            Cachar Basin Flood Digital Twin
          </h2>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>
            3-Day Barak River Discharge Forecasting (2024 Validation R2: {modelR2 || "..."}) and Spatial Inundation Mapping
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {forecastData?.data_source && (
            <span
              style={{
                background: "rgba(34, 197, 94, 0.14)",
                color: "#4ade80",
                border: "1px solid rgba(34, 197, 94, 0.4)",
                padding: "6px 12px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              Source: {forecastData.data_source}
            </span>
          )}
          <span
            style={{
              background: "rgba(56, 189, 248, 0.15)",
              color: "#38bdf8",
              border: "1px solid rgba(56, 189, 248, 0.4)",
              padding: "6px 12px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Forecasting Active
          </span>
        </div>
      </section>

      {errorMsg && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid #ef4444",
            color: "#fca5a5",
            padding: "12px 16px",
            borderRadius: "8px",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertTriangle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Interactive Hydrological Input Panel */}
      <section
        style={{
          background: "#15243a",
          border: "1px solid #293e59",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Sliders size={18} color="#38bdf8" />
            <h3 style={{ margin: 0, color: "#f8fafc", fontSize: "16px" }}>
              Hydrological Input and Flood Forecast Controls
            </h3>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { id: "custom", label: "Enter New Data" },
              { id: "live", label: "Live Today (Open-Meteo)" },
              { id: "historical", label: "Historical Replay (2020-2024)" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInputMode(tab.id)}
                style={{
                  padding: "7px 13px",
                  borderRadius: "8px",
                  border: inputMode === tab.id ? "1px solid #38bdf8" : "1px solid #334155",
                  background: inputMode === tab.id ? "rgba(56, 189, 248, 0.16)" : "#0f1c2e",
                  color: inputMode === tab.id ? "#38bdf8" : "#cbd5e1",
                  fontSize: "13px",
                  fontWeight: inputMode === tab.id ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode 1: Enter New Sensor / Rainfall Data */}
        {inputMode === "custom" && (
          <form onSubmit={handleCustomPredict}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
                gap: "14px",
                marginBottom: "16px",
              }}
            >
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "12px", marginBottom: "5px" }}>
                  Current Barak Discharge (m³/s)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customDischarge}
                  onChange={(e) => setCustomDischarge(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "12px", marginBottom: "5px" }}>
                  Silchar Rainfall (mm/day)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customSilcharRain}
                  onChange={(e) => setCustomSilcharRain(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "12px", marginBottom: "5px" }}>
                  Haflong Rainfall (mm/day)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customHaflongRain}
                  onChange={(e) => setCustomHaflongRain(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "12px", marginBottom: "5px" }}>
                  Jiribam Rainfall (mm/day)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customJiribamRain}
                  onChange={(e) => setCustomJiribamRain(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "12px", marginBottom: "5px" }}>
                  Tipaimukh Rainfall (mm/day)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customTipaimukhRain}
                  onChange={(e) => setCustomTipaimukhRain(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                Enter current river discharge and catchment rainfall values to forecast 3-day flow and update the flood map.
              </span>
              <button
                type="submit"
                disabled={loadingForecast}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#0284c7",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Send size={15} />
                {loadingForecast ? "Calculating Forecast..." : "Generate Flood Forecast"}
              </button>
            </div>
          </form>
        )}

        {/* Mode 2: Fetch Live Data from Open-Meteo */}
        {inputMode === "live" && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
              background: "#0f1c2e",
              border: "1px solid #293e59",
              borderRadius: "8px",
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: "13px", color: "#cbd5e1" }}>
              <strong style={{ color: "#f8fafc", display: "block", marginBottom: "4px" }}>
                Real-Time Barak Catchment Synchronization
              </strong>
              Fetches current rainfall across Silchar, Haflong, Jiribam, and Tipaimukh plus live Barak River discharge up to today, then updates the 3-day forecast and map.
            </div>

            <button
              type="button"
              onClick={handleLiveFetchPredict}
              disabled={loadingForecast}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                borderRadius: "8px",
                border: "none",
                background: "#16a34a",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Radio size={15} />
              {loadingForecast ? "Fetching Live Weather and River Data..." : "Fetch Live Data and Forecast"}
            </button>
          </div>
        )}

        {/* Mode 3: Historical Replay (Full 2020-2024 Date Picker) */}
        {inputMode === "historical" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "18px",
              alignItems: "end",
            }}
          >
            <div>
              <label
                htmlFor="cachar-date-picker"
                style={{ display: "block", color: "#94a3b8", fontSize: "13px", marginBottom: "6px" }}
              >
                Pick Any Historical Date ({minDate} to {maxDate})
              </label>
              <input
                id="cachar-date-picker"
                type="date"
                min={minDate}
                max={maxDate}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label
                htmlFor="rain-multiplier-range"
                style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "13px", marginBottom: "6px" }}
              >
                <span>Upstream Rainfall Multiplier</span>
                <strong style={{ color: "#38bdf8" }}>{rainMultiplier.toFixed(1)}x</strong>
              </label>
              <input
                id="rain-multiplier-range"
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={rainMultiplier}
                onChange={(e) => setRainMultiplier(parseFloat(e.target.value))}
                style={{ width: "100%", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b" }}>
                <span>0.5x (Dry)</span>
                <span>1.0x (Observed)</span>
                <span>2.5x (Extreme)</span>
              </div>
            </div>

            {forecastData && (
              <div
                style={{
                  background: "#0f1c2e",
                  border: "1px solid #293e59",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "13px",
                  color: "#cbd5e1",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#38bdf8", marginBottom: "4px" }}>
                  <CloudRain size={15} />
                  <strong>Active Input Rainfall ({forecastData.reference_date})</strong>
                </div>
                <div>
                  Haflong: <strong>{forecastData.upstream_catchment_rain_mm.haflong} mm</strong> | Jiribam:{" "}
                  <strong>{forecastData.upstream_catchment_rain_mm.jiribam} mm</strong> | Tipaimukh:{" "}
                  <strong>{forecastData.upstream_catchment_rain_mm.tipaimukh} mm</strong>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Single-Row 4-Card Forecast Strip */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "14px",
        }}
      >
        <div
          style={{
            background: "#15243a",
            border: "1px solid #293e59",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 600 }}>INPUT DISCHARGE (DAY 0)</span>
            {forecastData && (
              <span
                style={{
                  ...currentBadge,
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "10px",
                  fontWeight: 600,
                }}
              >
                {forecastData.current_alert_status || "Normal"}
              </span>
            )}
          </div>
          <h2 style={{ color: "#f8fafc", fontSize: "23px", margin: "8px 0" }}>
            {loadingForecast || !forecastData ? "..." : `${forecastData.current_discharge_m3s} m³/s`}
          </h2>
          <span style={{ color: "#64748b", fontSize: "11px" }}>
            Barak River at Silchar ({forecastData?.reference_date || selectedDate})
          </span>
        </div>

        {(forecastData?.forecast_3day || []).map((day) => {
          const badge = ALERT_BADGE_STYLES[day.alert_status] || ALERT_BADGE_STYLES.Normal;
          return (
            <div
              key={day.horizon_days}
              style={{
                background: "#15243a",
                border: "1px solid #293e59",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#38bdf8", fontSize: "11px", fontWeight: 600 }}>
                  DAY +{day.horizon_days} FORECAST
                </span>
                <span
                  style={{
                    ...badge,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    fontSize: "10px",
                    fontWeight: 600,
                  }}
                >
                  {day.alert_status}
                </span>
              </div>

              <h2 style={{ color: "#ffffff", fontSize: "23px", margin: "8px 0" }}>
                {loadingForecast ? "..." : `${day.predicted_discharge_m3s} m³/s`}
              </h2>
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>Target Date: {day.date}</span>
            </div>
          );
        })}
      </section>

      {/* Spatial Flood Inundation Map */}
      <section
        style={{
          background: "#15243a",
          border: "1px solid #293e59",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "14px",
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 4px", color: "#f8fafc", display: "flex", alignItems: "center", gap: "8px" }}>
              <Layers size={18} color="#38bdf8" />
              Cachar Spatial Flood Inundation Map
            </h3>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
              Flood extent dynamically adjusts with forecasted Barak River discharge, terrain elevation, and drainage slope
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {layerOptions.map((opt) => {
              const isSelected = activeLayer === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setActiveLayer(opt.key)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: isSelected ? `1px solid ${opt.color}` : "1px solid #334155",
                    background: isSelected ? "rgba(15, 28, 46, 0.95)" : "#0f1c2e",
                    color: isSelected ? opt.color : "#cbd5e1",
                    fontSize: "13px",
                    fontWeight: isSelected ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {opt.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Focus Location Selector and Dynamic Flood Extent Telemetry Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            background: "#0f1c2e",
            border: "1px solid #293e59",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "14px",
            fontSize: "13px",
            color: "#cbd5e1",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#38bdf8", fontWeight: 600 }}>
              <MapPin size={15} />
              Focus Location:
            </span>
            <select
              value={selectedZoneKey}
              onChange={(e) => setSelectedZoneKey(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid #40546c",
                background: "#15243a",
                color: "#ffffff",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {Object.entries(FOCUS_LOCATIONS).map(([key, zone]) => (
                <option key={key} value={key}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            {loadingSpatial || loadingForecast ? (
              <span>Updating spatial flood extent...</span>
            ) : activeLayerStats ? (
              <span>
                Active Layer: <strong>{activeLayerDisplayName}</strong> | Inundated:{" "}
                <strong style={{ color: "#38bdf8" }}>{activeLayerStats.inundated_area_km2} km²</strong> (
                {activeLayerStats.flooded_pixels.toLocaleString()} pixels)
              </span>
            ) : (
              <span>Spatial layer metadata unavailable.</span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <label htmlFor="overlay-opacity" style={{ color: "#94a3b8", fontSize: "12px" }}>
              Opacity: {Math.round(overlayOpacity * 100)} percent
            </label>
            <input
              id="overlay-opacity"
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
              style={{ width: "100px", cursor: "pointer" }}
            />
          </div>
        </div>

        {/* Leaflet Map Container */}
        <div
          style={{
            position: "relative",
            height: "440px",
            width: "100%",
            borderRadius: "10px",
            overflow: "hidden",
            border: "1px solid #293e59",
          }}
        >
          <MapContainer
            center={[24.80, 92.75]}
            zoom={10}
            minZoom={8}
            maxZoom={14}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution="© OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapFocusController bounds={activeBoxBounds} focusKey={selectedZoneKey} />

            {!loadingSpatial && (
              <ImageOverlay
                key={`${activeLayer}-${overlayCacheBust}`}
                url={`${API_BASE_URL}/api/cachar/overlay/${activeLayer}?v=${overlayCacheBust}`}
                bounds={rasterBounds}
                opacity={overlayOpacity}
                zIndex={500}
              />
            )}

            <Rectangle
              bounds={activeBoxBounds}
              pathOptions={{
                color: "#38bdf8",
                weight: 2.5,
                dashArray: "6 4",
                fillColor: "#38bdf8",
                fillOpacity: 0.08,
              }}
            >
              <Popup>
                <div style={{ minWidth: "180px" }}>
                  <strong>{selectedZone.name}</strong>
                  <br />
                  Code: {selectedZone.code}
                  <br />
                  District: {selectedZone.district}
                </div>
              </Popup>
            </Rectangle>

            <Marker position={selectedZone.center}>
              <Popup>
                <strong>{selectedZone.name}</strong>
                <br />
                Station Code: {selectedZone.code}
                <br />
                District: {selectedZone.district}, {selectedZone.state}
              </Popup>
            </Marker>
          </MapContainer>

          <div
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              zIndex: 1000,
              background: "rgba(15, 28, 46, 0.92)",
              border: "1px solid #38bdf8",
              borderRadius: "8px",
              padding: "10px 14px",
              color: "#f8fafc",
              fontSize: "12px",
              minWidth: "205px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
            }}
          >
            <div style={{ color: "#38bdf8", fontWeight: 700, marginBottom: "6px", borderBottom: "1px solid #293e59", paddingBottom: "4px" }}>
              {selectedZone.name}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "3px" }}>
              <span style={{ color: "#94a3b8" }}>Zone ID:</span>
              <strong>{selectedZone.code}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "3px" }}>
              <span style={{ color: "#94a3b8" }}>Peak Forecast:</span>
              <strong>{forecastData?.dynamic_spatial?.peak_predicted_discharge_m3s ?? "--"} m³/s</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ color: "#94a3b8" }}>Alert Threshold:</span>
              <strong style={{ color: "#f59e0b" }}>{warningThreshold} / {dangerThreshold} m³/s</strong>
            </div>
          </div>
        </div>
      </section>

      {/* Hydrograph Trajectory and 2024 Validation Charts */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "20px",
        }}
      >
        <div
          style={{
            background: "#15243a",
            border: "1px solid #293e59",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <h3 style={{ margin: "0 0 6px", color: "#f8fafc", fontSize: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={18} color="#38bdf8" />
            Recent Discharge Hydrograph and 3-Day Forecast
          </h3>
          <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: "12px" }}>
            Barak River discharge trajectory (m³/s) with calibrated Warning ({warningThreshold}) and Danger ({dangerThreshold}) thresholds
          </p>

          <div style={{ width: "100%", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={combinedTrajectory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#293e59" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} minTickGap={25} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#0f1c2e", border: "1px solid #293e59", color: "#f8fafc" }}
                />
                <Legend />
                <ReferenceLine
                  y={warningThreshold}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: `Warning (${warningThreshold})`, fill: "#f59e0b", fontSize: 11 }}
                />
                <ReferenceLine
                  y={dangerThreshold}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: `Danger (${dangerThreshold})`, fill: "#ef4444", fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="observed"
                  name="Input Discharge Window (m³/s)"
                  stroke="#38bdf8"
                  fill="rgba(56, 189, 248, 0.2)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="3-Day Forecast (m³/s)"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#f59e0b" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          style={{
            background: "#15243a",
            border: "1px solid #293e59",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <h3 style={{ margin: "0 0 6px", color: "#f8fafc", fontSize: "16px" }}>
            2024 Historical Flood Validation (R2 = {modelR2 || "..."})
          </h3>
          <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: "12px" }}>
            Comparison between observed 2024 Barak River discharge and forecasted values
          </p>

          <div style={{ width: "100%", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={validationSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#293e59" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} minTickGap={35} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#0f1c2e", border: "1px solid #293e59", color: "#f8fafc" }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="actual_m3s"
                  name="Observed 2024 (m³/s)"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted_day1_m3s"
                  name="Forecast Day +1 (m³/s)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted_day3_m3s"
                  name="Forecast Day +3 (m³/s)"
                  stroke="#a78bfa"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}

export default CacharBasinDashboard;