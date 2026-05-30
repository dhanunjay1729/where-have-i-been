"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import DropZone from "./components/DropZone";
import Sidebar from "./components/Sidebar";
import { parseFile } from "./utils/fileParser";

// Dynamically import MapView to avoid SSR issues with Leaflet
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

      // Transition delay
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
  }, []);

  return (
    <main className="h-screen w-screen flex overflow-hidden relative">
      {appState === "upload" && (
        <div className="flex-1 flex flex-col">
          <DropZone onFileLoaded={handleFileLoaded} />

          {error && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
              <div className="bg-red-900/40 border border-red-500/30 rounded-lg px-6 py-3 text-sm text-red-300 font-mono flex items-center gap-3 backdrop-blur-sm">
                <span>⚠</span>
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
          <Sidebar stats={stats} fileName={fileName} onReset={handleReset} />
          <MapView geojson={geojson} stats={stats} />
        </>
      )}
    </main>
  );
}
