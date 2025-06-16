const BUS_ID = 'ext_bridge_bus';

class ContentBridge {
  constructor(busId) {
    this.eventBus = document.getElementById(busId);
    this._instances = {};
    this.eventBus.addEventListener(this.eventBus.dataset.callEvent, this._handleCall.bind(this));
  }
  dispatchBusEvent(name, detail) {
    let payload = detail;
    if (typeof cloneInto === 'function') payload = cloneInto(detail, document.defaultView);
    const evt = new CustomEvent(name, { detail: payload, bubbles: false, composed: false });
    this.eventBus.dispatchEvent(evt);
  }
  getMethodNames(instance) {
    const proto = Object.getPrototypeOf(instance);
    return Object.getOwnPropertyNames(proto).filter(
      name => typeof instance[name] === 'function' && name !== 'constructor'
    );
  }
  registerInstanceApi(instance) {
    const apiName = instance.constructor.name.charAt(0).toLowerCase() + instance.constructor.name.slice(1);
    const methods = this.getMethodNames(instance);
    this._instances[apiName] = { instance, methods };
    this.dispatchBusEvent(this.eventBus.dataset.callEvent, { type: 'REGISTER_API', apiName, methods });
  }
  async _handleCall(e) {
    const msg = e.detail;
    if (msg.type !== 'API_CALL' || msg.source !== 'PAGE') return;
    const { apiName, action, args, id } = msg;
    const entry = this._instances[apiName];
    if (!entry || !entry.methods.includes(action)) return;
    let result, error;
    try { result = await entry.instance[action](...args); } catch (err) { error = err.message; }
    this.dispatchBusEvent(this.eventBus.dataset.responseEvent, { id, apiName, result, error, source: 'CONTENT' });
  }
}

let bus = document.getElementById(BUS_ID);
if (!bus) {
  bus = document.createElement('div');
  bus.id = BUS_ID;
  bus.style.display = 'none';
  bus.dataset.callEvent = 'ext-bridge-call';
  bus.dataset.responseEvent = 'ext-bridge-response';
  document.documentElement.appendChild(bus);
}

const bridge = new ContentBridge(BUS_ID);
const configManager = new ConfigManager();
await configManager.init();
bridge.registerInstanceApi(configManager);
console.log('[ContentBridge] ConfigManager API registered');
