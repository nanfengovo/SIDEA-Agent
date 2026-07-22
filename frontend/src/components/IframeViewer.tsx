import React, { useEffect, useRef, useState } from 'react';

interface IframeViewerProps {
  url: string;
  data: any;
  className?: string;
}

const IframeViewer: React.FC<IframeViewerProps> = ({ url, data, className = '' }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (isLoaded && iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'SIDEA_INJECT',
        payload: data
      }, '*');
    }
  }, [data, isLoaded]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-slate-400 text-xs font-mono">Loading External Template...</span>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={url}
        className="w-full h-full border-0 bg-transparent"
        sandbox="allow-scripts allow-same-origin"
        onLoad={handleLoad}
        title="External Template Viewer"
      />
    </div>
  );
};

export default IframeViewer;
