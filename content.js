(function() {
  'use strict';
  
  console.log('[SimulatorEnhancer:INIT] Core script loaded in MAIN world');
  
  window.SimulatorEnhancer = {
    version: '1.0.0',
    initialized: false,
    debugEnabled: true,
    reactRuntime: null,
    originalCreateElement: null,
    webpackHooksActive: false,
    reduxDispatch: null,
    
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
      if (!this.reduxDispatch) {
        this.findScriptEditorDispatch();
      }
      
      if (!this.reduxDispatch) {
        this.debug('REDUX', 'Redux dispatch not available');
        return;
      }
      
      this.debug('REDUX', 'Dispatching GET_SCRIPT_STRUCTURE.SUCCESS action');
      this.reduxDispatch({
        type: 'GET_SCRIPT_STRUCTURE.SUCCESS',
        payload: { content: structureData }
      });
      
      this.debug('REDUX', 'Redux state updated with fresh structure');
    },
    
    findScriptEditorDispatch: function() {
      this.debug('FIBER', 'Searching for ScriptEditor component via React Fiber');
      
      const findReactFiberNode = (dom) => {
        const key = Object.keys(dom).find(key => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'));
        return dom[key];
      };
      
      const traverseFiber = (fiber, depth = 0) => {
        if (!fiber || depth > 20) return null;
        
        if (fiber.type && fiber.type.name === 'ScriptEditor') {
          this.debug('FIBER', 'Found ScriptEditor component at depth:', depth);
          return fiber;
        }
        
        let result = null;
        if (fiber.child) {
          result = traverseFiber(fiber.child, depth + 1);
        }
        if (!result && fiber.sibling) {
          result = traverseFiber(fiber.sibling, depth + 1);
        }
        return result;
      };
      
      const rootElements = document.querySelectorAll('[id*="root"], [class*="app"], [class*="container"]');
      for (let element of rootElements) {
        const fiberNode = findReactFiberNode(element);
        if (fiberNode) {
          const scriptEditorFiber = traverseFiber(fiberNode);
          if (scriptEditorFiber && scriptEditorFiber.memoizedProps) {
            this.debug('FIBER', 'ScriptEditor fiber found, extracting dispatch from hooks');
            
            let currentHook = scriptEditorFiber.memoizedState;
            while (currentHook) {
              if (currentHook.queue && currentHook.queue.dispatch) {
                this.reduxDispatch = currentHook.queue.dispatch;
                this.debug('FIBER', 'Redux dispatch found via useDispatch hook');
                return true;
              }
              currentHook = currentHook.next;
            }
          }
        }
      }
      
      this.debug('FIBER', 'ScriptEditor component or dispatch not found');
      return false;
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

      if (window[CHUNK] && Array.isArray(window[CHUNK])) {
        self.debug('REACT', 'Webpack chunk array already exists, attaching interceptor');
        const existingChunkArray = window[CHUNK];
        self.attachPushInterceptor(existingChunkArray);
      } else {
        self.debug('REACT', 'Webpack chunk array not found, setting up property interceptor');
        Object.defineProperty(window, CHUNK, {
          configurable: true,
          set: (chunkArray) => {
            self.debug('REACT', 'Webpack chunk array assigned via property setter');
            self.attachPushInterceptor(chunkArray);
            delete window[CHUNK];
            window[CHUNK] = chunkArray;
          },
          get: () => undefined,
        });
      }
    },
    
    attachPushInterceptor: function(chunkArray) {
      const self = this;
      
      if (chunkArray.push && typeof chunkArray.push === 'function' && chunkArray.push !== Array.prototype.push) {
        self.debug('REACT', 'Custom push method already exists, intercepting it');
        const originalPush = chunkArray.push;
        chunkArray.push = function(payload) {
          self.interceptWebpackPayload(payload);
          return originalPush.call(this, payload);
        };
      } else {
        self.debug('REACT', 'Setting up push method interceptor');
        Object.defineProperty(chunkArray, 'push', {
          configurable: true,
          set: (finalJsonpPush) => {
            self.debug('REACT', 'Webpack push method being replaced');
            
            Object.defineProperty(chunkArray, 'push', {
              value: (payload) => {
                self.interceptWebpackPayload(payload);
                return finalJsonpPush.call(this, payload);
              },
            });
          },
          get: () => Array.prototype.push,
        });
      }
    },
    
    interceptWebpackPayload: function(payload) {
      const self = this;
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
      
      self.debug('REACT', '✅ createElement successfully overridden with prop-based detection');
    },
    
    init: function() {
      if (this.initialized) {
        this.debug('INIT', 'SimulatorEnhancer already initialized');
        return;
      }
      
      this.debug('INIT', 'Initializing SimulatorEnhancer core...');
      this.initialized = true;
      
      this.interceptReactRuntime();
      this.findScriptEditorDispatch();
    }
  };
  
  window.SimulatorEnhancer.init();
  
})();
