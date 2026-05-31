"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — Use environment variable only, no hardcoded keys
// ─────────────────────────────────────────────────────────────────────────────

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

const MAP_STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  streets: "mapbox://styles/mapbox/navigation-night-v1",
  terrain: "mapbox://styles/mapbox/outdoors-v12",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function deepCloneGeoJSON(data) {
  // Deep clone to prevent Mapbox Web Worker mutations
  return JSON.parse(JSON.stringify(data));
}

function splitGeoJSON(geojson) {
  if (!geojson?.features) return { points: null, lines: null };
  const pointFeatures = [];
  const lineFeatures = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;

    // Sanitize properties: remove null/undefined values that crash Mapbox workers
    const cleanProps = {};
    if (feature.properties) {
      for (const [key, val] of Object.entries(feature.properties)) {
        if (val != null) cleanProps[key] = val;
      }
    }

    if (geom.type === "Point") {
      pointFeatures.push({ ...feature, properties: cleanProps });
    } else if (geom.type === "LineString") {
      lineFeatures.push({ ...feature, properties: cleanProps });
    } else if (geom.type === "MultiLineString") {
      for (const coords of geom.coordinates) {
        lineFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { ...cleanProps },
        });
      }
    } else if (geom.type === "Polygon") {
      lineFeatures.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: geom.coordinates[0] },
        properties: { ...cleanProps },
      });
    }
  }

  return {
    points: pointFeatures.length > 0
      ? { type: "FeatureCollection", features: pointFeatures }
      : null,
    lines: lineFeatures.length > 0
      ? { type: "FeatureCollection", features: lineFeatures }
      : null,
  };
}

