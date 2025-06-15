(function() {
  'use strict';
  
  console.log('[SimulatorEnhancer:INIT] Core script loaded in MAIN world');
  
  window.SimulatorEnhancer = {
    version: '1.0.0',
    initialized: false,
    reduxInitialized: false,
    debugEnabled: true,
    reactRuntime: null,
    originalCreateElement: null,
    webpackHooksActive: false,

    
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
      this.debug('REDUX', 'Starting script structure refresh via Redux dispatch');
      const params = this.getScriptParams();
      if (!params) {
        this.debug('REDUX', 'Cannot extract script parameters from URL');
        if (callback) callback(null);
        return;
      }
      
      const { scriptId } = params;
      const envId = this.getActiveEnvId();
      
      if (!envId) {
        this.debug('REDUX', 'Cannot determine active environment ID');
        if (callback) callback(null);
        return;
      }
      
      const store = this.getReduxStore();
      if (!store) {
        this.debug('REDUX', 'Redux store not available for dispatch');
        if (callback) callback(null);
        return;
      }
      
      this.debug('REDUX', 'Dispatching GET_SCRIPT_STRUCTURE.REQUEST', { scriptId, envId });
      
      store.dispatch({
        type: 'GET_SCRIPT_STRUCTURE.REQUEST',
        payload: { scriptId, envId },
        callback: callback
      });
      
      this.debug('REDUX', 'GET_SCRIPT_STRUCTURE.REQUEST dispatched successfully');
    },

    dispatchGetScriptStructure: function() {
      const store = this.getReduxStore();
      if (!store) {
        this.debug('REDUX', 'Redux store not available');
        return;
      }
      
      const envId = this.getActiveEnvId();
      this.debug('REDUX', 'Dispatching GET_SCRIPT_STRUCTURE.REQUEST with envId:', envId);
      
      store.dispatch({
        type: 'GET_SCRIPT_STRUCTURE.REQUEST',
        payload: { envId: envId }
      });
    },
    
    getReduxStore: function() {
      this.debug('REDUX', 'Getting Redux store via reliable fiber method');
      
      const rootEl = document.getElementById('root');
      if (!rootEl) {
        this.debug('REDUX', 'Root element not found');
        return null;
      }
      
      const fiberKey = Object.keys(rootEl).find(k => 
        k.startsWith('__reactContainer$') || k.startsWith('__reactInternalInstance$')
      );
      
      if (!fiberKey) {
        this.debug('REDUX', 'React container key not found');
        return null;
      }
      
      const fiber = rootEl[fiberKey].current || rootEl[fiberKey];
      if (!fiber || !fiber.memoizedState || !fiber.memoizedState.element || !fiber.memoizedState.element.props) {
        this.debug('REDUX', 'Redux store not found in fiber structure');
        return null;
      }
      
      const store = fiber.memoizedState.element.props.store;
      if (store && typeof store.dispatch === 'function') {
        this.debug('REDUX', 'Redux store successfully retrieved:', {
          hasDispatch: !!store.dispatch,
          hasGetState: !!store.getState,
          hasSubscribe: !!store.subscribe,
          hasRunSaga: !!store.runSaga
        });
        return store;
      }
      
      this.debug('REDUX', 'Invalid Redux store structure');
      return null;
    },

    getActiveEnvId: function() {
      this.debug('ENV', 'Searching for activeEnv in React component state');
      
      const scriptEditorComponent = this.findScriptEditorComponent();
      if (!scriptEditorComponent) {
        this.debug('ENV', 'ScriptEditor component not found');
        return 'default';
      }
      
      const activeEnv = this.extractActiveEnvFromHooks(scriptEditorComponent);
      if (activeEnv && activeEnv.id) {
        this.debug('ENV', 'Found activeEnv:', activeEnv);
        return activeEnv.id;
      }
      
      this.debug('ENV', 'activeEnv not found, using default');
      return 'default';
    },

    findScriptEditorComponent: function() {
      const rootElement = document.getElementById('root');
      if (!rootElement) return null;
      
      const fiberKey = Object.keys(rootElement).find(key => 
        key.startsWith('__reactContainer$') || key.startsWith('__reactInternalInstance$')
      );
      
      if (!fiberKey) return null;
      
      const fiber = rootElement[fiberKey].current || rootElement[fiberKey];
      return this.traverseFiberForScriptEditor(fiber);
    },

    traverseFiberForScriptEditor: function(fiber) {
      if (!fiber) return null;
      
      if (fiber.type && fiber.type.name === 'ScriptEditor') {
        return fiber;
      }
      
      let child = fiber.child;
      while (child) {
        const result = this.traverseFiberForScriptEditor(child);
        if (result) return result;
        child = child.sibling;
      }
      
      return null;
    },

    extractActiveEnvFromHooks: function(scriptEditorFiber) {
      if (!scriptEditorFiber.memoizedState) return null;
      
      let hook = scriptEditorFiber.memoizedState;
      while (hook) {
        const state = hook.memoizedState;
        
        if (this.isActiveEnvObject(state)) {
          return state;
        }
        
        hook = hook.next;
      }
      
      return null;
    },

    isActiveEnvObject: function(obj) {
      if (!obj || typeof obj !== 'object') return false;
      
      const hasRequiredProps = 
        typeof obj.id !== 'undefined' &&
        typeof obj.title === 'string' &&
        typeof obj.actorId === 'string' &&
        typeof obj.corezoidCredentials === 'object' &&
        typeof obj.rootFolderId !== 'undefined' &&
        typeof obj.isSystem === 'boolean';
      
      this.debug('ENV', 'Checking object for activeEnv properties:', {
        obj: obj,
        hasRequiredProps: hasRequiredProps
      });
      
      return hasRequiredProps;
    },



    initializeReduxConnection: function() {
      if (this.reduxInitialized) {
        this.debug('REDUX', 'Redux already initialized, skipping');
        return;
      }
      
      this.debug('REDUX', 'Initializing Redux connection...');
      
      const store = this.getReduxStore();
      if (store) {
        this.reduxInitialized = true;
        this.debug('REDUX', 'Redux connection established successfully');
      } else {
        this.debug('REDUX', 'Redux connection failed');
      }
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
                if (!self.reduxInitialized) {
                  self.debug('REDUX', 'Redux not initialized, initializing now...');
                  self.initializeReduxConnection();
                }
                
                if (self.reduxInitialized) {
                  self.dispatchGetScriptStructure();
                  self.debug('REACT', '✅ Script structure refresh dispatched after file selection');
                } else {
                  self.debug('REACT', '❌ Redux initialization failed, cannot dispatch');
                }
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
    }
  };
  
  window.SimulatorEnhancer.init();
  
})();
