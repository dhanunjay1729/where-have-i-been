"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export default function DropZone({ onFileLoaded }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadProgress, setLoadProgress] = useState(0);
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

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -Math.random() * 0.8 - 0.2,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.5 + 0.1,
      hue: Math.random() > 0.5 ? 180 : 300,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      setError(null);
      setLoadProgress(0);

      // Animate progress
      const progressInterval = setInterval(() => {
        setLoadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 150);

      try {
        const text = await file.text();
        setLoadProgress(100);
        clearInterval(progressInterval);

        // Small delay for the completion animation
        await new Promise((r) => setTimeout(r, 600));
        onFileLoaded(file.name, text);
      } catch (err) {
        clearInterval(progressInterval);
        setError(`Failed to read file: ${err.message}`);
        setIsLoading(false);
        setLoadProgress(0);
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
    <div className="relative flex-1 flex items-center justify-center overflow-hidden">
      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* Animated grid background */}
      <div className="cyber-grid-bg" />

      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-cyan/5 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-magenta/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Title */}
        <div className="text-center mb-4">
          <h1 className="text-5xl md:text-7xl font-bold tracking-wider neon-text glitch-text font-mono">
            WHERE HAVE
            <br />
            <span className="text-neon-magenta neon-text-pink">I BEEN</span>
          </h1>
          <p className="mt-4 text-sm md:text-base text-foreground/40 tracking-[0.3em] uppercase font-mono">
            Upload your travel data to visualize your journey
          </p>
        </div>

        {/* Dropzone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          className={`
            relative cursor-pointer group
            w-72 h-72 md:w-96 md:h-96
            flex items-center justify-center
            transition-all duration-500
          `}
        >
          {/* Outer rotating ring */}
          <div
            className={`
              absolute inset-0 rounded-full border-2 border-dashed ring-spin
              ${isDragging ? "border-neon-magenta" : "border-neon-cyan/30"}
              transition-colors duration-300
            `}
          />

          {/* Inner rotating ring (reverse) */}
          <div
            className={`
              absolute inset-4 rounded-full border border-dashed ring-spin-reverse
              ${isDragging ? "border-neon-cyan" : "border-neon-purple/20"}
              transition-colors duration-300
            `}
          />

          {/* Center content */}
          <div
            className={`
              absolute inset-8 rounded-full flex flex-col items-center justify-center
              backdrop-blur-sm transition-all duration-500
              ${isDragging
                ? "bg-neon-cyan/10 scale-105"
                : "bg-surface/60 group-hover:bg-surface-light/80 group-hover:scale-[1.02]"
              }
            `}
            style={{
              boxShadow: isDragging
                ? "0 0 40px rgba(0,255,245,0.3), inset 0 0 40px rgba(0,255,245,0.1)"
                : "0 0 20px rgba(0,255,245,0.05), inset 0 0 20px rgba(0,255,245,0.02)",
            }}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-4">
                {/* Loading spinner */}
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-2 border-neon-cyan/20" />
                  <div
                    className="absolute inset-0 rounded-full border-2 border-transparent border-t-neon-cyan ring-spin"
                    style={{ animationDuration: "1s" }}
                  />
                </div>
                {/* Progress bar */}
                <div className="w-32 h-1 bg-surface-light rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-neon-cyan to-neon-magenta rounded-full transition-all duration-300"
                    style={{ width: `${loadProgress}%` }}
                  />
                </div>
                <span className="text-xs text-neon-cyan font-mono tracking-wider">
                  DECODING DATA...
                </span>
              </div>
            ) : (
              <>
                {/* Upload icon */}
                <div className="float-anim mb-4">
                  <svg
                    width="48"
                    height="48"
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
                <span className="text-sm font-mono text-foreground/60 text-center px-4">
                  {isDragging ? (
                    <span className="text-neon-cyan neon-text">
                      DROP FILE HERE
                    </span>
                  ) : (
                    <>
                      <span className="text-neon-cyan">Click</span> or{" "}
                      <span className="text-neon-cyan">drag & drop</span>
                      <br />
                      <span className="text-xs text-foreground/30 mt-1 block">
                        .gpx · .kml · .geojson
                      </span>
                    </>
                  )}
                </span>
              </>
            )}
          </div>

          {/* Corner accents */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-neon-cyan neon-pulse rounded-full" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-neon-magenta neon-pulse rounded-full" style={{ animationDelay: "1s" }} />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-neon-purple neon-pulse rounded-full" style={{ animationDelay: "0.5s" }} />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-neon-blue neon-pulse rounded-full" style={{ animationDelay: "1.5s" }} />
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-lg px-6 py-3 text-sm text-red-300 font-mono max-w-md text-center">
            {error}
          </div>
        )}

        {/* Supported formats */}
        <div className="flex gap-3 mt-2">
          {["GPX", "KML", "GeoJSON"].map((fmt) => (
            <span
              key={fmt}
              className="px-3 py-1 text-[10px] font-mono tracking-widest border border-neon-cyan/10 rounded-full text-foreground/30 bg-surface/40"
            >
              {fmt}
            </span>
          ))}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".gpx,.kml,.geojson,.json"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
