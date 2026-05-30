import { gpx, kml } from "@tmcw/togeojson";

/**
 * Parse uploaded file content into GeoJSON.
 * Supports: .gpx, .kml, .geojson, .json
 */
export function parseFile(fileName, fileContent) {
  const ext = fileName.toLowerCase().split(".").pop();

  if (ext === "geojson" || ext === "json") {
    try {
      const data = JSON.parse(fileContent);
      if (data.type === "FeatureCollection" || data.type === "Feature") {
        return data.type === "Feature"
          ? { type: "FeatureCollection", features: [data] }
          : data;
      }
      // Try Google Takeout Location History (Records.json / Semantic Location History)
      if (data.locations || data.timelineObjects) {
        return parseGoogleLocationHistory(data);
      }
      throw new Error("Unrecognized JSON format");
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${e.message}`);
    }
  }

  if (ext === "gpx" || ext === "kml") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(fileContent, "text/xml");
      const result = ext === "gpx" ? gpx(doc) : kml(doc);
      return result;
    } catch (e) {
      throw new Error(`Failed to parse ${ext.toUpperCase()}: ${e.message}`);
    }
  }

  throw new Error(
    `Unsupported file type: .${ext}. Please upload .gpx, .kml, .geojson, or .json`
  );
}

/**
 * Parse Google Location History (Records.json format)
 */
function parseGoogleLocationHistory(data) {
  const features = [];

  if (data.locations) {
    for (const loc of data.locations) {
      const lat = loc.latitudeE7
        ? loc.latitudeE7 / 1e7
        : loc.latitude || loc.lat;
      const lng = loc.longitudeE7
        ? loc.longitudeE7 / 1e7
        : loc.longitude || loc.lng || loc.lon;
      if (lat && lng) {
        features.push({
          type: "Feature",
          properties: {
            timestamp: loc.timestamp || loc.timestampMs,
          },
          geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}

/**
 * Calculate travel statistics from GeoJSON data
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
    totalDistance += haversine(pathCoords[i - 1], pathCoords[i]);
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
    totalDistance: totalDistance,
    totalElevationGain:
      totalElevationGain > 0 ? totalElevationGain : null,
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

/**
 * Haversine formula: distance between two [lng, lat] coords in km
 */
function haversine([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
