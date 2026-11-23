
import {
  CloudRain,
  Waves,
  AlertTriangle,
  MapPin,
  TrendingUp,
} from "lucide-react";

const iconMap = {
  rainfall: CloudRain,
  river: Waves,
  risk: AlertTriangle,
  districts: MapPin,
};

function StatCard({ title, value, unit, type, change, status }) {
  const Icon = iconMap[type];

  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <div className={`stat-icon ${type}`}>
          <Icon size={22} />
        </div>

        <span className="stat-status">{status}</span>
      </div>

      <div className="stat-value">
        {value}
        <span>{unit}</span>
      </div>

      <p className="stat-title">{title}</p>

      <div className="stat-footer">
        <TrendingUp size={14} />
        <span>{change}</span>
      </div>
    </div>
  );
}

export default StatCard;
