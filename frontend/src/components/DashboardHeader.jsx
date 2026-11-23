
import { useState } from "react";

import {
  Bell,
  CircleUserRound,
  Activity,
  X,
  CheckCheck,
} from "lucide-react";

const pageDetails = {
  Overview: {
    title: "Flood Monitoring Dashboard",
    subtitle: "Overview of flood conditions across Assam",
  },

  "Live Monitoring": {
    title: "Live Monitoring Centre",
    subtitle: "Monitor river levels, rainfall and monitoring stations",
  },

  "Flood Risk Map": {
    title: "Assam Flood Risk Map",
    subtitle: "Explore district-wise monitoring locations and station data",
  },

  "Digital Twin": {
    title: "Digital Twin Simulation",
    subtitle: "Explore simulated river and flood scenarios",
  },

  "AI Forecast": {
    title: "Weather & Rainfall Forecast Centre",
    subtitle:
      "Weather-model forecasts and rainfall analysis across supported Assam locations",
  },

  Analytics: {
    title: "Flood Data Analytics",
    subtitle: "Analyse rainfall trends and historical river-level observations",
  },

  Settings: {
    title: "System Settings",
    subtitle: "Manage dashboard preferences and system information",
  },
};

const sampleNotifications = [
  {
    id: 1,
    district: "Dhemaji",
    message: "Elevated flood risk detected.",
    time: "10 minutes ago",
    level: "High",
  },
  {
    id: 2,
    district: "Tinsukia",
    message: "River level approaching warning threshold.",
    time: "25 minutes ago",
    level: "High",
  },
  {
    id: 3,
    district: "Dibrugarh",
    message: "Moderate rainfall recorded.",
    time: "1 hour ago",
    level: "Moderate",
  },
];

function DashboardHeader({ activePage = "Overview" }) {
  const currentPage =
    pageDetails[activePage] || pageDetails.Overview;

  const [showNotifications, setShowNotifications] = useState(false);
  const [readNotifications, setReadNotifications] = useState([]);

  const unreadCount = sampleNotifications.filter(
    (notification) =>
      !readNotifications.includes(notification.id)
  ).length;

  const markAllRead = () => {
    setReadNotifications(
      sampleNotifications.map((notification) => notification.id)
    );
  };

  return (
    <header className="dashboard-header">

      {/* PAGE TITLE */}

      <div className="header-title">
        <h1>{currentPage.title}</h1>
        <p>{currentPage.subtitle}</p>
      </div>

      {/* HEADER ACTIONS */}

      <div className="header-actions">

        <div className="live-status">
          <span className="live-dot"></span>
          <Activity size={16} />
          <span>Monitoring Active</span>
        </div>

        {/* NOTIFICATIONS */}

        <div className="notification-wrapper">

          <button
            className="notification-button"
            aria-label="Notifications"
            title="Notifications"
            onClick={() =>
              setShowNotifications(!showNotifications)
            }
          >
            <Bell size={20} />

            {unreadCount > 0 && (
              <span className="notification-count">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="notification-dropdown">

              <div className="notification-header">
                <div>
                  <h3>Notifications</h3>
                  <span>{unreadCount} unread alerts</span>
                </div>

                <button
                  className="notification-close"
                  onClick={() => setShowNotifications(false)}
                  aria-label="Close notifications"
                >
                  <X size={18} />
                </button>
              </div>

              <button
                className="mark-read-button"
                onClick={markAllRead}
              >
                <CheckCheck size={15} />
                Mark all as read
              </button>

              <div className="notification-list">

                {sampleNotifications.map((notification) => (
                  <div
                    className={`notification-item ${
                      readNotifications.includes(notification.id)
                        ? "read"
                        : ""
                    }`}
                    key={notification.id}
                  >
                    <span
                      className={`notification-dot ${notification.level.toLowerCase()}`}
                    ></span>

                    <div>
                      <strong>{notification.district}</strong>

                      <p>{notification.message}</p>

                      <span>{notification.time}</span>
                    </div>
                  </div>
                ))}

              </div>

              <div className="notification-footer">
                Illustrative notifications — not official flood warnings.
              </div>

            </div>
          )}

        </div>

        {/* ADMINISTRATOR PROFILE */}

        <div className="user-profile">
          <CircleUserRound size={30} />

          <div>
            <strong>Administrator</strong>
            <span>Control Centre</span>
          </div>
        </div>

      </div>
    </header>
  );
}

export default DashboardHeader;
