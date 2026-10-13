import test from "node:test";
import assert from "node:assert/strict";
import { createJourney, selectHistory, distanceKm, timestamp, dayBounds, localDay, timelineBins, advancePlayback } from "../app/utils/journey.js";
import { parseFile } from "../app/utils/fileParser.js";

const time = (s) => Date.parse(`2025-06-${s}+05:30`);
const fc = (...features) => ({ type: "FeatureCollection", features });
const f = (geometry, properties = {}) => ({ type: "Feature", geometry, properties });
const line = (coordinates, properties = {}) => f({ type: "LineString", coordinates }, properties);
const visit = (coordinates, id, start, end = start) => f({ type: "Point", coordinates }, { _type: "placeVisit", placeId: id, arrivalTimestamp: start, departureTimestamp: end });
const activity = (start, end, meters) => f(null, { _type: "activitySegment", startTimestamp: start, endTimestamp: end, distanceMeters: meters, activityType: "WALKING" });
const stats = (...features) => selectHistory(createJourney(fc(...features))).stats;

test("separate routes never gain phantom connecting distance or elevation", () => {
  const a = [[0, 0, 0], [.01, 0, 10]], b = [[80, 30, 1000], [80.01, 30, 1010]];
  const result = stats(line(a), line(b));
  assert.ok(Math.abs(result.totalDistance - distanceKm(...a) - distanceKm(...b)) < 1e-9);
  assert.equal(result.totalElevationGain, 20);
  assert.equal(result.avgSpeed, null);
});
test("places use IDs, retain repeated visits and ignore semantic labels", () => {
  const result = stats(visit([77, 12], "A", time("01T08:00:00")), visit([77, 12], "A", time("02T08:00:00")), visit([78, 13], "B", time("03T08:00:00")));
  assert.equal(result.totalPlacesVisited, 3); assert.equal(result.uniquePlacesCount, 2);
});
test("exact coordinates are a conservative fallback for missing place IDs", () => {
  assert.equal(stats(visit([0, 0], null, null), visit([0, 0], null, null), visit([.1, 0], null, null)).uniquePlacesCount, 2);
});
test("numeric millisecond strings and zero coordinates are preserved", () => {
  assert.equal(timestamp("1748764800000"), 1748764800000);
  const result = parseFile("records.json", JSON.stringify({ locations: [{ latitudeE7: 0, longitudeE7: 0, timestampMs: "1748764800000" }] }));
  assert.equal(result.journey.records.length, 1); assert.deepEqual(result.geojson.features[0].geometry.coordinates, [0, 0]);
  assert.equal(result.stats.totalDistance, null);
});
test("unrelated point observations do not imply a continuous route", () => {
  assert.equal(stats(f({ type: "Point", coordinates: [0, 0] }), f({ type: "Point", coordinates: [90, 45] })).totalDistance, null);
});
test("timed playback reveals only observed coordinates, forwards and backwards", () => {
  const times = [0, 600000, 1200000], coords = [[0, 0], [.01, 0], [.02, 0]];
  const journey = createJourney(fc(line(coords, { coordTimes: times })));
  const midway = selectHistory(journey, 0, 600000);
  assert.equal(midway.geojson.features[0].geometry.coordinates.length, 2);
  assert.ok(Math.abs(midway.stats.totalDistance - distanceKm(coords[0], coords[1])) < 1e-9);
  assert.equal(selectHistory(journey, 0, 0).geojson.features[0].geometry.type, "Point");
  assert.equal(selectHistory(journey, 0, 0).stats.totalDistance, 0);
  assert.equal(selectHistory(journey, 0, 1200000).stats.totalPoints, 3);
});
test("undated data stays out of filtered history", () => {
  const journey = createJourney(fc(visit([0, 0], "A", 1000), visit([1, 1], "B", null)));
  assert.equal(journey.undated, 1);
  assert.equal(selectHistory(journey, 0, 2000, false).stats.totalPlacesVisited, 1);
  assert.equal(selectHistory(journey).stats.totalPlacesVisited, 2);
});
test("a route with only segment timestamps waits until its end", () => {
  const journey = createJourney(fc(line([[0, 0], [.01, 0]], { startTimestamp: 1000, endTimestamp: 5000 })));
  assert.equal(selectHistory(journey, 0, 3000).geojson.features.length, 0);
  assert.equal(selectHistory(journey, 0, 3000).deferredRoutes, 1);
  assert.equal(selectHistory(journey, 0, 5000).geojson.features.length, 1);
  assert.equal(selectHistory(journey, 2000, 5000).stats.totalDistance, null);
});
test("travel duration excludes overnight gaps and unions overlapping intervals", () => {
  const result = stats(activity(time("01T08:00:00"), time("01T09:00:00"), 1000), activity(time("01T08:30:00"), time("01T09:30:00"), 1000), activity(time("02T08:00:00"), time("02T09:00:00"), 1000));
  assert.equal(result.travelDuration, 2.5 * 3600000);
  assert.equal(result.totalActivitySegments, 3);
});
test("partial activity distance is unknown rather than prorated", () => {
  const journey = createJourney(fc(activity(1000, 5000, 1000)));
  const partial = selectHistory(journey, 0, 3000);
  assert.equal(partial.stats.totalDistance, null);
  assert.equal(partial.stats.avgSpeed, null);
  assert.equal(selectHistory(journey, 0, 5000).stats.totalDistance, 1);
});
test("reported activity and overlapping path distance are never added together", () => {
  const journey = createJourney(fc(activity(0, 1200000, 5000), line([[0, 0], [.01, 0]], { coordTimes: [0, 1200000] })));
  const result = selectHistory(journey).stats;
  assert.ok(result.totalDistance < 2); assert.equal(result.overlappingActivities, 1); assert.equal(result.avgSpeed, null);
});
test("timed recording gaps split routes and exclude the jump", () => {
  const journey = createJourney(fc(line([[0, 0], [.01, 0], [90, 45], [90.01, 45]], { coordTimes: [0, 600000, 7200000, 7800000] })));
  const result = selectHistory(journey).stats;
  assert.equal(journey.gaps, 1); assert.equal(result.totalRoutes, 2); assert.ok(result.totalDistance < 3);
  assert.equal(result.travelDuration, 1200000);
});
test("invalid route coordinates break the path rather than bridge across them", () => {
  const journey = createJourney(fc(line([[0, 0], [.01, 0], [999, 90], [80, 30], [80.01, 30]])));
  assert.equal(journey.skipped, 1); assert.equal(selectHistory(journey).stats.totalRoutes, 2);
});
test("MultiLineString timing stays aligned to independent paths", () => {
  const journey = createJourney(fc(f({ type: "MultiLineString", coordinates: [[[0, 0], [.01, 0]], [[80, 30], [80.01, 30]]] }, { coordTimes: [[0, 600000], [1200000, 1800000]] })));
  assert.equal(journey.records.length, 2);
  assert.equal(selectHistory(journey, 0, 600000).stats.totalRoutes, 1);
});
test("modern exports preserve activity metadata, path timestamps, and visits at route endpoints", () => {
  const result = parseFile("timeline.json", JSON.stringify({ semanticSegments: [
    { startTime: "2025-06-01T08:00:00+05:30", endTime: "2025-06-01T08:20:00+05:30", activity: { distanceMeters: 1000, topCandidate: { type: "walking" } }, timelinePath: [{ point: "12°, 77°", durationMinutesOffsetFromStartTime: "0" }, { point: "12.01°, 77.01°", durationMinutesOffsetFromStartTime: "20" }] },
    { startTime: "2025-06-01T08:20:00+05:30", endTime: "2025-06-01T09:00:00+05:30", visit: { topCandidate: { placeLocation: "geo:12.01,77.01", placeID: "A", semanticType: "HOME" } } },
  ] }));
  assert.equal(result.journey.records.length, 3); assert.equal(result.stats.totalPlacesVisited, 1); assert.equal(result.stats.totalActivitySegments, 1);
  assert.equal(result.journey.records.find((r) => r.kind === "route").times.length, 2);
});
test("legacy reports with no path still have filterable activity statistics", () => {
  const result = parseFile("legacy.json", JSON.stringify({ timelineObjects: [{ activitySegment: { activityType: "WALKING", distance: 300, duration: { startTimestampMs: "1000", endTimestampMs: "5000" } } }] }));
  assert.equal(result.stats.totalDistance, .3); assert.equal(result.journey.min, 1000); assert.equal(result.geojson.features.length, 0);
});
test("calendar days honor the current timezone rather than slicing UTC strings", () => {
  const beforeMidnight = new Date(2025, 5, 1, 23, 59).getTime();
  assert.equal(localDay(beforeMidnight), "2025-06-01");
  const [a, b] = dayBounds("2025-06-01");
  assert.ok(beforeMidnight >= a && beforeMidnight <= b);
  assert.equal(localDay(b + 1), "2025-06-02");
});
test("empty ranges have zero visits and unavailable distance", () => {
  const journey = createJourney(fc(visit([0, 0], "A", 1000)));
  const result = selectHistory(journey, 5000, 10000, false);
  assert.equal(result.stats.visibleRecords, 0); assert.equal(result.stats.totalDistance, null);
});
test("density bins reflect elapsed time and playback optionally skips gaps", () => {
  const journey = createJourney(fc(visit([0, 0], "A", 0), visit([1, 1], "B", 10000)));
  assert.deepEqual(timelineBins(journey, 0, 10000, 5), [1, 0, 0, 0, 1]);
  assert.equal(advancePlayback(0, 100, 10000, journey.intervals, false), 100);
  assert.equal(advancePlayback(0, 100, 10000, journey.intervals, true), 10000);
});
test("polygon boundaries are not counted as travelled distance", () => {
  const result = stats(f({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }));
  assert.equal(result.totalDistance, null); assert.equal(result.totalRoutes, 0);
});

