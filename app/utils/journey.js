// All history processing is local. Times are epoch milliseconds; calendar controls
// use the browser's timezone explicitly. Unknown times are never invented.
export const MAX_TRACK_GAP = 30 * 60 * 1000;
export const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] };

export function timestamp(value) {
  if (value == null || value === "") return null;
  const time = typeof value === "number" || /^\d+$/.test(value)
    ? Number(value) : Date.parse(value);
  return Number.isFinite(time) && Math.abs(time) <= 8.64e15 ? time : null;
}

export function validCoordinate(c) {
  return Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
    Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
}

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function localDay(time) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dayBounds(day) {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1); // Calendar arithmetic also handles daylight-saving days.
  return [start.getTime(), end.getTime() - 1];
}

function mergeIntervals(intervals) {
  const merged = [];
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue;
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function routeMetrics(coords, times) {
  const distances = [0], gains = [0];
  for (let i = 1; i < coords.length; i++) {
    distances.push(distances[i - 1] + distanceKm(coords[i - 1], coords[i]));
    const gain = Number.isFinite(coords[i][2]) && Number.isFinite(coords[i - 1][2])
      ? Math.max(0, coords[i][2] - coords[i - 1][2]) : 0;
    gains.push(gains[i - 1] + gain);
  }
  return { distances, gains, times };
}

// Split invalid geometry and gaps instead of connecting unrelated observations.
export function createJourney(geojson) {
  const records = [];
  let skipped = 0, gaps = 0;
  const add = (geometry, properties, extra = {}) => {
    const start = timestamp(properties.arrivalTimestamp ?? properties.startTimestamp ?? properties.timestamp ?? properties.time);
    const rawEnd = timestamp(properties.departureTimestamp ?? properties.endTimestamp);
    const end = rawEnd != null && start != null && rawEnd >= start ? rawEnd : start;
    const record = {
      id: records.length, geometry, properties, start, end,
      kind: geometry?.type === "LineString" ? "route" : properties._type === "placeVisit" ? "visit" : geometry ? "point" : "activity",
      ...extra,
    };
    record.feature = { type: "Feature", geometry, properties: { ...properties, _recordId: record.id,
      ...(record.kind === "point" && record.start != null ? { arrivalTimestamp: new Date(record.start).toISOString() } : {}),
      ...(record.kind === "visit" && record.start != null ? { durationMinutes: (record.end - record.start) / 60000 } : {}),
    } };
    records.push(record);
  };
  const addGeometry = (geometry, properties) => {
    if (!properties.coordTimes && properties.coordinateProperties?.times) {
      properties = { ...properties, coordTimes: properties.coordinateProperties.times };
    }
    if (!geometry) {
      if (properties._type === "activitySegment") add(null, properties);
      else skipped++;
      return;
    }
    if (geometry.type === "Point") {
      if (validCoordinate(geometry.coordinates)) add(geometry, properties);
      else skipped++;
      return;
    }
    if (geometry.type === "MultiPoint") {
      geometry.coordinates.forEach((c) => addGeometry({ type: "Point", coordinates: c }, properties));
      return;
    }
    if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach((g) => addGeometry(g, properties));
      return;
    }
    if (geometry.type === "MultiLineString") {
      geometry.coordinates.forEach((coords, i) => addGeometry({ type: "LineString", coordinates: coords }, {
        ...properties, coordinateProperties: undefined, coordTimes: properties.coordTimes?.[i],
      }));
      return;
    }
    if (geometry.type !== "LineString") {
      // Areas are context, not journeys; never count polygon perimeters as travel.
      if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") add(geometry, properties, { kind: "area" });
      else skipped++;
      return;
    }
    const input = geometry.coordinates || [];
    const parsedTimes = input.map((_, i) => timestamp(properties.coordTimes?.[i]));
    const hasTimes = parsedTimes.length > 0 && parsedTimes.every((t) => t !== null);
    let coords = [], times = [];
    const flush = () => {
      if (coords.length >= 2) {
        const timing = hasTimes ? { start: times[0], end: times.at(-1) } : {};
        add({ type: "LineString", coordinates: coords }, properties, {
          ...routeMetrics(coords, hasTimes ? times : null), ...timing,
        });
      } else if (coords.length === 1) {
        add({ type: "Point", coordinates: coords[0] }, properties, {
          kind: "point", ...(hasTimes ? { start: times[0], end: times[0] } : {}),
        });
      }
      coords = []; times = [];
    };
    input.forEach((c, i) => {
      if (!validCoordinate(c)) { skipped++; flush(); return; }
      if (hasTimes && times.length && (parsedTimes[i] < times.at(-1) || parsedTimes[i] - times.at(-1) > MAX_TRACK_GAP)) {
        gaps++; flush();
      }
      coords.push(c); times.push(parsedTimes[i]);
    });
    flush();
  };
  for (const feature of geojson.features || []) {
    if (!feature || typeof feature !== "object") { skipped++; continue; }
    addGeometry(feature.geometry, feature.properties || {});
  }
  records.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  let min = Infinity, max = -Infinity;
  const days = new Map();
  for (const record of records) {
    if (record.start == null) continue;
    min = Math.min(min, record.start); max = Math.max(max, record.end);
    // End is exclusive for a stay ending exactly at midnight.
    const finalDay = localDay(Math.max(record.start, record.end - 1));
    let key = localDay(record.start);
    while (key <= finalDay) {
      const day = days.get(key) || { date: key, visits: 0, routes: 0, points: 0 };
      if (record.kind === "visit") day.visits++;
      else if (record.kind === "route" || record.kind === "activity") day.routes++;
      else day.points++;
      days.set(key, day);
      key = localDay(dayBounds(key)[1] + 1);
    }
  }
  const intervals = mergeIntervals(records.filter((r) => r.start != null).map((r) => [r.start, Math.max(r.end, r.start + 1)]));
  return {
    records, min: min === Infinity ? null : min, max: max === -Infinity ? null : max,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), intervals,
    undated: records.filter((r) => r.start == null).length, skipped, gaps,
  };
}

