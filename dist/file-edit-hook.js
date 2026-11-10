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

// src/file-edit-hook.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));

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
function extractProjectName(cwd) {
  if (!cwd) return "_unknown";
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  const last = (parts[parts.length - 1] ?? "").replace(/[:*?"<>|]/g, "");
  return last || "_unknown";
}
var SESSION_PROJECT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
function getStableProjectName(sessionId, cwd) {
  const filePath = path.join(SESSION_EDITS_DIR, `${sessionId}.project.json`);
  try {
    if (fs.existsSync(filePath)) {
      const cached = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (cached.projectName) return cached.projectName;
    }
  } catch {
  }
  const projectName = extractProjectName(cwd);
  try {
    fs.mkdirSync(SESSION_EDITS_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ projectName, cwd }), "utf-8");
  } catch {
  }
  return projectName;
}
function shouldTrackProject(config, projectName) {
  if (config.focus.use) {
    return config.focus.files.includes(projectName);
  }
  if (config.exclude.use && config.exclude.files.includes(projectName)) {
    return false;
  }
  return true;
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

// src/file-edit-hook.ts
function readState(sessionId) {
  const filePath = path2.join(SESSION_EDITS_DIR, `${sessionId}.json`);
  if (!fs2.existsSync(filePath)) return { edits: [] };
  try {
    return JSON.parse(fs2.readFileSync(filePath, "utf-8"));
  } catch {
    return { edits: [] };
  }
}
function writeState(sessionId, state) {
  fs2.mkdirSync(SESSION_EDITS_DIR, { recursive: true });
  fs2.writeFileSync(path2.join(SESSION_EDITS_DIR, `${sessionId}.json`), JSON.stringify(state), "utf-8");
}
function main() {
  const stdinData = fs2.readFileSync(0, "utf-8");
  let payload;
  try {
    payload = JSON.parse(stdinData);
  } catch {
    return;
  }
  const { session_id, tool_name, tool_input } = payload;
  const filePath = tool_input?.file_path;
  if (!filePath) return;
  const config = loadConfig();
  if (!config.save) return;
  if (payload.cwd) {
    const projectName = getStableProjectName(session_id, payload.cwd);
    if (!shouldTrackProject(config, projectName)) return;
  }
  const state = readState(session_id);
  if (tool_name === "Edit") {
    state.edits.push({
      tool: "Edit",
      file: filePath,
      before: clip(tool_input.old_string ?? ""),
      after: clip(tool_input.new_string ?? "")
    });
  } else if (tool_name === "Write") {
    state.edits.push({ tool: "Write", file: filePath, after: clip(tool_input.content ?? "") });
  }
  writeState(session_id, state);
}
var MAX_EDIT_CHARS = 2e4;
function clip(text) {
  return text.length > MAX_EDIT_CHARS ? text.slice(0, MAX_EDIT_CHARS) + "\n...(\uC0DD\uB7B5)" : text;
}
try {
  main();
} catch {
}
