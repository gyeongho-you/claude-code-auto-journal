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
function loadConfig() {
  const defaultConfig = loadDefaultConfig();
  const userConfigPath = path.join(DATA_DIR, "user-config.json");
  if (!fs.existsSync(userConfigPath)) {
    return defaultConfig;
  }
  try {
    const userConfig = JSON.parse(fs.readFileSync(userConfigPath, "utf-8"));
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
      focus: userConfig.focus ? defaultConfig.focus : userConfig.focus,
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
function logError(message) {
  try {
    const logPath = path.join(DATA_DIR, "error.log");
    fs.appendFileSync(logPath, `[${getDateStringWithHourMinutesSeconds(loadConfig().timeZone)}] ${message}
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
  if (config.focus?.use && !config.focus.files.includes(projectName)) {
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
}
try {
  main();
} catch (e) {
  logError(`git-commit-hook \uC624\uB958: ${e}`);
}
