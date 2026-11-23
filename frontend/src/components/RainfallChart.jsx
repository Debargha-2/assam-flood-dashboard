import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function RainfallChart({ weatherData }) {
  const hourly = weatherData?.weather?.hourly;
  const currentTime = weatherData?.weather?.current?.time;

  let rainfallData = [];

  if (hourly && currentTime) {
    let startIndex = hourly.time?.findIndex(
      (time) => time >= currentTime
    ) ?? -1;

    if (startIndex === -1) {
      startIndex = 0;
    }

    // Safely extract arrays, defaulting to empty arrays if the API omits them
    const times = hourly.time || [];
    const precip = hourly.precipitation || [];
    const prob = hourly.precipitation_probability || [];

    rainfallData = times
      .slice(startIndex, startIndex + 24)
      .map((time, index) => ({
        hour: new Date(time).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Kolkata",
        }),
        // Safely access indexes, defaulting to 0 if the data point is missing
        rainfall: precip[startIndex + index] ?? 0,
        probability: prob[startIndex + index] ?? 0,
      }));
  }

  return (
    <div className="chart-card">
      <div className="chart-heading">
        <h3>Rainfall Forecast</h3>
        <span>Next 24 Hours</span>
      </div>

      <p className="chart-subtitle">
        Hourly rainfall and precipitation probability – Open-Meteo
      </p>

      {rainfallData.length > 0 ? (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={rainfallData}
            margin={{
              top: 15,
              right: 15,
              left: 10,
              bottom: 5,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#263b54"
            />

            <XAxis
              dataKey="hour"
              stroke="#94a3b8"
              tick={{ fontSize: 11 }}
              interval={3}
            />

            <YAxis
              yAxisId="rainfall"
              stroke="#38bdf8"
              tick={{ fontSize: 11 }}
              unit=" mm"
              allowDecimals
            />

            <YAxis
              yAxisId="probability"
              orientation="right"
              stroke="#f59e0b"
              tick={{ fontSize: 11 }}
              domain={[0, 100]}
              unit="%"
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "#142238",
                border: "1px solid #263b54",
                borderRadius: "8px",
                color: "#ffffff",
              }}
              formatter={(value, name) => {
                if (name === "Rainfall") {
                  return [`${value} mm`, name];
                }
                return [`${value}%`, name];
              }}
              labelFormatter={(label) => `Time: ${label}`}
            />

            <Legend
              wrapperStyle={{
                paddingTop: "15px",
                color: "#cbd5e1",
              }}
            />

            <Line
              yAxisId="rainfall"
              type="monotone"
              dataKey="rainfall"
              name="Rainfall"
              stroke="#38bdf8"
              strokeWidth={3}
              dot={{ fill: "#38bdf8", r: 3 }}
              activeDot={{ r: 6 }}
            />

            <Line
              yAxisId="probability"
              type="monotone"
              dataKey="probability"
              name="Rain Probability"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="weather-message">
          Waiting for rainfall forecast data...
        </p>
      )}

      <p className="weather-source-note">
        Source: Open-Meteo | Rainfall: mm/hour | Probability: %
      </p>
    </div>
  );
}

export default RainfallChart;