test("current GPX/KML converter coordinateProperties.times enables progressive playback", () => {
  const journey = createJourney(fc(line([[0, 0], [.01, 0], [.02, 0]], {
    time: "2025-06-01T08:00:00Z",
    coordinateProperties: { times: ["2025-06-01T08:00:00Z", "2025-06-01T08:10:00Z", "2025-06-01T08:20:00Z"] },
  })));
  assert.equal(journey.max - journey.min, 1200000);
  assert.equal(selectHistory(journey, journey.min, journey.min + 600000).stats.totalPoints, 2);
});
test("a visit ending at midnight does not become a visit on the following day", () => {
  const midnight = dayBounds("2025-06-02")[0];
  const journey = createJourney(fc(visit([0, 0], "A", midnight - 3600000, midnight)));
  assert.equal(selectHistory(journey, midnight, midnight + 3600000, false).stats.totalPlacesVisited, 0);
  assert.deepEqual(journey.days.map((d) => d.date), ["2025-06-01"]);
});
test("the popup duration follows the revealed part of a visit", () => {
  const journey = createJourney(fc(visit([0, 0], "A", 0, 3600000)));
  const snapshot = selectHistory(journey, 600000, 1200000);
  assert.equal(snapshot.geojson.features[0].properties.durationMinutes, 10);
});

