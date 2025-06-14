(function() {
  'use strict';
  
  console.log('Simulator Script Editor Core injected into page context');
  
  window.SimulatorEnhancer = {
    version: '1.0.0',
    initialized: false,
    
    init: function() {
      if (this.initialized) {
        console.log('SimulatorEnhancer already initialized');
        return;
      }
      
      console.log('Initializing SimulatorEnhancer core...');
      this.initialized = true;
      
      this.detectFrameworks();
      this.setupMonkeyPatches();
      this.waitForScriptEditor();
    },
    
    detectFrameworks: function() {
      this.waitForReact();
      this.waitForRedux();
    },
    
    waitForReact: function() {
      const checkReact = () => {
        if (window.React) {
          console.log('React detected:', window.React.version);
          this.patchReact();
        } else if (document.querySelector('[data-reactroot]') || document.querySelector('[data-react-checksum]')) {
          console.log('React application detected (no global React object)');
          this.findReactInstance();
        } else {
          setTimeout(checkReact, 500);
        }
      };
      checkReact();
    },
    
    waitForRedux: function() {
      const checkRedux = () => {
        if (window.__REDUX_DEVTOOLS_EXTENSION__ || window.Redux) {
          console.log('Redux detected');
          this.patchRedux();
        } else if (window.store || this.findReduxStore()) {
          console.log('Redux store detected');
          this.patchRedux();
        } else {
          setTimeout(checkRedux, 500);
        }
      };
      checkRedux();
    },
    
    findReactInstance: function() {
      const reactFiberKey = Object.keys(document.querySelector('body')).find(key => 
        key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber')
      );
      
      if (reactFiberKey) {
        console.log('React Fiber instance found');
        this.reactFiberKey = reactFiberKey;
        this.patchReact();
      }
    },
    
    findReduxStore: function() {
      const possibleStoreKeys = ['store', '__store__', '_store', 'reduxStore'];
      for (let key of possibleStoreKeys) {
        if (window[key] && typeof window[key].getState === 'function') {
          this.reduxStore = window[key];
          return true;
        }
      }
      return false;
    },
    
    patchReact: function() {
      console.log('Setting up React monkey patches...');
      
      if (window.React && window.React.Component) {
        const originalComponentDidMount = window.React.Component.prototype.componentDidMount;
        window.React.Component.prototype.componentDidMount = function() {
          console.log('React component mounted:', this.constructor.name);
          if (originalComponentDidMount) {
            originalComponentDidMount.call(this);
          }
        };
      }
    },
    
    patchRedux: function() {
      console.log('Setting up Redux monkey patches...');
      
      if (this.reduxStore) {
        const originalDispatch = this.reduxStore.dispatch;
        this.reduxStore.dispatch = (action) => {
          console.log('Redux action dispatched:', action);
          return originalDispatch.call(this.reduxStore, action);
        };
      }
    },
    
    waitForScriptEditor: function() {
      const checkScriptEditor = () => {
        const scriptEditor = document.querySelector('[class*="ScriptEditor"]') || 
                           document.querySelector('[class*="script-editor"]') ||
                           document.querySelector('[class*="se__content"]');
        
        if (scriptEditor) {
          console.log('Script editor detected, initializing enhancements');
          this.enhanceScriptEditor(scriptEditor);
        } else {
          setTimeout(checkScriptEditor, 1000);
        }
      };
      checkScriptEditor();
    },
    
    enhanceScriptEditor: function(editorElement) {
      console.log('Enhancing script editor functionality...');
      
      this.patchAceEditor();
      this.enhanceFileTree();
      this.addCustomFeatures();
    },
    
    patchAceEditor: function() {
      if (window.ace) {
        console.log('ACE Editor detected, setting up patches...');
        
        const originalCreateEditSession = window.ace.createEditSession;
        window.ace.createEditSession = function(text, mode) {
          console.log('ACE Editor session created with mode:', mode);
          return originalCreateEditSession.call(this, text, mode);
        };
      }
    },
    
    enhanceFileTree: function() {
      console.log('Enhancing file tree functionality...');
      
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE && 
                  (node.classList.contains('file-tree') || 
                   node.querySelector && node.querySelector('[class*="file"]'))) {
                console.log('File tree element detected');
                this.addFileTreeEnhancements(node);
              }
            });
          }
        });
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    },
    
    addFileTreeEnhancements: function(treeElement) {
      console.log('Adding file tree enhancements...');
    },
    
    addCustomFeatures: function() {
      console.log('Adding custom script editor features...');
      
      this.interceptAPIRequests();
      this.addKeyboardShortcuts();
    },
    
    interceptAPIRequests: function() {
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && url.includes('/script/')) {
          console.log('Script API request intercepted:', url);
        }
        return originalFetch.apply(this, args);
      };
      
      const originalXHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (typeof url === 'string' && url.includes('/script/')) {
          console.log('Script XHR request intercepted:', method, url);
        }
        return originalXHROpen.call(this, method, url, ...rest);
      };
    },
    
    addKeyboardShortcuts: function() {
      document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.shiftKey && event.key === 'E') {
          console.log('Custom shortcut triggered: Ctrl+Shift+E');
          event.preventDefault();
        }
      });
    },
    
    setupMonkeyPatches: function() {
      console.log('Setting up general monkey patches...');
      
      this.patchConsole();
    },
    
    patchConsole: function() {
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      console.log = function(...args) {
        originalLog.apply(console, ['[SimulatorEnhancer]', ...args]);
      };
      
      console.error = function(...args) {
        originalError.apply(console, ['[SimulatorEnhancer ERROR]', ...args]);
      };
      
      console.warn = function(...args) {
        originalWarn.apply(console, ['[SimulatorEnhancer WARN]', ...args]);
      };
    }
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.SimulatorEnhancer.init();
    });
  } else {
    window.SimulatorEnhancer.init();
  }
  
})();
