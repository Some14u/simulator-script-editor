(function() {
  'use strict';
  
  console.log('[SimulatorEnhancer:INIT] Core script injected into page context');
  
  window.SimulatorEnhancer = {
    version: '1.0.0',
    initialized: false,
    debugEnabled: true,
    
    debug: function(category, message, ...args) {
      if (!this.debugEnabled) return;
      const timestamp = new Date().toISOString().substr(11, 12);
      console.log(`[SimulatorEnhancer:${category}:${timestamp}]`, message, ...args);
    },
    
    getScriptParams: function() {
      this.debug('API', 'Extracting script parameters from URL:', window.location.pathname);
      const path = window.location.pathname;
      const match = path.match(/\/script\/(\d+)\/edit\/(\d+)/);
      if (match) {
        const params = {
          scriptId: match[1],
          envId: match[2]
        };
        this.debug('API', 'Script parameters extracted:', params);
        return params;
      }
      this.debug('API', 'Failed to extract script parameters from URL');
      return null;
    },
    
    recursiveFindObj: function(list, id, objType) {
      this.debug('FILE_SWITCH', 'Searching for file in structure:', { id, objType, listLength: list ? list.length : 0 });
      if (!list) return null;
      
      let file = list.find((i) => i.id === id && i.objType === objType);
      if (file) {
        this.debug('FILE_SWITCH', 'File found at current level:', file);
        return file;
      }
      
      for (const item of list) {
        file = this.recursiveFindObj(item.children || [], id, objType);
        if (file) {
          this.debug('FILE_SWITCH', 'File found in nested structure:', file);
          return file;
        }
      }
      this.debug('FILE_SWITCH', 'File not found in structure');
      return null;
    },
    
    makeSystemObjectsModel: function(data) {
      this.debug('API', 'Processing system objects model:', data);
      const STRUCTURE_ORDER = {
        pages: 1,
        definitions: 2,
        'style.css': 3,
        'locale.json': 4,
        'viewModel.json': 5,
      };
      
      const root = { ...data };
      for (const model of root.children) {
        model.priority = STRUCTURE_ORDER[model.title];
        switch (model.title) {
          case 'pages':
            model.icon = 'page';
            model.priority = 0;
            break;
          case 'definitions':
            model.priority = 1;
            model.icon = 'page_content';
            break;
          case 'style':
            model.priority = 2;
            model.icon = 'palette';
            break;
          case 'locale':
            model.priority = 3;
            model.icon = 'flag';
            break;
          case 'viewModel':
            model.priority = 4;
            model.icon = 'json';
            break;
        }
      }
      
      root.children.sort((a, b) => (a.priority || 999) - (b.priority || 999));
      this.debug('API', 'System objects model processed:', root);
      return root;
    },
    
    refreshScriptStructure: function(callback) {
      this.debug('API', 'Starting script structure refresh');
      const params = this.getScriptParams();
      if (!params) {
        this.debug('API', 'Cannot extract script parameters from URL');
        if (callback) callback(null);
        return;
      }
      
      const { scriptId, envId } = params;
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
        const processedData = this.makeSystemObjectsModel(data.data);
        this.updateReduxState(processedData);
        if (callback) callback(processedData);
      })
      .catch(error => {
        this.debug('API', 'Failed to refresh script structure:', error);
        if (callback) callback(null);
      });
    },
    
    updateReduxState: function(structureData) {
      this.debug('REDUX', 'Attempting to update Redux state with structure data');
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
    
    findScriptEditorComponent: function() {
      this.debug('REACT', 'Searching for ScriptEditor component');
      const editorElement = document.querySelector('[class*="se__content"]');
      if (!editorElement) {
        this.debug('REACT', 'ScriptEditor DOM element not found');
        return null;
      }
      
      this.debug('REACT', 'ScriptEditor DOM element found, searching for React Fiber');
      const fiberKey = Object.keys(editorElement).find(key => 
        key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber')
      );
      
      if (fiberKey) {
        this.debug('REACT', 'React Fiber key found:', fiberKey);
        let fiber = editorElement[fiberKey];
        while (fiber) {
          if (fiber.type && fiber.type.name === 'ScriptEditor') {
            this.debug('REACT', 'ScriptEditor component found via type.name');
            return fiber.stateNode;
          }
          if (fiber.elementType && fiber.elementType.name === 'ScriptEditor') {
            this.debug('REACT', 'ScriptEditor component found via elementType.name');
            return fiber.stateNode;
          }
          fiber = fiber.return;
        }
        this.debug('REACT', 'ScriptEditor component not found in Fiber tree');
      } else {
        this.debug('REACT', 'React Fiber key not found on element');
      }
      return null;
    },
    
    patchHandleSelect: function() {
      this.debug('REACT', 'Starting handleSelect patching process');
      const scriptEditorInstance = this.findScriptEditorComponent();
      if (!scriptEditorInstance) {
        this.debug('REACT', 'ScriptEditor component not found, cannot patch handleSelect');
        return;
      }
      
      this.debug('REACT', 'ScriptEditor component found, examining methods');
      
      const originalSetActiveFile = scriptEditorInstance.setActiveFile || 
                                    scriptEditorInstance.setState;
      
      if (!originalSetActiveFile) {
        this.debug('REACT', 'setActiveFile method not found on component');
        return;
      }
      
      this.debug('REACT', 'Original setActiveFile method found, creating wrapper');
      
      const enhancedSetActiveFile = (fileData) => {
        this.debug('FILE_SWITCH', 'Enhanced setActiveFile called with:', fileData);
        
        if (fileData && !fileData.isFolder && fileData.id) {
          this.debug('FILE_SWITCH', 'File selected, triggering structure refresh');
          
          this.refreshScriptStructure((refreshedStructure) => {
            if (refreshedStructure) {
              this.debug('FILE_SWITCH', 'Structure refreshed, searching for updated file');
              const updatedFile = this.recursiveFindObj(
                refreshedStructure.children,
                fileData.id,
                fileData.objType
              );
              this.debug('FILE_SWITCH', 'Using file data:', updatedFile || fileData);
              originalSetActiveFile.call(scriptEditorInstance, updatedFile || fileData);
            } else {
              this.debug('FILE_SWITCH', 'Structure refresh failed, using original file data');
              originalSetActiveFile.call(scriptEditorInstance, fileData);
            }
          });
        } else {
          this.debug('FILE_SWITCH', 'Non-file selection, using original method');
          originalSetActiveFile.call(scriptEditorInstance, fileData);
        }
      };
      
      scriptEditorInstance.setActiveFile = enhancedSetActiveFile;
      this.debug('REACT', 'handleSelect successfully patched');
    },
    
    init: function() {
      if (this.initialized) {
        this.debug('INIT', 'SimulatorEnhancer already initialized');
        return;
      }
      
      this.debug('INIT', 'Initializing SimulatorEnhancer core...');
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
          this.debug('REACT', 'React detected:', window.React.version);
          this.patchReact();
        } else if (document.querySelector('[data-reactroot]') || document.querySelector('[data-react-checksum]')) {
          this.debug('REACT', 'React application detected (no global React object)');
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
          this.debug('REDUX', 'Redux detected');
          this.patchRedux();
        } else if (window.store || this.findReduxStore()) {
          this.debug('REDUX', 'Redux store detected');
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
        this.debug('REACT', 'React Fiber instance found');
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
      this.debug('REACT', 'Setting up React monkey patches...');
      
      if (window.React && window.React.Component) {
        const originalComponentDidMount = window.React.Component.prototype.componentDidMount;
        window.React.Component.prototype.componentDidMount = function() {
          window.SimulatorEnhancer.debug('REACT', 'React component mounted:', this.constructor.name);
          if (originalComponentDidMount) {
            originalComponentDidMount.call(this);
          }
        };
      }
    },
    
    patchRedux: function() {
      this.debug('REDUX', 'Setting up Redux monkey patches...');
      
      if (this.reduxStore) {
        const originalDispatch = this.reduxStore.dispatch;
        this.reduxStore.dispatch = (action) => {
          window.SimulatorEnhancer.debug('REDUX', 'Redux action dispatched:', action);
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
          this.debug('INIT', 'Script editor detected, initializing enhancements');
          this.enhanceScriptEditor(scriptEditor);
        } else {
          setTimeout(checkScriptEditor, 1000);
        }
      };
      checkScriptEditor();
    },
    
    enhanceScriptEditor: function(editorElement) {
      this.debug('INIT', 'Enhancing script editor functionality...');
      
      this.patchAceEditor();
      this.enhanceFileTree();
      this.addCustomFeatures();
      
      setTimeout(() => {
        this.patchHandleSelect();
      }, 2000);
    },
    
    patchAceEditor: function() {
      if (window.ace) {
        this.debug('ACE', 'ACE Editor detected, setting up patches...');
        
        const originalCreateEditSession = window.ace.createEditSession;
        window.ace.createEditSession = function(text, mode) {
          window.SimulatorEnhancer.debug('ACE', 'ACE Editor session created with mode:', mode);
          return originalCreateEditSession.call(this, text, mode);
        };
      }
    },
    
    enhanceFileTree: function() {
      this.debug('FILE_TREE', 'Enhancing file tree functionality...');
      
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE && 
                  (node.classList.contains('file-tree') || 
                   node.querySelector && node.querySelector('[class*="file"]'))) {
                window.SimulatorEnhancer.debug('FILE_TREE', 'File tree element detected');
                window.SimulatorEnhancer.addFileTreeEnhancements(node);
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
      this.debug('FILE_TREE', 'Adding file tree enhancements...');
    },
    
    addCustomFeatures: function() {
      this.debug('INIT', 'Adding custom script editor features...');
      
      this.interceptAPIRequests();
    },
    
    interceptAPIRequests: function() {
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && url.includes('/script/')) {
          window.SimulatorEnhancer.debug('API', 'Script API request intercepted:', url);
        }
        return originalFetch.apply(this, args);
      };
      
      const originalXHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (typeof url === 'string' && url.includes('/script/')) {
          window.SimulatorEnhancer.debug('API', 'Script XHR request intercepted:', method, url);
        }
        return originalXHROpen.call(this, method, url, ...rest);
      };
    },
    

    
    setupMonkeyPatches: function() {
      this.debug('INIT', 'Setting up general monkey patches...');
      
      this.patchConsole();
    },
    
    patchConsole: function() {
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      console.log = function(...args) {
        originalLog.apply(console, args);
      };
      
      console.error = function(...args) {
        originalError.apply(console, args);
      };
      
      console.warn = function(...args) {
        originalWarn.apply(console, args);
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
