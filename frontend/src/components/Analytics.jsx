import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  CloudRain, Waves, TrendingUp, Radio, AlertTriangle, Database, MapPin,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const locations = [
  "Tezpur", "Guwahati", "Nagaon", "Dhemaji", "Dibrugarh",
  "Tinsukia", "Lakhimpur", "Barpeta", "Morigaon", "Dhubri",
];

function Analytics() {
  const [location, setLocation] = useState("Nagaon");
  const [weatherData, setWeatherData] = useState(null);
  const [riverData, setRiverData] = useState(null);
  const [stationData, setStationData] = useState([]);

  const [weatherLoading, setWeatherLoading] = useState(true);
  const [riverLoading, setRiverLoading] = useState(true);
  const [stationLoading, setStationLoading] = useState(true);

  const [weatherError, setWeatherError] = useState("");
  const [riverError, setRiverError] = useState("");
  const [stationError, setStationError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const fetchWeather = async () => {
      setWeatherLoading(true);
      setWeatherError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/weather/forecast?location=${encodeURIComponent(location)}`,
          { signal: controller.signal }
        );

        if (!response.ok) throw new Error("Unable to retrieve weather forecast.");

        const data = await response.json();
        setWeatherData(data);
      } catch (error) {
        if (error.name !== "AbortError") {
          setWeatherError(error.message);
          setWeatherData(null);
        }
      } finally {
        if (!controller.signal.aborted) setWeatherLoading(false);
      }
    };

    fetchWeather();
    return () => controller.abort();
  }, [location]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchRiverData = async () => {
      setRiverLoading(true);
      setRiverError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/river/levels?hours=168`,
          { signal: controller.signal }
        );

        if (!response.ok) throw new Error("Unable to retrieve historical river data.");

        const data = await response.json();
        setRiverData(data);
      } catch (error) {
        if (error.name !== "AbortError") {
          setRiverError(error.message);
          setRiverData(null);
        }
      } finally {
        if (!controller.signal.aborted) setRiverLoading(false);
      }
    };

    fetchRiverData();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchStations = async () => {
      setStationLoading(true);
      setStationError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/river/stations`,
          { signal: controller.signal }
        );

        if (!response.ok) throw new Error("Unable to retrieve station records.");

        const data = await response.json();
        setStationData(Array.isArray(data.stations) ? data.stations : []);
      } catch (error) {
        if (error.name !== "AbortError") {
          setStationError(error.message);
          setStationData([]);
        }
      } finally {
        if (!controller.signal.aborted) setStationLoading(false);
      }
    };

    fetchStations();
    return () => controller.abort();
  }, []);

  // FIXED: Robust null checks for Open-Meteo properties
  const hourly = weatherData?.weather?.hourly || {};

  const rainfallChartData = hourly.time
    ? hourly.time.slice(0, 24).map((time, index) => ({
        time: new Date(time).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        rainfall: Number(hourly.precipitation?.[index] ?? 0),
        probability: Number(hourly.precipitation_probability?.[index] ?? 0),
      }))
    : [];

  const next24HourRainfall = rainfallChartData.reduce(
    (sum, item) => sum + item.rainfall,
    0
  );

  const peakRainfall = rainfallChartData.length
    ? Math.max(...rainfallChartData.map((item) => item.rainfall))
    : 0;

  const riverHistory = riverData?.history || [];

  const riverChartData = riverHistory.map((record) => ({
    timestamp: record.timestamp,
    time: new Date(record.timestamp).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    waterLevel: Number(record.water_level),
  }));

  const latestRiverLevel = riverChartData.length
    ? riverChartData[riverChartData.length - 1].waterLevel
    : null;

  return (
    <section className="analytics-page">
      <div className="dashboard-welcome">
        <h2>Flood Analytics Centre</h2>
        <p>Weather forecasts, historical river observations and monitoring station data</p>
      </div>

      <div className="analytics-chart-card analytics-location-card">
        <div className="analytics-location-heading">
          <div>
            <h3>Weather Forecast Location</h3>
            <p>Select a location for weather forecast analysis</p>
          </div>
          <span className="monitoring-live-label">
            <CloudRain size={15} /> Weather Forecast
          </span>
        </div>

        <div className="analytics-location-control">
          <label htmlFor="analytics-location">
            <MapPin size={15} /> Monitoring Location
          </label>
          <select
            id="analytics-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="analytics-location-select"
          >
            {locations.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="analytics-summary">
        <div className="analytics-stat">
          <CloudRain size={23} />
          <span>Forecast Rainfall</span>
          <strong>
            {weatherLoading ? "..." : `${next24HourRainfall.toFixed(1)} mm`}
          </strong>
          <small>Next 24 hours · {location}</small>
        </div>

        <div className="analytics-stat">
          <Waves size={23} />
          <span>Latest River Level</span>
          <strong>
            {riverLoading ? "..." : latestRiverLevel !== null ? `${latestRiverLevel.toFixed(2)} m` : "--"}
          </strong>
          <small>{riverData?.station || "Historical station"}</small>
        </div>

        <div className="analytics-stat">
          <TrendingUp size={23} />
          <span>Peak Hourly Rainfall</span>
          <strong>
            {weatherLoading ? "..." : `${peakRainfall.toFixed(1)} mm`}
          </strong>
          <small>Next 24-hour forecast</small>
        </div>

        <div className="analytics-stat">
          <Radio size={23} />
          <span>SMART AXOM Stations</span>
          <strong>{stationLoading ? "..." : stationData.length}</strong>
          <small>Available station records</small>
        </div>
      </div>

      <div className="analytics-chart-card">
        <div className="analytics-chart-heading">
          <div>
            <h3>Hourly Rainfall Forecast</h3>
            <p>Forecast precipitation for {location}</p>
          </div>
          <span className="monitoring-live-label">Open-Meteo Forecast</span>
        </div>

        {weatherLoading && <p className="weather-message">Fetching rainfall forecast...</p>}
        {weatherError && <p className="weather-error">{weatherError}</p>}

        {!weatherLoading && !weatherError && rainfallChartData.length > 0 && next24HourRainfall > 0 && (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rainfallChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263b54" />
              <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 10 }} interval={3} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} unit=" mm" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#142238",
                  border: "1px solid #263b54",
                  borderRadius: "8px",
                  color: "#ffffff",
                }}
                formatter={(value) => [`${value} mm`, "Precipitation"]}
              />
              <Bar dataKey="rainfall" name="Rainfall" fill="#38bdf8" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {!weatherLoading && !weatherError && rainfallChartData.length > 0 && next24HourRainfall === 0 && (
          <div className="analytics-empty-state">
            <CloudRain size={34} />
            <h4>No rainfall forecast for this period</h4>
            <p>Open-Meteo currently forecasts 0 mm precipitation over the next 24 hours for {location}.</p>
          </div>
        )}

        {!weatherLoading && !weatherError && rainfallChartData.length === 0 && (
          <div className="analytics-empty-state">
            <CloudRain size={34} />
            <h4>No forecast data available</h4>
            <p>Hourly precipitation data is currently unavailable for {location}.</p>
          </div>
        )}

        <p className="analytics-data-note">
          Source: Open-Meteo weather model forecast. Forecast values are not measured rainfall observations.
        </p>
      </div>

      <div className="analytics-chart-card">
        <div className="analytics-chart-heading">
          <div>
            <h3>Historical River-Level Analysis</h3>
            <p>
              {riverData?.station || "Historical monitoring station"} {" — "}
              {riverData?.district || "District unavailable"}
            </p>
          </div>
          <span className="monitoring-live-label">Historical Observations</span>
        </div>

        {riverLoading && <p className="weather-message">Fetching historical river-level records...</p>}
        {riverError && <p className="weather-error">{riverError}</p>}

        {!riverLoading && !riverError && riverChartData.length > 0 && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={riverChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263b54" />
              <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={35} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} unit=" m" domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#142238",
                  border: "1px solid #263b54",
                  borderRadius: "8px",
                  color: "#ffffff",
                }}
                labelFormatter={(label) => `Time: ${label}`}
                formatter={(value) => [`${value} m`, "Water Level"]}
              />
              <Line type="monotone" dataKey="waterLevel" name="Water Level" stroke="#2dd4bf" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {!riverLoading && !riverError && riverChartData.length === 0 && (
          <div className="analytics-empty-state">
            <Waves size={34} />
            <h4>No historical observations available</h4>
            <p>No river-level records were returned for the requested period.</p>
          </div>
        )}

        <p className="analytics-data-note">
          Source: {riverData?.source || "Historical river-level dataset"}. This dataset currently represents one monitoring station, not statewide river conditions.
        </p>
      </div>

      <p className="analytics-disclaimer">
        Analytics combines weather forecasts, historical river observations and available monitoring data. Statewide flood assessment is not yet available.
      </p>
    </section>
  );
}

export default Analytics;