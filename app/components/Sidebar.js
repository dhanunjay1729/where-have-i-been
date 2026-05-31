"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { RARITY_COLORS } from "../utils/achievements";

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatDistance(km) {
  if (km == null || isNaN(km)) return "—";
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km > 10000) return `${(km / 1000).toFixed(1)}k km`;
  if (km > 1000) return `${km.toFixed(0)} km`;
  return `${km.toFixed(1)} km`;
}

function formatDuration(ms) {
  if (!ms) return "—";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatDate(date) {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatNumber(n) {
  if (n == null) return "—";
  return n.toLocaleString();
}

// ─── Animated Counter ───────────────────────────────────────────────────────

function AnimatedNumber({ value, duration = 1200 }) {
  const ref = useRef(null);
  const numValue = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  const prevValue = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const target = isNaN(numValue) ? 0 : numValue;
    if (target === 0) {
      el.textContent = "0";
      prevValue.current = 0;
      return;
    }

    const start = performance.now();
    let animId;
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(target * eased);
      el.textContent = current.toLocaleString();
      if (progress < 1) {
        animId = requestAnimationFrame(tick);
      } else {
        prevValue.current = target;
      }
    };
    animId = requestAnimationFrame(tick);

    return () => { if (animId) cancelAnimationFrame(animId); };
  }, [numValue, duration]);

  return <span ref={ref}>0</span>;
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color = "cyan", delay = 0, isNumeric = false }) {
  const colorMap = {
    cyan: { border: "border-neon-cyan/15", text: "text-neon-cyan", glow: "rgba(0,255,245,0.06)" },
    magenta: { border: "border-neon-magenta/15", text: "text-neon-magenta", glow: "rgba(255,0,255,0.06)" },
    purple: { border: "border-neon-purple/15", text: "text-neon-purple", glow: "rgba(179,71,255,0.06)" },
    blue: { border: "border-neon-blue/15", text: "text-neon-blue", glow: "rgba(77,127,255,0.06)" },
    pink: { border: "border-neon-pink/15", text: "text-neon-pink", glow: "rgba(255,61,138,0.06)" },
    yellow: { border: "border-neon-yellow/15", text: "text-neon-yellow", glow: "rgba(255,225,77,0.06)" },
    green: { border: "border-neon-green/15", text: "text-neon-green", glow: "rgba(0,255,136,0.06)" },
  };

  const c = colorMap[color] || colorMap.cyan;

  return (
    <div
      className={`stat-card glass-card ${c.border} p-3 transition-all duration-300 hover:bg-surface-hover/60 group/stat fade-in-up`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base group-hover/stat:scale-110 transition-transform">{icon}</span>
        <span className="text-[9px] uppercase tracking-[0.15em] text-foreground/25 font-mono">
          {label}
        </span>
      </div>
      <div className={`text-lg font-bold font-mono ${c.text}`}>
        {isNumeric ? <AnimatedNumber value={value} /> : value}
      </div>
    </div>
  );
}

// ─── Section Header ─────────────────────────────────────────────────────────

function SectionHeader({ title, icon, defaultOpen = true, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen((p) => !p)}
        className="w-full flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-foreground/25 font-mono mb-2 hover:text-foreground/40 transition-colors cursor-pointer group/section"
      >
        <span className="flex items-center gap-2">
          {icon && <span className="text-xs">{icon}</span>}
          {title}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform duration-300 ${isOpen ? "rotate-0" : "-rotate-90"}`}
        >
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>
      <div className={`overflow-hidden transition-all duration-400 ${isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Travel Mode Chart ──────────────────────────────────────────────────────

const MODE_LABELS = {
  IN_PASSENGER_VEHICLE: { label: "Driving", icon: "🚗" },
  IN_VEHICLE: { label: "Driving", icon: "🚗" },
  DRIVING: { label: "Driving", icon: "🚗" },
  WALKING: { label: "Walking", icon: "🚶" },
  ON_FOOT: { label: "On Foot", icon: "🚶" },
  CYCLING: { label: "Cycling", icon: "🚲" },
  IN_BUS: { label: "Bus", icon: "🚌" },
  IN_TRAIN: { label: "Train", icon: "🚆" },
  IN_SUBWAY: { label: "Subway", icon: "🚇" },
  IN_TRAM: { label: "Tram", icon: "🚊" },
  FLYING: { label: "Flying", icon: "✈️" },
  IN_FERRY: { label: "Ferry", icon: "⛴️" },
  RUNNING: { label: "Running", icon: "🏃" },
  MOTORCYCLING: { label: "Motorcycle", icon: "🏍️" },
  BOATING: { label: "Boating", icon: "🚤" },
  SKIING: { label: "Skiing", icon: "⛷️" },
  STILL: { label: "Stationary", icon: "🧍" },
  UNKNOWN_ACTIVITY_TYPE: { label: "Unknown", icon: "❓" },
  TIMELINE_PATH: { label: "Tracked", icon: "📍" },
};

const BAR_COLORS = [
  "from-neon-cyan to-neon-blue",
  "from-neon-magenta to-neon-purple",
  "from-neon-pink to-neon-yellow",
  "from-neon-green to-neon-cyan",
  "from-neon-blue to-neon-magenta",
  "from-neon-purple to-neon-pink",
];

function TravelModeChart({ modes }) {
  if (!modes || modes.length === 0) return null;
  const maxCount = Math.max(...modes.map((m) => m.count));

  return (
    <div className="flex flex-col gap-2">
      {modes.slice(0, 6).map((mode, i) => {
        const info = MODE_LABELS[mode.mode] || { label: mode.mode, icon: "📍" };
        const pct = (mode.count / maxCount) * 100;

        return (
          <div key={mode.mode} className="flex items-center gap-2">
            <span className="text-xs w-5 text-center">{info.icon}</span>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[10px] font-mono text-foreground/40">{info.label}</span>
                <span className="text-[10px] font-mono text-foreground/25">{mode.count}×</span>
              </div>
              <div className="h-1.5 bg-surface-light/60 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${BAR_COLORS[i % BAR_COLORS.length]} rounded-full bar-grow`}
                  style={{
                    width: `${pct}%`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Map Style Switcher ─────────────────────────────────────────────────────

const MAP_STYLES = [
  { id: "dark", label: "Dark", icon: "🌑" },
  { id: "satellite", label: "Satellite", icon: "🛰️" },
  { id: "streets", label: "Streets", icon: "🗺️" },
  { id: "terrain", label: "Terrain", icon: "⛰️" },
];

function MapStyleSwitcher({ current, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {MAP_STYLES.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[9px] font-mono transition-all duration-200 cursor-pointer
            ${current === s.id
              ? "bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan"
              : "bg-surface/40 border border-transparent text-foreground/25 hover:bg-surface-light/60 hover:text-foreground/40"
            }`}
        >
          <span className="text-sm">{s.icon}</span>
          <span className="tracking-wider">{s.label.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Main Sidebar Component ─────────────────────────────────────────────────

export default function Sidebar({
  stats,
  fileName,
  onReset,
  achievements = [],
  isOpen = true,
  onToggle,
  mapStyle = "dark",
  onMapStyleChange,
}) {
  // Detect if this is a Semantic/Timeline stats shape or generic
  const isSemanticStats = stats?.totalPlacesVisited !== undefined;

  const statCards = useMemo(() => {
    if (!stats) return [];
    const cards = [];

    if (isSemanticStats) {
      cards.push({
        label: "Distance",
        value: formatDistance(stats.totalDistanceTraveledKm || 0),
        icon: "📏",
        color: "cyan",
      });
      cards.push({
        label: "Places Visited",
        value: stats.totalPlacesVisited,
        icon: "📍",
        color: "magenta",
        isNumeric: true,
      });
      cards.push({
        label: "Features",
        value: stats.totalFeatures,
        icon: "🗺️",
        color: "purple",
        isNumeric: true,
      });
      if (stats.totalActivitySegments > 0) {
        cards.push({
          label: "Trips",
          value: stats.totalActivitySegments,
          icon: "🚀",
          color: "blue",
          isNumeric: true,
        });
      }
      if (stats.uniqueCitiesCount > 0) {
        cards.push({
          label: "Unique Places",
          value: stats.uniqueCitiesCount,
          icon: "🌍",
          color: "yellow",
          isNumeric: true,
        });
      }
    } else {
      cards.push({
        label: "Distance",
        value: formatDistance(stats.totalDistance),
        icon: "📏",
        color: "cyan",
      });
      cards.push({
        label: "Data Points",
        value: stats.totalPoints,
        icon: "📍",
        color: "magenta",
        isNumeric: true,
      });
      cards.push({
        label: "Features",
        value: stats.totalFeatures,
        icon: "🗺️",
        color: "purple",
        isNumeric: true,
      });
      if (stats.duration) {
        cards.push({
          label: "Duration",
          value: formatDuration(stats.duration),
          icon: "⏱️",
          color: "blue",
        });
      }
      if (stats.avgSpeed) {
        cards.push({
          label: "Avg Speed",
          value: `${stats.avgSpeed.toFixed(1)} km/h`,
          icon: "⚡",
          color: "yellow",
        });
      }
      if (stats.maxElevation != null) {
        cards.push({
          label: "Max Elevation",
          value: `${stats.maxElevation.toFixed(0)} m`,
          icon: "⛰️",
          color: "pink",
        });
      }
      if (stats.minElevation != null) {
        cards.push({
          label: "Min Elevation",
          value: `${stats.minElevation.toFixed(0)} m`,
          icon: "🏔️",
          color: "blue",
        });
      }
      if (stats.totalElevationGain) {
        cards.push({
          label: "Elevation Gain",
          value: `${stats.totalElevationGain.toFixed(0)} m`,
          icon: "📈",
          color: "green",
        });
      }
    }

    return cards;
  }, [stats, isSemanticStats]);

  return (
    <aside
      id="sidebar"
      className={`
        ${isOpen ? "w-80 md:w-[340px]" : "w-0"}
        h-full bg-glass-bg backdrop-blur-xl
        border-r border-glass-border
        flex flex-col overflow-hidden z-20
        transition-all duration-400
        slide-in-left
        mobile-sidebar md:relative ${isOpen ? "open" : ""}
      `}
    >
      {/* Header */}
      <div className="p-5 border-b border-glass-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold font-mono tracking-wider neon-text">
            TRAVEL DATA
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onToggle}
              className="text-xs font-mono p-1.5 rounded border border-neon-cyan/15 text-neon-cyan/50 hover:bg-neon-cyan/10 hover:text-neon-cyan transition-all duration-300 cursor-pointer md:hidden"
              title="Close sidebar"
            >
              ✕
            </button>
            <button
              onClick={onReset}
              className="text-[10px] font-mono px-3 py-1.5 rounded-lg border border-neon-magenta/15 text-neon-magenta/70 hover:bg-neon-magenta/10 hover:border-neon-magenta/30 hover:text-neon-magenta transition-all duration-300 cursor-pointer tracking-wider"
              title="Load a new file"
              id="reset-button"
            >
              ↻ NEW FILE
            </button>
          </div>
        </div>

        {/* File name badge */}
        <div className="flex items-center gap-2 bg-surface/40 rounded-lg px-3 py-2 border border-glass-border">
          <div className="w-2 h-2 rounded-full bg-neon-green shrink-0 animate-pulse" />
          <span className="text-xs font-mono text-foreground/40 truncate">
            {fileName}
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Stats grid */}
        <SectionHeader title="Statistics" icon="📊" defaultOpen={true}>
          <div className="grid grid-cols-2 gap-2">
            {statCards.map((card, i) => (
              <StatCard key={card.label} {...card} delay={i * 0.08} />
            ))}
          </div>
        </SectionHeader>

        {/* Travel Mode Breakdown */}
        {stats?.topTravelModes?.length > 0 && (
          <SectionHeader title="Travel Modes" icon="🚀" defaultOpen={true}>
            <div className="glass-card p-3 border border-glass-border">
              <TravelModeChart modes={stats.topTravelModes} />
            </div>
          </SectionHeader>
        )}

        {/* Achievements */}
        {achievements.length > 0 && (
          <SectionHeader title={`Achievements (${achievements.length})`} icon="🏆" defaultOpen={true}>
            <div className="flex flex-col gap-2">
              {achievements.map((ach, i) => {
                const colors = RARITY_COLORS[ach.rarity] || RARITY_COLORS.common;
                return (
                  <div
                    key={ach.id}
                    className={`glass-card ${colors.border} ${colors.bg} p-2.5 badge-pop flex items-start gap-2.5`}
                    style={{ animationDelay: `${i * 0.12}s` }}
                  >
                    <span className="text-xl mt-0.5">{ach.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-bold ${colors.text}`}>
                          {ach.title}
                        </span>
                        <span className={`text-[8px] font-mono uppercase tracking-widest ${colors.text} opacity-60`}>
                          {ach.rarity}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-foreground/30 leading-tight">
                        {ach.description}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionHeader>
        )}

        {/* Time range section */}
        {stats?.startTime && (
          <SectionHeader title="Time Range" icon="📅" defaultOpen={true}>
            <div className="glass-card p-3 border border-glass-border">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-foreground/30">
                    START
                  </span>
                  <span className="text-xs font-mono text-neon-cyan">
                    {formatDate(stats.startTime)}
                  </span>
                </div>
                <div className="w-full h-px bg-gradient-to-r from-neon-cyan/20 via-neon-magenta/20 to-neon-purple/20" />
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-foreground/30">
                    END
                  </span>
                  <span className="text-xs font-mono text-neon-magenta">
                    {formatDate(stats.endTime)}
                  </span>
                </div>
              </div>
            </div>
          </SectionHeader>
        )}

        {/* Bounding box */}
        {stats?.bounds && (
          <SectionHeader title="Bounding Box" icon="📐" defaultOpen={false}>
            <div className="glass-card p-3 border border-glass-border">
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="text-foreground/25">
                  N <span className="text-neon-purple">{stats.bounds[1][0].toFixed(4)}°</span>
                </div>
                <div className="text-foreground/25 text-right">
                  E <span className="text-neon-purple">{stats.bounds[1][1].toFixed(4)}°</span>
                </div>
                <div className="text-foreground/25">
                  S <span className="text-neon-purple">{stats.bounds[0][0].toFixed(4)}°</span>
                </div>
                <div className="text-foreground/25 text-right">
                  W <span className="text-neon-purple">{stats.bounds[0][1].toFixed(4)}°</span>
                </div>
              </div>
            </div>
          </SectionHeader>
        )}

        {/* Map Style */}
        <SectionHeader title="Map Style" icon="🎨" defaultOpen={false}>
          <MapStyleSwitcher current={mapStyle} onChange={onMapStyleChange} />
        </SectionHeader>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-glass-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="text-[8px] font-mono text-foreground/15 tracking-widest">
            WHERE HAVE I BEEN v2.0
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
            <span className="text-[8px] font-mono text-foreground/15 tracking-wider">
              LOCAL
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
