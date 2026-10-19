"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AtlasGlobe from "./AtlasGlobe";
import Link from "next/link";

const ICONS = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  upload: "M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-5",
  play: "m9 5 10 7-10 7V5Z",
  route: "M6 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 4h7a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8h7",
  compass: "m16 8-3 5-5 3 3-5 5-3ZM12 2v2m0 16v2M2 12h2m16 0h2",
};
function Icon({ name, className = "" }) {
  return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

export default function DropZone({ onFileLoaded, onError }) {
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState(null);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);
  const busyRef = useRef(false);
  const readerRef = useRef(null);
  const aliveRef = useRef(true);
  const dragDepth = useRef(0);
  const isLoading = phase !== "idle";

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (readerRef.current?.readyState === FileReader.LOADING) readerRef.current.abort();
    };
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setPhase("reading"); setProgress(null); setFileName(file.name);
    setIsDragging(false); dragDepth.current = 0;
    try {
      let text;
      if (file instanceof File) {
        text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          readerRef.current = reader;
          reader.onprogress = (e) => {
            if (aliveRef.current && e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100));
          };
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("This file could not be read. Please try again."));
          reader.onabort = () => reject(new Error("File reading was cancelled."));
          reader.readAsText(file);
        });
      } else text = await file.text();
      if (!aliveRef.current) return;
      setPhase("mapping");
      // Let the status paint before parsing a large export on the next turn.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (aliveRef.current) onFileLoaded(file.name, text);
    } catch (err) {
      if (aliveRef.current) onError?.(err.message || "The file could not be opened. Please try again.");
    } finally {
      readerRef.current = null;
      busyRef.current = false;
      if (aliveRef.current) { setPhase("idle"); setProgress(null); }
    }
  }, [onFileLoaded, onError]);

  const openSample = () => handleFile({
    name: "sample-journey.geojson",
    text: async () => {
      const response = await fetch("/sample-journey.geojson");
      if (!response.ok) throw new Error("The sample could not be loaded. Please try again.");
      return response.text();
    },
  });

  return <div id="drop-zone" className="atlas-home"
    onDragEnter={(e) => {
      if (!e.dataTransfer.types.includes("Files") || busyRef.current) return;
      e.preventDefault(); dragDepth.current++; setIsDragging(true);
    }}
    onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = busyRef.current ? "none" : "copy"; } }}
    onDragLeave={(e) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setIsDragging(false); }}
    onDrop={(e) => { e.preventDefault(); dragDepth.current = 0; setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}>
    <div className="atlas-home-grain" aria-hidden="true" />
    <div className="atlas-page-shell">
      <header className="atlas-header">
        <Link className="atlas-wordmark" href="/" aria-label="Where Have I Been home">
          <span className="atlas-brand-mark"><Icon name="compass" /></span>
          <span>where have i been<span className="atlas-brand-period">.</span></span>
        </Link>
        <nav className="atlas-nav" aria-label="Homepage navigation">
          <details className="atlas-privacy">
            <summary><Icon name="shield" /><span>Private by design</span><span className="atlas-private-dot" /></summary>
            <div className="atlas-privacy-popover"><strong>Your history belongs to you.</strong><p>Your file is read in your browser. No account, no file uploads, and no server database for your history.</p><p>When you open a map, Mapbox supplies map assets over the internet. Those requests can reveal the area being viewed.</p></div>
          </details>
          <a className="atlas-source-link" href="https://github.com/dhanunjay1729/where-have-i-been" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="atlas-hero" aria-labelledby="atlas-title">
        <div className="atlas-hero-copy">
          <div className="atlas-eyebrow"><span />A PERSONAL ATLAS OF YOUR LIFE</div>
          <h1 id="atlas-title">Your life.<br /><em>Mapped out.</em></h1>
          <p className="atlas-introduction">The everyday routes. The unforgettable trips.<br />Your location history has a story to tell.</p>

          <div className="atlas-import">
            <button type="button" className={`atlas-upload ${isLoading ? "is-loading" : ""}`} onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
              <span className="atlas-upload-symbol">{isLoading ? <span className="atlas-reading-spinner" /> : <Icon name="upload" />}</span>
              <span className="atlas-upload-copy"><strong>{phase === "reading" ? "Opening your history…" : phase === "mapping" ? "Finding your footprints…" : "Open your history"}</strong><span>{isLoading ? fileName : "Drop a file here, or click to browse"}</span></span>
              {!isLoading && <Icon name="arrow" className="atlas-upload-arrow" />}
              {isLoading && progress != null && phase === "reading" && <span className="atlas-read-percent">{progress}%</span>}
            </button>
            {isLoading && <div className="atlas-load-status" role="status" aria-live="polite">{phase === "reading" ? "Reading your file on this device." : "Building your map on this device."}</div>}
            <div className="atlas-import-meta"><span>GOOGLE TIMELINE</span><i /><span>GPX</span><i /><span>KML</span><i /><span>GEOJSON</span></div>
            <div className="atlas-sample-row"><span>Just looking around?</span><button type="button" onClick={openSample} disabled={isLoading}>Try a sample journey <Icon name="arrow" /></button></div>
          </div>

          <div className="atlas-trust"><Icon name="shield" /><p><strong>Your world. Your data.</strong><span>No sign-up. Your file never leaves your browser.</span></p></div>
          <details className="atlas-file-help"><summary>Where do I get my history?</summary><p>Export your Google Maps Timeline from your phone, then open the JSON file here. You can also use GPX tracks, KML, or GeoJSON. <a href="https://support.google.com/maps/answer/6258979" target="_blank" rel="noopener noreferrer">Google’s export guide ↗</a></p></details>
        </div>
        <div className="atlas-hero-visual"><AtlasGlobe /></div>
      </section>

      <section className="atlas-features" aria-label="What you can explore">
        <article><span className="atlas-feature-index">01 — EXPLORE</span><div><Icon name="route" /><h2>A little perspective.</h2></div><p>From your morning walk to the other side of the world. See where life has taken you.</p></article>
        <article><span className="atlas-feature-index">02 — REPLAY</span><div><Icon name="play" /><h2>Go back to a moment.</h2></div><p>Pick a day. Slide through time. Watch your footprints become a journey.</p></article>
        <article><span className="atlas-feature-index">03 — UNDERSTAND</span><div><Icon name="compass" /><h2>Find your patterns.</h2></div><p>The places you return to. The distance in between. A different way to see your everyday.</p></article>
      </section>
      <footer className="atlas-footer"><span>A personal project. A different perspective.</span><span>MADE FOR YOUR OWN LITTLE WORLD <span aria-hidden="true">↗</span></span></footer>
    </div>

    <input ref={fileInputRef} type="file" accept=".gpx,.kml,.geojson,.json" id="file-input" className="sr-only" tabIndex={-1}
      aria-label="Choose your travel history file" disabled={isLoading}
      onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
    {isDragging && <div className="atlas-drop-overlay" role="status"><div><Icon name="upload" /><strong>Drop your history here.</strong><span>Let’s see where you’ve been.</span></div></div>}
  </div>;
}
