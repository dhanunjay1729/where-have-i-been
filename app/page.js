"use client";

import { useState } from "react";
import DropZone from "./components/DropZone";
import JourneyExplorer from "./components/JourneyExplorer";
import ErrorBoundary from "./components/ErrorBoundary";
import { parseFile } from "./utils/fileParser";

export default function Home() {
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState(null);
  const reset = () => { setLoaded(null); setError(null); };
  const loadFile = (name, content) => {
    setError(null);
    try {
      const { journey } = parseFile(name, content);
      setLoaded({ name, journey });
    } catch (err) {
      setError(err.message);
    }
  };
  return <ErrorBoundary onReset={reset}>
    <main id="app-root" className="h-dvh w-screen overflow-hidden relative">
      {loaded ? <JourneyExplorer journey={loaded.journey} fileName={loaded.name} onReset={reset} /> :
        <div className="h-full flex flex-col"><DropZone onFileLoaded={loadFile} onError={setError} />
          {error && <div role="alert" className="upload-error"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}>✕</button></div>}
        </div>}
    </main>
  </ErrorBoundary>;
}
