"use client";

import { useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Layer & Source IDs
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_FOOTPRINTS = "footprints";
const SOURCE_ROUTES = "routes";

const LAYER_HEATMAP = "heatmap-layer";
const LAYER_ROUTES = "routes-layer";
const LAYER_ROUTES_GLOW = "routes-glow-layer";
const LAYER_CLUSTER_CIRCLES = "cluster-circles";
const LAYER_CLUSTER_COUNT = "cluster-count";
const LAYER_UNCLUSTERED_POINT = "unclustered-point";
const LAYER_UNCLUSTERED_GLOW = "unclustered-glow";

const ALL_LAYERS = [
  LAYER_HEATMAP,
  LAYER_ROUTES,
  LAYER_ROUTES_GLOW,
  LAYER_CLUSTER_CIRCLES,
  LAYER_CLUSTER_COUNT,
  LAYER_UNCLUSTERED_POINT,
  LAYER_UNCLUSTERED_GLOW,
];

const ALL_SOURCES = [SOURCE_FOOTPRINTS, SOURCE_ROUTES];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeRemoveLayers(map) {
  try {
    if (!map || !map.getStyle()) return;
    for (const id of ALL_LAYERS) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of ALL_SOURCES) {
      if (map.getSource(id)) map.removeSource(id);
    }
  } catch (e) {
    // Map may have been disposed
  }
}

