"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import Timeline from "./Timeline";
import { advancePlayback, dayBounds, selectHistory } from "../utils/journey";
import { computeAchievements } from "../utils/achievements";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="map-loading">Preparing your atlas…</div> });

export default function JourneyExplorer({ journey, fileName, onReset }) {
  const [range, setRange] = useState(null);
  const [cursor, setCursor] = useState(journey.max ?? 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [skipGaps, setSkipGaps] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  const [focus, setFocus] = useState(null);
  const [mapStyle, setMapStyle] = useState("dark");
  const from = range ? Math.max(journey.min, dayBounds(range[0])[0]) : journey.min ?? 0;
  const to = range ? Math.min(journey.max, dayBounds(range[1])[1]) : journey.max ?? 0;
  const effectiveCursor = Math.min(to, Math.max(from, cursor));
  const deferredCursor = useDeferredValue(effectiveCursor);
  const revealedUntil = Math.min(to, Math.max(from, deferredCursor));
  const includeUndated = !range && revealedUntil >= to;
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
    setPlaying(false);
    setCursor(Math.min(to, Math.max(from, record.end)));
    if (record.geometry?.type === "Point") setFocus({ coordinate: record.geometry.coordinates, id: record.id });
    if (window.innerWidth < 768) setSidebarOpen(false);
  };
  const achievements = useMemo(() => computeAchievements(snapshot.stats, snapshot.geojson), [snapshot]);
  const onRange = useCallback((next) => {
    setPlaying(false); setRange(next);
    setCursor(next ? Math.min(journey.max, dayBounds(next[1])[1]) : journey.max ?? 0);
  }, [journey.max]);
  const onDay = useCallback((day) => {
    onRange([day, day]);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [onRange]);
  const onSeek = useCallback((time) => { setPlaying(false); setCursor(time); }, []);

  useEffect(() => {
    if (!playing) return;
    // Throttle expensive map updates; time remains proportional to elapsed time.
    // A full selected range takes 40 seconds at 1×, before optional gap skipping.
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const amount = Math.min(now - previous, 250) / 40000 * (to - from) * speed;
      previous = now;
      setCursor((current) => advancePlayback(current, amount, to, journey.intervals, skipGaps));
    }, 100);
    return () => clearInterval(timer);
  }, [playing, from, to, speed, skipGaps, journey.intervals]);

  // Stop the timer at the end without state updates during render or inside an updater.
  useEffect(() => {
    if (playing && cursor >= to) {
      const timer = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(timer);
    }
  }, [cursor, to, playing]);
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
        <MapView geojson={snapshot.geojson} extent={extent} focus={focus} latest={revealedUntil < to ? snapshot.latest : null}
          mapStyle={mapStyle} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((value) => !value)} />
        <div className="journey-map-caption"><span>{range ? `${range[0]} — ${range[1]}` : "Your whole world"}</span><strong>{snapshot.stats.totalPlacesVisited ? `${snapshot.stats.totalPlacesVisited} visit${snapshot.stats.totalPlacesVisited === 1 ? "" : "s"} revealed` : `${snapshot.stats.totalPoints.toLocaleString()} observation${snapshot.stats.totalPoints === 1 ? "" : "s"} revealed`}</strong></div>
        {!hasGeometry && <div className="map-empty-message"><strong>{snapshot.stats.visibleRecords ? "Travel recorded. Route unavailable." : "A quiet stretch of your timeline."}</strong><span>{snapshot.stats.visibleRecords ? "Your export includes activity details, but no coordinates for this moment." : "Move forward or choose another date to find your next footprint."}</span></div>}
      </div>
      <Timeline journey={journey} from={from} to={to} cursor={effectiveCursor} onSeek={onSeek}
        playing={playing} onPlay={() => { if (effectiveCursor >= to) setCursor(from); setPlaying((value) => !value); }}
        speed={speed} onSpeed={setSpeed} skipGaps={skipGaps} onSkipGaps={setSkipGaps} deferredRoutes={snapshot.deferredRoutes} />
    </div>
  </div>;
}
