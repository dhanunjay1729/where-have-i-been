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
// Hook: useMapFootprints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook that takes a Mapbox GL map instance and a GeoJSON FeatureCollection,
 * then dynamically injects heatmap, route, and cluster layers.
 *
 * @param {mapboxgl.Map|null} map       – the live Mapbox GL map instance
 * @param {object|null}       geojsonData – a GeoJSON FeatureCollection from our parser
 */
export default function useMapFootprints(map, geojsonData, currentTime) {
  const layersAddedRef = useRef(false);
  const fullDataRef = useRef({ points: null, lines: null });
  const animationFrameRef = useRef(null);

  // ── Separate Point and LineString features ───────────────────────────────
  const splitFeatures = useCallback((geojson) => {
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

    // Process timestamps to numbers for fast filtering
    const processTime = (features, isPoint) => {
      return features.map(f => {
        const timeStr = isPoint 
          ? (f.properties.arrivalTimestamp || f.properties.timestamp || f.properties.time)
          : (f.properties.startTimestamp || f.properties.timestamp || f.properties.time);
        
        let _timeMs = 0;
        if (timeStr) {
          const t = new Date(timeStr).getTime();
          if (!isNaN(t)) _timeMs = t;
        }

        return {
          ...f,
          properties: {
            ...f.properties,
            _timeMs
          }
        };
      });
    };

    const points = pointFeatures.length > 0
      ? { type: "FeatureCollection", features: processTime(pointFeatures, true) }
      : null;

    const lines = lineFeatures.length > 0
      ? { type: "FeatureCollection", features: processTime(lineFeatures, false) }
      : null;

    return { points, lines };
  }, []);

  // ── Calculate geographic bounding box ────────────────────────────────────
  const calculateBounds = useCallback((geojson) => {
    if (!geojson?.features || geojson.features.length === 0) return null;

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;

    const processCoord = (coord) => {
      const [lng, lat] = coord;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    };

    for (const feature of geojson.features) {
      const geom = feature.geometry;
      if (!geom) continue;

      if (geom.type === "Point") {
        processCoord(geom.coordinates);
      } else if (geom.type === "LineString") {
        for (const coord of geom.coordinates) processCoord(coord);
      } else if (geom.type === "MultiLineString" || geom.type === "Polygon") {
        for (const ring of geom.coordinates) {
          for (const coord of ring) processCoord(coord);
        }
      }
    }

    if (minLng === Infinity) return null;

    return [[minLng, minLat], [maxLng, maxLat]];
  }, []);

  // ── Remove old layers & sources gracefully ───────────────────────────────
  const cleanupLayers = useCallback(
    (mapInstance) => {
      for (const layerId of ALL_LAYERS) {
        if (mapInstance.getLayer(layerId)) {
          mapInstance.removeLayer(layerId);
        }
      }
      for (const sourceId of ALL_SOURCES) {
        if (mapInstance.getSource(sourceId)) {
          mapInstance.removeSource(sourceId);
        }
      }
      layersAddedRef.current = false;
    },
    []
  );

  // ── Add all layers ──────────────────────────────────────────────────────
  const addLayers = useCallback(
    (mapInstance, pointsGeoJSON, linesGeoJSON) => {
      // 1) Ensure sources exist or are updated
      if (pointsGeoJSON) {
        if (mapInstance.getSource(SOURCE_FOOTPRINTS)) {
          mapInstance.getSource(SOURCE_FOOTPRINTS).setData(pointsGeoJSON);
        } else {
          mapInstance.addSource(SOURCE_FOOTPRINTS, {
            type: "geojson",
            data: pointsGeoJSON,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50,
          });
        }
      }

      if (linesGeoJSON) {
        if (mapInstance.getSource(SOURCE_ROUTES)) {
          mapInstance.getSource(SOURCE_ROUTES).setData(linesGeoJSON);
        } else {
          mapInstance.addSource(SOURCE_ROUTES, {
            type: "geojson",
            data: linesGeoJSON,
          });
        }
      }

      // 2) Add layers in correct visual order (bottom to top)
      
      // Bottom layer: Heatmap
      if (pointsGeoJSON && !mapInstance.getLayer(LAYER_HEATMAP)) {
        mapInstance.addLayer({
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

      // Route Glow
      if (linesGeoJSON && !mapInstance.getLayer(LAYER_ROUTES_GLOW)) {
        mapInstance.addLayer({
          id: LAYER_ROUTES_GLOW,
          type: "line",
          source: SOURCE_ROUTES,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#00fff5",
            "line-width": 8,
            "line-blur": 4,
            "line-opacity": 0.5,
          },
        });
      }

      // Route Main Line
      if (linesGeoJSON && !mapInstance.getLayer(LAYER_ROUTES)) {
        mapInstance.addLayer({
          id: LAYER_ROUTES,
          type: "line",
          source: SOURCE_ROUTES,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": 3,
          },
        });
      }

      // Unclustered Point Glow
      if (pointsGeoJSON && !mapInstance.getLayer(LAYER_UNCLUSTERED_GLOW)) {
        mapInstance.addLayer({
          id: LAYER_UNCLUSTERED_GLOW,
          type: "circle",
          source: SOURCE_FOOTPRINTS,
          filter: ["!", ["has", "point_count"]],
          minzoom: 12,
          paint: {
            "circle-radius": 8,
            "circle-color": "rgba(255, 0, 255, 0.2)",
            "circle-blur": 0.8,
          },
        });
      }

      // Unclustered Point Core
      if (pointsGeoJSON && !mapInstance.getLayer(LAYER_UNCLUSTERED_POINT)) {
        mapInstance.addLayer({
          id: LAYER_UNCLUSTERED_POINT,
          type: "circle",
          source: SOURCE_FOOTPRINTS,
          filter: ["!", ["has", "point_count"]],
          minzoom: 12,
          paint: {
            "circle-radius": 4,
            "circle-color": "#ff00ff",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#0a0a0f",
          },
        });
      }

      // Cluster Circles
      if (pointsGeoJSON && !mapInstance.getLayer(LAYER_CLUSTER_CIRCLES)) {
        mapInstance.addLayer({
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

      // Cluster Count Text
      if (pointsGeoJSON && !mapInstance.getLayer(LAYER_CLUSTER_COUNT)) {
        mapInstance.addLayer({
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

      layersAddedRef.current = true;
    },
    []
  );

  // ── Main effect: inject data when map + geojson are ready ───────────────
  useEffect(() => {
    if (!map || !geojsonData) return;

    const inject = () => {
      const { points, lines } = splitFeatures(geojsonData);
      fullDataRef.current = { points, lines };

      // Clean any existing layers/sources before re-adding
      cleanupLayers(map);

      // Add layers with the new data
      addLayers(map, points, lines);

      // ── Fly to bounding box ──────────────────────────────────────
      const bounds = calculateBounds(geojsonData);
      if (bounds) {
        map.fitBounds(bounds, { padding: 50, duration: 2500, essential: true });
      }
    };

    // Check if map style is fully loaded before injecting
    if (map.isStyleLoaded()) {
      inject();
    } else {
      map.once("style.load", inject);
    }

    // Cleanup on unmount or data change
    return () => {
      if (map && map.getStyle()) cleanupLayers(map);
    };
  }, [map, geojsonData, splitFeatures, calculateBounds, cleanupLayers, addLayers]);

  // ── Timeline filtering effect ───────────────────────────────────────────
  useEffect(() => {
    if (!map || !layersAddedRef.current || !currentTime) return;

    // Use requestAnimationFrame to throttle setData calls for smooth playback
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    animationFrameRef.current = requestAnimationFrame(() => {
      const { points, lines } = fullDataRef.current;

      if (points && map.getSource(SOURCE_FOOTPRINTS)) {
        const filteredPoints = {
          type: "FeatureCollection",
          features: points.features.filter(f => f.properties._timeMs <= currentTime)
        };
        map.getSource(SOURCE_FOOTPRINTS).setData(filteredPoints);
      }

      if (lines && map.getSource(SOURCE_ROUTES)) {
        const filteredLines = {
          type: "FeatureCollection",
          features: lines.features.filter(f => f.properties._timeMs <= currentTime)
        };
        map.getSource(SOURCE_ROUTES).setData(filteredLines);
      }
    });

  }, [currentTime, map]);

  // ── Handle cluster click → zoom into cluster ───────────────────────────
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
          zoom: zoom,
          duration: 800,
        });
      });
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", LAYER_CLUSTER_CIRCLES, handleClusterClick);
    map.on("mouseenter", LAYER_CLUSTER_CIRCLES, handleMouseEnter);
    map.on("mouseleave", LAYER_CLUSTER_CIRCLES, handleMouseLeave);

    return () => {
      map.off("click", LAYER_CLUSTER_CIRCLES, handleClusterClick);
      map.off("mouseenter", LAYER_CLUSTER_CIRCLES, handleMouseEnter);
      map.off("mouseleave", LAYER_CLUSTER_CIRCLES, handleMouseLeave);
    };
  }, [map]);

  // ── Handle unclustered point click → show popup ────────────────────────
  useEffect(() => {
    if (!map) return;

    let popup = null;

    const handlePointClick = (e) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const coords = feature.geometry.coordinates.slice();
      const props = feature.properties;

      // Build popup HTML
      let html = '<div style="font-family:monospace;font-size:11px;color:#e0e0ff;max-width:200px;">';

      if (props.name) {
        html += `<div style="color:#00fff5;font-weight:bold;margin-bottom:4px;">${props.name}</div>`;
      }

      if (props.address) {
        html += `<div style="color:#aaa;font-size:10px;margin-bottom:4px;">${props.address}</div>`;
      }

      if (props.durationMinutes) {
        html += `<div style="color:#ff00ff;">⏱ ${props.durationMinutes} min</div>`;
      }

      if (props.arrivalTimestamp) {
        const date = new Date(props.arrivalTimestamp);
        if (!isNaN(date.getTime())) {
          html += `<div style="color:#b347ff;font-size:10px;margin-top:2px;">${date.toLocaleDateString()}</div>`;
        }
      }

      html += "</div>";

      // Ensure the popup is positioned correctly for wrapped coordinates
      while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
        coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
      }

      // Remove old popup
      if (popup) popup.remove();

      // We need mapboxgl for popup creation — import dynamically
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

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", LAYER_UNCLUSTERED_POINT, handlePointClick);
    map.on("mouseenter", LAYER_UNCLUSTERED_POINT, handleMouseEnter);
    map.on("mouseleave", LAYER_UNCLUSTERED_POINT, handleMouseLeave);

    return () => {
      map.off("click", LAYER_UNCLUSTERED_POINT, handlePointClick);
      map.off("mouseenter", LAYER_UNCLUSTERED_POINT, handleMouseEnter);
      map.off("mouseleave", LAYER_UNCLUSTERED_POINT, handleMouseLeave);
      if (popup) popup.remove();
    };
  }, [map]);
}
