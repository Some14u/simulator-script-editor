console.log('Simulator Script Editor Enhancer content script loaded');

function injectCoreScript() {
  const scriptUrl = chrome.runtime.getURL('injected-core.js');
  const script = document.createElement('script');
  script.src = scriptUrl;
  script.onload = function() {
    console.log('Core script injected successfully');
    this.remove();
  };
  script.onerror = function() {
    console.error('Failed to inject core script');
    this.remove();
  };
  
  (document.head || document.documentElement).appendChild(script);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectCoreScript);
} else {
  injectCoreScript();
}
