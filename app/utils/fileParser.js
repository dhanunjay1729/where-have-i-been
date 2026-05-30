import { gpx, kml } from "@tmcw/togeojson";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COORD_PRECISION = 6;
const E7_DIVISOR = 1e7;
const EARTH_RADIUS_KM = 6371;
const DEDUP_THRESHOLD_KM = 0.015; // 15 meters
const DEG_TO_RAD = Math.PI / 180;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an uploaded file (File object) into GeoJSON + stats.
 * Supports: .gpx, .kml, .geojson, .json (including Google Takeout Semantic Location History)
 *
 * @param {string} fileName – the file name (used for extension detection)
 * @param {string} fileContent – raw text content of the file
 * @returns {{ geojson: object, stats: object|null }}
 */
export function parseFile(fileName, fileContent) {
  const ext = fileName.toLowerCase().split(".").pop();

  if (ext === "geojson" || ext === "json") {
    try {
      const data = JSON.parse(fileContent);

      // Standard GeoJSON pass-through
      if (data.type === "FeatureCollection" || data.type === "Feature") {
        const geojson =
          data.type === "Feature"
            ? { type: "FeatureCollection", features: [data] }
            : data;
        return { geojson, stats: calculateStats(geojson) };
      }

      // Google Takeout – Semantic Location History (timelineObjects)
      if (data.timelineObjects) {
        return parseSemanticLocationHistory(data);
      }

      // Google Takeout – New Timeline.json format (semanticSegments)
      if (data.semanticSegments) {
        return parseTimelineJson(data);
      }

      // Google Takeout – Records.json (locations array)
      if (data.locations) {
        const geojson = parseGoogleRecordsJson(data);
        return { geojson, stats: calculateStats(geojson) };
      }

      throw new Error("Unrecognized JSON format");
    } catch (e) {
      if (e.message === "Unrecognized JSON format") throw e;
      throw new Error(`Failed to parse JSON: ${e.message}`);
    }
  }

  if (ext === "gpx" || ext === "kml") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(fileContent, "text/xml");
      const geojson = ext === "gpx" ? gpx(doc) : kml(doc);
      return { geojson, stats: calculateStats(geojson) };
    } catch (e) {
      throw new Error(`Failed to parse ${ext.toUpperCase()}: ${e.message}`);
    }
  }

  throw new Error(
    `Unsupported file type: .${ext}. Please upload .gpx, .kml, .geojson, or .json`
  );
}

/**
 * Read a File object via FileReader and return parsed results.
 * Wraps parseFile in a Promise for async / drag-and-drop workflows.
 *
 * @param {File} file – browser File object
 * @returns {Promise<{ geojson: object, stats: object|null }>}
 */
