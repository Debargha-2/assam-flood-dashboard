import { useState, useEffect } from "react";

import Sidebar from "./components/Sidebar";
import DashboardHeader from "./components/DashboardHeader";
import StatCard from "./components/StatCard";
import AssamMap from "./components/AssamMap";
import FloodAlerts from "./components/FloodAlerts";
import ForecastPanel from "./components/ForecastPanel";
import LiveMonitoring from "./components/LiveMonitoring";
import DigitalTwin from "./components/DigitalTwin";
import Analytics from "./components/Analytics";
import RainfallChart from "./components/RainfallChart";
import RiverLevelChart from "./components/RiverLevelChart";
import CacharBasinDashboard from "./components/CacharBasinDashboard";

import { getWeatherForecast } from "./services/weatherService";

import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function App() {
  const [activePage, setActivePage] = useState("Overview");

  const [showSampleData, setShowSampleData] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [compactView, setCompactView] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState("Nagaon");
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  const [districtRegistry, setDistrictRegistry] = useState(null);
  const [districtLoading, setDistrictLoading] = useState(true);
  const [districtError, setDistrictError] = useState("");

  const [riverLevels, setRiverLevels] = useState([]);
  const [riverLoading, setRiverLoading] = useState(true);

  const locations = [
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

  /* Fetch live district registry and river levels together */
  useEffect(() => {
    const controller = new AbortController();

    const fetchLiveSystemStats = async () => {
      setDistrictLoading(true);
      setRiverLoading(true);
      setDistrictError("");

      try {
        const [districtRes, riverRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/districts`, { signal: controller.signal }),
          fetch(`${API_BASE_URL}/api/river/levels?hours=24`, { signal: controller.signal }),
        ]);

        if (!districtRes.ok) {
          throw new Error(`District registry request failed: ${districtRes.status}`);
        }

        const distData = await districtRes.json();
        if (!Array.isArray(distData.districts)) {
          throw new Error("Invalid district registry response.");
        }
        setDistrictRegistry(distData);

        if (riverRes.ok) {
          const riverData = await riverRes.json();
          setRiverLevels(Array.isArray(riverData.data) ? riverData.data : []);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setDistrictError(
            error.message || "Unable to retrieve Assam district registry."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setDistrictLoading(false);
          setRiverLoading(false);
        }
      }
    };

    fetchLiveSystemStats();

    return () => {
      controller.abort();
    };
  }, []);

  /* Fetch live Open-Meteo weather forecast */
  useEffect(() => {
    let isActive = true;

    const fetchWeather = async () => {
      setWeatherLoading(true);
      setWeatherError("");

      try {
        const data = await getWeatherForecast(selectedLocation);
        if (isActive) {
          setWeatherData(data);
        }
      } catch (error) {
        if (isActive) {
          setWeatherError(
            error.response?.data?.detail ||
              "Unable to retrieve weather data. Check your backend connection."
          );
        }
      } finally {
        if (isActive) {
          setWeatherLoading(false);
        }
      }
    };

    fetchWeather();

    return () => {
      isActive = false;
    };
  }, [selectedLocation]);

  const currentWeather = weatherData?.weather?.current;

  /* Live computed Overview KPIs */
  const liveRainfall24h = (() => {
    const hourlyPrecip = weatherData?.weather?.hourly?.precipitation;
    if (Array.isArray(hourlyPrecip) && hourlyPrecip.length > 0) {
      const total = hourlyPrecip
        .slice(0, 24)
        .reduce((sum, val) => sum + (Number(val) || 0), 0);
      return total.toFixed(1);
    }
    const dailyFirst = weatherData?.weather?.daily?.precipitation_sum?.[0];
    if (dailyFirst !== undefined && dailyFirst !== null) {
      return Number(dailyFirst).toFixed(1);
    }
    return weatherLoading ? "..." : "0.0";
  })();

  const liveAvgRiverLevel = (() => {
    if (riverLoading) return "...";
    if (!riverLevels.length) return "—";
    const sum = riverLevels.reduce(
      (acc, item) => acc + (Number(item.water_level_m ?? item.water_level) || 0),
      0
    );
    return (sum / riverLevels.length).toFixed(2);
  })();

  const liveHighRiskDistricts = (() => {
    if (riverLoading) return "...";
    const flagged = new Set(
      riverLevels
        .filter((item) => item.status === "Danger" || item.status === "Warning")
        .map((item) => item.district)
    );
    return String(flagged.size);
  })();

  const totalDistrictsCount = districtRegistry
    ? districtRegistry.total_districts ?? districtRegistry.districts?.length ?? "—"
    : "—";

  const renderPage = () => {
    switch (activePage) {
      case "Overview":
        return (
          <>
            <div className="dashboard-welcome">
              <h2>Assam Flood Intelligence System</h2>
              <p>Digital Twin-Based Flood Monitoring and Forecasting</p>
            </div>

            <section className="live-weather-section">
              <div className="section-heading">
                <div>
                  <h2>Live Weather Monitoring</h2>
                  <p>Weather-model data retrieved from Open-Meteo</p>
                </div>

                <span className="map-label">API Connected</span>
              </div>

              <div className="weather-location-selector">
                <label htmlFor="weather-location">
                  Select Monitoring Location
                </label>

                <select
                  id="weather-location"
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                >
                  {locations.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </div>

              {weatherLoading && (
                <p className="weather-message">Fetching weather data...</p>
              )}

              {weatherError && <p className="weather-error">{weatherError}</p>}

              {currentWeather && !weatherLoading && (
                <>
                  <div className="weather-data-grid">
                    <div className="weather-data-card">
                      <span>Temperature</span>
                      <strong>{currentWeather.temperature_2m} °C</strong>
                    </div>

                    <div className="weather-data-card">
                      <span>Humidity</span>
                      <strong>{currentWeather.relative_humidity_2m}%</strong>
                    </div>

                    <div className="weather-data-card">
                      <span>Precipitation</span>
                      <strong>{currentWeather.precipitation} mm</strong>
                    </div>

                    <div className="weather-data-card">
                      <span>Wind Speed</span>
                      <strong>{currentWeather.wind_speed_10m ?? 0} km/h</strong>
                    </div>
                  </div>

                  <p className="weather-source-note">
                    Source: Open-Meteo | Location: {weatherData.location}
                    {" | "}Model timestamp: {currentWeather.time}
                  </p>
                </>
              )}
            </section>

            <RainfallChart weatherData={weatherData} />

            <RiverLevelChart />

            <section className="stats-grid">
              <StatCard
                title={`24h Rainfall (${selectedLocation})`}
                value={liveRainfall24h}
                unit="mm"
                type="rainfall"
                change="Live Open-Meteo 24h sum"
                status="Live"
              />

              <StatCard
                title="Average River Level"
                value={liveAvgRiverLevel}
                unit="m"
                type="river"
                change={`Across ${riverLevels.length || 0} active stations`}
                status="Live"
              />

              <StatCard
                title="Alert-Active Districts"
                value={liveHighRiskDistricts}
                unit=""
                type="risk"
                change="Warning or Danger threshold"
                status="Live Status"
              />

              <StatCard
                title="Districts Monitored"
                value={districtLoading ? "..." : totalDistrictsCount}
                unit=""
                type="districts"
                change={
                  districtRegistry
                    ? "Connected to district registry"
                    : districtError
                    ? "District registry unavailable"
                    : "Loading district registry"
                }
                status={districtRegistry ? "Registry Connected" : "Registry"}
              />
            </section>

            {districtError && (
              <p className="weather-error">
                District registry error: {districtError}
              </p>
            )}

            <FloodAlerts />
          </>
        );

      case "Cachar Basin AI":
      case "Cachar Basin":
        return <CacharBasinDashboard />;

      case "Live Monitoring":
        return <LiveMonitoring />;

      case "Flood Risk Map":
        return (
          <section className="map-section">
            <div className="section-heading">
              <div>
                <h2>Flood Risk Map – Assam</h2>
                <p>District-wise flood risk and monitoring stations</p>
              </div>

              <span className="map-label">Interactive Map</span>
            </div>

            <AssamMap />
          </section>
        );

      case "Digital Twin":
        return <DigitalTwin />;

      case "AI Forecast":
      case "Flood Forecast":
        return <ForecastPanel />;

      case "Analytics":
        return <Analytics />;

      case "Settings":
        return (
          <section className="settings-page">
            <div className="dashboard-welcome">
              <h2>System Settings</h2>
              <p>Manage dashboard preferences and system notifications</p>
            </div>

            <div className="settings-section">
              <h3>Display Preferences</h3>
              <p>Customise how information appears on your dashboard.</p>

              <div className="setting-row">
                <div>
                  <h4>Show Sample Data Labels</h4>
                  <span>
                    Display labels identifying illustrative data across the
                    dashboard.
                  </span>
                </div>

                <input
                  type="checkbox"
                  checked={showSampleData}
                  onChange={(e) => setShowSampleData(e.target.checked)}
                />
              </div>

              <div className="setting-row">
                <div>
                  <h4>Compact View</h4>
                  <span>Enable a more compact dashboard layout.</span>
                </div>

                <input
                  type="checkbox"
                  checked={compactView}
                  onChange={(e) => setCompactView(e.target.checked)}
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>Notifications</h3>
              <p>Manage dashboard notification preferences.</p>

              <div className="setting-row">
                <div>
                  <h4>Flood Alert Notifications</h4>
                  <span>
                    Enable or disable flood alert notifications in this
                    dashboard interface.
                  </span>
                </div>

                <input
                  type="checkbox"
                  checked={notifications}
                  onChange={(e) => setNotifications(e.target.checked)}
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>System Information</h3>

              <div className="system-info-row">
                <span>Application</span>
                <strong>Assam Flood Intelligence System</strong>
              </div>

              <div className="system-info-row">
                <span>Platform</span>
                <strong>Digital Twin-Based Dashboard</strong>
              </div>

              <div className="system-info-row">
                <span>Version</span>
                <strong>2.0</strong>
              </div>

              <div className="system-info-row">
                <span>Data Mode</span>
                <strong>Live Weather API and Station Telemetry</strong>
              </div>

              <div className="system-info-row">
                <span>District Registry</span>
                <strong>
                  {districtLoading
                    ? "Loading..."
                    : districtRegistry
                    ? `${totalDistrictsCount} Districts Loaded`
                    : "Unavailable"}
                </strong>
              </div>
            </div>

            <p className="settings-note">
              Note: These preferences currently apply within the running
              dashboard session. They are not permanently saved.
            </p>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`app-container ${compactView ? "compact-view" : ""}`}
      data-show-sample-data={showSampleData}
      data-notifications={notifications}
    >
      <Sidebar activePage={activePage} setActivePage={setActivePage} />

      <main className="main-content">
        <DashboardHeader activePage={activePage} />
        {renderPage()}
      </main>
    </div>
  );
}

export default App;