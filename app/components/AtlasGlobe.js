"use client";

import { useEffect, useRef } from "react";
import land from "../utils/atlas-land.json";

const RAD = Math.PI / 180;
const TILT = 18 * RAD;
const DESTINATIONS = [
  { coordinate: [-9.14, 38.72], label: "LIS" },
  { coordinate: [36.82, -1.29], label: "NBO" },
  { coordinate: [77.21, 28.61], label: "DEL" },
  { coordinate: [103.82, 1.35], label: "SIN" },
];
const ROUTES = [[0, 2], [1, 2], [2, 3]];
const vector = ([lon, lat]) => [Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD), Math.cos(lat * RAD) * Math.cos(lon * RAD)];

function arcPoint(a, b, t) {
  const u = vector(a), v = vector(b);
  const angle = Math.acos(Math.min(1, Math.max(-1, u.reduce((sum, n, i) => sum + n * v[i], 0))));
  const denominator = Math.sin(angle) || 1;
  const p = u.map((n, i) => (Math.sin((1 - t) * angle) * n + Math.sin(t * angle) * v[i]) / denominator);
  return [Math.atan2(p[0], p[2]) / RAD, Math.asin(Math.max(-1, Math.min(1, p[1]))) / RAD];
}

// An illustrative globe, made from bundled public-domain geography. It never
// reads the visitor's location and does not contact a map provider.
export default function AtlasGlobe() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 600, frame = 0, previous = 0, inView = true;
    const began = performance.now();

    const paint = (now) => {
      if (document.hidden || !inView) { frame = 0; return; }
      if (now - previous < 32 && !motion.matches) { frame = requestAnimationFrame(paint); return; }
      previous = now;
      const t = motion.matches ? 0 : (now - began) / 1000;
      const rotation = (30 + t * .8) * RAD;
      const radius = width * .39;
      const center = width / 2;
      const project = ([lon, lat], lift = 1) => {
        const lambda = lon * RAD - rotation, phi = lat * RAD;
        const depth = Math.sin(TILT) * Math.sin(phi) + Math.cos(TILT) * Math.cos(phi) * Math.cos(lambda);
        return [
          center + radius * lift * Math.cos(phi) * Math.sin(lambda),
          center - radius * lift * (Math.cos(TILT) * Math.sin(phi) - Math.sin(TILT) * Math.cos(phi) * Math.cos(lambda)),
          depth,
        ];
      };
      const line = (coordinates, color, strokeWidth = .6, lift = () => 1) => {
        ctx.beginPath();
        let connected = false;
        coordinates.forEach((coordinate, i) => {
          const p = project(coordinate, lift(i / Math.max(1, coordinates.length - 1)));
          if (p[2] < 0) { connected = false; return; }
          if (connected) ctx.lineTo(p[0], p[1]);
          else ctx.moveTo(p[0], p[1]);
          connected = true;
        });
        ctx.strokeStyle = color; ctx.lineWidth = strokeWidth; ctx.stroke();
      };
      ctx.clearRect(0, 0, width, width);
      const fill = ctx.createRadialGradient(center - radius * .35, center - radius * .45, 0, center, center, radius);
      fill.addColorStop(0, "#14271e"); fill.addColorStop(.65, "#0c1712"); fill.addColorStop(1, "#080e0c");
      ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = "#a6dfba27"; ctx.lineWidth = 1; ctx.stroke();

      for (let lat = -60; lat <= 60; lat += 30) line(Array.from({ length: 181 }, (_, i) => [i * 2 - 180, lat]), "#a8cfb815");
      for (let lon = -180; lon < 180; lon += 30) line(Array.from({ length: 91 }, (_, i) => [lon, i * 2 - 90]), "#a8cfb815");
      for (const coordinate of land.points) {
        const p = project(coordinate);
        if (p[2] < 0) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], (.65 + p[2] * .55) * width / 600, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(157, 218, 175, ${.16 + p[2] * .65})`; ctx.fill();
      }
      ROUTES.forEach(([a, b], routeIndex) => {
        const coordinates = Array.from({ length: 65 }, (_, i) => arcPoint(DESTINATIONS[a].coordinate, DESTINATIONS[b].coordinate, i / 64));
        const lift = (value) => 1 + Math.sin(value * Math.PI) * .13;
        line(coordinates, "#edc99b80", 1.1, lift);
        const progress = ((t / 9) + routeIndex * .28) % 1;
        const p = project(arcPoint(DESTINATIONS[a].coordinate, DESTINATIONS[b].coordinate, progress), lift(progress));
        if (p[2] > 0) {
          ctx.shadowColor = "#f0cc9f"; ctx.shadowBlur = 13;
          ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2); ctx.fillStyle = "#ffe3bd"; ctx.fill(); ctx.shadowBlur = 0;
        }
      });
      for (const destination of DESTINATIONS) {
        const p = project(destination.coordinate);
        if (p[2] < .12) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fillStyle = "#d6f6d6"; ctx.fill();
        ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2); ctx.strokeStyle = "#c7f3c649"; ctx.lineWidth = .8; ctx.stroke();
        ctx.font = `${Math.max(8, width / 68)}px monospace`; ctx.fillStyle = "#b8c9bc"; ctx.fillText(destination.label, p[0] + 13, p[1] + 3);
      }
      if (!motion.matches) frame = requestAnimationFrame(paint);
      else frame = 0;
    };
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    };
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(width * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      refresh();
    });
    resize.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; refresh(); }, { rootMargin: "100px" });
    intersection.observe(canvas);
    motion.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { resize.disconnect(); intersection.disconnect(); cancelAnimationFrame(frame); motion.removeEventListener("change", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  return <div className="atlas-globe-art" aria-hidden="true">
    <div className="atlas-globe-halo" />
    <div className="atlas-orbit atlas-orbit-one" />
    <div className="atlas-orbit atlas-orbit-two" />
    <canvas ref={canvasRef} className="atlas-globe-canvas" />
    <span className="atlas-globe-label">A WORLD OF POSSIBILITIES</span>
    <span className="atlas-globe-cross atlas-globe-cross-one">+</span>
    <span className="atlas-globe-cross atlas-globe-cross-two">+</span>
    <div className="atlas-globe-caption"><span className="atlas-caption-line" /><span>Somewhere you went.<br /><em>Something you remember.</em></span></div>
    <span className="atlas-globe-footnote">ILLUSTRATIVE MAP · YOUR STORY IS NEXT</span>
  </div>;
}
