"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import DropZone from "./components/DropZone";
import Sidebar from "./components/Sidebar";
import ErrorBoundary from "./components/ErrorBoundary";
import { parseFile } from "./utils/fileParser";
import { computeAchievements } from "./utils/achievements";

// Dynamically import MapView to avoid SSR issues with Mapbox GL
const MapView = dynamic(() => import("./components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-neon-cyan/20" />
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-neon-cyan ring-spin"
            style={{ animationDuration: "1s" }}
          />
        </div>
        <span className="text-xs font-mono text-neon-cyan tracking-wider neon-pulse">
          INITIALIZING MAP ENGINE...
        </span>
      </div>
    </div>
  ),
});

export default function Home() {
  const [appState, setAppState] = useState("upload"); // "upload" | "transitioning" | "map"
  const [geojson, setGeojson] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mapStyle, setMapStyle] = useState("dark");

  const handleFileLoaded = useCallback((name, content) => {
    try {
      const { geojson: parsedGeojson, stats: parsedStats } = parseFile(name, content);

      if (!parsedGeojson.features || parsedGeojson.features.length === 0) {
        setError("No geographic features found in this file.");
        return;
      }

      setGeojson(parsedGeojson);
      setStats(parsedStats);
      setFileName(name);
      setAppState("transitioning");

      // Compute achievements based on stats
      if (parsedStats) {
        const earned = computeAchievements(parsedStats, parsedGeojson);
        setAchievements(earned);
      }

      // Transition delay for smooth animation
      setTimeout(() => {
        setAppState("map");
      }, 300);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleReset = useCallback(() => {
    setAppState("upload");
    setGeojson(null);
    setStats(null);
    setFileName("");
    setError(null);
    setAchievements([]);
    setSidebarOpen(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (appState !== "map") return;
      if (e.key === "Escape") {
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [appState]);

  return (
    <ErrorBoundary onReset={handleReset}>
      <main id="app-root" className="h-screen w-screen flex overflow-hidden relative">
        {appState === "upload" && (
          <div className="flex-1 flex flex-col">
            <DropZone onFileLoaded={handleFileLoaded} />

            {error && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 fade-in-up">
                <div className="glass-card px-6 py-3 text-sm text-red-300 font-mono flex items-center gap-3 border-red-500/20">
                  <span className="text-red-400">⚠</span>
                  <span>{error}</span>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-400 hover:text-red-200 transition-colors ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {(appState === "transitioning" || appState === "map") && (
          <>
            {/* Mobile overlay */}
            <div
              className={`mobile-overlay md:hidden ${sidebarOpen ? "open" : ""}`}
              onClick={() => setSidebarOpen(false)}
            />

            <Sidebar
              stats={stats}
              geojson={geojson}
              fileName={fileName}
              onReset={handleReset}
              achievements={achievements}
              isOpen={sidebarOpen}
              onToggle={() => setSidebarOpen((prev) => !prev)}
              mapStyle={mapStyle}
              onMapStyleChange={setMapStyle}
            />

            <MapView
              geojson={geojson}
              stats={stats}
              mapStyle={mapStyle}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            />
          </>
        )}
      </main>
    </ErrorBoundary>
  );
}
