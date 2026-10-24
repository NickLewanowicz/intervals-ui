var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y2, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../../../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// _worker.js
var Q = ["WORKOUT", "RACE_A", "RACE_B", "RACE_C", "NOTE", "PLAN", "HOLIDAY", "SICK", "INJURED", "SET_EFTP", "FITNESS_DAYS", "SEASON_START", "TARGET", "SET_FITNESS"];
var se = ["RACE_A", "RACE_B", "RACE_C"];
var ee = ["Run", "TrailRun", "VirtualRun", "Ride", "VirtualRide", "Swim", "Row", "Walk", "Hike", "Ski", "Other"];
var Te = "https://intervals.icu/api/v1";
var ke = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 intervals-ui/0.1";
var te = class extends Error {
  static {
    __name(this, "te");
  }
  constructor(n, r, i) {
    super(`intervals.icu API ${n}: ${r.slice(0, 200)}`);
    this.status = n;
    this.body = r;
    this.retryAfterSeconds = i;
    this.name = "IntervalsApiError";
  }
  status;
  body;
  retryAfterSeconds;
};
function K(t) {
  let e = t.athleteId || "0", n = t.fetchImpl ?? fetch, r = "Basic " + btoa(`API_KEY:${t.apiKey}`);
  async function i(a, l) {
    let u = await n(Te + a, { ...l, headers: { Authorization: r, "User-Agent": ke, "Content-Type": "application/json", ...l?.headers ?? {} } });
    if (!u.ok) {
      let p = u.headers.get("Retry-After") ?? void 0;
      throw new te(u.status, await u.text().catch(() => ""), p ? Number(p) : void 0);
    }
    if (u.status !== 204) return await u.json();
  }
  __name(i, "i");
  let s = /* @__PURE__ */ __name((a) => {
    let l = Object.entries(a).filter(([, u]) => u !== void 0);
    return l.length ? "?" + l.map(([u, p]) => `${u}=${encodeURIComponent(String(p))}`).join("&") : "";
  }, "s"), o = /* @__PURE__ */ __name((a) => a.toISOString().slice(0, 10), "o");
  return { athlete: /* @__PURE__ */ __name(() => i(`/athlete/${e}`), "athlete"), events: /* @__PURE__ */ __name((a, l) => i(`/athlete/${e}/events` + s({ oldest: typeof a == "string" ? a : o(a), newest: typeof l == "string" ? l : o(l) })), "events"), createEvent: /* @__PURE__ */ __name((a, l = true) => i(`/athlete/${e}/events${s({ upsertOnUid: l })}`, { method: "POST", body: JSON.stringify(a) }), "createEvent"), createEvents: /* @__PURE__ */ __name((a, l = true) => i(`/athlete/${e}/events/bulk${s({ upsertOnUid: l })}`, { method: "POST", body: JSON.stringify(a) }), "createEvents"), updateEvent: /* @__PURE__ */ __name((a, l) => i(`/athlete/${e}/events/${a}`, { method: "PUT", body: JSON.stringify(l) }), "updateEvent"), deleteEvent: /* @__PURE__ */ __name((a) => i(`/athlete/${e}/events/${a}`, { method: "DELETE" }), "deleteEvent"), activities: /* @__PURE__ */ __name((a, l, u = 100) => i(`/athlete/${e}/activities` + s({ oldest: typeof a == "string" ? a : o(a), newest: typeof l == "string" ? l : o(l), limit: u })), "activities"), wellness: /* @__PURE__ */ __name((a, l) => i(`/athlete/${e}/wellness` + s({ oldest: typeof a == "string" ? a : o(a), newest: typeof l == "string" ? l : o(l) })), "wellness"), sportSettings: /* @__PURE__ */ __name(() => i(`/athlete/${e}/sport-settings`), "sportSettings") };
}
__name(K, "K");
function ae(t) {
  return !!t && se.includes(t.category ?? "");
}
__name(ae, "ae");
function Z(t) {
  let e = Math.round(t), n = Math.floor(e / 3600), r = n > 0 ? Math.floor(e % 3600 / 60) : Math.max(1, Math.floor(e / 60));
  return n > 0 ? `${n}h${String(r).padStart(2, "0")}m` : `${r}m`;
}
__name(Z, "Z");
function J(t) {
  return (t / 1e3).toFixed(1) + "km";
}
__name(J, "J");
function oe(t) {
  let e = Math.floor(t), n = Math.round((t - e) * 60);
  return `${e}:${String(n === 60 ? 0 : n).padStart(2, "0")}/km`;
}
__name(oe, "oe");
var L = class extends Error {
  static {
    __name(this, "L");
  }
  constructor(n, r) {
    super(n);
    this.path = r;
    this.name = "ProposalValidationError";
  }
  path;
};
var Ae = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
var Oe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function y(t, e) {
  throw new L(`${t}: ${e}`, t);
}
__name(y, "y");
function ne(t, e = true) {
  (typeof t != "object" || t === null) && y("event", "expected object");
  let n = t, r = typeof n.start_date_local == "string" && Ae.test(n.start_date_local);
  e && !r && y("start_date_local", 'must be athlete-local ISO-ish "YYYY-MM-DDTHH:mm[:ss]" without timezone offset'), !e && n.start_date_local !== void 0 && !r && y("start_date_local", 'must be "YYYY-MM-DDTHH:mm[:ss]" without timezone offset'), n.category !== void 0 && !Q.includes(n.category) && y("category", `must be one of ${Q.join("|")}`), n.type !== void 0 && !ee.includes(n.type) && y("type", `must be one of ${ee.join("|")}`), n.name !== void 0 && typeof n.name != "string" && y("name", "must be string"), n.description !== void 0 && typeof n.description != "string" && y("description", "must be string");
  for (let i of ["distance", "moving_time"]) {
    let s = n[i];
    s !== void 0 && (typeof s != "number" || s < 0 || !Number.isFinite(s)) && y(i, "must be a non-negative number (meters / seconds)");
  }
  return n.uid !== void 0 && (typeof n.uid != "string" || !Oe.test(n.uid)) && y("uid", "must be a UUID v4 string"), n.id !== void 0 && (typeof n.id != "number" || !Number.isInteger(n.id)) && y("id", "must be an integer intervals.icu event id"), { ...n, start_date_local: n.start_date_local };
}
__name(ne, "ne");
function le(t, e) {
  let n = typeof e == "object" && e !== null ? e : {}, r = typeof n.rationale == "string" ? n.rationale : void 0;
  switch (t) {
    case "propose_event":
    case "create_event": {
      let i = n.event ?? n, s = ne(i);
      return ["RACE_A", "RACE_B", "RACE_C"].includes(s.category ?? "") && s.distance, { kind: "create_event", payload: s, rationale: r };
    }
    case "update_event": {
      let i = ne(n.event ?? n, false);
      return i.id === void 0 && i.uid === void 0 && y("event.id|event.uid", "update needs the intervals.icu event id or uid"), { kind: "update_event", payload: i, rationale: r };
    }
    case "delete_event": {
      let i = ne(n.event ?? n, false);
      return i.id === void 0 && y("event.id", "delete needs the event id"), { kind: "delete_event", payload: i, rationale: r };
    }
    default:
      y("tool", `unknown proposal tool "${t}"`);
  }
}
__name(le, "le");
function ce(t, e) {
  let n = t + ":" + e, r = 2166136261, i = 2654435769, s = 2246822507, o = 3266489909;
  for (let f = 0; f < n.length; f++) {
    let _ = n.charCodeAt(f);
    r = Math.imul(r ^ _, 16777619) >>> 0, i = Math.imul(i ^ _, 2246822507) >>> 0, s = Math.imul(s ^ _, 3266489909) + f >>> 0, o = (Math.imul(o + _, 668265263) ^ f) >>> 0;
  }
  let a = /* @__PURE__ */ __name((f) => f.toString(16).padStart(8, "0"), "a"), l = a(r), u = a(i).slice(0, 4), p = "4" + a(s).slice(0, 3), c = (8 | o >>> 29).toString(16) + a(o).slice(0, 3), h = (a((o ^ r) >>> 0) + a((i ^ s) >>> 0)).slice(0, 12);
  return `${l}-${u}-${p}-${c}-${h}`;
}
__name(ce, "ce");
var ue = [{ type: "function", function: { name: "propose_event", description: "Propose adding a planned workout or race to the calendar. The athlete confirms it in a modal before it is written.", parameters: { type: "object", required: ["start_date_local", "name"], properties: { start_date_local: { type: "string", description: 'Athlete-local start "YYYY-MM-DDTHH:mm" (no timezone suffix)' }, name: { type: "string", description: "Short human title" }, category: { type: "string", enum: ["WORKOUT", "RACE_A", "RACE_B", "RACE_C"], description: "WORKOUT for training; RACE_A goal race; RACE_B/C lower priority" }, type: { type: "string", enum: ["Run", "TrailRun", "VirtualRun"], description: "Sport; default Run" }, description: { type: "string", description: 'Workout spec in intervals.icu syntax: section lines (Warmup / Main Set 4x / Cooldown) + "- " steps like "- 10m Z2 Pace". Parsed into the structured workout.' }, distance: { type: "number", description: "Total distance in meters" }, moving_time: { type: "number", description: "Total duration in seconds" }, rationale: { type: "string", description: "One sentence why this session" } } } } }, { type: "function", function: { name: "update_event", description: "Propose modifying an existing calendar entry. Reference it by its #id from the calendar digest.", parameters: { type: "object", required: ["id"], properties: { id: { type: "number", description: "intervals.icu event id from the digest" }, name: { type: "string" }, description: { type: "string" }, start_date_local: { type: "string", description: 'New local start "YYYY-MM-DDTHH:mm"' }, distance: { type: "number" }, moving_time: { type: "number" }, category: { type: "string", enum: ["WORKOUT", "RACE_A", "RACE_B", "RACE_C"] }, rationale: { type: "string" } } } } }, { type: "function", function: { name: "delete_event", description: "Propose removing a calendar entry by its #id.", parameters: { type: "object", required: ["id"], properties: { id: { type: "number" }, rationale: { type: "string" } } } } }];
function de(t) {
  let e = { model: t.model.id, messages: t.messages, tools: t.tools, tool_choice: "auto", stream: t.stream ?? false, provider: { sort: "throughput", require_parameters: true } };
  return t.model.reasoningEffort && (e.reasoning = { effort: t.model.reasoningEffort }), { method: "POST", headers: { Authorization: `Bearer ${t.apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://intervals.imnick.dev", "X-Title": "intervals coach" }, body: JSON.stringify(e), signal: t.signal };
}
__name(de, "de");
var pe = "https://openrouter.ai/api/v1/chat/completions";
function ge(t) {
  return `You are Coach, an expert distance-running coach embedded in the athlete's training calendar (intervals.icu). You are pragmatic, encouraging without being saccharine, and brief \u2014 a working athlete reads you between meetings.

## Your data (already fetched; trust it over user recall)

Today is ${t.today}. Athlete: ${t.athleteName ?? "the athlete"}. Distances are in ${t.units}.

### Recent + upcoming calendar
${t.calendarDigest}

### Wellness (fitness/fatigue/sleep)
${t.wellnessDigest}

### Training zones
${t.zonesDigest}

### Athlete profile
${t.athleteProfile || "No profile set yet. Ask about goals when it matters."}

## How you talk

- Answer scheduling/feedback questions directly from the data above ("what does my week look like?" \u2192 summarize planned vs completed, load, form).
- When asked for feedback on completed training, reference actual numbers (distance, load, intensity, zone distribution, form trend), not platitudes.
- Flag risks: rapidly decreasing form (< -30), monotone training (all Z2, no quality for 10+ days), sudden volume jumps (>30% week over week), or races without taper.
- If information you need is missing (e.g. race distance when planning), ask ONE compact clarifying question, or state your assumption explicitly and offer the plan anyway.

## How you modify the calendar (CRITICAL)

You never claim to have changed anything. You PROPOSE changes by calling a tool:

- propose_event \u2014 add a planned run/race to the calendar.
- update_event \u2014 modify an existing calendar entry (needs its id or uid).
- delete_event \u2014 remove an entry (needs its id).

The athlete reviews every proposal in a confirmation modal before it is written. Rules:

1. propose_event payloads MUST use this shape:
   - start_date_local: "YYYY-MM-DDTHH:mm" (their local time, no timezone suffix)
   - category: "WORKOUT" for training; "RACE_A" for goal races, "RACE_B" for B-priority, "RACE_C" for C-priority. NEVER invent other categories.
   - type: "Run" unless told otherwise.
   - name: short, human ("Tempo 8k", "Long run 24k w/ 16k Z3", "Half marathon").
   - description: the workout itself, in intervals.icu's free-text syntax \u2014 plain lines with "- " steps: durations like "10m", "3km", zones like "Z2 Pace", "Z4 HR". Sections like "Warmup", "Main Set 4x", "Cooldown" get their own lines. THIS FIELD IS PARSED INTO THE STRUCTURED WORKOUT \u2014 write it as the athlete will read it in intervals.icu.
   - distance (meters) and/or moving_time (seconds): your estimate for the whole session.
2. Race plans: when the athlete registers for a race, first propose_event with category RACE_A/B/C on race day, then \u2014 only when asked \u2014 build the plan backwards from it (taper, long-run progression, quality sessions), proposing each week's sessions in SEPARATE propose_event calls (one tool call per calendar day) so the modal can be steered item-by-item.
3. When re-planning, reference existing events by their id (visible in the calendar digest as "#id") so updates replace rather than duplicate.
4. Never propose more than ~10 sessions in one reply; end by asking whether to continue with the following week.
5. After tools, summarize in one short paragraph what you proposed and why (load logic, race logic). No emoji spam; at most one emoji.

## Boundaries

- Medical red flags (chest pain, injury with sharp pain, dizziness) \u2192 recommend a professional, do not prescribe.
- You only see running data. Don't fabricate swims/rides that aren't in the digest.
- If the athlete asks for something the tools can't do (e.g. change their watch settings), say so plainly.`;
}
__name(ge, "ge");
var me = [{ id: "z-ai/glm-5.3-flash", label: "GLM 5.3 Flash (default \u2014 fastest value, agentic-tuned)", reasoningEffort: "low" }, { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5 (most reliable tool calls)" }, { id: "deepseek/deepseek-v4.1-flash-1017", label: "DeepSeek V4.1 Flash (Oct 17 snapshot)" }];
function fe(t) {
  return me.find((e) => e.id === t) ?? me[0];
}
__name(fe, "fe");
var G = /* @__PURE__ */ __name((t) => (t ?? "").slice(0, 10), "G");
function _e(t, e) {
  let n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ __name((s) => {
    let o = n.get(s);
    return o || (o = { events: [], activities: [] }, n.set(s, o)), o;
  }, "r");
  for (let s of t) r(G(s.start_date_local)).events.push(s);
  for (let s of e) r(G(s.start_date_local)).activities.push(s);
  let i = [...n.keys()].sort();
  return i.length ? i.map((s) => {
    let { events: o, activities: a } = n.get(s), l = /* @__PURE__ */ new Date(s + "T12:00:00Z"), p = [`${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][l.getUTCDay()]} ${s.slice(5)}:`];
    for (let c of o) {
      let h = ae(c) ? "RACE" : c.category ?? "WORKOUT", f = [c.distance ? J(c.distance) : null, c.moving_time ? Z(c.moving_time) : null].filter(Boolean).join("/"), _ = a.find((d) => d.paired_event_id != null && d.paired_event_id === c.id) ?? a.find((d) => G(d.start_date_local) === G(c.start_date_local)), D = _ ? ` \xB7 done ${_.distance ? J(_.distance) : "?"}${_.moving_time ? "/" + Z(_.moving_time) : ""}${_.icu_training_load ? " load " + Math.round(_.icu_training_load) : ""}` : "";
      p.push(`  #${c.intervals_id ?? c.id} ${c.name ?? "(untitled)"} \xB7 ${h} \xB7 planned ${f || "\u2014"}${c.icu_training_load ? " load " + Math.round(c.icu_training_load) : ""}${D}`), c.description && p.push(`    ${c.description.replace(/\n/g, " \u23CE ").slice(0, 220)}`);
    }
    for (let c of a) o.some((f) => (f.intervals_id ?? f.id) === c.paired_event_id) || p.push(`  (unplanned) ${c.name ?? c.type ?? "Activity"} \xB7 done ${c.distance ? J(c.distance) : "?"}${c.moving_time ? "/" + Z(c.moving_time) : ""}${c.icu_training_load ? " load " + Math.round(c.icu_training_load) : ""}${c.race ? " [RACE]" : ""}`);
    return p.length === 1 && p.push("  (no entries)"), p.join(`
`);
  }).join(`
`) : "(calendar empty \u2014 no intervals.icu data synced yet)";
}
__name(_e, "_e");
function ye(t) {
  let e = [...t].sort((r, i) => String(r.date ?? r.id).localeCompare(String(i.date ?? i.id))).slice(-7);
  return e.length ? e.map((r) => {
    let i = r.ctl != null && r.atl != null ? r.ctl - r.atl : null;
    return [`${String(r.date ?? r.id).slice(5)}:`, i != null ? `form ${i >= 0 ? "+" : ""}${i.toFixed(0)}` : null, r.ctl != null ? `fitness ${r.ctl.toFixed(0)}` : null, r.atl != null ? `fatigue ${r.atl.toFixed(0)}` : null, r.hrv != null ? `hrv ${r.hrv.toFixed(0)}` : null, r.resting_hr != null ? `rhr ${r.resting_hr.toFixed(0)}` : null, r.sleep_secs != null ? `sleep ${(r.sleep_secs / 3600).toFixed(1)}h` : null].filter(Boolean).join(" ");
  }).join(`
`) : "(no wellness data synced)";
}
__name(ye, "ye");
function he(t) {
  let e = (t ?? []).find((s) => !s.type || s.type === "Run") ?? (t ?? [])[0];
  if (!e) return "(zone settings not synced)";
  let n = e.hr_zones?.length ? `HR zones (bpm): ${e.hr_zone_names?.map((s, o) => `${s} <${e.hr_zones[o]}`).join(", ") ?? e.hr_zones.join("/")}` : null, r = e.threshold_pace ? `Threshold pace ${oe(e.threshold_pace)}/km; pace zones are % of it (${(e.pace_zone_names ?? ["Z1", "Z2", "Z3", "Z4", "Z5a", "Z5b", "Z5c"]).join("/")})` : null, i = e.lthr ? `LTHR ${e.lthr}bpm` : null;
  return [n, r, i].filter(Boolean).join(`
`) || "(zone settings incomplete)";
}
__name(he, "he");
var q = class extends Error {
  static {
    __name(this, "q");
  }
  constructor(n, r) {
    super(`PocketBase ${n}: ${r.slice(0, 200)}`);
    this.status = n;
    this.body = r;
    this.name = "PbError";
  }
  status;
  body;
};
var V = null;
function Ce(t) {
  try {
    let e = JSON.parse(atob(t.split(".")[1] ?? ""));
    return typeof e.exp == "number" ? e.exp * 1e3 : Date.now();
  } catch {
    return Date.now();
  }
}
__name(Ce, "Ce");
async function ve(t, e = false) {
  if (!e && V && V.expMs - Date.now() > 5 * 6e4) return V.token;
  let n = await fetch(`${t.PB_URL}/api/collections/_superusers/auth-with-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identity: t.PB_EMAIL, password: t.PB_PASSWORD }) });
  if (!n.ok) throw new q(n.status, await n.text());
  let r = await n.json();
  return V = { token: r.token, expMs: Ce(r.token) }, r.token;
}
__name(ve, "ve");
var Pe = /* @__PURE__ */ __name((t) => new Promise((e) => setTimeout(e, t)), "Pe");
async function Y(t, e, n = {}, r = true) {
  let i = await ve(t), s = await fetch(`${t.PB_URL}${e}`, { ...n, headers: { Authorization: i, "Content-Type": "application/json", ...n.headers ?? {} } });
  if (s.status === 401 && r) return await ve(t, true), Y(t, e, n, false);
  if (s.status === 429 && r) {
    let o = Number(s.headers.get("Retry-After") ?? "10");
    return await Pe(Math.min(30, Math.max(2, o)) * 1e3), Y(t, e, n, false);
  }
  if (!s.ok) throw new q(s.status, await s.text());
  if (s.status !== 204) return await s.json();
}
__name(Y, "Y");
async function be(t, e) {
  if (!e) return null;
  let n = await fetch(`${t.PB_URL}/api/collections/users/auth-refresh`, { headers: { Authorization: e } });
  return n.ok ? (await n.json()).record ?? null : null;
}
__name(be, "be");
async function S(t, e, n, r = "") {
  return (await Y(t, `/api/collections/${e}/records?filter=${encodeURIComponent(n)}${r}`)).items ?? [];
}
__name(S, "S");
async function P(t, e, n) {
  return (await S(t, e, n, "&perPage=1"))[0] ?? null;
}
__name(P, "P");
async function T(t, e, n) {
  return Y(t, `/api/collections/${e}/records`, { method: "POST", body: JSON.stringify(n) });
}
__name(T, "T");
async function k(t, e, n, r) {
  return Y(t, `/api/collections/${e}/records/${n}`, { method: "PATCH", body: JSON.stringify(r) });
}
__name(k, "k");
var v = /* @__PURE__ */ __name((t) => `user="${t}"`, "v");
var we = 1440 * 60 * 1e3;
var g = /* @__PURE__ */ __name((t) => typeof t == "number" && Number.isFinite(t) ? t : null, "g");
function De(t, e) {
  return { user: t, intervals_id: e.id, uid: e.uid, start_date_local: e.start_date_local, end_date_local: e.end_date_local ?? null, category: e.category ?? "WORKOUT", type: e.type ?? "Run", sub_type: e.sub_type ?? null, name: e.name ?? "", description: e.description ?? "", distance: g(e.distance), moving_time: g(e.moving_time), icu_training_load: g(e.icu_training_load), icu_intensity: g(e.icu_intensity), paired_activity_id: e.paired_activity_id ?? null, workout_doc: e.workout_doc ?? null, data: e };
}
__name(De, "De");
function $e(t, e) {
  return { user: t, intervals_id: e.id, start_date_local: e.start_date_local, name: e.name ?? "", type: e.type ?? "Run", race: e.race ?? false, distance: g(e.distance), moving_time: g(e.moving_time), average_heartrate: g(e.average_heartrate), pace: g(e.pace), icu_training_load: g(e.icu_training_load), icu_intensity: g(e.icu_intensity), icu_ctl: g(e.icu_ctl), icu_atl: g(e.icu_atl), zone_times: e.icu_zone_times ?? null, hr_zone_times: e.icu_hr_zone_times ?? null, pace_zone_times: e.pace_zone_times ?? null, paired_event_id: e.paired_event_id ?? null, source: e.source ?? null, data: e };
}
__name($e, "$e");
function Me(t, e) {
  return { user: t, date: e.id, ctl: g(e.ctl), atl: g(e.atl), resting_hr: g(e.restingHR), hrv: g(e.hrv), sleep_secs: g(e.sleepSecs), data: e };
}
__name(Me, "Me");
async function re(t, e, n, r, i, s) {
  if (!i.length) return 0;
  let o = await S(t, e, v(n), "&perPage=500"), a = new Map(o.map((u) => [String(u[r] ?? ""), u])), l = 0;
  for (let u of i) {
    let p = a.get(s(u));
    p && JSON.stringify(p.data) === JSON.stringify(u.data) || (p ? await k(t, e, p.id, u) : await T(t, e, u), l++);
  }
  return l;
}
__name(re, "re");
async function X(t, e, n, r, i = {}) {
  let s = K({ apiKey: n, athleteId: r || "0" }), o = /* @__PURE__ */ new Date(), a = /* @__PURE__ */ __name((d) => new Date(o.getTime() - d * we), "a"), [l, u, p, c] = await Promise.all([s.events(a(i.eventDaysBack ?? 21), new Date(o.getTime() + (i.eventDaysForward ?? 90) * we)), s.activities(a(i.activityDays ?? 90), o, 200), s.wellness(a(i.wellnessDays ?? 30), o), s.sportSettings().catch(() => [])]), h = await re(t, "calendar_events", e, "intervals_id", l.map((d) => De(e, d)), (d) => String(d.intervals_id)), f = await re(t, "activities", e, "intervals_id", u.map((d) => $e(e, d)), (d) => String(d.intervals_id)), _ = await re(t, "wellness", e, "date", p.map((d) => Me(e, d)), (d) => String(d.date)), D = false;
  if (Array.isArray(c) && c.length) {
    let d = { user: e, data: c }, $ = await P(t, "sport_settings", v(e));
    $ ? await k(t, "sport_settings", $.id, d) : await T(t, "sport_settings", d), D = true;
  }
  return await Re(t, e, "ok", null), { events: h, activities: f, wellness: _, sportSettings: D };
}
__name(X, "X");
async function Re(t, e, n, r) {
  let i = { user: e, status: n, error: r, last_sync: (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19) + "Z" }, s = await P(t, "sync_state", v(e));
  s ? await k(t, "sync_state", s.id, i) : await T(t, "sync_state", i);
}
__name(Re, "Re");
async function ie(t) {
  let e = await S(t, "users", 'intervals_api_key != ""', "&perPage=5");
  for (let n of e) try {
    await X(t, n.id, String(n.intervals_api_key ?? ""), String(n.intervals_athlete_id ?? "") || void 0);
  } catch (r) {
    await Re(t, n.id, "error", String(r).slice(0, 500)).catch(() => {
    });
  }
}
__name(ie, "ie");
var Ee = ["https://intervals.imnick.dev", "https://intervals-356.pages.dev", "http://localhost:8081", "http://localhost:8082", "http://localhost:5173"];
function Ie(t) {
  return { "Access-Control-Allow-Origin": t && Ee.includes(t) ? t : Ee[0], "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Cron-Secret", "Access-Control-Max-Age": "86400", Vary: "Origin" };
}
__name(Ie, "Ie");
var m = /* @__PURE__ */ __name((t, e = 200, n) => new Response(JSON.stringify(t), { status: e, headers: { "Content-Type": "application/json", ...n } }), "m");
var gt = { async fetch(t, e, n) {
  let r = Ie(t.headers.get("Origin")), i = new URL(t.url);
  if (!i.pathname.startsWith("/api")) return e.ASSETS ? e.ASSETS.fetch(t) : new Response("not found", { status: 404 });
  if (t.method === "OPTIONS") return new Response(null, { status: 204, headers: r });
  if (i.pathname === "/api/health") return m({ ok: true }, 200, r);
  if (i.pathname === "/api/cron" && t.method === "GET") return t.headers.get("X-Cron-Secret") !== e.CRON_SECRET ? m({ error: "forbidden" }, 403, r) : (n.waitUntil(ie(e)), m({ ok: true, started: true }, 200, r));
  let s = t.headers.get("Authorization"), o = await be(e, s);
  if (!o) return m({ error: "unauthorized" }, 401, r);
  if (i.pathname === "/api/chat" && t.method === "POST") return We(t, e, o, r);
  if (i.pathname === "/api/sync" && t.method === "POST") return ze(e, o, r);
  if (i.pathname === "/api/proposals" && t.method === "GET") return Ue(e, o, i, r);
  let a = i.pathname.match(/^\/api\/proposals\/([\w]+)\/(apply|dismiss)$/);
  return a && t.method === "POST" ? Ne(a[1], a[2], e, o, r) : m({ error: "not_found" }, 404, r);
}, async scheduled(t, e, n) {
  n.waitUntil(ie(e));
} };
async function ze(t, e, n) {
  if (!e.intervals_api_key) return m({ error: "missing_intervals_key" }, 400, n);
  try {
    let r = await X(t, e.id, e.intervals_api_key, e.intervals_athlete_id || void 0);
    return m({ ok: true, ...r }, 200, n);
  } catch (r) {
    return m({ error: "sync_failed", detail: String(r).slice(0, 300) }, 502, n);
  }
}
__name(ze, "ze");
async function Ue(t, e, n, r) {
  let i = n.searchParams.get("status") ?? "pending", s = await S(t, "proposals", `${v(e.id)} && status="${i}"`, "&sort=-created&perPage=50");
  return m({ items: s }, 200, r);
}
__name(Ue, "Ue");
async function Ne(t, e, n, r, i) {
  let s = await P(n, "proposals", `${v(r.id)} && id="${t}"`);
  if (!s) return m({ error: "not_found" }, 404, i);
  if (s.status !== "pending") return m({ error: "already_resolved", status: s.status }, 409, i);
  if (e === "dismiss") {
    let u = await k(n, "proposals", t, { status: "dismissed" });
    return m({ ok: true, proposal: u }, 200, i);
  }
  if (!r.intervals_api_key) return m({ error: "missing_intervals_key" }, 400, i);
  let o = K({ apiKey: r.intervals_api_key, athleteId: r.intervals_athlete_id || "0" }), a = String(s.kind), l = s.payload ?? {};
  try {
    let u;
    if (a === "create_event") {
      let c = { ...l, uid: l.uid ?? ce(r.id + ":" + String(s.session ?? ""), String(l.start_date_local) + String(l.name)) };
      u = (await o.createEvent(c, true))?.id;
    } else if (a === "update_event") {
      let c = l.id, h = { ...l };
      delete h.id, delete h.uid, await o.updateEvent(c, h), u = c;
    } else await o.deleteEvent(l.id), u = l.id;
    let p = await k(n, "proposals", t, { status: "applied", intervals_event_id: u ?? null, applied_at: (/* @__PURE__ */ new Date()).toISOString() });
    return X(n, r.id, r.intervals_api_key, r.intervals_athlete_id || void 0).catch(() => {
    }), m({ ok: true, proposal: p }, 200, i);
  } catch (u) {
    return await k(n, "proposals", t, { status: "failed", error: String(u).slice(0, 500) }).catch(() => {
    }), m({ error: "apply_failed", detail: String(u).slice(0, 300) }, 502, i);
  }
}
__name(Ne, "Ne");
var He = 20;
async function We(t, e, n, r) {
  let i;
  try {
    i = await t.json();
  } catch {
    return m({ error: "bad_json" }, 400, r);
  }
  let s = (i.message ?? "").trim();
  if (!s) return m({ error: "empty_message" }, 400, r);
  if (!n.openrouter_api_key) return m({ error: "missing_openrouter_key" }, 400, r);
  let o = i.session_id, a = null;
  o && (a = await P(e, "chat_sessions", `${v(n.id)} && id="${o}"`)), a || (a = await T(e, "chat_sessions", { user: n.id, title: s.slice(0, 60), model: i.model ?? n.preferred_model ?? void 0 }), o = a.id);
  let l = "(no intervals.icu account connected \u2014 ask the athlete to connect one in Settings; you can still talk training)", u = "(no wellness data)", p = "(no zone settings)";
  if (n.intervals_api_key) {
    let b = /* @__PURE__ */ new Date(), A = new Date(b.getTime() - 21 * 864e5).toISOString().slice(0, 10), B = new Date(b.getTime() + 90 * 864e5).toISOString().slice(0, 10), E = b.toISOString().slice(0, 10), [I, O, z, U] = await Promise.all([S(e, "calendar_events", `${v(n.id)} && start_date_local >= "${A}T00:00:00" && start_date_local <= "${B}T23:59:59"`, "&sort=start_date_local&perPage=300"), S(e, "activities", `${v(n.id)} && start_date_local >= "${A}T00:00:00" && start_date_local <= "${E}T23:59:59"`, "&sort=-start_date_local&perPage=150"), S(e, "wellness", v(n.id), "&sort=-date&perPage=14"), P(e, "sport_settings", v(n.id))]);
    l = _e(I.map((w) => ({ ...w.data, intervals_id: w.intervals_id })), O.map((w) => w.data)), u = ye(z.map((w) => ({ ...w.data, date: w.date }))), p = he(U?.data ?? null);
  }
  let c = ge({ athleteName: n.name, today: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), units: n.units ?? "km", calendarDigest: l, wellnessDigest: u, zonesDigest: p, athleteProfile: n.athlete_profile ?? "" }), f = (await S(e, "chat_messages", `session="${o}"`, "&sort=created&perPage=100")).slice(-He).map((b) => ({ role: b.role === "assistant" ? "assistant" : "user", content: String(b.content ?? "") })), _ = [{ role: "system", content: c }, ...f, { role: "user", content: s }];
  await T(e, "chat_messages", { session: o, user: n.id, role: "user", content: s });
  let D = fe(i.model ?? n.preferred_model), d = await fetch(pe, de({ apiKey: n.openrouter_api_key, model: D, messages: _, tools: ue, stream: true }));
  if (!d.ok || !d.body) {
    let b = await d.text().catch(() => "");
    return m({ error: "openrouter_failed", status: d.status, detail: b.slice(0, 300) }, 502, r);
  }
  let $ = o, Se = new TextEncoder(), xe = new ReadableStream({ async start(b) {
    let A = /* @__PURE__ */ __name((O, z) => b.enqueue(Se.encode(`event: ${O}
data: ${JSON.stringify(z)}

`)), "A"), B = "", E = [], I = null;
    try {
      let O = d.body.getReader(), z = new TextDecoder(), U = "";
      for (; ; ) {
        let { done: R, value: F } = await O.read();
        if (R) break;
        U += z.decode(F, { stream: true });
        let x = U.split(`
`);
        U = x.pop() ?? "";
        for (let N of x) {
          if (!N.startsWith("data: ")) continue;
          let H = N.slice(6).trim();
          if (H === "[DONE]") continue;
          let M;
          try {
            M = JSON.parse(H);
          } catch {
            continue;
          }
          M.usage && (I = M.usage);
          let W = M.choices?.[0]?.delta;
          if (W) {
            W.content && (B += W.content, A("delta", { text: W.content }));
            for (let C of W.tool_calls ?? []) {
              let j = C.index ?? 0;
              E[j] = E[j] ?? { id: "", name: "", args: "" }, C.id && (E[j].id = C.id), C.function?.name && (E[j].name += C.function.name), C.function?.arguments && (E[j].args += C.function.arguments);
            }
          }
        }
      }
      await T(e, "chat_messages", { session: $, user: n.id, role: "assistant", content: B, tool_calls: E.length ? E.map((R) => ({ id: R.id, function: { name: R.name, arguments: R.args } })) : null, usage: I });
      let w = [];
      for (let R of E) {
        if (!R?.name) continue;
        let F;
        try {
          F = JSON.parse(R.args || "{}");
        } catch {
          w.push({ tool: R.name, error: "unparseable tool arguments" });
          continue;
        }
        try {
          let { kind: x, payload: N, rationale: H } = le(R.name, F), M = await T(e, "proposals", { user: n.id, session: $, kind: x, payload: N, rationale: H ?? null, status: "pending" });
          A("proposal", { id: M.id, kind: x, payload: N, rationale: H });
        } catch (x) {
          if (x instanceof L) w.push({ tool: R.name, error: x.message });
          else throw x;
        }
      }
      A("done", { session_id: $, usage: I, proposal_errors: w });
    } catch (O) {
      A("error", { message: String(O).slice(0, 300) });
    } finally {
      b.close();
    }
  } });
  return new Response(xe, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive", ...r } });
}
__name(We, "We");
export {
  gt as default
};
//# sourceMappingURL=bundledWorker-0.40610409510287726.mjs.map