export function parseFileAsync(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseFile(file.name, reader.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("FileReader error"));
    reader.readAsText(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic Location History Parser  (timelineObjects)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core parser for Google Takeout "Semantic Location History" JSON.
 * Processes the top-level `timelineObjects` array and produces:
 *   - A clean GeoJSON FeatureCollection
 *   - An aggregated stats object
 *
 * @param {{ timelineObjects: Array }} data
 * @returns {{ geojson: object, stats: object }}
 */
function parseSemanticLocationHistory(data) {
  const timelineObjects = data.timelineObjects;
  if (!Array.isArray(timelineObjects)) {
    throw new Error("timelineObjects is not an array");
  }

  const features = [];

  // Accumulators for stats
  let totalPlacesVisited = 0;
  let totalDistanceTraveled = 0; // in meters
  const travelModeCounts = new Map();
  const citySet = new Set();

  // Previous point coordinate for deduplication (across features)
  let prevCoord = null;

  for (let i = 0, len = timelineObjects.length; i < len; i++) {
    const obj = timelineObjects[i];

    if (obj.placeVisit) {
      const feature = processPlaceVisit(obj.placeVisit, prevCoord);
      if (feature) {
        features.push(feature);
        totalPlacesVisited++;
        prevCoord = feature.geometry.coordinates;

        // Rough city inference from location name
        const name = feature.properties.name;
        if (name) {
          citySet.add(name);
        }
      }
    } else if (obj.activitySegment) {
      const result = processActivitySegment(obj.activitySegment, prevCoord);
      if (result.feature) {
        features.push(result.feature);
        prevCoord = result.lastCoord || prevCoord;
      }

      // Accumulate distance
      if (result.distance > 0) {
        totalDistanceTraveled += result.distance;
      }

      // Accumulate travel mode
      if (result.activityType) {
        travelModeCounts.set(
          result.activityType,
          (travelModeCounts.get(result.activityType) || 0) + 1
        );
      }
    }
  }

  // Build sorted travel modes array
  const topTravelModes = [...travelModeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([mode, count]) => ({ mode, count }));

  const geojson = { type: "FeatureCollection", features };

  const stats = {
    totalPlacesVisited,
    totalDistanceTraveled, // meters
    totalDistanceTraveledKm: +(totalDistanceTraveled / 1000).toFixed(2),
    uniqueCities: [...citySet],
    uniqueCitiesCount: citySet.size,
    topTravelModes,
    totalFeatures: features.length,
    totalActivitySegments: features.filter(
      (f) => f.properties._type === "activitySegment"
    ).length,
  };

  return { geojson, stats };
}

// ─────────────────────────────────────────────────────────────────────────────
// Node Processors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a single `placeVisit` node into a GeoJSON Point feature.
 *
 * @param {object} pv – the placeVisit object
 * @param {number[]|null} prevCoord – previous coordinate for dedup
 * @returns {object|null} GeoJSON Feature or null if filtered
 */
function processPlaceVisit(pv, prevCoord) {
  const loc = pv.location;
  if (!loc) return null;

  const lat = convertE7(loc.latitudeE7);
  const lng = convertE7(loc.longitudeE7);
  if (lat == null || lng == null) return null;

  const coord = [capPrecision(lng), capPrecision(lat)];

  // Dedup: skip if within 15m of the previous point
  if (prevCoord && haversineKm(prevCoord, coord) < DEDUP_THRESHOLD_KM) {
    return null;
  }

  // Duration parsing
  const duration = pv.duration || {};
  const startTs = duration.startTimestamp || duration.startTimestampMs || null;
  const endTs = duration.endTimestamp || duration.endTimestampMs || null;

  let durationMinutes = null;
  if (startTs && endTs) {
    const diffMs = new Date(endTs).getTime() - new Date(startTs).getTime();
    if (diffMs > 0) {
      durationMinutes = +(diffMs / 60000).toFixed(1);
    }
  }

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: coord,
    },
    properties: {
      _type: "placeVisit",
      name: loc.name || null,
      placeId: loc.placeId || null,
      address: loc.address || null,
      arrivalTimestamp: startTs,
      departureTimestamp: endTs,
      durationMinutes,
    },
  };
}

/**
 * Process a single `activitySegment` node into a GeoJSON Feature.
 * If `waypointPath.waypoints` exists → LineString geometry.
 * Otherwise returns metadata only (feature may be null).
 *
 * @param {object} seg – the activitySegment object
 * @param {number[]|null} prevCoord – for dedup of start/end locations
 * @returns {{ feature: object|null, distance: number, activityType: string|null, lastCoord: number[]|null }}
 */
function processActivitySegment(seg, prevCoord) {
  const activityType = seg.activityType || null;
  const distance = seg.distance || 0; // meters

  const duration = seg.duration || {};
  const startTs = duration.startTimestamp || duration.startTimestampMs || null;
  const endTs = duration.endTimestamp || duration.endTimestampMs || null;

  let durationMinutes = null;
  if (startTs && endTs) {
    const diffMs = new Date(endTs).getTime() - new Date(startTs).getTime();
    if (diffMs > 0) {
      durationMinutes = +(diffMs / 60000).toFixed(1);
    }
  }

  // Attempt to build a LineString from waypointPath
  const wp = seg.waypointPath;
  let coordinates = null;
  let lastCoord = null;

  if (wp && Array.isArray(wp.waypoints) && wp.waypoints.length >= 2) {
    const raw = wp.waypoints;
    const coords = [];

    for (let i = 0, len = raw.length; i < len; i++) {
      const pt = raw[i];
      const lat = convertE7(pt.latE7);
      const lng = convertE7(pt.lngE7);
      if (lat == null || lng == null) continue;
      const c = [capPrecision(lng), capPrecision(lat)];

      // Dedup consecutive points within 15m
      if (coords.length > 0) {
        if (haversineKm(coords[coords.length - 1], c) < DEDUP_THRESHOLD_KM) {
          continue;
        }
      } else if (prevCoord) {
        // First point: compare with the global previous coord
        if (haversineKm(prevCoord, c) < DEDUP_THRESHOLD_KM) {
          continue;
        }
      }

      coords.push(c);
    }

    if (coords.length >= 2) {
      coordinates = coords;
      lastCoord = coords[coords.length - 1];
    }
  }

  // Fallback: try to build a 2-point line from startLocation → endLocation
  if (!coordinates) {
    const startLoc = seg.startLocation;
    const endLoc = seg.endLocation;
    if (startLoc && endLoc) {
      const sLat = convertE7(startLoc.latitudeE7);
      const sLng = convertE7(startLoc.longitudeE7);
      const eLat = convertE7(endLoc.latitudeE7);
      const eLng = convertE7(endLoc.longitudeE7);

      if (sLat != null && sLng != null && eLat != null && eLng != null) {
        const startCoord = [capPrecision(sLng), capPrecision(sLat)];
        const endCoord = [capPrecision(eLng), capPrecision(eLat)];

        // Only create if the two points are far enough apart
        if (haversineKm(startCoord, endCoord) >= DEDUP_THRESHOLD_KM) {
          coordinates = [startCoord, endCoord];
          lastCoord = endCoord;
        }
      }
    }
  }

  if (!coordinates) {
    // No geometry to create, but still count distance + mode
    return { feature: null, distance, activityType, lastCoord: null };
  }

  const feature = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates,
    },
    properties: {
      _type: "activitySegment",
      activityType,
      distanceMeters: distance,
      distanceKm: distance > 0 ? +(distance / 1000).toFixed(2) : null,
      startTimestamp: startTs,
      endTimestamp: endTs,
      durationMinutes,
      waypointCount: coordinates.length,
    },
  };

  return { feature, distance, activityType, lastCoord };
}

