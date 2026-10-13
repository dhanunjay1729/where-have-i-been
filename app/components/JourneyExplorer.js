"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import { dayBounds, selectHistory } from "../utils/journey";
import { computeAchievements } from "../utils/achievements";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="map-loading">Preparing your atlas…</div> });

export default function JourneyExplorer({ journey, fileName, onReset }) {
  const [range, setRange] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  const [focus, setFocus] = useState(null);
  const [mapStyle, setMapStyle] = useState("dark");
  const from = range ? Math.max(journey.min, dayBounds(range[0])[0]) : journey.min ?? 0;
  const to = range ? Math.min(journey.max, dayBounds(range[1])[1]) : journey.max ?? 0;
  const revealedUntil = to;
  const includeUndated = !range;
  const snapshot = useMemo(() => selectHistory(journey,
    journey.min == null ? -Infinity : from,
    journey.min == null ? Infinity : revealedUntil, includeUndated), [journey, from, revealedUntil, includeUndated]);
  const extent = useMemo(() => selectHistory(journey,
    journey.min == null ? -Infinity : from,
    journey.min == null ? Infinity : to, !range).geojson, [journey, from, to, range]);
  const days = useMemo(() => journey.days.filter((d) => !range || (d.date >= range[0] && d.date <= range[1])), [journey, range]);
  const dayEvents = useMemo(() => {
    if (!range || range[0] !== range[1]) return [];
    const records = journey.records.filter((r) => r.start != null && r.start <= to && r.end >= from);
    // Keep the diary understandable when Google supplies both a route and a
    // transport record for the same travel period.
    const activities = records.filter((r) => r.kind === "activity");
    return records.filter((r) => r.kind !== "route" || !activities.some((a) => a.start <= r.start && a.end >= r.end));
  }, [journey, range, from, to]);
  const onEvent = (record) => {
    if (record.geometry?.type === "Point") setFocus({ coordinate: record.geometry.coordinates, id: record.id });
    if (window.innerWidth < 768) setSidebarOpen(false);
  };
  const achievements = useMemo(() => computeAchievements(snapshot.stats, snapshot.geojson), [snapshot]);
  const onRange = useCallback((next) => {
    setRange(next);
  }, []);
  const onDay = useCallback((day) => {
    onRange([day, day]);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [onRange]);
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") setSidebarOpen((value) => !value);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const hasGeometry = snapshot.geojson.features.length > 0;
  return <div className="journey-explorer">
    {sidebarOpen && <button className="journey-mobile-backdrop" aria-label="Close journey details" onClick={() => setSidebarOpen(false)} />}
    <Sidebar journey={journey} stats={snapshot.stats} days={days} range={range} onRange={onRange} onDay={onDay}
      dayEvents={dayEvents} onEvent={onEvent} revealedUntil={revealedUntil} fileName={fileName} onReset={onReset} isOpen={sidebarOpen} onToggle={() => setSidebarOpen((value) => !value)}
      mapStyle={mapStyle} onMapStyleChange={setMapStyle} hiddenUndated={includeUndated ? 0 : journey.undated} achievements={achievements} />
    <div className="journey-stage">
      <div className="journey-map-area">
        <MapView geojson={snapshot.geojson} extent={extent} focus={focus}
          mapStyle={mapStyle} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((value) => !value)} />
        <div className="journey-map-caption"><span>{range ? `${range[0]} — ${range[1]}` : "Your whole world"}</span><strong>{snapshot.stats.totalPlacesVisited ? `${snapshot.stats.totalPlacesVisited} visit${snapshot.stats.totalPlacesVisited === 1 ? "" : "s"} revealed` : `${snapshot.stats.totalPoints.toLocaleString()} observation${snapshot.stats.totalPoints === 1 ? "" : "s"} revealed`}</strong></div>
        {!hasGeometry && <div className="map-empty-message"><strong>{snapshot.stats.visibleRecords ? "Travel recorded. Route unavailable." : "A quiet stretch of your timeline."}</strong><span>{snapshot.stats.visibleRecords ? "Your export includes activity details, but no coordinates for this moment." : "Choose another date to find your next footprint."}</span></div>}
      </div>

    </div>
  </div>;
}
