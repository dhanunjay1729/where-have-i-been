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
      setTimeout(() => map.resize(), 100);

      // Inject data synchronously on style.load to avoid React lifecycle race conditions
      if (!geojson || !geojson.features) return;

      const points = {
        type: "FeatureCollection",
        features: geojson.features.filter(f => f.geometry.type === "Point")
      };
      
      const lines = {
        type: "FeatureCollection",
        features: geojson.features.filter(f => f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")
      };

      // ── Add sources ──────────────────────────────────────────────
      if (points.features.length > 0) {
        map.addSource("footprints", {
          type: "geojson",
          data: points,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });
      }

      if (lines.features.length > 0) {
        map.addSource("routes", {
          type: "geojson",
          data: lines,
        });
      }

      // ── Add layers ───────────────────────────────────────────────
      // Heatmap
      if (points.features.length > 0) {
        map.addLayer({
          id: "heatmap",
          type: "heatmap",
          source: "footprints",
          filter: ["!", ["has", "point_count"]],
          maxzoom: 15,
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["zoom"], 0, 1, 15, 3],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 15, 3],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(0, 0, 0, 0)",
              0.1, "rgba(30, 0, 120, 0.4)",
              0.25, "rgba(0, 100, 255, 0.6)",
              0.4, "rgba(0, 255, 245, 0.7)",
              0.6, "rgba(0, 255, 100, 0.8)",
              0.8, "rgba(180, 0, 255, 0.9)",
              1.0, "rgba(255, 0, 120, 1)",
            ],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 8, 6, 20, 12, 35, 15, 50],
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.9, 15, 0.3],
          },
        });

        // Clusters
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "footprints",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step", ["get", "point_count"],
              "#00fff5", 20,
              "#00aaff", 100,
              "#ff00ff"
            ],
            "circle-radius": [
              "step", ["get", "point_count"],
              12, 20,
              18, 100,
              25
            ],
            "circle-opacity": 0.8,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff"
          }
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "footprints",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 10
          },
          paint: { "text-color": "#000000" }
        });

        // Unclustered point
        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "footprints",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 6,
            "circle-color": "#ff00ff",
          },
        });
      }

      // Route lines
      if (lines.features.length > 0) {
        map.addLayer({
          id: "routes-glow",
          type: "line",
          source: "routes",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#00fff5",
            "line-width": ["interpolate", ["linear"], ["zoom"], 1, 4, 6, 8, 12, 12],
            "line-blur": 4,
            "line-opacity": 0.6,
          },
        });

        map.addLayer({
          id: "routes",
          type: "line",
          source: "routes",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 1, 2, 6, 3, 12, 5],
            "line-opacity": 1,
          },
        });
      }

      // ── Fly to data bounds ───────────────────────────────────────
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      const process = ([lng, lat]) => {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      };
      
      for (const f of geojson.features) {
        const g = f.geometry;
        if (!g) continue;
        if (g.type === "Point") process(g.coordinates);
        else if (g.type === "LineString") g.coordinates.forEach(process);
        else if (g.type === "MultiLineString" || g.type === "Polygon")
          g.coordinates.forEach((r) => r.forEach(process));
      }

      if (minLng !== Infinity) {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 2000, essential: true });
      }
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
  }, []); // Run ONCE on mount

  return (
    <div className="flex-1 w-full h-full relative fade-scale-in">
      <div ref={mapContainerRef} className="w-full h-full" />

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
