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
export default function useMapFootprints(map, geojsonData) {
  const layersAddedRef = useRef(false);

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
        // Flatten each sub-line into its own LineString feature
        for (const coords of geom.coordinates) {
          lineFeatures.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: { ...feature.properties },
          });
        }
      } else if (geom.type === "Polygon") {
        // Treat polygon ring as a line for visualization
        lineFeatures.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: geom.coordinates[0] },
          properties: { ...feature.properties },
        });
      }
    }

    const points =
      pointFeatures.length > 0
        ? { type: "FeatureCollection", features: pointFeatures }
        : null;

    const lines =
      lineFeatures.length > 0
        ? { type: "FeatureCollection", features: lineFeatures }
        : null;

    return { points, lines };
  }, []);

  // ── Calculate geographic bounding box ────────────────────────────────────
  const calculateBounds = useCallback((geojson) => {
    if (!geojson?.features || geojson.features.length === 0) return null;

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

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
        for (const coord of geom.coordinates) {
          processCoord(coord);
        }
      } else if (geom.type === "MultiLineString" || geom.type === "Polygon") {
        for (const ring of geom.coordinates) {
          for (const coord of ring) {
            processCoord(coord);
          }
        }
      }
    }

    if (minLng === Infinity) return null;

    return [
      [minLng, minLat], // SW
      [maxLng, maxLat], // NE
    ];
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
      // ────────────────────────────────────────────────────────────────────
      // 1) POINT SOURCE (clustered) + HEATMAP + CLUSTER + UNCLUSTERED LAYERS
      // ────────────────────────────────────────────────────────────────────
      if (pointsGeoJSON) {
        // Check if source already exists → update data; else create new
        const existingSource = mapInstance.getSource(SOURCE_FOOTPRINTS);
        if (existingSource) {
          existingSource.setData(pointsGeoJSON);
        } else {
          mapInstance.addSource(SOURCE_FOOTPRINTS, {
            type: "geojson",
            data: pointsGeoJSON,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50,
          });
        }

        // ── Heatmap Layer ──────────────────────────────────────────────
        // Neon color ramp: translucent blue → neon green → hot pink at dense nodes
        if (!mapInstance.getLayer(LAYER_HEATMAP)) {
          mapInstance.addLayer({
            id: LAYER_HEATMAP,
            type: "heatmap",
            source: SOURCE_FOOTPRINTS,
            filter: ["!", ["has", "point_count"]],
            maxzoom: 15,
            paint: {
              // Increase weight based on density or a property
              "heatmap-weight": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0, 1,
                15, 3,
              ],
              // Increase intensity as zoom level increases
              "heatmap-intensity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0, 0.8,
                15, 3,
              ],
              // Neon color ramp: transparent → blue → cyan → neon green → hot pink
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,   "rgba(0, 0, 0, 0)",
                0.1, "rgba(30, 0, 120, 0.4)",
                0.25, "rgba(0, 100, 255, 0.6)",
                0.4, "rgba(0, 255, 245, 0.7)",
                0.6, "rgba(0, 255, 100, 0.8)",
                0.8, "rgba(180, 0, 255, 0.9)",
                1.0, "rgba(255, 0, 120, 1)",
              ],
              // Radius adjusts with zoom
              "heatmap-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0, 8,
                6, 20,
                12, 35,
                15, 50,
              ],
              // Opacity fades at higher zooms to reveal individual points
              "heatmap-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12, 0.9,
                15, 0.3,
              ],
            },
          });
        }

        // ── Clustered Circle Layer ────────────────────────────────────
        if (!mapInstance.getLayer(LAYER_CLUSTER_CIRCLES)) {
          mapInstance.addLayer({
            id: LAYER_CLUSTER_CIRCLES,
            type: "circle",
            source: SOURCE_FOOTPRINTS,
            filter: ["has", "point_count"],
            paint: {
              // Color clusters based on count: cyan → magenta → pink
              "circle-color": [
                "step",
                ["get", "point_count"],
                "rgba(0, 255, 245, 0.85)",  // < 25: neon cyan
                25,
                "rgba(180, 71, 255, 0.85)",  // 25-100: neon purple
                100,
                "rgba(255, 0, 255, 0.85)",   // 100-500: magenta
                500,
                "rgba(255, 61, 138, 0.9)",   // 500+: hot pink
              ],
              // Size scales with cluster count
              "circle-radius": [
                "step",
                ["get", "point_count"],
                16,   // base size
                25, 22,
                100, 28,
                500, 36,
              ],
              "circle-stroke-width": 2,
              "circle-stroke-color": "rgba(0, 0, 0, 0.4)",
              // Subtle blur for glow effect
              "circle-blur": 0.15,
            },
          });
        }

        // ── Cluster Count Label ──────────────────────────────────────
        if (!mapInstance.getLayer(LAYER_CLUSTER_COUNT)) {
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

        // ── Unclustered Point Glow (outer ring) ─────────────────────
        if (!mapInstance.getLayer(LAYER_UNCLUSTERED_GLOW)) {
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

        // ── Unclustered Points (inner dot) ──────────────────────────
        if (!mapInstance.getLayer(LAYER_UNCLUSTERED_POINT)) {
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
      }

      // ────────────────────────────────────────────────────────────────────
      // 2) LINESTRING SOURCE + ROUTE LAYERS
      // ────────────────────────────────────────────────────────────────────
      if (linesGeoJSON) {
        const existingRouteSource = mapInstance.getSource(SOURCE_ROUTES);
        if (existingRouteSource) {
          existingRouteSource.setData(linesGeoJSON);
        } else {
          mapInstance.addSource(SOURCE_ROUTES, {
            type: "geojson",
            data: linesGeoJSON,
          });
        }

        // ── Route Glow Layer (wider, blurred for neon glow) ─────────
        if (!mapInstance.getLayer(LAYER_ROUTES_GLOW)) {
          mapInstance.addLayer(
            {
              id: LAYER_ROUTES_GLOW,
              type: "line",
              source: SOURCE_ROUTES,
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": "rgba(0, 255, 245, 0.15)",
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4, 4,
                  10, 8,
                  15, 14,
                ],
                "line-blur": 6,
              },
            },
            // Insert below heatmap if it exists
            mapInstance.getLayer(LAYER_HEATMAP) ? LAYER_HEATMAP : undefined
          );
        }

        // ── Route Line Layer (thin, crisp neon line) ────────────────
        if (!mapInstance.getLayer(LAYER_ROUTES)) {
          mapInstance.addLayer(
            {
              id: LAYER_ROUTES,
              type: "line",
              source: SOURCE_ROUTES,
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  2, "rgba(0, 255, 245, 0.5)",
                  8, "rgba(0, 255, 245, 0.75)",
                  14, "rgba(0, 255, 245, 0.9)",
                ],
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4, 1,
                  10, 2,
                  15, 3.5,
                ],
              },
            },
            // Insert glow above the glow layer
            mapInstance.getLayer(LAYER_ROUTES_GLOW)
              ? LAYER_HEATMAP
              : undefined
          );
        }
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

      // Clean any existing layers/sources before re-adding
      cleanupLayers(map);

      // Add layers with the new data
      addLayers(map, points, lines);

      // ── Fly to bounding box ──────────────────────────────────────
      const bounds = calculateBounds(geojsonData);
      if (bounds) {
        map.fitBounds(bounds, {
          padding: 50,
          duration: 2500,
          essential: true,
        });
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
      if (map && map.getStyle()) {
        cleanupLayers(map);
      }
    };
  }, [map, geojsonData, splitFeatures, calculateBounds, cleanupLayers, addLayers]);

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
