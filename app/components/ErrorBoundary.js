"use client";

import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-background">
          <div className="cyber-grid-bg" />
          <div className="relative z-10 glass-card p-10 max-w-lg text-center">
            {/* Error icon */}
            <div className="mb-6 mx-auto w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ff3d8a" strokeWidth="1.5">
                <path d="M12 9v4m0 4h.01M3.27 20h17.46c1.01 0 1.63-1.09 1.12-1.96l-8.73-15.08c-.5-.87-1.76-.87-2.26 0L2.15 18.04c-.51.87.11 1.96 1.12 1.96z" />
              </svg>
            </div>

            <h2 className="text-xl font-mono font-bold text-neon-pink mb-2">
              SYSTEM ERROR
            </h2>
            <p className="text-sm font-mono text-foreground/50 mb-6 leading-relaxed">
              Something unexpected happened while processing your data. This is usually
              caused by an unsupported file format or corrupted data.
            </p>

            {/* Error details (collapsible) */}
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-xs font-mono text-foreground/30 cursor-pointer hover:text-foreground/50 transition-colors">
                  VIEW ERROR DETAILS
                </summary>
                <pre className="mt-2 p-3 bg-surface/80 rounded-lg text-[10px] text-red-300/60 font-mono overflow-auto max-h-32 border border-red-500/10">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}

            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset?.();
              }}
              className="px-6 py-2.5 rounded-lg font-mono text-sm tracking-wider bg-gradient-to-r from-neon-cyan/20 to-neon-purple/20 border border-neon-cyan/30 text-neon-cyan hover:border-neon-cyan/60 hover:bg-neon-cyan/10 transition-all duration-300 cursor-pointer"
            >
              ↻ RESTART APPLICATION
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
