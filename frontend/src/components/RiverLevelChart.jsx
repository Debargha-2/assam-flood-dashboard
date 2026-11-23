
import { useState, useEffect } from "react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import axios from "axios";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
function RiverLevelChart() {
  const [riverData, setRiverData] = useState([]);
  const [station, setStation] = useState("");
  const [latestLevel, setLatestLevel] = useState(null);
  const [latestTime, setLatestTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    const fetchRiverLevels = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await axios.get(
          API_BASE_URL + "/api/river/levels",
          {
            params: { hours: 24 },
          }
        );

        const data = response.data;

        if (!isActive) return;

        setStation(data.station);
        setLatestLevel(data.latest_observation.water_level);
        setLatestTime(data.latest_observation.timestamp);

        const formattedData = data.history.map((record) => ({
          time: new Date(
            `${record.timestamp}+05:30`
          ).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Kolkata",
          }),
          level: record.water_level,
          timestamp: record.timestamp,
        }));

        setRiverData(formattedData);
      } catch (err) {
        if (isActive) {
          setError(
            err.response?.data?.detail ||
              "Unable to retrieve river-level data."
          );
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchRiverLevels();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="chart-card">
      <div className="chart-heading">
        <h3>River Water-Level Monitoring</h3>
        <span>Last 24 Hours</span>
      </div>

      <p className="chart-subtitle">
        Historical water-level observations (m) – Assam Telemetry
      </p>

      {loading && (
        <p className="weather-message">
          Fetching river-level observations...
        </p>
      )}

      {error && (
        <p className="weather-error">{error}</p>
      )}

      {!loading && !error && (
        <>
          <div className="river-latest-info">
            <div>
              <span>Latest Recorded Water Level</span>
              <strong>{latestLevel} m</strong>
            </div>

            <div>
              <span>Monitoring Station</span>
              <strong>{station}</strong>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={riverData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#263b54"
              />

              <XAxis
                dataKey="time"
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                interval={3}
              />

              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
                domain={["dataMin - 0.02", "dataMax + 0.02"]}
                unit=" m"
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: "#142238",
                  border: "1px solid #263b54",
                  borderRadius: "8px",
                  color: "#ffffff",
                }}
                formatter={(value) => [
                  `${value} m`,
                  "Water Level",
                ]}
                labelFormatter={(label) => `Time: ${label}`}
              />

              <Line
                type="monotone"
                dataKey="level"
                name="River Water Level"
                stroke="#2dd4bf"
                strokeWidth={3}
                dot={{ fill: "#2dd4bf", r: 3 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>

          <p className="weather-source-note">
            Source: Assam River Water Level Telemetry Dataset
            {" | "}Latest observation: {latestTime}
            {" | "}Historical data, not live readings
          </p>
        </>
      )}
    </div>
  );
}

export default RiverLevelChart;
