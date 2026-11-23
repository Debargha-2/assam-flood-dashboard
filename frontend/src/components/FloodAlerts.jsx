
import { useState, useEffect } from "react";
import { Info } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function FloodAlerts() {
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const fetchDistricts = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_BASE_URL}/api/districts`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Unable to retrieve district registry.");
        }

        const data = await response.json();

        if (!Array.isArray(data.districts)) {
          throw new Error("Invalid district registry response.");
        }

        setDistricts(data.districts);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchDistricts();

    return () => controller.abort();
  }, []);

  return (
    <div className="alerts-card">
      <div className="alerts-heading">
        <div>
          <h3>Flood Alerts & Warnings</h3>
          <p>District-wise monitoring status across Assam</p>
        </div>

        <span className="alerts-count">
          {districts.length} Districts
        </span>
      </div>

      {loading && (
        <p className="weather-message">
          Loading district information...
        </p>
      )}

      {error && (
        <p className="weather-error">{error}</p>
      )}

      {!loading && !error && (
        <>
          <div className="alerts-list">
            {districts.map((district) => (
              <div
                className="alert-item"
                key={district.district_id}
              >
                <div className="alert-icon insufficient">
                  <Info size={21} />
                </div>

                <div className="alert-content">
                  <div className="alert-title">
                    <h4>{district.district_name}</h4>

                    <span className="alert-badge insufficient">
                      Insufficient Data
                    </span>
                  </div>

                  <p>
                    Verified district-level flood risk assessment
                    is not currently available in this section.
                  </p>

                  <div className="alert-action">
                    <strong>Monitoring Status:</strong>{" "}
                    Awaiting verified monitoring data.
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="alerts-disclaimer">
            No verified district-level flood alerts are currently
            integrated into this section. Insufficient Data does
            not indicate that a district is safe from flooding.
          </p>
        </>
      )}
    </div>
  );
}

export default FloodAlerts;
