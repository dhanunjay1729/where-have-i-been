"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import useMapFootprints from "../hooks/useMapFootprints";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

mapboxgl.accessToken =
  "REDACTED_MAPBOX_TOKEN";

const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

export default function MapView({ geojson, stats, currentTime }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // Initialize Mapbox GL map on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: DARK_STYLE,
      center: [0, 20],
      zoom: 1.8,
      attributionControl: true,
      antialias: true,
      fadeDuration: 0,
    });

    // Add navigation controls (zoom +/-)
    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "top-right"
    );

    map.on("style.load", () => {
      setMapReady(true);
      // Force a resize once the style loads to ensure it fills the container
      setTimeout(() => map.resize(), 100);
    });

    // ResizeObserver ensures map fills the container even if flex dimensions change
    const resizeObserver = new ResizeObserver(() => {
      if (map) map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);

    mapInstanceRef.current = map;

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Hook: inject GeoJSON layers when map is ready and data is present
  useMapFootprints(mapReady ? mapInstanceRef.current : null, geojson, currentTime);

  return (
    <div className="fade-scale-in flex-1 w-full h-full relative">
      {/* Map container */}
      <div ref={mapContainerRef} className="absolute inset-0 z-0 w-full h-full" />

      {/* Corner status indicator */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <div className="flex items-center gap-2 bg-surface/80 backdrop-blur-sm rounded px-3 py-1.5 border border-neon-cyan/10">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
          <span className="text-[9px] font-mono text-foreground/30 tracking-widest">
            LIVE RENDER
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 left-3 z-10 pointer-events-none">
        <div className="bg-surface/80 backdrop-blur-sm rounded-lg px-3 py-2.5 border border-neon-cyan/10">
          <div className="text-[9px] font-mono text-foreground/25 tracking-widest mb-2">
            LEGEND
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(0,100,255,0.6), rgba(0,255,100,0.8), rgba(255,0,120,1))",
                }}
              />
              <span className="text-[9px] font-mono text-foreground/40">
                HEATMAP
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  background: "#00fff5",
                  boxShadow: "0 0 6px #00fff5",
                }}
              />
              <span className="text-[9px] font-mono text-foreground/40">
                CLUSTERS
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  background: "#ff00ff",
                  boxShadow: "0 0 6px #ff00ff",
                }}
              />
              <span className="text-[9px] font-mono text-foreground/40">
                PLACES
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-neon-cyan rounded" />
              <span className="text-[9px] font-mono text-foreground/40">
                ROUTES
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
