import { gpx, kml } from "@tmcw/togeojson";
import { createJourney, selectHistory, timestamp, validCoordinate } from "./journey.js";

const feature = (geometry, properties) => ({ type: "Feature", geometry, properties });
const point = (coordinate) => coordinate ? { type: "Point", coordinates: coordinate } : null;

function latLng(input) {
  if (input && typeof input === "object") input = input.latLng ?? input.latlng ?? input.location;
  if (typeof input !== "string") return null;
  const values = input.replace(/^geo:/, "").replace(/°/g, "").split(",").map(Number);
  const c = [values[1], values[0]];
  return validCoordinate(c) ? c : null;
}
function e7(location, latKey = "latitudeE7", lngKey = "longitudeE7") {
  if (location?.[latKey] == null || location?.[lngKey] == null) return null;
  const c = [Number(location[lngKey]) / 1e7, Number(location[latKey]) / 1e7];
  return validCoordinate(c) ? c : null;
}
function duration(start, end) {
  const a = timestamp(start), b = timestamp(end);
  return a != null && b != null && b >= a ? (b - a) / 60000 : null;
}
function line(coordinates) {
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : point(coordinates[0]);
}

function modernTimeline(segments) {
  if (!Array.isArray(segments)) throw new Error("semanticSegments must be an array.");
  const features = [];
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue;
    const startTimestamp = seg.startTime, endTimestamp = seg.endTime;
    if (seg.visit?.topCandidate) {
      const candidate = seg.visit.topCandidate;
      const coordinate = latLng(candidate.placeLocation);
      if (coordinate) features.push(feature(point(coordinate), {
        _type: "placeVisit", name: candidate.name || candidate.semanticType || "Visited place",
        placeId: candidate.placeID || candidate.placeId, semanticType: candidate.semanticType,
        arrivalTimestamp: startTimestamp, departureTimestamp: endTimestamp,
        durationMinutes: duration(startTimestamp, endTimestamp),
      }));
    }
    if (seg.activity) {
      const act = seg.activity;
      // Preserve metadata without inventing a straight-line route between endpoints.
      features.push(feature(null, {
        _type: "activitySegment", activityType: act.topCandidate?.type?.toUpperCase(),
        distanceMeters: act.distanceMeters == null ? null : Number(act.distanceMeters),
        startTimestamp, endTimestamp, durationMinutes: duration(startTimestamp, endTimestamp),
      }));
    }
    // Some exports put a path alongside an activity; process both independently.
    if (Array.isArray(seg.timelinePath) && seg.timelinePath.length) {
      const coordinates = seg.timelinePath.map((p) => latLng(p.point) || [NaN, NaN]);
      const coordTimes = seg.timelinePath.map((p) => {
        if (p.time) return p.time;
        const start = timestamp(startTimestamp);
        return start != null && p.durationMinutesOffsetFromStartTime != null
          ? start + Number(p.durationMinutesOffsetFromStartTime) * 60000 : null;
      });
      features.push(feature(line(coordinates), {
        _type: "timelinePath", activityType: "TIMELINE_PATH", startTimestamp, endTimestamp, coordTimes,
      }));
    }
  }
  return features;
}

function legacyTimeline(objects) {
  if (!Array.isArray(objects)) throw new Error("timelineObjects must be an array.");
  const features = [];
  for (const obj of objects) {
    if (obj?.placeVisit) {
      const visit = obj.placeVisit, loc = visit.location;
      const coordinate = e7(loc);
      const start = visit.duration?.startTimestamp ?? visit.duration?.startTimestampMs;
      const end = visit.duration?.endTimestamp ?? visit.duration?.endTimestampMs;
      if (coordinate) features.push(feature(point(coordinate), {
        _type: "placeVisit", name: loc.name || "Visited place", placeId: loc.placeId, address: loc.address,
        arrivalTimestamp: start, departureTimestamp: end, durationMinutes: duration(start, end),
      }));
    }
    if (obj?.activitySegment) {
      const act = obj.activitySegment;
      const startTimestamp = act.duration?.startTimestamp ?? act.duration?.startTimestampMs;
      const endTimestamp = act.duration?.endTimestamp ?? act.duration?.endTimestampMs;
      const props = {
        _type: "activitySegment", activityType: act.activityType,
        distanceMeters: act.distance ?? null, startTimestamp, endTimestamp,
        durationMinutes: duration(startTimestamp, endTimestamp),
      };
      const raw = act.simplifiedRawPath?.points || act.waypointPath?.waypoints;
      // Store reported activity separately so date filtering can retain its timing.
      features.push(feature(null, props));
      if (raw?.length >= 2) features.push(feature(line(raw.map((p) =>
        e7(p) || e7(p, "latE7", "lngE7") || [NaN, NaN])), {
        _type: "timelinePath", startTimestamp, endTimestamp,
        coordTimes: raw.map((p) => p.timestamp ?? p.timestampMs ?? null),
      }));
    }
  }
  return features;
}

function googleRecords(locations) {
  if (!Array.isArray(locations)) throw new Error("locations must be an array.");
  // Isolated observations are not continuous tracks. Never invent distance
  // between them or infer a route through a recording gap.
  return locations.flatMap((loc) => {
    const c = e7(loc) || [Number(loc.longitude ?? loc.lng ?? loc.lon), Number(loc.latitude ?? loc.lat)];
    return validCoordinate(c) ? [feature(point(c), { timestamp: loc.timestamp ?? loc.timestampMs })] : [];
  });
}

export function parseFile(fileName, content) {
  const ext = fileName.toLowerCase().split(".").pop();
  let geojson;
  if (ext === "json" || ext === "geojson") {
    let data;
    try { data = JSON.parse(content); } catch { throw new Error("This file is not valid JSON. Please choose a fresh export."); }
    if (!data || typeof data !== "object") throw new Error("No location data found in this JSON file.");
    if (data.type === "FeatureCollection" && Array.isArray(data.features)) geojson = data;
    else if (data.type === "Feature") geojson = { type: "FeatureCollection", features: [data] };
    else {
      let features;
      if (data.semanticSegments) features = modernTimeline(data.semanticSegments);
      else if (data.timelineObjects) features = legacyTimeline(data.timelineObjects);
      else if (data.locations) features = googleRecords(data.locations);
      else throw new Error("Unrecognized JSON format. Choose GeoJSON or a Google Timeline export.");
      geojson = { type: "FeatureCollection", features };
    }
  } else if (ext === "gpx" || ext === "kml") {
    const doc = new DOMParser().parseFromString(content, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error(`This ${ext.toUpperCase()} file contains invalid XML.`);
    geojson = ext === "gpx" ? gpx(doc) : kml(doc);
  } else throw new Error("Please choose a .gpx, .kml, .geojson, or .json file.");
  const journey = createJourney(geojson);
  if (!journey.records.length) throw new Error("No usable location records found in this file.");
  const snapshot = selectHistory(journey);
  return { ...snapshot, journey };
}

export function calculateStats(geojson) {
  return selectHistory(createJourney(geojson)).stats;
}

export async function parseFileAsync(file) {
  return parseFile(file.name, await file.text());
}
