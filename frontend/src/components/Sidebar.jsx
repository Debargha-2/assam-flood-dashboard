import {
  LayoutDashboard,
  Activity,
  Map,
  Waves,
  BrainCircuit,
  BarChart3,
  Settings,
  CloudRain,
  Compass,
} from "lucide-react";

const menuItems = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Cachar Basin AI", icon: Compass },
  { name: "Live Monitoring", icon: Activity },
  { name: "Flood Risk Map", icon: Map },
  { name: "Digital Twin", icon: Waves },
  { name: "AI Forecast", icon: BrainCircuit },
  { name: "Analytics", icon: BarChart3 },
  { name: "Settings", icon: Settings },
];

function Sidebar({ activePage, setActivePage }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <CloudRain size={30} />
        <div>
          <h2>ASSAM FLOOD</h2>
          <span>INTELLIGENCE SYSTEM</span>
        </div>
      </div>

      <p className="menu-heading">MAIN MENU</p>

      <nav>
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <div
              className={`menu-item ${
                activePage === item.name ? "active" : ""
              }`}
              key={item.name}
              onClick={() => setActivePage(item.name)}
            >
              <Icon size={19} />
              <span>{item.name}</span>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export default Sidebar;