// ─────────────────────────────────────────────────────────────────────────────
// New Google Timeline.json Parser  (semanticSegments)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the modern Google Timeline.json export (2024+ device-based export).
 * Top-level key is `semanticSegments`, each containing one of:
 *   - `visit`        → Point feature (place stayed at)
 *   - `activity`     → LineString from start→end
 *   - `timelinePath` → LineString from array of waypoints
 *
 * Coordinates are string-formatted: "lat°, lng°" (e.g. "49.3817572°, 8.5769077°")
 *
 * @param {{ semanticSegments: Array }} data
 * @returns {{ geojson: object, stats: object }}
 */
function parseTimelineJson(data) {
  const segments = data.semanticSegments;
  if (!Array.isArray(segments)) {
    throw new Error("semanticSegments is not an array");
  }

  const features = [];

  // Accumulators for stats
  let totalPlacesVisited = 0;
  let totalDistanceTraveled = 0; // meters
  const travelModeCounts = new Map();
  const placeNames = new Set();
  let prevCoord = null;

  for (let i = 0, len = segments.length; i < len; i++) {
    const seg = segments[i];
    const startTime = seg.startTime || null;
    const endTime = seg.endTime || null;

    // ── Visit segment ──────────────────────────────────────────
    if (seg.visit) {
      const visit = seg.visit;
      const candidate = visit.topCandidate;
      if (!candidate) continue;

      const coord = parseLatLngString(candidate.placeLocation);
      if (!coord) continue;

      // Dedup: skip if within 15m of previous point
      if (prevCoord && haversineKm(prevCoord, coord) < DEDUP_THRESHOLD_KM) {
        continue;
      }

      let durationMinutes = null;
      if (startTime && endTime) {
        const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
        if (diffMs > 0) durationMinutes = +(diffMs / 60000).toFixed(1);
      }

      const name = candidate.placeID || null;
      const semanticType = candidate.semanticType || null;

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: coord },
        properties: {
          _type: "placeVisit",
          name: semanticType || name,
          placeId: candidate.placeID || null,
          probability: candidate.probability ? parseFloat(candidate.probability) : null,
          semanticType,
          arrivalTimestamp: startTime,
          departureTimestamp: endTime,
          durationMinutes,
        },
      });

      totalPlacesVisited++;
      prevCoord = coord;
      if (semanticType) placeNames.add(semanticType);

    // ── Activity segment ───────────────────────────────────────
    } else if (seg.activity) {
      const act = seg.activity;
      const startCoord = parseLatLngString(act.start);
      const endCoord = parseLatLngString(act.end);
      const activityType = act.topCandidate?.type || null;
      const distance = act.distanceMeters
        ? parseFloat(act.distanceMeters)
        : 0;

      let durationMinutes = null;
      if (startTime && endTime) {
        const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
        if (diffMs > 0) durationMinutes = +(diffMs / 60000).toFixed(1);
      }

      if (startCoord && endCoord && haversineKm(startCoord, endCoord) >= DEDUP_THRESHOLD_KM) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [startCoord, endCoord] },
          properties: {
            _type: "activitySegment",
            activityType,
            distanceMeters: distance,
            distanceKm: distance > 0 ? +(distance / 1000).toFixed(2) : null,
            probability: act.topCandidate?.probability
              ? parseFloat(act.topCandidate.probability)
              : null,
            startTimestamp: startTime,
            endTimestamp: endTime,
            durationMinutes,
            waypointCount: 2,
          },
        });
        prevCoord = endCoord;
      }

      if (distance > 0) totalDistanceTraveled += distance;
      if (activityType) {
        travelModeCounts.set(
          activityType,
          (travelModeCounts.get(activityType) || 0) + 1
        );
      }

    // ── TimelinePath segment ───────────────────────────────────
    } else if (seg.timelinePath) {
      const pathPoints = seg.timelinePath;
      if (!Array.isArray(pathPoints) || pathPoints.length < 2) continue;

      const coords = [];
      for (let j = 0; j < pathPoints.length; j++) {
        const pt = pathPoints[j];
        const c = parseLatLngString(pt.point);
        if (!c) continue;

        // Dedup consecutive within 15m
        if (coords.length > 0) {
          if (haversineKm(coords[coords.length - 1], c) < DEDUP_THRESHOLD_KM) {
            continue;
          }
        } else if (prevCoord) {
          if (haversineKm(prevCoord, c) < DEDUP_THRESHOLD_KM) {
            continue;
          }
        }
        coords.push(c);
      }

      if (coords.length >= 2) {
        // Calculate path distance
        let pathDist = 0;
        for (let j = 1; j < coords.length; j++) {
          pathDist += haversineKm(coords[j - 1], coords[j]);
        }

        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {
            _type: "activitySegment",
            activityType: "TIMELINE_PATH",
            distanceMeters: +(pathDist * 1000).toFixed(0),
            distanceKm: +pathDist.toFixed(2),
            startTimestamp: startTime,
            endTimestamp: endTime,
            waypointCount: coords.length,
          },
        });

        totalDistanceTraveled += pathDist * 1000;
        prevCoord = coords[coords.length - 1];
      }
    }
  }

  // Build sorted travel modes
  const topTravelModes = [...travelModeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([mode, count]) => ({ mode, count }));

  const geojson = { type: "FeatureCollection", features };

  const stats = {
    totalPlacesVisited,
    totalDistanceTraveled, // meters
    totalDistanceTraveledKm: +(totalDistanceTraveled / 1000).toFixed(2),
    uniqueCities: [...placeNames],
    uniqueCitiesCount: placeNames.size,
    topTravelModes,
    totalFeatures: features.length,
    totalActivitySegments: features.filter(
      (f) => f.properties._type === "activitySegment"
    ).length,
  };

  return { geojson, stats };
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Records.json Parser (backward compat)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse Google Location History Records.json (locations array).
 * Preserved for backward compatibility with the older export format.
 */