function lowerBound(values, target) {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid] < target) lo = mid + 1; else hi = mid; }
  return lo;
}

export function selectHistory(journey, from = -Infinity, to = Infinity, includeUndated = true) {
  const features = [], visible = [], travelIntervals = [], routeIntervals = [];
  const places = new Set(), modes = new Map();
  let distance = 0, distanceKnown = false, gain = 0, elevationKnown = false;
  let minElevation = Infinity, maxElevation = -Infinity, visits = 0, routes = 0, points = 0;
  let timedDistance = 0, deferredRoutes = 0, overlappingActivities = 0;
  let first = Infinity, last = -Infinity;
  const reportCandidates = [];
  let latest = null;
  for (const r of journey.records) {
    if (!includeUndated && r.start != null && r.start > to) break;
    if (r.start == null ? !includeUndated : r.start > to || r.end < from) continue;
    if (r.kind === "visit" && r.start !== r.end && r.end === from) continue;
    let geometry = r.geometry, start = r.start, end = r.end, km = null;
    if (start != null) { start = Math.max(start, from); end = Math.min(end, to); }
    if (r.kind === "route") {
      if (r.times) {
        const a = lowerBound(r.times, from), b = lowerBound(r.times, to + 1);
        if (b <= a) continue;
        const coords = a === 0 && b === r.times.length ? r.geometry.coordinates : r.geometry.coordinates.slice(a, b);
        start = r.times[a]; end = r.times[b - 1];
        geometry = coords.length > 1 ? { type: "LineString", coordinates: coords } : { type: "Point", coordinates: coords[0] };
        km = r.distances[b - 1] - r.distances[a];
        gain += r.gains[b - 1] - r.gains[a];
      } else {
        // Without per-point times we can only show a whole completed route.
        if (r.start != null && (r.start < from || r.end > to)) { deferredRoutes++; continue; }
        km = r.distances.at(-1);
        gain += r.gains.at(-1);
      }
      distance += km; distanceKnown = true; routes++;
      if (start != null && end > start) {
        travelIntervals.push([start, end]); routeIntervals.push([start, end]); timedDistance += km;
      }
    }
    if (r.kind === "visit") {
      visits++;
      const coord = r.geometry?.coordinates;
      if (r.properties.placeId) places.add(`id:${r.properties.placeId}`);
      else if (coord) places.add(`coord:${coord[0].toFixed(6)},${coord[1].toFixed(6)}`);
    }
    if (r.kind === "activity") {
      const reported = Number(r.properties.distanceMeters);
      if (r.properties.distanceMeters != null && Number.isFinite(reported) && reported >= 0 &&
          (r.start == null || (r.start >= from && r.end <= to))) reportCandidates.push({ r, km: reported / 1000 });
      if (start != null && end > start) travelIntervals.push([start, end]);
    }
    const mode = r.properties.activityType;
    if (mode && mode !== "TIMELINE_PATH") modes.set(mode, (modes.get(mode) || 0) + 1);
    if (geometry && r.kind !== "area") {
      const coords = geometry.type === "Point" ? [geometry.coordinates] : geometry.coordinates;
      points += coords.length;
      for (const c of coords) if (Number.isFinite(c[2])) {
        elevationKnown = true; minElevation = Math.min(minElevation, c[2]); maxElevation = Math.max(maxElevation, c[2]);
      }
      const markerTime = end ?? -Infinity;
      if (!latest || markerTime >= latest.time) latest = { time: markerTime, coordinate: coords.at(-1) };
    }
    if (start != null) { first = Math.min(first, start); last = Math.max(last, end); }
    let mapFeature = r.feature;
    if (geometry !== r.geometry) mapFeature = { ...r.feature, geometry };
    if (r.kind === "visit" && start != null && (start !== r.start || end !== r.end)) {
      const properties = { ...r.feature.properties };
      properties.arrivalTimestamp = new Date(start).toISOString();
      properties.departureTimestamp = new Date(end).toISOString();
      properties.durationMinutes = (end - start) / 60000;
      mapFeature = { ...r.feature, properties };
    }
    if (geometry) features.push(mapFeature);
    visible.push(r);
  }
  // Prefer actual recorded geometry when Google also reports distance for the
  // same time span. Reported totals cannot be apportioned across partial spans.
  const covered = mergeIntervals(routeIntervals);
  const coveredEnds = covered.map((span) => span[1]);
  for (const { r, km } of reportCandidates) {
    const index = lowerBound(coveredEnds, r.start == null ? -Infinity : r.start + 1);
    const overlap = r.start != null && covered[index] && covered[index][0] < r.end && covered[index][1] > r.start;
    if (overlap) { overlappingActivities++; continue; }
    distance += km; distanceKnown = true;
    if (r.start != null && r.end > r.start) timedDistance += km;
  }
  const travelDuration = mergeIntervals(travelIntervals).reduce((sum, [a, b]) => sum + b - a, 0);
  // A speed is meaningful only if all visible travel has distance and timing.
  const activities = visible.filter((r) => r.kind === "activity" && r.start != null);
  const activityTimeSum = activities.reduce((sum, r) => sum + Math.max(0, r.end - r.start), 0);
  const activityTimeUnion = mergeIntervals(activities.map((r) => [r.start, r.end])).reduce((sum, [a, b]) => sum + b - a, 0);
  const completeTiming = activityTimeSum === activityTimeUnion && visible.filter((r) => r.kind === "route" || r.kind === "activity")
    .every((r) => r.start != null && r.end > r.start && (r.kind === "route" ||
      (r.properties.distanceMeters != null && r.start >= from && r.end <= to)));
  return {
    geojson: { type: "FeatureCollection", features }, latest, deferredRoutes,
    stats: {
      totalDistance: distanceKnown ? distance : null, totalDistanceTraveledKm: distanceKnown ? distance : null,
      totalPlacesVisited: visits, uniquePlacesCount: places.size,
      totalActivitySegments: visible.filter((r) => r.kind === "activity").length,
      totalRoutes: routes, totalPoints: points, totalFeatures: features.length,
      travelDuration: travelDuration || null, duration: first < last ? last - first : null,
      startTime: first !== Infinity ? new Date(first) : null, endTime: last !== -Infinity ? new Date(last) : null,
      avgSpeed: overlappingActivities === 0 && completeTiming && travelDuration > 0 && distanceKnown ? timedDistance / (travelDuration / 3600000) : null,
      totalElevationGain: elevationKnown ? gain : null,
      minElevation: minElevation === Infinity ? null : minElevation, maxElevation: maxElevation === -Infinity ? null : maxElevation,
      topTravelModes: [...modes].map(([mode, count]) => ({ mode, count })).sort((a, b) => b.count - a.count),
      overlappingActivities, visibleRecords: visible.length,
    },
  };
}

export function timelineBins(journey, from, to, count = 80) {
  const bins = Array(count).fill(0);
  const add = (time) => {
    if (time < from || time > to) return;
    const index = Math.min(count - 1, Math.max(0, Math.floor((time - from) / Math.max(1, to - from) * count)));
    bins[index]++;
  };
  for (const r of journey.records) {
    if (r.start == null || r.end < from || r.start > to) continue;
    if (r.times) r.times.forEach(add);
    else add(Math.max(from, r.start));
  }
  return bins;
}

export function advancePlayback(current, amount, end, intervals, skipGaps) {
  let next = Math.min(end, current + amount);
  if (skipGaps) {
    const interval = intervals.find(([a, b]) => b >= next && a <= end);
    if (!interval) next = end;
    else if (next < interval[0]) next = Math.min(end, interval[0]);
  }
  return next;
}