function calcBounds(geojson) {
  if (!geojson?.features?.length) return null;
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

  return minLng === Infinity ? null : [[minLng, minLat], [maxLng, maxLat]];
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer IDs
// ─────────────────────────────────────────────────────────────────────────────

const SRC_POINTS = "footprints";
const SRC_ROUTES = "routes";

const LAYER_IDS = [
  "heatmap",
  "routes-glow",
  "routes",
  "clusters",
  "cluster-count",
  "unclustered-point",
  "unclustered-glow",
];

function safeRemoveAll(map) {
  try {
    if (!map || !map.getStyle()) return;
    for (const id of LAYER_IDS) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(SRC_POINTS)) map.removeSource(SRC_POINTS);
    if (map.getSource(SRC_ROUTES)) map.removeSource(SRC_ROUTES);
  } catch {
    // Map may be disposed
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MapView({ geojson, stats, mapStyle = "dark", sidebarOpen, onToggleSidebar }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const popupRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [coordinates, setCoordinates] = useState(null);
  const dataRef = useRef(null);

  // Inject data into the map
  const injectData = useCallback((map, data) => {
    if (!map || !data) return;

    try {
      safeRemoveAll(map);

      const { points, lines } = splitGeoJSON(data);

      // ── Add sources ──────────────────────────────────────────────
      if (points) {
        map.addSource(SRC_POINTS, {
          type: "geojson",
          data: deepCloneGeoJSON(points),
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });
      }

      if (lines) {
        map.addSource(SRC_ROUTES, {
          type: "geojson",
          data: deepCloneGeoJSON(lines),
        });
      }

      // ── Add layers (bottom → top) ────────────────────────────────

      // Heatmap layer
      if (points) {
        map.addLayer({
          id: "heatmap",
          type: "heatmap",
          source: SRC_POINTS,
          filter: ["!", ["has", "point_count"]],
          maxzoom: 15,
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["zoom"], 0, 1, 15, 3],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 15, 3],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(0, 0, 0, 0)",
              0.1, "rgba(10, 0, 80, 0.35)",
              0.2, "rgba(0, 80, 255, 0.5)",
              0.35, "rgba(0, 255, 245, 0.6)",
              0.5, "rgba(0, 255, 136, 0.65)",
              0.7, "rgba(180, 0, 255, 0.75)",
              0.85, "rgba(255, 0, 180, 0.85)",
              1.0, "rgba(255, 60, 138, 1)",
            ],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 6, 4, 14, 8, 25, 12, 40, 15, 55],
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.85, 15, 0.25],
          },
        });
      }

      // Route glow (wider, blurry)
      if (lines) {
        map.addLayer({
          id: "routes-glow",
          type: "line",
          source: SRC_ROUTES,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#00fff5",
            "line-width": ["interpolate", ["linear"], ["zoom"], 1, 5, 6, 9, 12, 14],
            "line-blur": 5,
            "line-opacity": 0.45,
          },
        });

        // Route core line
        map.addLayer({
          id: "routes",
          type: "line",
          source: SRC_ROUTES,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": [
              "interpolate", ["linear"], ["zoom"],
              1, "#00fff5",
              8, "#b347ff",
              14, "#ff3d8a",
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 1, 2, 6, 3, 12, 5],
            "line-opacity": 0.9,
          },
        });
      }

      // Cluster circles
      if (points) {
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: SRC_POINTS,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step", ["get", "point_count"],
              "rgba(0, 255, 245, 0.85)", 25,
              "rgba(179, 71, 255, 0.85)", 100,
              "rgba(255, 0, 255, 0.85)", 500,
              "rgba(255, 61, 138, 0.9)",
            ],
            "circle-radius": [
              "step", ["get", "point_count"],
              14, 25, 20, 100, 26, 500, 34,
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "rgba(0, 0, 0, 0.3)",
            "circle-blur": 0.1,
          },
        });

        // Cluster count labels
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: SRC_POINTS,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 11,
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0, 0, 0, 0.5)",
            "text-halo-width": 1,
          },
        });

        // Unclustered point glow
        map.addLayer({
          id: "unclustered-glow",
          type: "circle",
          source: SRC_POINTS,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 12,
            "circle-color": "rgba(255, 0, 255, 0.2)",
            "circle-blur": 0.8,
          },
        });

        // Unclustered points
        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: SRC_POINTS,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 5, 15, 7],
            "circle-color": "#ff00ff",
            "circle-stroke-width": 1,
            "circle-stroke-color": "rgba(255, 255, 255, 0.3)",
          },
        });
      }

      // ── Fly to data bounds ───────────────────────────────────────
      const bounds = calcBounds(data);
      if (bounds) {
        map.fitBounds(bounds, { padding: 80, duration: 2500, essential: true });
      }
    } catch (err) {
      console.error("[MapView] Data injection error:", err);
    }
  }, []);

  // Initialize Mapbox GL map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES[mapStyle] || MAP_STYLES.dark,
      center: [0, 20],
      zoom: 1.8,
      attributionControl: true,
      antialias: true,
      fadeDuration: 0,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
    });

    // Navigation controls
    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }),
      "top-right"
    );

    // Scale bar
    map.addControl(
      new mapboxgl.ScaleControl({ maxWidth: 100, unit: "metric" }),
      "bottom-right"
    );

    // Fullscreen control
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

    map.on("style.load", () => {
      setMapReady(true);

      // Add 3D terrain if available
      try {
        if (!map.getSource("mapbox-dem")) {
          map.addSource("mapbox-dem", {
            type: "raster-dem",
            url: "mapbox://mapbox.mapbox-terrain-dem-v1",
            tileSize: 512,
            maxzoom: 14,
          });
          map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
        }
      } catch {
        // Terrain may not be supported in all styles
      }

      // Add sky atmosphere
      try {
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0, 0],
            "sky-atmosphere-sun-intensity": 5,
          },
        });
      } catch {
        // Sky layer may already exist
      }

      // Inject data after style loads
      if (dataRef.current) {
        injectData(map, dataRef.current);
      }
    });

    // ── Interactive behaviors ──────────────────────────────────────

    // Cluster click → zoom in
    map.on("click", "clusters", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
      if (!features.length) return;
      const clusterId = features[0].properties.cluster_id;
      const source = map.getSource(SRC_POINTS);
      if (!source) return;
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({
          center: features[0].geometry.coordinates,
          zoom: zoom + 0.5,
          duration: 800,
        });
      });
    });

    // Point click → rich popup
    map.on("click", "unclustered-point", (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const coords = feature.geometry.coordinates.slice();
      const props = feature.properties;

      let html = '<div style="font-family:var(--font-geist-mono,monospace);font-size:11px;color:#e0e0ff;max-width:220px;">';

      if (props.name) {
        html += `<div style="color:#00fff5;font-weight:bold;margin-bottom:6px;font-size:13px;">${escapeHtml(props.name)}</div>`;
      }
      if (props.address) {
        html += `<div style="color:#888;font-size:10px;margin-bottom:6px;">${escapeHtml(props.address)}</div>`;
      }
      if (props.semanticType) {
        html += `<div style="display:inline-block;padding:2px 8px;background:rgba(179,71,255,0.15);border:1px solid rgba(179,71,255,0.3);border-radius:4px;font-size:9px;color:#b347ff;margin-bottom:6px;">${escapeHtml(props.semanticType)}</div>`;
      }
      if (props.durationMinutes) {
        const mins = parseFloat(props.durationMinutes);
        const display = mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins.toFixed(0)}min`;
        html += `<div style="color:#ff00ff;margin-bottom:4px;">⏱ ${display}</div>`;
      }
      if (props.arrivalTimestamp) {
        try {
          const date = new Date(props.arrivalTimestamp);
          if (!isNaN(date.getTime())) {
            html += `<div style="color:#b347ff;font-size:10px;margin-top:4px;">${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>`;
          }
        } catch { /* ignore */ }
      }
      html += "</div>";

      // Handle date line wrapping
      while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
        coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
      }

      if (popupRef.current) popupRef.current.remove();

      popupRef.current = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        className: "footprint-popup",
        maxWidth: "260px",
        offset: 12,
      })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
    });

    // Cursor changes
    map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
    map.on("mouseenter", "unclustered-point", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "unclustered-point", () => { map.getCanvas().style.cursor = ""; });

    // Track mouse coordinates for status display
    map.on("mousemove", (e) => {
      setCoordinates({
        lng: e.lngLat.lng.toFixed(4),
        lat: e.lngLat.lat.toFixed(4),
      });
    });

    // ResizeObserver for flex container changes
    const resizeObserver = new ResizeObserver(() => {
      if (map) map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);

    mapInstanceRef.current = map;

    return () => {
      resizeObserver.disconnect();
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapInstanceRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-inject data when geojson changes
  useEffect(() => {
    dataRef.current = geojson;
    const map = mapInstanceRef.current;
    if (!map || !geojson) return;

    if (map.isStyleLoaded()) {
      injectData(map, geojson);
    } else {
      map.once("style.load", () => injectData(map, geojson));
    }
  }, [geojson, injectData]);

  // Handle map style changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const newStyle = MAP_STYLES[mapStyle] || MAP_STYLES.dark;
    const currentStyle = map.getStyle()?.sprite;

    // Only change if different
    if (currentStyle && !currentStyle.includes(mapStyle)) {
      map.setStyle(newStyle);
      // Data will be re-injected on style.load event (set up in init)
    }
  }, [mapStyle]);

  // Resize map when sidebar toggles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map) {
      setTimeout(() => map.resize(), 400); // Wait for sidebar animation
    }
  }, [sidebarOpen]);

  return (
    <div id="map-container" className="flex-1 w-full h-full relative fade-scale-in">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Sidebar toggle button (visible when sidebar is closed) */}
      {!sidebarOpen && (
        <button
          onClick={onToggleSidebar}
          className="absolute top-4 left-4 z-30 sidebar-toggle glass-card p-2.5 cursor-pointer hover:bg-surface-light/80 transition-all border border-neon-cyan/15"
          title="Open sidebar (Esc)"
          id="toggle-sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neon-cyan">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
      )}

      {/* Status indicator */}
      <div className="absolute top-4 right-[60px] z-10 pointer-events-none">
        <div className="flex items-center gap-2 glass-card px-3 py-1.5 border border-glass-border">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
          <span className="text-[9px] font-mono text-foreground/25 tracking-widest">
            LIVE
          </span>
        </div>
      </div>

      {/* Coordinate display */}
      {coordinates && (
        <div className="absolute top-4 right-[130px] z-10 pointer-events-none hidden md:block">
          <div className="glass-card px-3 py-1.5 border border-glass-border">
            <span className="text-[9px] font-mono text-foreground/20 tracking-wider">
              {coordinates.lat}° {coordinates.lng}°
            </span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-8 left-4 z-10 pointer-events-none">
        <div className="glass-card px-3 py-3 border border-glass-border">
          <div className="text-[8px] font-mono text-foreground/20 tracking-[0.2em] mb-2.5">
            LEGEND
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div
                className="w-3.5 h-3.5 rounded-sm"
                style={{
                  background: "linear-gradient(135deg, rgba(0,80,255,0.5), rgba(0,255,136,0.65), rgba(255,60,138,1))",
                }}
              />
              <span className="text-[9px] font-mono text-foreground/30">HEATMAP</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-3.5 h-3.5 rounded-full"
                style={{ background: "#00fff5", boxShadow: "0 0 6px #00fff5" }}
              />
              <span className="text-[9px] font-mono text-foreground/30">CLUSTERS</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-3.5 h-3.5 rounded-full"
                style={{ background: "#ff00ff", boxShadow: "0 0 6px #ff00ff" }}
              />
              <span className="text-[9px] font-mono text-foreground/30">PLACES</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 rounded" style={{ background: "linear-gradient(90deg, #00fff5, #b347ff)" }} />
              <span className="text-[9px] font-mono text-foreground/30">ROUTES</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HTML Escape helper (XSS prevention) ─────────────────────────────────────

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