function parseGoogleRecordsJson(data) {
  const features = [];

  if (data.locations) {
    for (const loc of data.locations) {
      const lat = loc.latitudeE7
        ? loc.latitudeE7 / E7_DIVISOR
        : loc.latitude || loc.lat;
      const lng = loc.longitudeE7
        ? loc.longitudeE7 / E7_DIVISOR
        : loc.longitude || loc.lng || loc.lon;
      if (lat && lng) {
        features.push({
          type: "Feature",
          properties: {
            timestamp: loc.timestamp || loc.timestampMs,
          },
          geometry: {
            type: "Point",
            coordinates: [capPrecision(lng), capPrecision(lat)],
          },
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats Calculator (generic, for non-Semantic formats)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate travel statistics from a generic GeoJSON FeatureCollection.
 * Used for GPX / KML / plain GeoJSON / Records.json.
 */
export function calculateStats(geojson) {
  if (!geojson || !geojson.features || geojson.features.length === 0) {
    return null;
  }

  const points = [];
  const lineCoords = [];
  let timestamps = [];

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;

    if (geom.type === "Point") {
      points.push(geom.coordinates);
      if (feature.properties?.timestamp || feature.properties?.time) {
        timestamps.push(
          new Date(feature.properties.timestamp || feature.properties.time)
        );
      }
    } else if (geom.type === "LineString") {
      lineCoords.push(...geom.coordinates);
      if (feature.properties?.coordTimes) {
        timestamps.push(
          ...feature.properties.coordTimes.map((t) => new Date(t))
        );
      }
    } else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates) {
        lineCoords.push(...line);
      }
    } else if (geom.type === "Polygon") {
      lineCoords.push(...geom.coordinates[0]);
    }
  }

  const allCoords = [...points, ...lineCoords];

  if (allCoords.length === 0) {
    return null;
  }

  // Calculate bounding box
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  let totalElevationGain = 0;
  let maxElevation = -Infinity;
  let minElevation = Infinity;

  for (const coord of allCoords) {
    const [lng, lat, ele] = coord;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    if (ele !== undefined) {
      maxElevation = Math.max(maxElevation, ele);
      minElevation = Math.min(minElevation, ele);
    }
  }

  // Calculate total distance using Haversine formula
  const pathCoords = lineCoords.length > 0 ? lineCoords : allCoords;
  let totalDistance = 0;
  for (let i = 1; i < pathCoords.length; i++) {
    totalDistance += haversineKm(pathCoords[i - 1], pathCoords[i]);
  }

  // Elevation gain
  for (let i = 1; i < pathCoords.length; i++) {
    if (pathCoords[i][2] !== undefined && pathCoords[i - 1][2] !== undefined) {
      const diff = pathCoords[i][2] - pathCoords[i - 1][2];
      if (diff > 0) totalElevationGain += diff;
    }
  }

  // Time range
  timestamps = timestamps.filter((t) => !isNaN(t.getTime()));
  timestamps.sort((a, b) => a - b);
  const duration =
    timestamps.length >= 2
      ? timestamps[timestamps.length - 1] - timestamps[0]
      : null;

  // Unique countries/regions approximation based on coordinate spread
  const center = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];

  return {
    totalPoints: allCoords.length,
    totalFeatures: geojson.features.length,
    totalDistance,
    totalElevationGain: totalElevationGain > 0 ? totalElevationGain : null,
    maxElevation: maxElevation !== -Infinity ? maxElevation : null,
    minElevation: minElevation !== Infinity ? minElevation : null,
    bounds: [
      [minLat, minLng],
      [maxLat, maxLng],
    ],
    center,
    duration,
    startTime: timestamps.length > 0 ? timestamps[0] : null,
    endTime:
      timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
    avgSpeed:
      duration && totalDistance
        ? totalDistance / (duration / 1000 / 3600)
        : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a Google Timeline string coordinate like "49.3817572°, 8.5769077°"
 * into a GeoJSON-ordered [lng, lat] array.
 * Also handles "geo:lat,lng" format and plain "lat, lng" without degree signs.
 *
 * @param {string} str
 * @returns {number[]|null} [lng, lat] or null
 */
function parseLatLngString(str) {
  if (!str || typeof str !== "string") return null;

  let cleaned = str.trim();

  // Handle "geo:lat,lng" prefix
  if (cleaned.startsWith("geo:")) {
    cleaned = cleaned.slice(4);
  }

  // Remove degree symbols and whitespace, split on comma
  const parts = cleaned.replace(/°/g, "").split(",").map((s) => s.trim());
  if (parts.length < 2) return null;

  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);

  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return [capPrecision(lng), capPrecision(lat)];
}

/**
 * Convert a latitudeE7 / longitudeE7 integer to a standard float.
 * Returns null if the input is falsy or not a number.
 */
function convertE7(value) {
  if (value == null || typeof value !== "number") return null;
  return value / E7_DIVISOR;
}

/**
 * Cap a floating-point coordinate to exactly `COORD_PRECISION` decimal places.
 * Uses a multiplication trick to avoid toFixed string round-trip overhead.
 */
function capPrecision(value) {
  // 1e6 for 6 decimals
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Haversine formula: distance between two [lng, lat] coords in km.
 * Optimised to avoid object destructuring overhead in hot loops.
 */
function haversineKm(a, b) {
  const lat1 = a[1] * DEG_TO_RAD;
  const lat2 = b[1] * DEG_TO_RAD;
  const dLat = (b[1] - a[1]) * DEG_TO_RAD;
  const dLng = (b[0] - a[0]) * DEG_TO_RAD;
  const sinHalfDLat = Math.sin(dLat * 0.5);
  const sinHalfDLng = Math.sin(dLng * 0.5);
  const h =
    sinHalfDLat * sinHalfDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfDLng * sinHalfDLng;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
}
