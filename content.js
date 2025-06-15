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
    deferredFileOperations: [],
    reduxSuccessListenerSetup: false,

    
    debug: function(category, message, ...args) {
      if (!this.debugEnabled) return;
      const timestamp = new Date().toISOString().substr(11, 12);
      console.log(`[SimulatorEnhancer:${category}:${timestamp}]`, message, ...args);
    },
    
    getScriptParams: function() {
      const path = window.location.pathname;
      const match = path.match(/\/script\/([^\/]+)\/edit\/([^\/]+)/);
      if (match) {
        const params = {
          workspaceId: match[1],
          scriptId: match[2]
        };
        return params;
      }
      console.error('[SimulatorEnhancer:ERROR] Failed to extract script parameters from URL:', window.location.pathname);
      return null;
    },
    
    refreshScriptStructure: function(callback) {
      const params = this.getScriptParams();
      if (!params) {
        console.error('[SimulatorEnhancer:ERROR] Cannot extract script parameters from URL');
        if (callback) callback(null);
        return;
      }
      
      const { scriptId } = params;
      const envId = this.getActiveEnvId();
      
      if (!envId) {
        console.error('[SimulatorEnhancer:ERROR] Cannot determine active environment ID');
        if (callback) callback(null);
        return;
      }
      
      const store = this.getReduxStore();
      if (!store) {
        console.error('[SimulatorEnhancer:ERROR] Redux store not available for dispatch');
        if (callback) callback(null);
        return;
      }
      
      store.dispatch({
        type: 'GET_SCRIPT_STRUCTURE_REQUEST',
        payload: { scriptId, envId },
        callback: callback
      });
    },

    dispatchGetScriptStructure: function() {
      const store = this.getReduxStore();
      if (!store) {
        console.error('[SimulatorEnhancer:ERROR] Redux store not available');
        return;
      }
      
      const params = this.getScriptParams();
      if (!params) {
        console.error('[SimulatorEnhancer:ERROR] Cannot extract script parameters from URL');
        return;
      }
      
      const { scriptId } = params;
      const envId = this.getActiveEnvId();
      
      console.log('[SimulatorEnhancer:DEFERRED] Dispatching GET_SCRIPT_STRUCTURE_REQUEST for deferred operations', {
        scriptId: scriptId,
        envId: envId,
        deferredCount: this.deferredFileOperations.length
      });
      
      store.dispatch({
        type: 'GET_SCRIPT_STRUCTURE_REQUEST',
        payload: { scriptId, envId }
      });
    },
    
    addDeferredFileOperation: function(fileId, fileName, originalHandleSelect, selectArgs) {
      const operation = {
        id: Date.now() + Math.random(),
        fileId: fileId,
        fileName: fileName,
        originalHandleSelect: originalHandleSelect,
        selectArgs: selectArgs,
        timestamp: Date.now()
      };
      
      this.deferredFileOperations.push(operation);
      console.log('[SimulatorEnhancer:DEFERRED] Added deferred file operation:', {
        operationId: operation.id,
        fileId: fileId,
        fileName: fileName,
        totalDeferred: this.deferredFileOperations.length,
        timestamp: operation.timestamp
      });
      
      return operation.id;
    },
    
    executeDeferredFileOperations: function() {
      console.log('[SimulatorEnhancer:DEFERRED] Starting execution of deferred file operations:', {
        count: this.deferredFileOperations.length
      });
      
      if (this.deferredFileOperations.length === 0) {
        console.log('[SimulatorEnhancer:DEFERRED] No deferred operations to execute');
        return;
      }
      
      const operations = [...this.deferredFileOperations];
      this.deferredFileOperations = [];
      
      operations.forEach((operation, index) => {
        console.log('[SimulatorEnhancer:DEFERRED] Executing operation', {
          step: `${index + 1}/${operations.length}`,
          operationId: operation.id,
          fileId: operation.fileId,
          fileName: operation.fileName,
          age: Date.now() - operation.timestamp
        });
        
        try {
          const result = operation.originalHandleSelect.apply(null, operation.selectArgs);
          console.log('[SimulatorEnhancer:DEFERRED] Operation executed successfully:', {
            operationId: operation.id,
            result: result
          });
        } catch (error) {
          console.error('[SimulatorEnhancer:DEFERRED] Operation execution failed:', {
            operationId: operation.id,
            error: error.message,
            stack: error.stack
          });
        }
      });
      
      console.log('[SimulatorEnhancer:DEFERRED] All deferred operations completed');
    },
    
    setupReduxSuccessListener: function() {
      if (this.reduxSuccessListenerSetup) {
        console.log('[SimulatorEnhancer:DEFERRED] Redux success listener already setup');
        return;
      }
      
      const store = this.getReduxStore();
      if (!store) {
        console.error('[SimulatorEnhancer:DEFERRED] Cannot setup success listener - Redux store not available');
        return;
      }
      
      console.log('[SimulatorEnhancer:DEFERRED] Setting up GET_SCRIPT_STRUCTURE_SUCCESS listener');
      
      const originalDispatch = store.dispatch;
      const self = this;
      
      store.dispatch = function(action) {
        const result = originalDispatch.apply(this, arguments);
        
        if (action && action.type === 'GET_SCRIPT_STRUCTURE_SUCCESS') {
          console.log('[SimulatorEnhancer:DEFERRED] GET_SCRIPT_STRUCTURE_SUCCESS intercepted:', {
            actionType: action.type,
            hasPayload: !!action.payload,
            deferredCount: self.deferredFileOperations.length,
            payloadKeys: action.payload ? Object.keys(action.payload) : []
          });
          
          if (self.deferredFileOperations.length > 0) {
            console.log('[SimulatorEnhancer:DEFERRED] Structure updated, scheduling deferred file operations execution');
            setTimeout(() => {
              self.executeDeferredFileOperations();
            }, 150);
          } else {
            console.log('[SimulatorEnhancer:DEFERRED] No deferred operations to execute after structure update');
          }
        }
        
        return result;
      };
      
      this.reduxSuccessListenerSetup = true;
      console.log('[SimulatorEnhancer:DEFERRED] Redux dispatch successfully patched for success listener');
    },
    
    cleanupOldDeferredOperations: function() {
      const maxAge = 30000; // 30 seconds
      const now = Date.now();
      const initialCount = this.deferredFileOperations.length;
      
      this.deferredFileOperations = this.deferredFileOperations.filter(operation => {
        const age = now - operation.timestamp;
        if (age > maxAge) {
          console.log('[SimulatorEnhancer:DEFERRED] Removing old deferred operation:', {
            operationId: operation.id,
            age: age,
            fileId: operation.fileId,
            fileName: operation.fileName
          });
          return false;
        }
        return true;
      });
      
      const removedCount = initialCount - this.deferredFileOperations.length;
      if (removedCount > 0) {
        console.log('[SimulatorEnhancer:DEFERRED] Cleaned up old deferred operations:', {
          removedCount: removedCount,
          remainingCount: this.deferredFileOperations.length
        });
      }
    },
    
    getReduxStore: function() {
      const rootEl = document.getElementById('root');
      if (!rootEl) {
        return null;
      }
      
      const fiberKey = Object.keys(rootEl).find(k => 
        k.startsWith('__reactContainer$') || k.startsWith('__reactInternalInstance$')
      );
      
      if (!fiberKey) {
        return null;
      }
      
      const fiber = rootEl[fiberKey].current || rootEl[fiberKey];
      if (!fiber || !fiber.memoizedState || !fiber.memoizedState.element || !fiber.memoizedState.element.props) {
        return null;
      }
      
      const store = fiber.memoizedState.element.props.store;
      if (store && typeof store.dispatch === 'function') {
        return store;
      }
      
      return null;
    },

    getActiveEnvId: function() {
      const scriptEditorComponent = this.findScriptEditorComponent();
      if (!scriptEditorComponent) {
        return 'default';
      }
      
      const activeEnv = this.extractActiveEnvFromHooks(scriptEditorComponent);
      if (activeEnv && activeEnv.id) {
        return activeEnv.id;
      }
      
      return 'default';
    },

    findScriptEditorComponent: function() {
      const scriptEditorElement = document.querySelector('#mainRoot > [class^="se__"]');
      if (!scriptEditorElement) {
        return null;
      }
      
      const fiberKey = Object.keys(scriptEditorElement).find(key => 
        key.startsWith('__reactFiber$') || 
        key.startsWith('__reactInternalInstance$') ||
        key.startsWith('__reactContainer$')
      );
      
      if (!fiberKey) {
        return null;
      }
      
      let fiber = scriptEditorElement[fiberKey];
      
      while (fiber && fiber.return) {
        fiber = fiber.return;
        if (fiber.type && typeof fiber.type === 'function') {
          return fiber;
        }
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
      
      return hasRequiredProps;
    },



    initializeReduxConnection: function() {
      if (this.reduxInitialized) {
        console.log('[SimulatorEnhancer:DEFERRED] Redux already initialized, skipping');
        return;
      }
      
      console.log('[SimulatorEnhancer:DEFERRED] Initializing Redux connection...');
      
      const store = this.getReduxStore();
      if (store) {
        this.reduxInitialized = true;
        console.log('[SimulatorEnhancer:DEFERRED] Redux connection established successfully');
      } else {
        console.error('[SimulatorEnhancer:DEFERRED] Redux connection failed');
      }
    },
    
    interceptReactRuntime: function() {
      if (this.webpackHooksActive) {
        return;
      }
      
      this.webpackHooksActive = true;
      
      const CHUNK = 'webpackChunk_control_front_end_app';
      const self = this;

      if (window[CHUNK] && Array.isArray(window[CHUNK])) {
        const existingChunkArray = window[CHUNK];
        self.attachPushInterceptor(existingChunkArray);
      } else {
        Object.defineProperty(window, CHUNK, {
          configurable: true,
          set: (chunkArray) => {
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
        const originalPush = chunkArray.push;
        chunkArray.push = function(payload) {
          self.interceptWebpackPayload(payload);
          return originalPush.call(this, payload);
        };
      } else {
        Object.defineProperty(chunkArray, 'push', {
          configurable: true,
          set: (finalJsonpPush) => {
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
            console.log('[SimulatorEnhancer:INIT] React runtime captured successfully');
            self.reactRuntime = exports;
            self.originalCreateElement = exports.createElement;
            self.overrideCreateElement();
            self.cleanupWebpackHooks();
          }
        };
      }
    },
    
    cleanupWebpackHooks: function() {
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
    },
    
    overrideCreateElement: function() {
      if (!this.reactRuntime || !this.originalCreateElement) {
        console.error('[SimulatorEnhancer:ERROR] Cannot override createElement - React runtime not available');
        return;
      }
      
      console.log('[SimulatorEnhancer:INIT] React.createElement override established');
      
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
          
          if (props.objType === 'file') {
            console.log('[SimulatorEnhancer:DEFERRED] File StructureItem detected:', {
              id: props.id,
              title: props.title,
              objType: props.objType,
              level: props.level
            });
            
            const originalHandleSelect = props.handleSelect;
            props.handleSelect = function(...args) {
              console.log('[SimulatorEnhancer:DEFERRED] File selection intercepted:', {
                id: props.id,
                title: props.title,
                args: args,
                argsLength: args.length
              });
              
              const operationId = self.addDeferredFileOperation(
                props.id,
                props.title,
                originalHandleSelect,
                args
              );
              
              console.log('[SimulatorEnhancer:DEFERRED] File operation deferred, triggering structure refresh:', {
                operationId: operationId,
                fileId: props.id,
                fileName: props.title
              });
              
              setTimeout(() => {
                if (!self.reduxInitialized) {
                  console.log('[SimulatorEnhancer:DEFERRED] Initializing Redux connection for deferred operation');
                  self.initializeReduxConnection();
                }
                
                if (!self.reduxSuccessListenerSetup) {
                  console.log('[SimulatorEnhancer:DEFERRED] Setting up Redux success listener');
                  self.setupReduxSuccessListener();
                }
                
                if (self.reduxInitialized) {
                  console.log('[SimulatorEnhancer:DEFERRED] Dispatching structure refresh for deferred operation:', {
                    operationId: operationId
                  });
                  self.dispatchGetScriptStructure();
                } else {
                  console.error('[SimulatorEnhancer:DEFERRED] Redux initialization failed, executing operation immediately:', {
                    operationId: operationId
                  });
                  setTimeout(() => {
                    self.executeDeferredFileOperations();
                  }, 100);
                }
              }, 50);
              
              console.log('[SimulatorEnhancer:DEFERRED] Original handleSelect execution prevented, will execute after structure update');
              return undefined;
            };
          }
        }
        
        return self.originalCreateElement.apply(self.reactRuntime, [type, props, ...children]);
      };
    },
    
    init: function() {
      if (this.initialized) {
        return;
      }
      
      console.log('[SimulatorEnhancer:INIT] Initializing core functionality...');
      this.initialized = true;
      
      this.interceptReactRuntime();
      
      setInterval(() => {
        this.cleanupOldDeferredOperations();
      }, 15000); // Clean up every 15 seconds
      
      console.log('[SimulatorEnhancer:INIT] Deferred file operations system initialized');
    }
  };
  
  window.SimulatorEnhancer.init();
  
})();
