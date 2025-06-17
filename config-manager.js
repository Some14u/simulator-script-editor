class ConfigManager {
  constructor() {
    this.storageKey = 'config';
    this.positionsPrefix = 'ace-pos';
    this.defaultSettings = null;
    this.config = {};
    this.initialized = false;
    this.initPromise = null;
  }

  async loadDefaultConfig() {
    try {
      const response = await fetch(chrome.runtime.getURL('default-config.json'));
      this.defaultSettings = await response.json();
    } catch (error) {
      console.error('[ConfigManager] Failed to load default-config.json:', error);
      this.defaultSettings = {
        maxTotalEntries: 10,
        debugEnabled: true,
        enableCursorMemory: true,
        enableSelectionMemory: true
      };
    }
  }

  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        await this.loadDefaultConfig();
        const result = await chrome.storage.local.get(this.storageKey);
        const stored = result[this.storageKey] || {};
        this.config = { ...this.defaultSettings, ...stored };
        await this.cleanupOldEntries();
        this.initialized = true;
        return this.config;
      } catch (error) {
        console.error('[ConfigManager] Initialization failed:', error);
        this.initialized = false;
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  async getConfig() {
    if (!this.initialized) {
      if (this.initPromise) {
        await this.initPromise;
      } else {
        await this.init();
      }
    }
    return this.config;
  }

  getSetting(key) {
    return this.config[key];
  }

  async setSetting(key, value) {
    this.config[key] = value;
    await chrome.storage.local.set({ [this.storageKey]: this.config });
  }

  makePositionKey(scriptId, envId) {
    return `${this.positionsPrefix}-${scriptId}-${envId}`;
  }

  async loadPositionGroup(scriptId, envId) {
    const key = this.makePositionKey(scriptId, envId);
    const result = await chrome.storage.local.get(key);
    return result[key] || {};
  }

  async savePositionGroup(scriptId, envId, groupObj) {
    const key = this.makePositionKey(scriptId, envId);
    await chrome.storage.local.set({ [key]: groupObj });
  }

  async getPosition(scriptId, envId, fileId) {
    const group = await this.loadPositionGroup(scriptId, envId);
    return group[fileId] || null;
  }

  async savePosition(scriptId, envId, fileId, { cursor, selection }) {
    const group = await this.loadPositionGroup(scriptId, envId);
    group[fileId] = { cursor, selection, lastUsed: Date.now() };
    await this.savePositionGroup(scriptId, envId, group);
  }

  async cleanupOldEntries() {
    const maxTotalEntries = this.config.maxTotalEntries;
    const stored = await chrome.storage.local.get(null);
    const groupKeys = Object.keys(stored).filter(
      key => key.startsWith(`${this.positionsPrefix}-`)
    );

    const entries = [];
    for (const key of groupKeys) {
      const files = stored[key] || {};
      for (const [fileId, data] of Object.entries(files)) {
        entries.push({ key, fileId, lastUsed: data.lastUsed });
      }
    }

    if (entries.length <= maxTotalEntries) return;

    entries.sort((a, b) => a.lastUsed - b.lastUsed);
    const toRemove = entries.slice(0, entries.length - maxTotalEntries);

    const removals = toRemove.reduce((map, { key, fileId }) => {
      if (!map[key]) map[key] = [];
      map[key].push(fileId);
      return map;
    }, {});

    for (const [groupKey, fileIds] of Object.entries(removals)) {
      const groupObj = stored[groupKey] || {};
      fileIds.forEach(id => delete groupObj[id]);
      if (Object.keys(groupObj).length) {
        await chrome.storage.local.set({ [groupKey]: groupObj });
      } else {
        await chrome.storage.local.remove(groupKey);
      }
    }
  }
}
