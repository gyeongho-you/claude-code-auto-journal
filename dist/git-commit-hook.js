"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/git-commit-hook.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var import_child_process = require("child_process");

// src/config.ts
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var DATA_DIR = path.join(os.homedir(), ".claude", "daily-journal");
var PLUGIN_DIR = path.join(os.homedir(), ".claude", "plugins", "daily-journal");
var GIT_HOOKS_PATH = path.join(DATA_DIR, "git-hooks.json");
var SESSION_EDITS_DIR = path.join(os.homedir(), ".claude", "session-edits");
var DEFAULT_OUTPUT_DIR = path.join(DATA_DIR, "data");
function loadDefaultConfig() {
  const configPath = path.join(__dirname, "..", "config.json");
  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return {
    ...raw,
    journal: {
      ...raw.journal,
      output_dir: raw.journal?.output_dir || DEFAULT_OUTPUT_DIR
    }
  };
}
function resolveTimeZone(candidate, fallback) {
  if (typeof candidate !== "string" || !candidate) return fallback;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: candidate }).format(/* @__PURE__ */ new Date());
    return candidate;
  } catch {
    logError(`\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 timeZone: "${candidate}", \uAE30\uBCF8\uAC12 \uC0AC\uC6A9: "${fallback}"`);
    return fallback;
  }
}
function stripBom(text) {
  return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
}
function loadConfig() {
  const defaultConfig = loadDefaultConfig();
  const userConfigPath = path.join(DATA_DIR, "user-config.json");
  if (!fs.existsSync(userConfigPath)) {
    return defaultConfig;
  }
  try {
    const userConfig = JSON.parse(stripBom(fs.readFileSync(userConfigPath, "utf-8")));
    return {
      ...defaultConfig,
      schedule: { ...defaultConfig.schedule, ...userConfig.schedule },
      summary: {
        ...defaultConfig.summary,
        ...userConfig.summary,
        defaultPrompt: defaultConfig.summary.defaultPrompt
      },
      journal: {
        ...defaultConfig.journal,
        ...userConfig.journal,
        defaultPrompt: defaultConfig.journal.defaultPrompt,
        output_dir: userConfig.journal?.output_dir || defaultConfig.journal.output_dir
      },
      focus: { ...defaultConfig.focus, ...userConfig.focus },
      exclude: { ...defaultConfig.exclude, ...userConfig.exclude },
      gitCommit: { ...defaultConfig.gitCommit, ...userConfig.gitCommit },
      cleanup: userConfig.cleanup ?? defaultConfig.cleanup,
      save: userConfig.save ?? defaultConfig.save,
      timeZone: resolveTimeZone(userConfig.timeZone, defaultConfig.timeZone)
    };
  } catch (e) {
    logError(`user-config.json \uD30C\uC2F1 \uC2E4\uD328: ${e}`);
    return defaultConfig;
  }
}
var SESSION_PROJECT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
function shouldTrackProject(config, projectName) {
  if (config.focus.use) {
    return config.focus.files.includes(projectName);
  }
  if (config.exclude.use && config.exclude.files.includes(projectName)) {
    return false;
  }
  return true;
}
function getDateString(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(/* @__PURE__ */ new Date());
}
function getDateStringWithHourMinutes(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(/* @__PURE__ */ new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
function getDateStringWithHourMinutesSeconds(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(/* @__PURE__ */ new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
function getTodayDir(config) {
  return path.join(config.journal.output_dir, getDateString(config.timeZone));
}
function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}
function readRunHistory(historyPath) {
  if (!fs.existsSync(historyPath)) return {};
  try {
    return JSON.parse(stripBom(fs.readFileSync(historyPath, "utf-8")));
  } catch (e) {
    try {
      fs.copyFileSync(historyPath, `${historyPath}.corrupt-${Date.now()}`);
    } catch {
    }
    logError(`run-history.json \uD30C\uC2F1 \uC2E4\uD328, \uBC31\uC5C5 \uD6C4 \uC0C8\uB85C \uC2DC\uC791: ${e}`);
    return {};
  }
}
var isGenerateStatus = (s) => ["success", "failed", "no_data"].includes(s);
function withFileLock(lockPath, fn) {
  const STALE_MS = 1e4;
  const MAX_WAIT_MS = 2e3;
  const started = Date.now();
  let locked = false;
  while (!locked) {
    try {
      fs.mkdirSync(lockPath);
      locked = true;
    } catch (e) {
      if (e.code !== "EEXIST") break;
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > STALE_MS) {
          fs.rmdirSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - started > MAX_WAIT_MS) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return fn();
  } finally {
    if (locked) {
      try {
        fs.rmdirSync(lockPath);
      } catch {
      }
    }
  }
}
function recordRunHistory(entry) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return;
    const historyPath = path.join(DATA_DIR, "run-history.json");
    withFileLock(`${historyPath}.lock`, () => updateRunHistory(historyPath, entry));
  } catch {
  }
}
function updateRunHistory(historyPath, entry) {
  {
    const history = readRunHistory(historyPath);
    const oldHistory = history[entry.date];
    if (!isGenerateStatus(entry.status)) {
      if (!oldHistory) {
        entry.status = "create";
      } else if (!isGenerateStatus(oldHistory.status)) {
        return;
      } else if (oldHistory.status === "failed") {
        entry.error = oldHistory.error;
      }
    } else if (entry.status === "failed") {
      entry.attempts = (oldHistory?.attempts ?? 0) + 1;
    }
    history[entry.date] = entry;
    writeJsonAtomic(historyPath, history);
  }
}
var LOG_TIME_ZONE = "Asia/Seoul";
function logError(message) {
  try {
    const logPath = path.join(DATA_DIR, "error.log");
    fs.appendFileSync(logPath, `[${getDateStringWithHourMinutesSeconds(LOG_TIME_ZONE)}] ${message}
`);
    console.error(`[Error] ${message}`);
  } catch {
  }
}

// src/git-commit-hook.ts
function main() {
  const config = loadConfig();
  if (!config.save || !config.gitCommit.use) return;
  let repoRoot;
  try {
    repoRoot = (0, import_child_process.execSync)("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
  } catch {
    return;
  }
  const projectName = path2.basename(repoRoot);
  if (!shouldTrackProject(config, projectName)) {
    return;
  }
  let commitMessage;
  try {
    commitMessage = (0, import_child_process.execSync)("git log -1 --format=%B", { encoding: "utf-8" }).trim();
  } catch {
    logError("git-commit-hook: \uCEE4\uBC0B \uBA54\uC2DC\uC9C0 \uC77D\uAE30 \uC2E4\uD328");
    return;
  }
  let commitHash;
  try {
    commitHash = (0, import_child_process.execSync)("git log -1 --format=%h", { encoding: "utf-8" }).trim();
  } catch {
    commitHash = "";
  }
  const todayDir = getTodayDir(config);
  const historyDir = path2.join(todayDir, "history");
  fs2.mkdirSync(historyDir, { recursive: true });
  const entry = {
    time: getDateStringWithHourMinutes(config.timeZone),
    prompt: commitMessage,
    summary: "",
    answer: commitHash,
    source: "git-commit",
    repoPath: repoRoot
  };
  fs2.appendFileSync(
    path2.join(historyDir, `${projectName}.jsonl`),
    JSON.stringify(entry) + "\n"
  );
  recordRunHistory({ date: getDateString(config.timeZone), status: "modified", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
}
try {
  main();
} catch (e) {
  logError(`git-commit-hook \uC624\uB958: ${e}`);
}