test("overlap detection continues past a route ending at the activity's start", () => {
  const journey = createJourney(fc(
    line([[0, 0], [.01, 0]], {coordTimes: [0, 1000]}),
    line([[0, 1], [.01, 1]], {coordTimes: [1500, 2000]}),
    activity(1000, 2000, 5000),
  ));
  assert.equal(selectHistory(journey).stats.overlappingActivities, 1);
  assert.ok(selectHistory(journey).stats.totalDistance < 3);
});

test("activity density includes timed route observations rather than only the route start", () => {
  const j = createJourney(fc(line([[0,0],[.01,0],[.02,0]],{coordTimes:[0,500,1000]})));
  assert.deepEqual(timelineBins(j,0,1000,3),[1,1,1]);
});
test("reusing complete features never mutates the original or a prior snapshot", () => {
  const j = createJourney(fc(visit([0,0],"A",0,3600000)));
  const full = selectHistory(j);
  const partial = selectHistory(j,0,600000);
  assert.equal(full.geojson.features[0].properties.durationMinutes,60);
  assert.equal(partial.geojson.features[0].properties.durationMinutes,10);
  assert.equal(j.records[0].feature.properties.durationMinutes,60);
});

test("gap skipping finishes immediately when only empty trailing time remains", () => {
  assert.equal(advancePlayback(6000,100,10000,[[0,5000]],true),10000);
  assert.equal(advancePlayback(6000,100,10000,[[0,5000]],false),6100);
});
