(function() {
  'use strict';
  
  console.log('[SimulatorEnhancer:INIT] Core script injected into page context');
  
  window.SimulatorEnhancer = {
    version: '1.0.0',
    initialized: false,
    debugEnabled: true,
    reactRuntime: null,
    originalCreateElement: null,
    webpackHooksActive: false,
    reduxStore: null,
    
    debug: function(category, message, ...args) {
      if (!this.debugEnabled) return;
      const timestamp = new Date().toISOString().substr(11, 12);
      console.log(`[SimulatorEnhancer:${category}:${timestamp}]`, message, ...args);
    },
    
    getScriptParams: function() {
      this.debug('API', 'Extracting script parameters from URL:', window.location.pathname);
      const path = window.location.pathname;
      const match = path.match(/\/script\/([^\/]+)\/edit\/([^\/]+)/);
      if (match) {
        const params = {
          workspaceId: match[1],
          scriptId: match[2]
        };
        this.debug('API', 'Script parameters extracted:', params);
        return params;
      }
      this.debug('API', 'Failed to extract script parameters from URL');
      return null;
    },
    
    refreshScriptStructure: function(callback) {
      this.debug('API', 'Starting script structure refresh');
      const params = this.getScriptParams();
      if (!params) {
        this.debug('API', 'Cannot extract script parameters from URL');
        if (callback) callback(null);
        return;
      }
      
      const { scriptId } = params;
      const envId = 'default';
      const url = `/app_content/struct/${scriptId}/${envId}`;
      
      this.debug('API', 'Fetching script structure from:', url);
      
      fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
      })
      .then(response => {
        this.debug('API', 'Fetch response received:', { status: response.status, ok: response.ok });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        this.debug('API', 'Script structure data received:', data);
        this.updateReduxState(data.data);
        if (callback) callback(data.data);
      })
      .catch(error => {
        this.debug('API', 'Failed to refresh script structure:', error);
        if (callback) callback(null);
      });
    },
    
    updateReduxState: function(structureData) {
      this.debug('REDUX', 'Attempting to update Redux state with structure data');
      if (!this.reduxStore) {
        this.findReduxStore();
      }
      
      if (!this.reduxStore) {
        this.debug('REDUX', 'Redux store not available');
        return;
      }
      
      this.debug('REDUX', 'Dispatching GET_SCRIPT_STRUCTURE_SUCCESS action');
      this.reduxStore.dispatch({
        type: 'GET_SCRIPT_STRUCTURE_SUCCESS',
        payload: { content: structureData }
      });
      
      this.debug('REDUX', 'Redux state updated with fresh structure');
    },
    
    findReduxStore: function() {
      const possibleStoreKeys = ['store', '__store__', '_store', 'reduxStore'];
      for (let key of possibleStoreKeys) {
        if (window[key] && typeof window[key].getState === 'function') {
          this.reduxStore = window[key];
          this.debug('REDUX', 'Redux store found:', key);
          return true;
        }
      }
      this.debug('REDUX', 'Redux store not found');
      return false;
    },
    
    waitForRedux: function() {
      const self = this;
      const checkRedux = () => {
        if (window.__REDUX_DEVTOOLS_EXTENSION__ || window.Redux) {
          self.debug('REDUX', 'Redux detected via global objects');
          self.findReduxStore();
        } else if (window.store || self.findReduxStore()) {
          self.debug('REDUX', 'Redux store detected');
        } else {
          self.debug('REDUX', 'Redux not found, retrying in 500ms...');
          setTimeout(checkRedux, 500);
        }
      };
      checkRedux();
    },
    
    interceptReactRuntime: function() {
      if (this.webpackHooksActive) {
        this.debug('REACT', 'Webpack hooks already active');
        return;
      }
      
      this.debug('REACT', 'Setting up React runtime interception via webpack chunks');
      this.webpackHooksActive = true;
      
      const CHUNK = 'webpackChunk_control_front_end_app';
      const self = this;

      Object.defineProperty(window, CHUNK, {
        configurable: true,
        set: (chunkArray) => {
          self.debug('REACT', 'Webpack chunk array assigned');
          
          Object.defineProperty(chunkArray, 'push', {
            configurable: true,
            set: (finalJsonpPush) => {
              self.debug('REACT', 'Webpack push method being replaced');
              
              Object.defineProperty(chunkArray, 'push', {
                value: (payload) => {
                  const [, modules] = payload;
                  for (const [modId, factory] of Object.entries(modules)) {
                    modules[modId] = (module, exports, require) => {
                      factory(module, exports, require);

                      const isNamespaceWrapper = (obj) =>
                        typeof obj === 'object' &&
                        Symbol.toStringTag in obj &&
                        obj[Symbol.toStringTag] === 'Module';

                      const isReact =
                        !isNamespaceWrapper(exports)
                        && exports.createElement
                        && !(exports.h && exports.options);

                      if (isReact) {
                        self.debug('REACT', '✅ React runtime found →', exports);
                        self.reactRuntime = exports;
                        self.originalCreateElement = exports.createElement;
                        self.overrideCreateElement();
                        self.cleanupWebpackHooks();
                      }
                    };
                  }
                  return finalJsonpPush.call(this, payload);
                },
              });
            },
            get: () => Array.prototype.push,
          });

          delete window[CHUNK];
          window[CHUNK] = chunkArray;
        },
        get: () => undefined,
      });
    },
    
    cleanupWebpackHooks: function() {
      this.debug('REACT', 'Cleaning up webpack hooks after React runtime capture');
      this.webpackHooksActive = false;
      
      const CHUNK = 'webpackChunk_control_front_end_app';
      if (window[CHUNK]) {
        const chunkArray = window[CHUNK];
        delete window[CHUNK];
        window[CHUNK] = chunkArray;
        
        if (chunkArray && typeof chunkArray.push !== 'function') {
          chunkArray.push = Array.prototype.push;
        }
      }
      
      this.debug('REACT', 'Webpack hooks cleanup completed');
    },
    
    overrideCreateElement: function() {
      if (!this.reactRuntime || !this.originalCreateElement) {
        this.debug('REACT', '❌ Cannot override createElement - React runtime not available');
        return;
      }
      
      this.debug('REACT', 'Overriding React.createElement for StructureItem interception');
      
      const self = this;
      this.reactRuntime.createElement = function(type, props, ...children) {
        if (type && props && 
            typeof props.objType === 'string' &&
            typeof props.handleSelect === 'function' &&
            typeof props.level === 'number' &&
            props.hasOwnProperty('activeItem') &&
            props.hasOwnProperty('handleUpdate') &&
            props.hasOwnProperty('handleRemove') &&
            props.hasOwnProperty('handleDuplicate')) {
          
          self.debug('REACT', '🎯 StructureItem createElement intercepted by props:', { 
            objType: props.objType,
            title: props.title,
            level: props.level,
            id: props.id
          });
          
          if (props.objType === 'file') {
            self.debug('REACT', '📄 File StructureItem detected:', {
              id: props.id,
              title: props.title,
              objType: props.objType,
              level: props.level
            });
            
            const originalHandleSelect = props.handleSelect;
            props.handleSelect = function(...args) {
              self.debug('REACT', '🖱️ File selected via handleSelect:', {
                id: props.id,
                title: props.title,
                args: args
              });
              
              const result = originalHandleSelect.apply(this, args);
              
              setTimeout(() => {
                self.refreshScriptStructure((structure) => {
                  if (structure) {
                    self.debug('REACT', '✅ Script structure refreshed after file selection');
                  }
                });
              }, 100);
              
              return result;
            };
          }
        }
        
        return self.originalCreateElement.apply(self.reactRuntime, [type, props, ...children]);
      };
      
      this.debug('REACT', '✅ createElement successfully overridden with prop-based detection');
    },
    
    init: function() {
      if (this.initialized) {
        this.debug('INIT', 'SimulatorEnhancer already initialized');
        return;
      }
      
      this.debug('INIT', 'Initializing SimulatorEnhancer core...');
      this.initialized = true;
      
      this.interceptReactRuntime();
      this.waitForRedux();
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
