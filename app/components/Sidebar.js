"use client";

import { useState } from "react";
import { localDay } from "../utils/journey";

const MODES = { IN_PASSENGER_VEHICLE: "Driving", IN_VEHICLE: "Driving", DRIVING: "Driving", WALKING: "Walking", ON_FOOT: "Walking", CYCLING: "Cycling", IN_BUS: "Bus", IN_TRAIN: "Train", IN_SUBWAY: "Subway", FLYING: "Flying", RUNNING: "Running", MOTORCYCLING: "Motorcycle" };
const STYLES = ["dark", "satellite", "streets", "terrain"];
export function formatDistance(km) {
  if (km == null) return "Unavailable";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
}
function formatDuration(ms) {
  if (ms == null) return "Unavailable";
  const mins = Math.round(ms / 60000);
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function Metric({ label, value, children }) {
  return <details className="journey-metric"><summary><span>{label}<span className="metric-info" aria-hidden="true">i</span></span><strong>{value}</strong></summary><p>{children}</p></details>;
}

function DateFilters({ journey, range, onRange }) {
  const [start, setStart] = useState(range?.[0] || localDay(journey.min));
  const [end, setEnd] = useState(range?.[1] || localDay(journey.max));
  const [error, setError] = useState("");
  const months = [...new Set(journey.days.map((d) => d.date.slice(0, 7)))];
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const first = localDay(journey.min), last = localDay(journey.max);
  const apply = (a, b) => {
    if (!a || !b || a > b) { setError("Choose an end date on or after the start date."); return; }
    if (b < first || a > last) { setError("Choose dates within your recorded history."); return; }
    setError(""); onRange([a < first ? first : a, b > last ? last : b]);
  };
  return <div className="date-filters">
    <div className="section-heading"><h2>Explore by date</h2><button className="text-button" onClick={() => onRange(null)} disabled={!range}>All history</button></div>
    <form onSubmit={(e) => { e.preventDefault(); apply(start, end); }}>
      <div className="date-fields">
        <label>From<input aria-label="Start date" type="date" min={first} max={last} value={start} onInput={(e) => setStart(e.currentTarget.value)} onChange={(e) => setStart(e.target.value)} required /></label>
        <label>To<input aria-label="End date" type="date" min={first} max={last} value={end} onInput={(e) => setEnd(e.currentTarget.value)} onChange={(e) => setEnd(e.target.value)} required /></label>
      </div>
      {error && <p className="filter-error" role="alert">{error}</p>}
      <button className="apply-dates" type="submit">Explore these dates <span aria-hidden="true">↗</span></button>
    </form>
    <div className="date-shortcuts">
      <select aria-label="Jump to year" value="" onChange={(e) => { if (e.target.value) apply(`${e.target.value}-01-01`, `${e.target.value}-12-31`); }}><option value="">Jump to year</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
      <select aria-label="Jump to month" value="" onChange={(e) => {
        if (!e.target.value) return;
        const [y, m] = e.target.value.split("-").map(Number);
        apply(`${e.target.value}-01`, localDay(new Date(y, m, 0).getTime()));
      }}><option value="">Jump to month</option>{months.map((m) => <option key={m} value={m}>{new Date(`${m}-01T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</option>)}</select>
    </div>
    <p className="quiet-note">Dates in {Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ")}</p>
  </div>;
}

function DayList({ days, onDay }) {
  const [limit, setLimit] = useState(21);
  return <section className="day-section">
    <div className="section-heading"><h2>Days with footprints</h2><span>{days.length}</span></div>
    {days.length === 0 && <p className="quiet-note">No dated records in this range. Try a wider range.</p>}
    <div className="day-list">{days.slice(0, limit).map((d) => {
      const date = new Date(`${d.date}T12:00:00`);
      return <button key={d.date} onClick={() => onDay(d.date)} className="day-item" aria-label={`Explore ${date.toLocaleDateString(undefined, { dateStyle: "full" })}`}>
        <span className="day-calendar"><small>{date.toLocaleDateString(undefined, { month: "short" })}</small><strong>{date.getDate()}</strong></span>
        <span className="day-copy"><strong>{date.toLocaleDateString(undefined, { weekday: "long" })}<small>{date.getFullYear()}</small></strong><span>{[d.visits && `${d.visits} visit${d.visits === 1 ? "" : "s"}`, d.routes && "Travel recorded", d.points && `${d.points} observation${d.points === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span></span>
        <span className="day-arrow" aria-hidden="true">↗</span>
      </button>;
    })}</div>
    {days.length > limit && <button className="show-more" onClick={() => setLimit((n) => n + 30)}>Show more days</button>}
  </section>;
}

function DayDiary({ events, cursor, onEvent }) {
  const [limit, setLimit] = useState(30);
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return <section className="day-diary">
    <div className="section-heading"><h2>This day, step by step</h2><span>{events.length} records</span></div>
    <div className="diary-events">{events.slice(0, limit).map((r) => <button className={`diary-event ${r.start > cursor ? "ahead" : ""}`} key={r.id} onClick={() => onEvent(r)}>
      <span className="diary-time">{clock(r.start)}</span>
      <span className="diary-dot" aria-hidden="true" />
      <span className="diary-copy"><strong>{r.kind === "visit" ? r.properties.name || "Visited place" : r.kind === "activity" ? MODES[r.properties.activityType] || "Travel activity" : r.kind === "route" ? r.properties.name || "Recorded route" : "Location recorded"}</strong>
        <span>{r.end > r.start ? `Until ${clock(r.end)}` : "Recorded observation"}{r.start > cursor ? " · Ahead" : ""}</span>
      </span><span className="day-arrow" aria-hidden="true">↗</span>
    </button>)}</div>
    {events.length > limit && <button className="show-more" onClick={() => setLimit((n) => n + 30)}>Show more records</button>}
  </section>;
}

export default function Sidebar({ journey, stats, range, days, onRange, onDay, fileName, onReset, isOpen, onToggle, mapStyle, onMapStyleChange, hiddenUndated, dayEvents, onEvent, revealedUntil, achievements = [] }) {
  const noRecords = stats.visibleRecords === 0;
  return <aside id="sidebar" className={`journey-sidebar ${isOpen ? "open" : ""}`} aria-label="Journey details" inert={!isOpen}>
    <header className="journey-brand"><div><span className="eyebrow">A PERSONAL ATLAS</span><h1>Where have I been<span>?</span></h1></div><button className="icon-button" onClick={onToggle} aria-label="Close sidebar">✕</button></header>
    <div className="journey-file"><span title={fileName}>{fileName}</span><button onClick={onReset} className="text-button">New file</button></div>
    <div className="journey-sidebar-scroll">
      {journey.min != null && <DateFilters key={`filters:${range?.join(":") || "all"}`} journey={journey} range={range} onRange={onRange} />}
      <section className="journey-statistics">
        <div className="section-heading"><h2>The journey so far</h2><span className="quiet-note">Tap a number for details</span></div>
        {noRecords && <p className="empty-history">No records revealed here yet. Move the timeline forward or choose another date.</p>}
        <div className="journey-metrics">
          <Metric label="Recorded distance" value={formatDistance(stats.totalDistance)}>Distances follow recorded route points, never the space between separate tracks. Reported activity distance is used only for completed activities with no overlapping recorded route. Partial reported totals are excluded. This is recorded coverage, not a claim of complete travel.</Metric>
          <Metric label="Unique places" value={stats.totalPlacesVisited ? stats.uniquePlacesCount.toLocaleString() : "Unavailable"}>Distinct place IDs from visits. When an ID is missing, exact coordinates rounded to six decimals are used. Names such as HOME are not counted as unique places. Raw GPS observations are not visits.</Metric>
          <Metric label="Visits" value={stats.totalPlacesVisited.toLocaleString()}>Visit records in the selected time window. Returning to the same place counts as another visit. Visits are not dropped just because a route ended nearby.</Metric>
          <Metric label="Recorded travel time" value={formatDuration(stats.travelDuration)}>The union of timed route and activity intervals. Overlapping intervals count once. Overnight stays and gaps between routes are excluded. This is not moving time; stops within an activity may be included.</Metric>
          <Metric label="Route sections" value={stats.totalRoutes.toLocaleString()}>Independent recorded paths. Timed gaps over 30 minutes split a path. A section is not necessarily a whole trip.</Metric>
          <Metric label="Activity segments" value={stats.totalActivitySegments.toLocaleString()}>Transport segments reported by your export. A walk, train ride, and another walk are three segments, not three trips.</Metric>
        </div>
        <details className="data-notes"><summary>About these numbers</summary><p>All numbers follow the date range and the timeline position. An unavailable value means the export cannot support it.</p><p>Average speed: <strong>{stats.avgSpeed == null ? "Unavailable" : `${stats.avgSpeed.toFixed(1)} km/h`}</strong>. Shown only when distance and timing can be matched without overlapping activity estimates.</p>{stats.maxElevation != null && <p>Highest elevation: {Math.round(stats.maxElevation)} m · Recorded ascent: {Math.round(stats.totalElevationGain || 0)} m.</p>}<p>{journey.gaps} recording gaps split. {journey.skipped} invalid or unsupported observations skipped.</p>{stats.overlappingActivities > 0 && <p>{stats.overlappingActivities} overlapping activity distance totals excluded to avoid counting the same travel twice.</p>}</details>
        {hiddenUndated > 0 && <p className="coverage-note">{hiddenUndated} undated item{hiddenUndated === 1 ? " is" : "s are"} hidden while filtering or replaying. Choose All history and Show all to see them.</p>}
      </section>
      {stats.topTravelModes.length > 0 && <section className="journey-modes"><div className="section-heading"><h2>How you travelled</h2><span>Segments</span></div>{stats.topTravelModes.slice(0, 6).map((m) => <div className="mode-row" key={m.mode}><span>{MODES[m.mode] || m.mode.toLowerCase().replaceAll("_", " ")}</span><div><i style={{ width: `${m.count / stats.topTravelModes[0].count * 100}%` }} /></div><strong>{m.count}</strong></div>)}</section>}
      {range?.[0] === range?.[1] && dayEvents.length > 0 && <DayDiary key={`diary:${range?.[0]}`} events={dayEvents} cursor={revealedUntil} onEvent={onEvent} />}
      {journey.min != null && <DayList key={`days:${range?.join(":") || "all"}`} days={days} onDay={onDay} />}
      <details className="appearance-options"><summary>Map appearance</summary><div className="map-style-options">{STYLES.map((style) => <button key={style} aria-pressed={mapStyle === style} onClick={() => onMapStyleChange(style)}>{style}</button>)}</div></details>
      {achievements.length > 0 && <details className="appearance-options"><summary>Travel milestones <span>{achievements.length}</span></summary><div className="milestone-list">{achievements.map((a) => <div key={a.id}><span aria-hidden="true">{a.icon}</span><div><strong>{a.title}</strong><p>{a.description}</p></div></div>)}</div></details>}
    </div>
    <footer className="journey-sidebar-footer"><i />History processed on your device</footer>
  </aside>;
}
