"use client";

import { useMemo } from "react";
import { timelineBins } from "../utils/journey";

const dateLabel = (time, options = {}) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", ...options });

export default function Timeline({ journey, from, to, cursor, onSeek, playing, onPlay, speed, onSpeed, skipGaps, onSkipGaps, deferredRoutes }) {
  const bins = useMemo(() => timelineBins(journey, from, to), [journey, from, to]);
  const peak = Math.max(1, ...bins);
  const progress = to > from ? (cursor - from) / (to - from) * 100 : 100;
  const usable = journey.min != null && to > from;
  const finished = cursor >= to;
  const hasActivity = bins.some((n) => n > 0);
  const extentLabel = (time) => dateLabel(time) + (to - from < 36 * 3600000 ? ` · ${new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "");
  return (
    <section className="journey-timeline" aria-label="Travel timeline">
      <div className="timeline-heading">
        <div>
          <div className="eyebrow">YOUR FOOTPRINTS, THROUGH TIME</div>
          <div className="timeline-current">
            {journey.min == null ? "This file has no dates" : dateLabel(cursor)}
            {journey.min != null && <span>{new Date(cursor).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
        </div>
        <span className={`timeline-state ${playing ? "is-playing" : ""}`}><i />{playing ? "Playing" : finished ? "All in range" : "Paused"}</span>
      </div>

      {journey.min != null ? <>
        <div className="timeline-track">
          <div className="timeline-density" aria-hidden="true">
            {bins.map((n, i) => <span key={i} className={i / bins.length * 100 <= progress ? "revealed" : ""}
              style={{ height: n ? `${Math.max(12, Math.sqrt(n / peak) * 100)}%` : "2px" }} />)}
          </div>
          <input type="range" className="footprint-slider" min={from} max={Math.max(from + 1, to)}
            step="any" value={cursor} disabled={!usable}
            style={{ "--progress": `${progress}%` }} aria-label="Reveal footprints up to date"
            aria-valuetext={new Date(cursor).toLocaleString()}
            onChange={(e) => onSeek(Number(e.target.value))} />
        </div>
        <div className="timeline-extents"><span>{extentLabel(from)}</span><span>{extentLabel(to)}</span></div>
        <div className="timeline-controls">
          <div className="playback-buttons">
            <button className="timeline-play" disabled={!usable || !hasActivity} onClick={onPlay} aria-label={playing ? "Pause timeline" : finished ? "Replay timeline" : "Play timeline"}>
              <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>{playing ? "Pause" : finished ? "Replay" : "Play"}
            </button>
            <button className="subtle-button" disabled={!usable || finished} onClick={() => onSeek(to)} title="Reveal all footprints in the selected range">Show all</button>
            <label className="speed-control"><span className="sr-only">Playback speed</span>
              <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))} aria-label="Playback speed">
                {[0.5, 1, 2, 4].map((n) => <option key={n} value={n}>{n}×</option>)}
              </select>
            </label>
          </div>
          <label className="gap-toggle"><input type="checkbox" checked={skipGaps} onChange={(e) => onSkipGaps(e.target.checked)} />Skip empty time</label>
        </div>
        <p className="timeline-hint">{!usable ? "Only one recorded moment. Showing it in full." : !hasActivity ? "No dated footprints in this range. Choose another date to explore." : deferredRoutes > 0
          ? `${deferredRoutes} route${deferredRoutes === 1 ? "" : "s"} waiting for an end time. This export has no point-by-point timing for them.`
          : "Drag to reveal your travels. Taller bars mark more recorded activity."}</p>
      </> : <p className="timeline-hint">Your map is available in full. Date filtering and playback need timestamps in the original file.</p>}
    </section>
  );
}
