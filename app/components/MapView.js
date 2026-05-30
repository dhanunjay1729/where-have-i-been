"use client";

import { useEffect, useRef, useMemo } from "react";
import L from "leaflet";

// Cyberpunk-themed dark tile layer
const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

export default function MapView({ geojson, stats }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Process geojson into renderable layers
  const { points, lines } = useMemo(() => {
    const pts = [];
    const lns = [];

    if (!geojson?.features) return { points: pts, lines: lns };

    for (const feature of geojson.features) {
      const geom = feature.geometry;
      if (!geom) continue;

      if (geom.type === "Point") {
        pts.push(geom.coordinates);
      } else if (geom.type === "LineString") {
        lns.push(geom.coordinates);
      } else if (geom.type === "MultiLineString") {
        lns.push(...geom.coordinates);
      } else if (geom.type === "Polygon") {
        lns.push(geom.coordinates[0]);
      }
    }

    return { points: pts, lines: lns };
  }, [geojson]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Create map
    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    // Fit bounds
    if (stats?.bounds) {
      map.fitBounds(stats.bounds, { padding: [50, 50] });
    } else {
      // Calculate bounds from the data itself
      const allCoords = [...points, ...lines.flat()];
      if (allCoords.length > 0) {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const [lng, lat] of allCoords) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }
        map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [50, 50] });
      } else {
        map.setView([20, 0], 2);
      }
    }

    // Add lines with gradient-like neon effect
    if (lines.length > 0) {
      for (const lineCoords of lines) {
        const latLngs = lineCoords.map(([lng, lat]) => [lat, lng]);

        // Glow layer (wider, transparent)
        L.polyline(latLngs, {
          color: "#00fff5",
          weight: 6,
          opacity: 0.15,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map);

        // Main line
        L.polyline(latLngs, {
          color: "#00fff5",
          weight: 2.5,
          opacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map);
      }
    }

    // Add point markers
    if (points.length > 0) {
      // For large datasets, use canvas renderer and circle markers
      const renderer = L.canvas({ padding: 0.5 });

      // Limit displayed points for performance
      const maxPoints = 5000;
      const step = Math.max(1, Math.floor(points.length / maxPoints));
      const displayPoints = points.filter((_, i) => i % step === 0);

      for (const [lng, lat] of displayPoints) {
        L.circleMarker([lat, lng], {
          radius: points.length > 500 ? 2 : 4,
          color: "#ff00ff",
          fillColor: "#ff00ff",
          fillOpacity: 0.6,
          weight: 1,
          opacity: 0.8,
          renderer,
        }).addTo(map);
      }

      // If no lines, connect points with a line
      if (lines.length === 0 && points.length > 1) {
        const latLngs = displayPoints.map(([lng, lat]) => [lat, lng]);

        L.polyline(latLngs, {
          color: "#00fff5",
          weight: 4,
          opacity: 0.1,
          lineCap: "round",
        }).addTo(map);

        L.polyline(latLngs, {
          color: "#00fff5",
          weight: 1.5,
          opacity: 0.7,
          lineCap: "round",
        }).addTo(map);
      }
    }

    // Add start/end markers if applicable
    const allCoords =
      lines.length > 0
        ? lines.flat()
        : points;

    if (allCoords.length >= 2) {
      const startCoord = allCoords[0];
      const endCoord = allCoords[allCoords.length - 1];

      // Start marker
      const startIcon = L.divIcon({
        className: "",
        html: `<div style="
          width: 14px; height: 14px;
          background: #00fff5;
          border: 2px solid #0a0a0f;
          border-radius: 50%;
          box-shadow: 0 0 12px #00fff5, 0 0 24px rgba(0,255,245,0.3);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      // End marker
      const endIcon = L.divIcon({
        className: "",
        html: `<div style="
          width: 14px; height: 14px;
          background: #ff00ff;
          border: 2px solid #0a0a0f;
          border-radius: 50%;
          box-shadow: 0 0 12px #ff00ff, 0 0 24px rgba(255,0,255,0.3);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      L.marker([startCoord[1], startCoord[0]], { icon: startIcon })
        .bindPopup(
          '<span style="font-family:monospace;color:#00fff5;font-size:11px;">▶ START</span>'
        )
        .addTo(map);

      L.marker([endCoord[1], endCoord[0]], { icon: endIcon })
        .bindPopup(
          '<span style="font-family:monospace;color:#ff00ff;font-size:11px;">■ END</span>'
        )
        .addTo(map);
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [geojson, stats, points, lines]);

  return (
    <div className="fade-scale-in flex-1 relative">
      {/* Map container */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* Corner decorations */}
      <div className="absolute top-3 right-3 z-10 pointer-events-none">
        <div className="flex items-center gap-2 bg-surface/80 backdrop-blur-sm rounded px-3 py-1.5 border border-neon-cyan/10">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
          <span className="text-[9px] font-mono text-foreground/30 tracking-widest">
            LIVE RENDER
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 right-3 z-10 pointer-events-none">
        <div className="bg-surface/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-neon-cyan/10">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  background: "#00fff5",
                  boxShadow: "0 0 6px #00fff5",
                }}
              />
              <span className="text-[9px] font-mono text-foreground/40">
                START
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  background: "#ff00ff",
                  boxShadow: "0 0 6px #ff00ff",
                }}
              />
              <span className="text-[9px] font-mono text-foreground/40">
                END
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-neon-cyan rounded" />
              <span className="text-[9px] font-mono text-foreground/40">
                TRACK
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
