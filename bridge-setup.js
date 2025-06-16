const BUS_ID = 'ext_bridge_bus';
(function setupBus() {
  let bus = document.getElementById(BUS_ID);
  if (!bus) {
    bus = document.createElement('div');
    bus.id = BUS_ID;
    bus.style.display = 'none';
    bus.dataset.callEvent = 'ext-bridge-call';
    bus.dataset.responseEvent = 'ext-bridge-response';
    document.documentElement.appendChild(bus);
  }
})();

class ExtensionBridge {
  constructor(busId) {
    this.eventBus = document.getElementById(busId);
    this._callbacks = new Map();
    this.eventBus.addEventListener(this.eventBus.dataset.responseEvent, this._onResponse.bind(this));
    this.eventBus.addEventListener(this.eventBus.dataset.callEvent, this._onRegister.bind(this));
  }
  _onRegister(e) {
    const msg = e.detail;
    if (msg.type !== 'REGISTER_API') return;
    this._registerApi(msg.apiName, msg.methods);
  }
  _onResponse(e) {
    const msg = e.detail;
    const cb = this._callbacks.get(msg.id);
    if (!cb) return;
    msg.error ? cb.reject(new Error(msg.error)) : cb.resolve(msg.result);
    this._callbacks.delete(msg.id);
  }
  _registerApi(apiName, methods) {
    if (this[apiName]) return;
    this[apiName] = {};
    methods.forEach(name => {
      this[apiName][name] = (...args) => this._callApi(apiName, name, args);
    });
  }
  _callApi(apiName, action, args) {
    const id = Math.random().toString(36).substr(2);
    return new Promise((resolve, reject) => {
      this._callbacks.set(id, { resolve, reject });
      const callDetail = { type: 'API_CALL', apiName, action, args, id, source: 'PAGE' };
      this.dispatchBusEvent(this.eventBus.dataset.callEvent, callDetail);
    });
  }
  dispatchBusEvent(name, detail) {
    const evt = new CustomEvent(name, { detail, bubbles: false, composed: false });
    this.eventBus.dispatchEvent(evt);
  }
}
