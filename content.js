(function () {
  "use strict";

  console.log("[SimulatorEnhancer:INIT] Core script loaded in MAIN world");

  window.SimulatorEnhancer = {
    version: "1.0.0",
    initialized: false,
    reduxInitialized: false,
    debugEnabled: true,
    reactRuntime: null,
    originalCreateElement: null,
    webpackHooksActive: false,

    debug: function (category, message, ...args) {
      if (!this.debugEnabled) return;
      const timestamp = new Date().toISOString().substr(11, 12);
      console.log(`[SimulatorEnhancer:${category}:${timestamp}]`, message, ...args);
    },

    getScriptParams: function () {
      const path = window.location.pathname;
      const match = path.match(/\/script\/([^\/]+)\/edit\/([^\/]+)/);
      if (match) {
        const params = {
          workspaceId: match[1],
          scriptId: match[2],
        };
        return params;
      }
      console.error("[SimulatorEnhancer:ERROR] Failed to extract script parameters from URL:", window.location.pathname);
      return null;
    },

    refreshScriptStructure: function (callback) {
      const params = this.getScriptParams();
      if (!params) {
        console.error("[SimulatorEnhancer:ERROR] Cannot extract script parameters from URL");
        if (callback) callback(null);
        return;
      }

      const { scriptId } = params;
      const envId = this.getActiveEnvId();

      if (!envId) {
        console.error("[SimulatorEnhancer:ERROR] Cannot determine active environment ID");
        if (callback) callback(null);
        return;
      }

      const store = this.getReduxStore();
      if (!store) {
        console.error("[SimulatorEnhancer:ERROR] Redux store not available for dispatch");
        if (callback) callback(null);
        return;
      }

      store.dispatch({
        type: "GET_SCRIPT_STRUCTURE_REQUEST",
        payload: { scriptId, envId },
        callback: callback,
      });
    },

    dispatchGetScriptStructure: function () {
      const store = this.getReduxStore();
      if (!store) {
        console.error("[SimulatorEnhancer:ERROR] Redux store not available");
        return;
      }

      const params = this.getScriptParams();
      if (!params) {
        console.error("[SimulatorEnhancer:ERROR] Cannot extract script parameters from URL");
        return;
      }

      const { scriptId } = params;
      const envId = this.getActiveEnvId();

      store.dispatch({
        type: "GET_SCRIPT_STRUCTURE_REQUEST",
        payload: { scriptId, envId },
      });
    },

    setupReduxDispatchInterceptor: function () {
      const store = this.getReduxStore();
      if (!store) {
        console.log("[SimulatorEnhancer] Cannot setup dispatch interceptor - Redux store not available");
        return;
      }

      if (store._originalDispatch) {
        console.log("[SimulatorEnhancer] Redux dispatch already intercepted");
        return;
      }

      console.log("[SimulatorEnhancer] Setting up Redux dispatch interceptor");

      const originalDispatch = store.dispatch;
      store._originalDispatch = originalDispatch;

      store.dispatch = function (action) {
        if (action && action.type === "GET_SCRIPT_STRUCTURE_SUCCESS") {
          console.log("[SimulatorEnhancer] GET_SCRIPT_STRUCTURE_SUCCESS intercepted:", action);
        }

        return originalDispatch.apply(this, arguments);
      };

      console.log("[SimulatorEnhancer] Redux dispatch interceptor setup complete");
    },

    getReduxStore: function () {
      const rootEl = document.getElementById("root");
      if (!rootEl) {
        return null;
      }

      const fiberKey = Object.keys(rootEl).find((k) => k.startsWith("__reactContainer$") || k.startsWith("__reactInternalInstance$"));

      if (!fiberKey) {
        return null;
      }

      const fiber = rootEl[fiberKey].current || rootEl[fiberKey];
      if (!fiber || !fiber.memoizedState || !fiber.memoizedState.element || !fiber.memoizedState.element.props) {
        return null;
      }

      const store = fiber.memoizedState.element.props.store;
      if (store && typeof store.dispatch === "function") {
        return store;
      }

      return null;
    },

    getActiveEnvId: function () {
      const scriptEditorComponent = this.findScriptEditorComponent();
      if (!scriptEditorComponent) {
        return "default";
      }

      const activeEnv = this.extractActiveEnvFromHooks(scriptEditorComponent);
      if (activeEnv && activeEnv.id) {
        return activeEnv.id;
      }

      return "default";
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

    initializeReduxConnection: function () {
      if (this.reduxInitialized) {
        return;
      }

      const store = this.getReduxStore();
      if (store) {
        this.reduxInitialized = true;
      } else {
        console.error("[SimulatorEnhancer:ERROR] Redux connection failed");
      }
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
            console.log("[SimulatorEnhancer:INIT] React runtime captured successfully");
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

      console.log("[SimulatorEnhancer:INIT] React.createElement override established");

      const self = this;
      this.reactRuntime.createElement = function (type, props, ...children) {
        if (
          type &&
          props &&
          typeof props.objType === "string" &&
          typeof props.handleSelect === "function" &&
          typeof props.level === "number" &&
          props.hasOwnProperty("activeItem") &&
          props.hasOwnProperty("handleUpdate") &&
          props.hasOwnProperty("handleRemove") &&
          props.hasOwnProperty("handleDuplicate")
        ) {
          if (props.objType === "file") {
            const originalHandleSelect = props.handleSelect;
            props.handleSelect = function (...args) {
              const result = originalHandleSelect.apply(this, args);

              setTimeout(() => {
                if (!self.reduxInitialized) {
                  self.initializeReduxConnection();
                }

                self.setupReduxDispatchInterceptor();

                if (self.reduxInitialized) {
                  self.dispatchGetScriptStructure();
                } else {
                  console.error("[SimulatorEnhancer:ERROR] Redux initialization failed, cannot dispatch");
                }
              }, 100);

              return result;
            };
          }
        }

        return self.originalCreateElement.apply(self.reactRuntime, [type, props, ...children]);
      };
    },

    init: function () {
      if (this.initialized) {
        return;
      }

      console.log("[SimulatorEnhancer:INIT] Initializing core functionality...");
      this.initialized = true;

      this.interceptReactRuntime();
    },
  };

  window.SimulatorEnhancer.init();
})();
