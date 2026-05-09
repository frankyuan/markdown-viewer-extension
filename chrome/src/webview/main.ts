// Markdown Viewer Main - Chrome Extension Entry Point
import { platform } from './index';
import { startViewer } from './viewer-main';
import { initializeViewerBase } from '../../../src/core/viewer/viewer-bootstrap';

declare global {
  interface Window {
    __markdownViewerOriginalNode?: Node;
    __markdownViewerOriginalScroll?: { x: number; y: number };
    __markdownViewerInjected?: boolean;
    __markdownViewerRestoreHandler?: (message: any) => void;
  }
}

if (window.__markdownViewerInjected) {
  console.log('[main] Markdown Viewer already injected.');
} else {
  window.__markdownViewerInjected = true;
  // Save original DOM and scroll position BEFORE viewer replaces the body
  window.__markdownViewerOriginalNode = document.documentElement.cloneNode(true);
  window.__markdownViewerOriginalScroll = { x: window.scrollX, y: window.scrollY };

  // Listen for restore message
  const handleMessage = (message: any) => {
    if (message?.type === 'RESTORE_ORIGINAL_VIEW' && window.__markdownViewerOriginalNode) {
      // Restore the DOM
      document.replaceChild(window.__markdownViewerOriginalNode, document.documentElement);
      
      // Restore scroll position
      window.scrollTo(
        window.__markdownViewerOriginalScroll?.x || 0,
        window.__markdownViewerOriginalScroll?.y || 0
      );
      
      // Cleanup
      window.__markdownViewerInjected = false;
      chrome.runtime.onMessage.removeListener(handleMessage);
    }
  };
  chrome.runtime.onMessage.addListener(handleMessage);

  void initializeViewerBase(platform).then((pluginRenderer) => {
    startViewer({
      platform,
      pluginRenderer,
      themeConfigRenderer: platform.renderer,
    });
  }).catch((error) => {
    console.error('[main] viewer base init failed', error);
  });
}
