"use client";

import { useMemo } from "react";

function formatDistance(km) {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km > 1000) return `${(km / 1000).toFixed(1)}k km`;
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

function StatCard({ label, value, icon, color = "cyan", delay = 0 }) {
  const colorClasses = {
    cyan: "border-neon-cyan/20 text-neon-cyan",
    magenta: "border-neon-magenta/20 text-neon-magenta",
    purple: "border-neon-purple/20 text-neon-purple",
    blue: "border-neon-blue/20 text-neon-blue",
    pink: "border-neon-pink/20 text-neon-pink",
    yellow: "border-neon-yellow/20 text-neon-yellow",
  };

  return (
    <div
      className={`stat-card bg-surface/80 backdrop-blur-sm border ${colorClasses[color]} rounded-lg p-3 transition-all hover:bg-surface-light/80`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono">
          {label}
        </span>
      </div>
      <div className={`text-lg font-bold font-mono ${colorClasses[color]}`}>
        {value}
      </div>
    </div>
  );
}

export default function Sidebar({ stats, fileName, onReset }) {
  const statCards = useMemo(() => {
    if (!stats) return [];

    const cards = [
      {
        label: "Distance",
        value: formatDistance(stats.totalDistance),
        icon: "📏",
        color: "cyan",
      },
      {
        label: "Data Points",
        value: stats.totalPoints.toLocaleString(),
        icon: "📍",
        color: "magenta",
      },
      {
        label: "Features",
        value: stats.totalFeatures.toLocaleString(),
        icon: "🗺️",
        color: "purple",
      },
    ];

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

    if (stats.maxElevation !== null) {
      cards.push({
        label: "Max Elevation",
        value: `${stats.maxElevation.toFixed(0)} m`,
        icon: "⛰️",
        color: "pink",
      });
    }

    if (stats.minElevation !== null) {
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
        color: "cyan",
      });
    }

    return cards;
  }, [stats]);

  return (
    <aside className="slide-in-left w-80 h-full bg-surface/90 backdrop-blur-md border-r border-neon-cyan/10 flex flex-col overflow-hidden z-20">
      {/* Header */}
      <div className="p-5 border-b border-neon-cyan/10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold font-mono tracking-wider neon-text">
            TRAVEL DATA
          </h2>
          <button
            onClick={onReset}
            className="text-xs font-mono px-3 py-1.5 rounded border border-neon-magenta/20 text-neon-magenta hover:bg-neon-magenta/10 transition-all duration-300 hover:border-neon-magenta/40 cursor-pointer"
            title="Load a new file"
          >
            ✕ RESET
          </button>
        </div>

        {/* File name badge */}
        <div className="flex items-center gap-2 bg-surface-light/60 rounded-lg px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
          <span className="text-xs font-mono text-foreground/50 truncate">
            {fileName}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-3">
          {statCards.map((card, i) => (
            <StatCard key={card.label} {...card} delay={i * 0.1} />
          ))}
        </div>

        {/* Time range section */}
        {stats?.startTime && (
          <div className="mt-5 p-3 bg-surface/60 rounded-lg border border-neon-blue/10">
            <h3 className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono mb-3">
              Time Range
            </h3>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-foreground/40">
                  START
                </span>
                <span className="text-xs font-mono text-neon-cyan">
                  {formatDate(stats.startTime)}
                </span>
              </div>
              <div className="w-full h-px bg-gradient-to-r from-neon-cyan/20 via-neon-magenta/20 to-neon-purple/20" />
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-foreground/40">
                  END
                </span>
                <span className="text-xs font-mono text-neon-magenta">
                  {formatDate(stats.endTime)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bounding box visualization */}
        {stats?.bounds && (
          <div className="mt-5 p-3 bg-surface/60 rounded-lg border border-neon-purple/10">
            <h3 className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono mb-3">
              Bounding Box
            </h3>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="text-foreground/30">
                N{" "}
                <span className="text-neon-purple">
                  {stats.bounds[1][0].toFixed(4)}°
                </span>
              </div>
              <div className="text-foreground/30 text-right">
                E{" "}
                <span className="text-neon-purple">
                  {stats.bounds[1][1].toFixed(4)}°
                </span>
              </div>
              <div className="text-foreground/30">
                S{" "}
                <span className="text-neon-purple">
                  {stats.bounds[0][0].toFixed(4)}°
                </span>
              </div>
              <div className="text-foreground/30 text-right">
                W{" "}
                <span className="text-neon-purple">
                  {stats.bounds[0][1].toFixed(4)}°
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-neon-cyan/10">
        <div className="text-[9px] font-mono text-foreground/20 text-center tracking-widest">
          WHERE HAVE I BEEN v1.0
          <br />
          <span className="neon-pulse inline-block mt-1">
            ◈ SYSTEM ACTIVE ◈
          </span>
        </div>
      </div>
    </aside>
  );
}