function splitGeoJSON(geojson) {
  if (!geojson?.features) return { points: null, lines: null };

  const pointFeatures = [];
  const lineFeatures = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;

    if (geom.type === "Point") {
      pointFeatures.push(feature);
    } else if (geom.type === "LineString") {
      lineFeatures.push(feature);
    } else if (geom.type === "MultiLineString") {
      for (const coords of geom.coordinates) {
        lineFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { ...feature.properties },
        });
      }
    } else if (geom.type === "Polygon") {
      lineFeatures.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: geom.coordinates[0] },
        properties: { ...feature.properties },
      });
    }
  }

  // Add _timeMs for filtering
  const addTime = (features, isPoint) =>
    features.map((f) => {
      const timeStr = isPoint
        ? f.properties.arrivalTimestamp || f.properties.timestamp || f.properties.time
        : f.properties.startTimestamp || f.properties.timestamp || f.properties.time;
      let _timeMs = 0;
      if (timeStr) {
        const t = new Date(timeStr).getTime();
        if (!isNaN(t)) _timeMs = t;
      }
      return { ...f, properties: { ...f.properties, _timeMs } };
    });

  return {
    points: pointFeatures.length > 0
      ? { type: "FeatureCollection", features: addTime(pointFeatures, true) }
      : null,
    lines: lineFeatures.length > 0
      ? { type: "FeatureCollection", features: addTime(lineFeatures, false) }
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
// Hook: useMapFootprints
// ─────────────────────────────────────────────────────────────────────────────

export default function useMapFootprints(map, geojsonData, currentTime) {
  const fullDataRef = useRef({ points: null, lines: null });
  const injectedRef = useRef(false);

  // ── Main effect: inject data ────────────────────────────────────────────
  useEffect(() => {
    if (!map || !geojsonData) return;

    // Mapbox GL JS silently drops GeoJSON sources if they are synchronously removed
    // and re-added in the same frame during React Strict Mode. If the data is the same, skip.
    if (injectedRef.current === geojsonData) return;

    let cancelled = false;

    const inject = () => {
      if (cancelled) return;

      try {
        const { points, lines } = splitGeoJSON(geojsonData);
        fullDataRef.current = { points, lines };

        console.log("[MAP] Injecting data:", {
          points: points?.features?.length || 0,
          lines: lines?.features?.length || 0,
        });

        // Remove existing custom layers/sources
        safeRemoveLayers(map);

        // ── Add sources ──────────────────────────────────────────────
        if (points) {
          map.addSource(SOURCE_FOOTPRINTS, {
            type: "geojson",
            data: JSON.parse(JSON.stringify(points)),
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50,
          });
        }

        if (lines) {
          map.addSource(SOURCE_ROUTES, {
            type: "geojson",
            data: JSON.parse(JSON.stringify(lines)),
          });
        }

        // ── Add layers (bottom → top) ────────────────────────────────

        // Heatmap
        if (points) {
          map.addLayer({
            id: LAYER_HEATMAP,
            type: "heatmap",
            source: SOURCE_FOOTPRINTS,
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
        }

        // Route main line
        if (lines) {
          map.addLayer({
            id: LAYER_ROUTES,
            type: "line",
            source: SOURCE_ROUTES,
            paint: {
              "line-color": "#00fff5",
              "line-width": 4,
              "line-opacity": 0.8,
            },
          });
        }

        // Unclustered point
        if (points) {
          map.addLayer({
            id: LAYER_UNCLUSTERED_POINT,
            type: "circle",
            source: SOURCE_FOOTPRINTS,
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-radius": 6,
              "circle-color": "#ff00ff",
            },
          });
        }

        // Cluster circles
        if (points) {
          map.addLayer({
            id: LAYER_CLUSTER_CIRCLES,
            type: "circle",
            source: SOURCE_FOOTPRINTS,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": [
                "step", ["get", "point_count"],
                "rgba(0, 255, 245, 0.85)", 25,
                "rgba(180, 71, 255, 0.85)", 100,
                "rgba(255, 0, 255, 0.85)", 500,
                "rgba(255, 61, 138, 0.9)",
              ],
              "circle-radius": [
                "step", ["get", "point_count"],
                16, 25, 22, 100, 28, 500, 36,
              ],
              "circle-stroke-width": 2,
              "circle-stroke-color": "rgba(0, 0, 0, 0.4)",
              "circle-blur": 0.15,
            },
          });
        }

        // Cluster count
        if (points) {
          map.addLayer({
            id: LAYER_CLUSTER_COUNT,
            type: "symbol",
            source: SOURCE_FOOTPRINTS,
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
              "text-size": 12,
              "text-allow-overlap": true,
            },
            paint: {
              "text-color": "#ffffff",
              "text-halo-color": "rgba(0, 0, 0, 0.5)",
              "text-halo-width": 1,
            },
          });
        }

        injectedRef.current = true;

        // ── Fly to data bounds ───────────────────────────────────────
        const bounds = calcBounds(geojsonData);
        if (bounds) {
          map.fitBounds(bounds, { padding: 60, duration: 2000, essential: true });
        }

        console.log(
          "[MAP] Injection complete. Routes source:",
          !!map.getSource(SOURCE_ROUTES)
        );

        injectedRef.current = geojsonData;
      } catch (err) {
        console.error("[MAP] Injection error:", err);
      }
    };

    // Wait for map style to be ready, then inject
    if (map.isStyleLoaded()) {
      inject();
    } else {
      map.once("style.load", inject);
    }

    return () => {
      cancelled = true;
      // Don't cleanup layers here — React Strict Mode would remove them immediately
    };
  }, [map, geojsonData]);

  // ── Cleanup only on true unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (map) safeRemoveLayers(map);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cluster click → zoom ───────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    const handleClusterClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [LAYER_CLUSTER_CIRCLES],
      });
      if (!features.length) return;

      const clusterId = features[0].properties.cluster_id;
      const source = map.getSource(SOURCE_FOOTPRINTS);
      if (!source) return;

      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({
          center: features[0].geometry.coordinates,
          zoom,
          duration: 800,
        });
      });
    };

    const cursorPointer = () => { map.getCanvas().style.cursor = "pointer"; };
    const cursorDefault = () => { map.getCanvas().style.cursor = ""; };

    map.on("click", LAYER_CLUSTER_CIRCLES, handleClusterClick);
    map.on("mouseenter", LAYER_CLUSTER_CIRCLES, cursorPointer);
    map.on("mouseleave", LAYER_CLUSTER_CIRCLES, cursorDefault);

    return () => {
      map.off("click", LAYER_CLUSTER_CIRCLES, handleClusterClick);
      map.off("mouseenter", LAYER_CLUSTER_CIRCLES, cursorPointer);
      map.off("mouseleave", LAYER_CLUSTER_CIRCLES, cursorDefault);
    };
  }, [map]);

  // ── Unclustered point click → popup ────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    let popup = null;

    const handlePointClick = (e) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const coords = feature.geometry.coordinates.slice();
      const props = feature.properties;

      let html = '<div style="font-family:monospace;font-size:11px;color:#e0e0ff;max-width:200px;">';
      if (props.name) html += `<div style="color:#00fff5;font-weight:bold;margin-bottom:4px;">${props.name}</div>`;
      if (props.address) html += `<div style="color:#aaa;font-size:10px;margin-bottom:4px;">${props.address}</div>`;
      if (props.durationMinutes) html += `<div style="color:#ff00ff;">⏱ ${props.durationMinutes} min</div>`;
      if (props.arrivalTimestamp) {
        const date = new Date(props.arrivalTimestamp);
        if (!isNaN(date.getTime())) html += `<div style="color:#b347ff;font-size:10px;margin-top:2px;">${date.toLocaleDateString()}</div>`;
      }
      html += "</div>";

      while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
        coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
      }

      if (popup) popup.remove();

      import("mapbox-gl").then(({ default: mapboxgl }) => {
        popup = new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: true,
          className: "footprint-popup",
          maxWidth: "240px",
        })
          .setLngLat(coords)
          .setHTML(html)
          .addTo(map);
      });
    };

    const cursorPointer = () => { map.getCanvas().style.cursor = "pointer"; };
    const cursorDefault = () => { map.getCanvas().style.cursor = ""; };

    map.on("click", LAYER_UNCLUSTERED_POINT, handlePointClick);
    map.on("mouseenter", LAYER_UNCLUSTERED_POINT, cursorPointer);
    map.on("mouseleave", LAYER_UNCLUSTERED_POINT, cursorDefault);

    return () => {
      map.off("click", LAYER_UNCLUSTERED_POINT, handlePointClick);
      map.off("mouseenter", LAYER_UNCLUSTERED_POINT, cursorPointer);
      map.off("mouseleave", LAYER_UNCLUSTERED_POINT, cursorDefault);
      if (popup) popup.remove();
    };
  }, [map]);
}
