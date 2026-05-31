"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const SUPPORTED_FORMATS = [
  { ext: "GPX", desc: "GPS Exchange" },
  { ext: "KML", desc: "Google Earth" },
  { ext: "GeoJSON", desc: "Geographic JSON" },
  { ext: "JSON", desc: "Google Timeline" },
];

export default function DropZone({ onFileLoaded }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStage, setLoadStage] = useState("");
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  // Particle animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -Math.random() * 0.6 - 0.15,
      size: Math.random() * 2 + 0.3,
      opacity: Math.random() * 0.4 + 0.05,
      hue: [180, 280, 200, 320][Math.floor(Math.random() * 4)],
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connection lines between nearby particles
      ctx.lineWidth = 0.3;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.strokeStyle = `hsla(180, 100%, 70%, ${0.06 * (1 - dist / 120)})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.opacity})`;
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;

        if (p.y < -10) {
          p.y = canvas.height + 10;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const handleFile = useCallback(
    async (file) => {
      if (!file) return;
      setIsLoading(true);
      setLoadProgress(0);
      setLoadStage("READING FILE...");

      // Animate progress
      const progressInterval = setInterval(() => {
        setLoadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 12;
        });
      }, 120);

      try {
        setLoadStage("READING FILE...");
        const text = await file.text();

        setLoadStage("PARSING COORDINATES...");
        setLoadProgress(60);
        await new Promise((r) => setTimeout(r, 200));

        setLoadStage("BUILDING MAP DATA...");
        setLoadProgress(85);
        await new Promise((r) => setTimeout(r, 200));

        setLoadProgress(100);
        setLoadStage("COMPLETE ✓");
        clearInterval(progressInterval);

        // Completion animation delay
        await new Promise((r) => setTimeout(r, 500));
        onFileLoaded(file.name, text);
      } catch (err) {
        clearInterval(progressInterval);
        setIsLoading(false);
        setLoadProgress(0);
        setLoadStage("");
      }
    },
    [onFileLoaded]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = () => fileInputRef.current?.click();

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
  };

  return (
    <div id="drop-zone" className="relative flex-1 flex items-center justify-center overflow-hidden">
      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* Animated grid background */}
      <div className="cyber-grid-bg" />

      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-neon-cyan/[0.03] rounded-full blur-[150px] animate-pulse" />
      <div
        className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-neon-magenta/[0.03] rounded-full blur-[150px] animate-pulse"
        style={{ animationDelay: "1.5s" }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-neon-purple/[0.02] rounded-full blur-[120px] animate-pulse"
        style={{ animationDelay: "3s" }}
      />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6">
        {/* Title */}
        <div className="text-center mb-2">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-wider font-mono leading-tight">
            <span className="neon-text glitch-text">WHERE HAVE</span>
            <br />
            <span className="text-neon-magenta neon-text-pink">I BEEN</span>
          </h1>
          <p className="mt-5 text-sm md:text-base text-foreground/30 tracking-[0.3em] uppercase font-mono">
            Upload your travel data to visualize your journey
          </p>
        </div>

        {/* Dropzone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          className="relative cursor-pointer group w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 flex items-center justify-center transition-all duration-500"
        >
          {/* Outer rotating ring */}
          <div
            className={`absolute inset-0 rounded-full border-2 border-dashed ring-spin transition-colors duration-300
              ${isDragging ? "border-neon-magenta" : "border-neon-cyan/20"}`}
          />

          {/* Inner rotating ring (reverse) */}
          <div
            className={`absolute inset-4 rounded-full border border-dashed ring-spin-reverse transition-colors duration-300
              ${isDragging ? "border-neon-cyan" : "border-neon-purple/15"}`}
          />

          {/* Third ring for depth */}
          <div
            className={`absolute inset-8 rounded-full border border-dotted ring-spin transition-colors duration-500
              ${isDragging ? "border-neon-yellow/40" : "border-neon-blue/10"}`}
            style={{ animationDuration: "20s" }}
          />

          {/* Center content */}
          <div
            className={`absolute inset-12 rounded-full flex flex-col items-center justify-center backdrop-blur-sm transition-all duration-500
              ${isDragging
                ? "bg-neon-cyan/10 scale-110"
                : "bg-surface/50 group-hover:bg-surface-light/70 group-hover:scale-[1.03]"
              }`}
            style={{
              boxShadow: isDragging
                ? "0 0 60px rgba(0,255,245,0.25), inset 0 0 60px rgba(0,255,245,0.08)"
                : "0 0 30px rgba(0,255,245,0.04), inset 0 0 30px rgba(0,255,245,0.02)",
            }}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                {/* Loading spinner */}
                <div className="relative w-14 h-14">
                  <div className="absolute inset-0 rounded-full border-2 border-neon-cyan/20" />
                  <div
                    className="absolute inset-0 rounded-full border-2 border-transparent border-t-neon-cyan border-r-neon-cyan/50 ring-spin"
                    style={{ animationDuration: "0.8s" }}
                  />
                </div>
                {/* Progress bar */}
                <div className="w-28 h-1 bg-surface-light rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-magenta rounded-full transition-all duration-300"
                    style={{ width: `${loadProgress}%` }}
                  />
                </div>
                <span className="text-[10px] text-neon-cyan font-mono tracking-wider">
                  {loadStage}
                </span>
                <span className="text-[10px] text-foreground/20 font-mono">
                  {Math.round(loadProgress)}%
                </span>
              </div>
            ) : (
              <>
                {/* Upload icon */}
                <div className="float-anim mb-3">
                  <svg
                    width="44"
                    height="44"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    className={`transition-colors duration-300 ${
                      isDragging ? "text-neon-magenta" : "text-neon-cyan"
                    }`}
                    strokeWidth="1.5"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <span className="text-sm font-mono text-foreground/50 text-center px-6">
                  {isDragging ? (
                    <span className="text-neon-cyan neon-text text-base">
                      DROP FILE HERE
                    </span>
                  ) : (
                    <>
                      <span className="text-neon-cyan">Click</span> or{" "}
                      <span className="text-neon-cyan">drag & drop</span>
                    </>
                  )}
                </span>
              </>
            )}
          </div>

          {/* Corner accent dots */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-neon-cyan neon-pulse rounded-full" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-neon-magenta neon-pulse rounded-full" style={{ animationDelay: "1s" }} />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-neon-purple neon-pulse rounded-full" style={{ animationDelay: "0.5s" }} />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-neon-blue neon-pulse rounded-full" style={{ animationDelay: "1.5s" }} />
        </div>

        {/* Supported formats */}
        <div className="flex flex-wrap justify-center gap-2 mt-1 max-w-md">
          {SUPPORTED_FORMATS.map((fmt) => (
            <div
              key={fmt.ext}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono tracking-widest border border-neon-cyan/8 rounded-lg text-foreground/25 bg-surface/30 hover:border-neon-cyan/20 hover:text-foreground/40 transition-all duration-300 group/fmt"
            >
              <span className="text-neon-cyan/50 group-hover/fmt:text-neon-cyan/80 transition-colors">.{fmt.ext.toLowerCase()}</span>
              <span className="hidden md:inline text-foreground/15">·</span>
              <span className="hidden md:inline">{fmt.desc}</span>
            </div>
          ))}
        </div>

        {/* How it works hint */}
        <p className="text-[10px] font-mono text-foreground/15 tracking-wider mt-2 text-center">
          YOUR DATA STAYS ON YOUR DEVICE · 100% PRIVATE · NO SERVER UPLOADS
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".gpx,.kml,.geojson,.json"
        className="hidden"
        onChange={handleInputChange}
        id="file-input"
      />
    </div>
  );
}
