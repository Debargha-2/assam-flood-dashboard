import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  CloudRain,
  TrendingUp,
  Target,
  MapPin,
  Calendar,
  Droplets,
  Database,
  Waves,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const LOCATIONS = [
  "Tezpur",
  "Guwahati",
  "Nagaon",
  "Dhemaji",
  "Dibrugarh",
  "Tinsukia",
  "Lakhimpur",
  "Barpeta",
  "Morigaon",
  "Dhubri",
];

const HORIZONS = [
  { label: "24 Hours", hours: 24, days: 1 },
  { label: "48 Hours", hours: 48, days: 2 },
  { label: "72 Hours", hours: 72, days: 3 },
];

const BADGE_STYLES = {
  Danger: {
    background: "rgba(239, 68, 68, 0.16)",
    color: "#ef4444",
    border: "1px solid #ef4444",
  },
  Warning: {
    background: "rgba(245, 158, 11, 0.16)",
    color: "#f59e0b",
    border: "1px solid #f59e0b",
  },
  Normal: {
    background: "rgba(34, 197, 94, 0.16)",
    color: "#22c55e",
    border: "1px solid #22c55e",
  },
};

function formatShortDate(dateStr) {
  if (!dateStr) return "--";
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return dateStr;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatHourLabel(isoStr, showDate) {
  if (!isoStr) return "";
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return isoStr;
  const hh = String(dt.getHours()).padStart(2, "0") + ":00";
  if (!showDate) return hh;
  return `${dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} ${hh}`;
}

function ForecastPanel() {
  const [selectedLocation, setSelectedLocation] = useState("Nagaon");
  const [horizonHours, setHorizonHours] = useState(72);

  const [weatherPayload, setWeatherPayload] = useState(null);
  const [cacharForecast, setCacharForecast] = useState(null);
  const [riverSummary, setRiverSummary] = useState({ total: 0, warning: 0, danger: 0 });

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  /* Fetch live weather forecast whenever location changes */
  useEffect(() => {
    let active = true;

    const loadWeather = async () => {
      try {
        setLoading(true);
        setErrorMsg("");
        const res = await fetch(
          `${API_BASE_URL}/api/weather/forecast?location=${encodeURIComponent(selectedLocation)}`
        );
        if (!res.ok) {
          throw new Error(`Weather API error (${res.status})`);
        }
        const data = await res.json();
        if (active) {
          setWeatherPayload(data);
        }
      } catch (err) {
        if (active) {
          setErrorMsg(err.message || "Unable to fetch forecast data from backend.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadWeather();
    return () => {
      active = false;
    };
  }, [selectedLocation]);

  /* Fetch connected flood forecasting model outputs and station alerts once */
  useEffect(() => {
    let active = true;

    const loadFloodModelTelemetry = async () => {
      try {
        const [cacharRes, riverRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/cachar/forecast`),
          fetch(`${API_BASE_URL}/api/river/levels?hours=24`),
        ]);

        if (cacharRes.ok) {
          const cacharJson = await cacharRes.json();
          if (active) setCacharForecast(cacharJson.data || null);
        }

        if (riverRes.ok) {
          const riverJson = await riverRes.json();
          const rows = Array.isArray(riverJson.data) ? riverJson.data : [];
          if (active) {
            setRiverSummary({
              total: rows.length,
              warning: rows.filter((r) => r.status === "Warning").length,
              danger: rows.filter((r) => r.status === "Danger").length,
            });
          }
        }
      } catch (err) {
        console.error("Flood model summary error:", err);
      }
    };

    loadFloodModelTelemetry();
    return () => {
      active = false;
    };
  }, []);

  const hourly = weatherPayload?.weather?.hourly;
  const daily = weatherPayload?.weather?.daily;
  const currentHorizon =
    HORIZONS.find((h) => h.hours === horizonHours) || HORIZONS[2];

  /* Build full hourly chart series for 24h, 48h, or 72h */
  const hourlySeries = (() => {
    if (!hourly || !Array.isArray(hourly.time)) return [];
    const now = Date.now();
    let startIndex = hourly.time.findIndex((t) => new Date(t).getTime() >= now - 3600000);
    if (startIndex < 0) startIndex = 0;

    const sliceCount = Math.min(horizonHours, hourly.time.length - startIndex);
    const points = [];
    for (let i = 0; i < sliceCount; i += 1) {
      const idx = startIndex + i;
      points.push({
        time: formatHourLabel(hourly.time[idx], horizonHours > 24),
        rainfall: Number(hourly.precipitation?.[idx] ?? 0),
        probability: Number(hourly.precipitation_probability?.[idx] ?? 0),
        humidity: Number(hourly.relative_humidity_2m?.[idx] ?? 0),
      });
    }
    return points;
  })();

  /* Build multi-day breakdown rows from Open-Meteo daily forecast */
  const dailyRows = (() => {
    if (!daily || !Array.isArray(daily.time)) return [];
    return daily.time.map((dateVal, idx) => {
      const rainMm = Number(daily.precipitation_sum?.[idx] ?? 0);
      const probPct = Number(daily.precipitation_probability_max?.[idx] ?? 0);
      let risk = "Low";
      if (rainMm >= 65 || probPct >= 85) risk = "High";
      else if (rainMm >= 20 || probPct >= 55) risk = "Moderate";

      return {
        rawDate: dateVal,
        date: formatShortDate(dateVal),
        rainfall: rainMm,
        probability: probPct,
        status: idx === 0 ? "Today" : "Forecast",
        risk,
      };
    });
  })();

  const expectedRainfall = hourlySeries
    .reduce((sum, pt) => sum + pt.rainfall, 0)
    .toFixed(1);

  const peakHourlyRain =
    hourlySeries.length > 0
      ? Math.max(...hourlySeries.map((pt) => pt.rainfall)).toFixed(1)
      : "0.0";

  const maxRainProb =
    hourlySeries.length > 0
      ? Math.round(Math.max(...hourlySeries.map((pt) => pt.probability)))
      : 0;

  const cardStyle = {
    background: "#15243a",
    border: "1px solid #293e59",
    borderRadius: "12px",
    padding: "18px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", textAlign: "left" }}>
      {/* Header */}
      <section style={cardStyle}>
        <h2 style={{ margin: "0 0 6px", color: "#f8fafc" }}>
          Weather and Flood Forecast Centre
        </h2>
        <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>
          Live hourly rainfall outlook across Assam locations coupled with Barak River discharge forecasting
        </p>
      </section>

      {errorMsg && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.16)",
            border: "1px solid #ef4444",
            color: "#fca5a5",
            padding: "12px 16px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
          }}
        >
          <AlertTriangle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Horizon and Location Controls */}
      <section
        style={{
          ...cardStyle,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "18px",
          alignItems: "center",
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 4px", color: "#f8fafc", fontSize: "15px" }}>
            Forecast Horizon
          </h3>
          <p style={{ margin: "0 0 10px", color: "#94a3b8", fontSize: "12px" }}>
            Select hourly analysis window
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {HORIZONS.map((h) => {
              const active = horizonHours === h.hours;
              return (
                <button
                  key={h.hours}
                  type="button"
                  onClick={() => setHorizonHours(h.hours)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: active ? "1px solid #38bdf8" : "1px solid #334155",
                    background: active ? "#0284c7" : "#0f1c2e",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {h.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="forecast-location-select"
            style={{ display: "block", color: "#f8fafc", fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}
          >
            Weather Forecast Explorer
          </label>
          <p style={{ margin: "0 0 10px", color: "#94a3b8", fontSize: "12px" }}>
            Select a supported Assam monitoring location
          </p>
          <select
            id="forecast-location-select"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #40546c",
              background: "#0f1c2e",
              color: "#ffffff",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            {LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Primary KPI Strip */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "16px",
        }}
      >
        <div style={cardStyle}>
          <CloudRain size={18} color="#38bdf8" />
          <p style={{ color: "#94a3b8", fontSize: "12px", margin: "8px 0 4px" }}>
            Expected Rainfall ({currentHorizon.label})
          </p>
          <h2 style={{ color: "#f8fafc", fontSize: "26px", margin: "0 0 4px" }}>
            {loading ? "..." : `${expectedRainfall} mm`}
          </h2>
          <span style={{ color: "#64748b", fontSize: "12px" }}>
            Cumulative hourly sum
          </span>
        </div>

        <div style={cardStyle}>
          <TrendingUp size={18} color="#38bdf8" />
          <p style={{ color: "#94a3b8", fontSize: "12px", margin: "8px 0 4px" }}>
            Peak Hourly Rainfall
          </p>
          <h2 style={{ color: "#f8fafc", fontSize: "26px", margin: "0 0 4px" }}>
            {loading ? "..." : `${peakHourlyRain} mm/hr`}
          </h2>
          <span style={{ color: "#64748b", fontSize: "12px" }}>
            Highest forecast hourly intensity
          </span>
        </div>

        <div style={cardStyle}>
          <Target size={18} color="#f59e0b" />
          <p style={{ color: "#94a3b8", fontSize: "12px", margin: "8px 0 4px" }}>
            Maximum Rain Probability
          </p>
          <h2 style={{ color: "#f8fafc", fontSize: "26px", margin: "0 0 4px" }}>
            {loading ? "..." : `${maxRainProb}%`}
          </h2>
          <span style={{ color: "#64748b", fontSize: "12px" }}>
            Peak probability over {currentHorizon.label}
          </span>
        </div>
      </section>

      {/* Metadata Strip */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))",
          gap: "14px",
        }}
      >
        <div style={cardStyle}>
          <MapPin size={16} color="#38bdf8" />
          <p style={{ color: "#94a3b8", fontSize: "12px", margin: "6px 0 4px" }}>Selected Location</p>
          <strong style={{ color: "#f8fafc", fontSize: "16px" }}>{selectedLocation}</strong>
        </div>

        <div style={cardStyle}>
          <Calendar size={16} color="#38bdf8" />
          <p style={{ color: "#94a3b8", fontSize: "12px", margin: "6px 0 4px" }}>Forecast Period</p>
          <strong style={{ color: "#f8fafc", fontSize: "16px" }}>{currentHorizon.label}</strong>
        </div>

        <div style={cardStyle}>
          <Droplets size={16} color="#38bdf8" />
          <p style={{ color: "#94a3b8", fontSize: "12px", margin: "6px 0 4px" }}>Data Points</p>
          <strong style={{ color: "#f8fafc", fontSize: "16px" }}>
            {hourlySeries.length} Hours / {dailyRows.length} Days
          </strong>
        </div>

        <div style={cardStyle}>
          <Database size={16} color="#38bdf8" />
          <p style={{ color: "#94a3b8", fontSize: "12px", margin: "6px 0 4px" }}>Data Source</p>
          <strong style={{ color: "#f8fafc", fontSize: "16px" }}>
            {weatherPayload?.source || "Open-Meteo"}
          </strong>
        </div>
      </section>

      {/* Hourly Rainfall and Probability Chart */}
      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 4px", color: "#f8fafc", fontSize: "16px" }}>
              Hourly Rainfall and Probability Forecast
            </h3>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "12px" }}>
              Expected hourly precipitation (mm) and rain probability (%) for {selectedLocation} — {currentHorizon.label}
            </p>
          </div>
          <span
            style={{
              background: "rgba(56, 189, 248, 0.14)",
              color: "#38bdf8",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              padding: "5px 12px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Live Weather Model
          </span>
        </div>

        <div style={{ width: "100%", height: "310px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={hourlySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#293e59" />
              <XAxis
                dataKey="time"
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis
                yAxisId="left"
                stroke="#38bdf8"
                tick={{ fontSize: 11 }}
                unit=" mm"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#f59e0b"
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  background: "#0f1c2e",
                  border: "1px solid #293e59",
                  color: "#f8fafc",
                }}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="rainfall"
                name="Rainfall (mm)"
                fill="#38bdf8"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="probability"
                name="Rain Probability (%)"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Multi-Day Rainfall Breakdown Table */}
      <section style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", color: "#f8fafc", fontSize: "16px" }}>
          Multi-Day Rainfall Breakdown ({selectedLocation})
        </h3>
        <p style={{ margin: "0 0 14px", color: "#94a3b8", fontSize: "12px" }}>
          Daily precipitation totals and peak probabilities returned by Open-Meteo
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #293e59", color: "#94a3b8", textAlign: "left" }}>
                <th style={{ padding: "10px 8px" }}>Date</th>
                <th style={{ padding: "10px 8px" }}>Forecast Rainfall</th>
                <th style={{ padding: "10px 8px" }}>Max Rain Probability</th>
                <th style={{ padding: "10px 8px" }}>Rainfall Intensity</th>
                <th style={{ padding: "10px 8px" }}>Data Status</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "16px 8px", color: "#94a3b8" }}>
                    {loading ? "Loading multi-day breakdown..." : "No daily forecast rows available."}
                  </td>
                </tr>
              ) : (
                dailyRows.map((row) => (
                  <tr
                    key={row.rawDate}
                    style={{ borderBottom: "1px solid rgba(41, 62, 89, 0.55)", color: "#e2e8f0" }}
                  >
                    <td style={{ padding: "10px 8px", fontWeight: 600 }}>{row.date}</td>
                    <td style={{ padding: "10px 8px" }}>{row.rainfall.toFixed(1)} mm</td>
                    <td style={{ padding: "10px 8px" }}>{Math.round(row.probability)}%</td>
                    <td style={{ padding: "10px 8px" }}>{row.risk}</td>
                    <td style={{ padding: "10px 8px", color: "#38bdf8" }}>{row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Connected Flood Forecast Model Summary */}
      <section style={cardStyle}>
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Waves size={18} color="#22c55e" />
            <h3 style={{ margin: 0, color: "#f8fafc", fontSize: "16px" }}>
              Integrated Flood Forecast Engine
            </h3>
          </div>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(34, 197, 94, 0.16)",
              color: "#4ade80",
              border: "1px solid rgba(34, 197, 94, 0.45)",
              padding: "4px 12px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={14} />
            Connected and Active
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "12px",
          }}
        >
          <div
            style={{
              background: "#0f1c2e",
              border: "1px solid #293e59",
              borderRadius: "8px",
              padding: "12px 14px",
            }}
          >
            <span style={{ color: "#94a3b8", fontSize: "11px" }}>ACTIVE RIVER STATIONS</span>
            <h3 style={{ color: "#f8fafc", margin: "6px 0 2px", fontSize: "20px" }}>
              {riverSummary.total} Monitored
            </h3>
            <span style={{ color: "#f59e0b", fontSize: "12px" }}>
              {riverSummary.danger} Danger | {riverSummary.warning} Warning
            </span>
          </div>

          {(cacharForecast?.forecast_3day || []).map((day) => {
            const badge = BADGE_STYLES[day.alert_status] || BADGE_STYLES.Normal;
            return (
              <div
                key={day.horizon_days}
                style={{
                  background: "#0f1c2e",
                  border: "1px solid #293e59",
                  borderRadius: "8px",
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#38bdf8", fontSize: "11px", fontWeight: 600 }}>
                    BARAK DAY +{day.horizon_days}
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
                <h3 style={{ color: "#f8fafc", margin: "6px 0 2px", fontSize: "20px" }}>
                  {day.predicted_discharge_m3s} m³/s
                </h3>
                <span style={{ color: "#94a3b8", fontSize: "11px" }}>Date: {day.date}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default ForecastPanel;