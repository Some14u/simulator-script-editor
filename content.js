(function () {
  "use strict";

  console.log("[SimulatorEnhancer:INIT] Core script loaded in MAIN world");

  const extensionBridge = window.extensionBridge;

  window.SimulatorEnhancer = {
    version: "1.0.0",
    initialized: false,
    reduxInitialized: false,
    debugEnabled: true,
    reactRuntime: null,
    originalCreateElement: null,
    webpackHooksActive: false,
    lastSelectedFile: null,
    pendingFileUpdate: false,
    reduxStore: null,
    configManager: null,

    debug: function (category, message, ...args) {
      if (!this.configManager || this.configManager.getSetting('debugEnabled')) {
        const timestamp = new Date().toISOString().substr(11, 12);
        console.log(`[SimulatorEnhancer:${category}:${timestamp}]`, message, ...args);
      }
    },

    async initConfigManager() {
      try {
        let attempts = 0;
        while (!extensionBridge.configManager && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!extensionBridge.configManager) {
          throw new Error('ConfigManager API not available via bridge');
        }
        
        this.configManager = extensionBridge.configManager;
        const config = await this.configManager.getConfig();
      } catch (error) {
        console.error('[SimulatorEnhancer:ERROR] Failed to initialize ConfigManager via bridge:', error);
        this.configManager = {
          getSetting: (key) => {
            const fallback = {
              maxTotalEntries: 10,
              debugEnabled: true,
              enableCursorMemory: true,
              enableSelectionMemory: true
            };
            return fallback[key];
          }
        };
      }
    },

    identifyComponent: function(props) {
      if (!props || typeof props !== 'object') {
        return null;
      }

      if (props.store && 
          typeof props.store === 'object' &&
          typeof props.store.dispatch === 'function' &&
          typeof props.store.getState === 'function' &&
          typeof props.store.subscribe === 'function') {
        return 'ReduxProvider';
      }

      if (props.aceEditorRef && 
          typeof props.aceEditorRef === 'object' &&
          typeof props.mode === 'string' &&
          typeof props.theme === 'string' &&
          typeof props.text === 'string') {
        return 'AceEditorReact';
      }

      if (props.fileId && 
          typeof props.readOnly === 'boolean' &&
          typeof props.showPanel === 'boolean' &&
          typeof props.handleTogglePanel === 'function' &&
          typeof props.handleChange === 'function') {
        return 'ScriptFileEditor';
      }

      if (typeof props.handleSelect === 'function' &&
          typeof props.objType === 'string' &&
          typeof props.level === 'number' &&
          props.hasOwnProperty('activeItem') &&
          props.hasOwnProperty('handleUpdate') &&
          props.hasOwnProperty('handleRemove') &&
          props.hasOwnProperty('handleDuplicate')) {
        return 'StructureItem';
      }

      return null;
    },

    dispatchGetScriptStructure: function () {
      const store = this.getReduxStore();
      if (!store) {
        console.error("[SimulatorEnhancer:ERROR] Redux store not available");
        return;
      }

      const activeEnv = this.getActiveEnv();
      if (!activeEnv || !activeEnv.actorId || !activeEnv.id) {
        console.error("[SimulatorEnhancer:ERROR] Cannot extract activeEnv or missing actorId/id");
        return;
      }

      store.dispatch({
        type: "GET_SCRIPT_STRUCTURE_REQUEST",
        payload: { scriptId: activeEnv.actorId, envId: activeEnv.id },
      });
    },
    
    setupReduxStoreSubscription: function() {
      const store = this.getReduxStore();
      if (!store || !store.subscribe) {
        return;
      }
      
      if (this.storeUnsubscribe) {
        return;
      }
      
      let previousScriptContent = null;
      const self = this;
      
      const unsubscribe = store.subscribe(() => {
        try {
          const state = store.getState();
          const currentScriptContent = state.scriptContent;
          
          if (currentScriptContent && 
              currentScriptContent.reqStatus === 'success' && 
              currentScriptContent !== previousScriptContent) {
            if (self.pendingFileUpdate && self.lastSelectedFile) {
              self.executeDeferredFileUpdate();
            }
          }
          
          previousScriptContent = currentScriptContent;
        } catch (error) {
          console.error('[SimulatorEnhancer] Error in store subscription:', error);
        }
      });
      
      this.storeUnsubscribe = unsubscribe;
    },

    getReduxStore: function () {
      return this.reduxStore;
    },

    getActiveEnv: function () {
      const scriptEditorComponent = this.findScriptEditorComponent();
      if (!scriptEditorComponent) {
        return null;
      }

      const activeEnv = this.extractActiveEnvFromHooks(scriptEditorComponent);
      return activeEnv;
    },

    findScriptEditorComponent: function () {
      const scriptEditorElement = document.querySelector('#mainRoot > [class^="se__"]');
      if (!scriptEditorElement) {
        return null;
      }

      const fiberKey = Object.keys(scriptEditorElement).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$") || key.startsWith("__reactContainer$"));

      if (!fiberKey) {
        return null;
      }

      let fiber = scriptEditorElement[fiberKey];

      while (fiber && fiber.return) {
        fiber = fiber.return;
        if (fiber.type && typeof fiber.type === "function") {
          return fiber;
        }
      }

      return null;
    },

    extractActiveEnvFromHooks: function (scriptEditorFiber) {
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

    isActiveEnvObject: function (obj) {
      if (!obj || typeof obj !== "object") return false;

      const hasRequiredProps =
        typeof obj.id !== "undefined" &&
        typeof obj.title === "string" &&
        typeof obj.actorId === "string" &&
        typeof obj.corezoidCredentials === "object" &&
        typeof obj.rootFolderId !== "undefined" &&
        typeof obj.isSystem === "boolean";

      return hasRequiredProps;
    },



    interceptReactRuntime: function () {
      if (this.webpackHooksActive) {
        return;
      }

      this.webpackHooksActive = true;

      const CHUNK = "webpackChunk_control_front_end_app";
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

    attachPushInterceptor: function (chunkArray) {
      const self = this;

      if (chunkArray.push && typeof chunkArray.push === "function" && chunkArray.push !== Array.prototype.push) {
        const originalPush = chunkArray.push;
        chunkArray.push = function (payload) {
          self.interceptWebpackPayload(payload);
          return originalPush.call(this, payload);
        };
      } else {
        Object.defineProperty(chunkArray, "push", {
          configurable: true,
          set: (finalJsonpPush) => {
            Object.defineProperty(chunkArray, "push", {
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

    interceptWebpackPayload: function (payload) {
      const self = this;
      const [, modules] = payload;

      for (const [modId, factory] of Object.entries(modules)) {
        modules[modId] = (module, exports, require) => {
          factory(module, exports, require);

          const isNamespaceWrapper = (obj) => typeof obj === "object" && Symbol.toStringTag in obj && obj[Symbol.toStringTag] === "Module";

          const isReact = !isNamespaceWrapper(exports) && exports.createElement && !(exports.h && exports.options);

          if (isReact) {
            self.reactRuntime = exports;
            self.originalCreateElement = exports.createElement;
            self.overrideCreateElement();
            self.cleanupWebpackHooks();
          }
        };
      }
    },

    cleanupWebpackHooks: function () {
      this.webpackHooksActive = false;

      const CHUNK = "webpackChunk_control_front_end_app";
      if (window[CHUNK]) {
        const chunkArray = window[CHUNK];
        delete window[CHUNK];
        window[CHUNK] = chunkArray;

        if (chunkArray && typeof chunkArray.push !== "function") {
          chunkArray.push = Array.prototype.push;
        }
      }
    },

    overrideCreateElement: function () {
      if (!this.reactRuntime || !this.originalCreateElement) {
        console.error("[SimulatorEnhancer:ERROR] Cannot override createElement - React runtime not available");
        return;
      }

      const self = this;
      this.reactRuntime.createElement = function (type, props, ...children) {
        const componentType = self.identifyComponent(props);
        
        switch (componentType) {
          case 'ReduxProvider':
            if (!self.reduxInitialized) {
              self.reduxStore = props.store;
              self.reduxInitialized = true;
              self.setupReduxStoreSubscription();
            }
            break;

          case 'AceEditorReact':
            break;

          case 'ScriptFileEditor':
            break;

          case 'StructureItem':
            if (props.objType === "file") {
              const originalHandleSelect = props.handleSelect;
              props.handleSelect = function (...args) {
                self.lastSelectedFile = {
                  id: props.id,
                  title: props.title,
                  objType: props.objType,
                  originalHandler: originalHandleSelect,
                  handlerContext: this,
                  handlerArgs: args
                };
                self.pendingFileUpdate = true;
                
                if (self.reduxInitialized) {
                  self.dispatchGetScriptStructure();
                } else {
                  console.error("[SimulatorEnhancer:ERROR] Redux not initialized, cannot dispatch");
                }
              };
            }
            break;
        }

        return self.originalCreateElement.apply(self.reactRuntime, [type, props, ...children]);
      };
    },
    
    executeDeferredFileUpdate: function() {
      if (!this.lastSelectedFile || !this.pendingFileUpdate) {
        return;
      }
      
      try {
        const { originalHandler, handlerContext, handlerArgs } = this.lastSelectedFile;
        originalHandler.apply(handlerContext, handlerArgs);
        this.pendingFileUpdate = false;
      } catch (error) {
        console.error('[SimulatorEnhancer] Error executing deferred file update:', error);
        this.pendingFileUpdate = false;
      }
    },

    cleanup: function() {
      if (this.storeUnsubscribe) {
        this.storeUnsubscribe();
        this.storeUnsubscribe = null;
      }
      
      this.lastSelectedFile = null;
      this.pendingFileUpdate = false;
    },

    async init() {
      if (this.initialized) {
        return;
      }

      console.log("[SimulatorEnhancer:INIT] Initializing core functionality...");
      this.initialized = true;
      
      await this.initConfigManager();
      
      this.setupReduxStoreSubscription();
      this.interceptReactRuntime();
      
      window.addEventListener('beforeunload', () => {
        this.cleanup();
      });
    }
  };

  window.SimulatorEnhancer.init().catch(error => {
    console.error('[SimulatorEnhancer:ERROR] Failed to initialize:', error);
  });
})();
