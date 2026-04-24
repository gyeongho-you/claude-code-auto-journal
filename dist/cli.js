#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/cli.ts
var cli_exports = {};
__export(cli_exports, {
  RUN_HISTORY_PATH: () => RUN_HISTORY_PATH
});
module.exports = __toCommonJS(cli_exports);
var fs6 = __toESM(require("fs"));
var path6 = __toESM(require("path"));
var os4 = __toESM(require("os"));
var import_child_process3 = require("child_process");

// src/config.ts
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var DATA_DIR = path.join(os.homedir(), ".claude", "daily-journal");
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
function recordRunHistory(entry) {
  try {
    const historyPath = path.join(DATA_DIR, "run-history.json");
    let history = {};
    if (fs.existsSync(historyPath)) {
      history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
    }
    const oldHistory = history[entry.date];
    const isGenerateJournal = (s) => ["success", "failed", "no_data"].includes(s);
    if (!isGenerateJournal(entry.status)) {
      if (!oldHistory) {
        entry.status = "create";
      } else if (!isGenerateJournal(oldHistory?.status)) {
        return;
      }
    } else {
      if (!oldHistory) return;
    }
    history[entry.date] = entry;
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
  } catch {
  }
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

// src/generate-journal.ts
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));

// src/claude.ts
var import_child_process = require("child_process");
var fs2 = __toESM(require("fs"));
var os2 = __toESM(require("os"));
var path2 = __toESM(require("path"));

// src/types.ts
var ClaudeModel = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
  default: "claude-haiku-4-5-20251001"
};

// src/claude.ts
function getEmptyMcpConfigPath() {
  const configPath = path2.join(os2.tmpdir(), "daily-journal-empty-mcp.json");
  if (!fs2.existsSync(configPath)) {
    fs2.writeFileSync(configPath, JSON.stringify({ mcpServers: {} }), "utf-8");
  }
  return configPath;
}
function callClaude(input, model) {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  env.DAILY_JOURNAL_RUNNING = "1";
  const claudeModel = ClaudeModel[model] ?? ClaudeModel.default;
  const result = (0, import_child_process.spawnSync)("claude", ["--print", "--model", claudeModel, "--allowedTools", "none", "--output-format", "text", "--mcp-config", getEmptyMcpConfigPath(), "--strict-mcp-config"], {
    input,
    encoding: "utf-8",
    timeout: 18e4,
    shell: true,
    env
  });
  const stdout = (result.stdout || "").trim() ? result.stdout : result.stderr;
  return { ...result, stdout };
}

// src/generate-journal.ts
var MAX_DATA_TOKENS = 14e4;
function estimateTokens(text) {
  return Math.ceil(text.length / 2.5);
}
function loadHistoryByProject(historyDir) {
  const result = {};
  const files = fs3.readdirSync(historyDir).filter((f) => f.endsWith(".jsonl"));
  for (const file of files) {
    const project = file.replace(".jsonl", "");
    const lines = fs3.readFileSync(path3.join(historyDir, file), "utf-8").trim().split("\n").filter(Boolean);
    result[project] = lines.flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch (e) {
        logError("\uC77C\uC9C0 \uC791\uC131\uC911 \uC190\uC0C1\uB41C history Skip: " + l);
        console.error("\uC77C\uC9C0 \uC791\uC131\uC911 \uC190\uC0C1\uB41C history \uC874\uC7AC", e);
        return [];
      }
    });
  }
  return result;
}
function buildPromptData(historyByProject) {
  return Object.entries(historyByProject).map(([project, entries]) => {
    const items = entries.map((e) => `---
[\uC791\uC5C5] ${e.prompt}
${e.summary ? "[\uC694\uC57D]" + e.summary.replace(/\n/g, " ") : "[\uC815\uB9AC\uD544\uC694]" + e.answer.replace(/\n/g, " ")}`).join("\n");
    return `## ${project}
${items}`;
  }).join("\n\n");
}
function splitIntoChunks(data, maxTokens) {
  const sections = data.split("\n\n").reduce((acc, part) => {
    if (part.startsWith("## ")) {
      acc.push(part);
    } else if (acc.length > 0) {
      acc[acc.length - 1] += "\n\n" + part;
    }
    return acc;
  }, []);
  const chunks = [];
  let current = "";
  for (const section of sections) {
    const next = current ? current + "\n\n" + section : section;
    if (current && estimateTokens(next) > maxTokens) {
      chunks.push(current);
      current = section;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
function summarizeChunk(chunkData, chunkIndex, totalChunks, model) {
  const input = `\uB2E4\uC74C\uC740 \uB300\uD654 \uAE30\uB85D\uC758 \uC77C\uBD80. (\uD30C\uD2B8 ${chunkIndex + 1}/${totalChunks}).
\uD575\uC2EC \uC791\uC5C5 \uB0B4\uC6A9, \uD574\uACB0\uD55C \uBB38\uC81C, \uC911\uC694\uD55C \uACB0\uC815 \uC0AC\uD56D\uC744 \uAC04\uACB0\uD558\uAC8C \uC815\uB9AC.

${chunkData}`;
  const result = callClaude(input, model);
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || String(result.error) || "claude CLI \uC2E4\uD328");
  }
  const output = result.stdout.trim();
  if (!output) throw new Error("\uCCAD\uD06C \uC751\uB2F5 \uC5C6\uC74C");
  return output;
}
function main() {
  const config = loadConfig();
  writeJournal(getDateString(config.timeZone), config);
}
function writeJournal(date, config) {
  try {
    generateJournalForDate(date, config);
  } catch (e) {
    logError(`generate-journal \uC624\uB958: ${e}`);
    recordRunHistory({ date, status: "failed", timestamp: (/* @__PURE__ */ new Date()).toISOString(), error: String(e) });
  }
}
function generateJournalForDate(date, config) {
  const dateDir = path3.join(config.journal.output_dir, date);
  const historyDir = path3.join(dateDir, "history");
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  if (!fs3.existsSync(historyDir)) {
    console.log(`  \uB370\uC774\uD130 \uC5C6\uC74C (history \uB514\uB809\uD1A0\uB9AC \uC5C6\uC74C)`);
    recordRunHistory({ date, status: "no_data", timestamp });
    return;
  }
  const historyByProject = loadHistoryByProject(historyDir);
  const entryCount = Object.values(historyByProject).reduce((sum, e) => sum + e.length, 0);
  if (entryCount > 0) {
    const data = buildPromptData(historyByProject);
    console.log(`  \uD56D\uBAA9 ${entryCount}\uAC1C \u2192 \uC815\uB9AC\uC911 ...`);
    const journalContent = estimateTokens(data) <= MAX_DATA_TOKENS ? generateSingle(date, data, config) : generateChunked(date, data, config);
    if (!journalContent) return;
    fs3.mkdirSync(dateDir, { recursive: true });
    fs3.writeFileSync(path3.join(dateDir, "journal.md"), journalContent, "utf-8");
    recordRunHistory({ date, status: "success", timestamp });
    console.log(`  \u2713 \uC644\uB8CC \u2192 ${path3.join(dateDir, "journal.md")}`);
  } else {
    console.log(`  \uC815\uB9AC\uD560 \uD56D\uBAA9\uC774 \uC874\uC7AC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
    recordRunHistory({ date, status: "no_data", timestamp });
    return;
  }
  if (config.cleanup && date !== getDateString(config.timeZone)) {
    fs3.rmSync(historyDir, { recursive: true, force: true });
  }
}
function generateSingle(date, data, config) {
  const input = `${config.journal.defaultPrompt}
${config.journal.stylePrompt}

\uB0A0\uC9DC: ${date}

${data}`;
  const result = callClaude(input, config.journal.claudeModel);
  if (result.error || result.status !== 0) {
    const error = result.stderr || String(result.error) || "claude CLI \uC2E4\uD328";
    console.log(`  \u2717 claude CLI \uC2E4\uD328: ${error}`);
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    recordRunHistory({ date, status: "failed", timestamp, error });
    return null;
  }
  const content = result.stdout.trim();
  if (!content) {
    console.log(`  \u2717 \uC751\uB2F5 \uC5C6\uC74C`);
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    recordRunHistory({ date, status: "failed", timestamp, error: "CLI \uC751\uB2F5 \uC5C6\uC74C" });
    return null;
  }
  const journalStart = content.search(/^#/m);
  return journalStart > 0 ? content.slice(journalStart) : content;
}
function generateChunked(date, data, config) {
  const chunks = splitIntoChunks(data, MAX_DATA_TOKENS);
  console.log(`  \uCEE8\uD14D\uC2A4\uD2B8 \uCD08\uACFC \u2192 ${chunks.length}\uAC1C \uCCAD\uD06C\uB85C \uBD84\uD560 \uCC98\uB9AC`);
  const partialSummaries = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  \uCCAD\uD06C ${i + 1}/${chunks.length} \uCC98\uB9AC \uC911...`);
    const summary = summarizeChunk(chunks[i], i, chunks.length, config.journal.claudeModel);
    partialSummaries.push(summary);
  }
  const combined = partialSummaries.map((s, i) => `### \uD30C\uD2B8 ${i + 1}
${s}`).join("\n\n");
  const finalInput = `${config.journal.defaultPrompt}
${config.journal.stylePrompt}

\uB0A0\uC9DC: ${date}

\uC544\uB798\uB294 \uC624\uB298 \uD558\uB8E8 \uB300\uD654 \uAE30\uB85D\uC744 \uC5EC\uB7EC \uD30C\uD2B8\uB85C \uB098\uB204\uC5B4 \uC815\uB9AC\uD55C \uB0B4\uC6A9. \uC774\uB97C \uD558\uB098\uC758 \uC77C\uAD00\uB41C \uC77C\uC9C0\uB85C \uD1B5\uD569.

${combined}`;
  const result = callClaude(finalInput, config.journal.claudeModel);
  if (result.error || result.status !== 0) {
    const error = result.stderr || String(result.error) || "claude CLI \uC2E4\uD328 (\uCD5C\uC885 \uD1B5\uD569)";
    console.log(`  \u2717 \uCD5C\uC885 \uD1B5\uD569 \uC2E4\uD328: ${error}`);
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    recordRunHistory({ date, status: "failed", timestamp, error });
    return null;
  }
  const content = result.stdout.trim();
  if (!content) {
    console.log(`  \u2717 \uCD5C\uC885 \uD1B5\uD569 \uC751\uB2F5 \uC5C6\uC74C`);
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    recordRunHistory({ date, status: "failed", timestamp, error: "\uCD5C\uC885 \uD1B5\uD569 \uC751\uB2F5 \uC5C6\uC74C" });
    return null;
  }
  const journalStart = content.search(/^#/m);
  return journalStart > 0 ? content.slice(journalStart) : content;
}
var isDirectRun = process.argv[1]?.endsWith("generate-journal.js") || process.argv[1]?.endsWith("generate-journal.ts");
if (isDirectRun) {
  main();
}

// src/setup.ts
var fs4 = __toESM(require("fs"));
var os3 = __toESM(require("os"));
var path4 = __toESM(require("path"));
var import_child_process2 = require("child_process");
var HOME = os3.homedir();
var CLAUDE_DIR = path4.join(HOME, ".claude");
var PLUGIN_DIR = path4.join(CLAUDE_DIR, "plugins", "daily-journal");
var SETTINGS_PATH = path4.join(CLAUDE_DIR, "settings.json");
function initClaudeSetting() {
  const stopHookCommand = `node "${path4.join(PLUGIN_DIR, "dist", "stop-hook.js")}"`;
  const fileEditHookCommand = `node "${path4.join(PLUGIN_DIR, "dist", "file-edit-hook.js")}"`;
  let settings = {};
  if (fs4.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs4.readFileSync(SETTINGS_PATH, "utf-8"));
    } catch {
      settings = {};
    }
  }
  const hooks = settings.hooks ?? {};
  const stopHooks = hooks.Stop ?? [];
  const stopAlreadyRegistered = stopHooks.some(
    (h) => h.hooks?.some((hh) => hh.command?.includes("daily-journal"))
  );
  if (!stopAlreadyRegistered) {
    stopHooks.push({ hooks: [{ type: "command", command: stopHookCommand }] });
  }
  const postToolUseHooks = hooks.PostToolUse ?? [];
  const postToolUseAlreadyRegistered = postToolUseHooks.some(
    (h) => h.hooks?.some((hh) => hh.command?.includes("daily-journal"))
  );
  if (!postToolUseAlreadyRegistered) {
    postToolUseHooks.push({
      matcher: "Edit|Write",
      hooks: [{ type: "command", command: fileEditHookCommand }]
    });
  }
  settings.hooks = { ...hooks, Stop: stopHooks, PostToolUse: postToolUseHooks };
  const permissions = settings.permissions ?? {};
  const allowList = permissions.allow ?? [];
  const dailyJournalPermission = `Write(${path4.join(DATA_DIR, "**")})`;
  if (!allowList.includes(dailyJournalPermission)) {
    allowList.push(dailyJournalPermission);
  }
  settings.permissions = { ...permissions, allow: allowList };
  fs4.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  console.log("\u2713 Stop \uD6C5, PostToolUse \uD6C5, write \uAD8C\uD55C \uB4F1\uB85D \uC644\uB8CC");
}
function registerTaskScheduler(generateTime) {
  if (process.platform === "win32") {
    registerWindowsScheduler(generateTime);
  } else {
    registerCronJob(generateTime);
  }
}
function unregisterTaskScheduler() {
  if (process.platform === "win32") {
    try {
      (0, import_child_process2.execSync)(`schtasks /delete /tn "DailyJournalPlugin" /f`, { stdio: "ignore" });
    } catch {
    }
  } else {
    let currentCrontab = "";
    try {
      currentCrontab = (0, import_child_process2.execSync)("crontab -l", { encoding: "utf-8" });
    } catch {
    }
    const filtered = currentCrontab.split("\n").filter((l) => !l.includes("daily-journal-plugin")).filter(Boolean);
    if (filtered.length > 0) {
      const tmpFile = path4.join(os3.tmpdir(), "daily-journal-crontab.tmp");
      fs4.writeFileSync(tmpFile, filtered.join("\n") + "\n", "utf-8");
      (0, import_child_process2.execSync)(`crontab "${tmpFile}"`);
      fs4.unlinkSync(tmpFile);
    } else {
      try {
        (0, import_child_process2.execSync)("crontab -r", { stdio: "ignore" });
      } catch {
      }
    }
  }
  console.log("- \uC2A4\uCF00\uC974\uB7EC \uC81C\uAC70 \uC644\uB8CC");
}
function registerWindowsScheduler(endTime) {
  const [h, m] = endTime.split(":");
  const hour = h.padStart(2, "0");
  const minute = m.padStart(2, "0");
  const generateScript = path4.join(PLUGIN_DIR, "dist", "generate-journal.js");
  const taskName = "DailyJournalPlugin";
  const deleteCmd = `schtasks /delete /tn "${taskName}" /f 2>nul`;
  const createCmd = [
    `schtasks /create /tn "${taskName}"`,
    `/tr "node \\"${generateScript}\\""`,
    `/sc daily /st ${hour}:${minute}`,
    `/f`
  ].join(" ");
  try {
    (0, import_child_process2.execSync)(deleteCmd, { stdio: "ignore" });
  } catch {
  }
  (0, import_child_process2.execSync)(createCmd, { stdio: "inherit" });
  console.log(`\u2713 Task Scheduler \uB4F1\uB85D \uC644\uB8CC (\uB9E4\uC77C ${endTime})`);
}
function registerCronJob(generateTime) {
  const [hour, minute] = generateTime.split(":");
  const generateScript = path4.join(PLUGIN_DIR, "dist", "generate-journal.js");
  const cronLine = `${minute} ${hour} * * * node "${generateScript}" # daily-journal-plugin`;
  let currentCrontab = "";
  try {
    currentCrontab = (0, import_child_process2.execSync)("crontab -l", { encoding: "utf-8" });
  } catch {
  }
  const filtered = currentCrontab.split("\n").filter((l) => !l.includes("daily-journal-plugin")).filter(Boolean);
  filtered.push(cronLine);
  const tmpFile = path4.join(os3.tmpdir(), "daily-journal-crontab.tmp");
  fs4.writeFileSync(tmpFile, filtered.join("\n") + "\n", "utf-8");
  (0, import_child_process2.execSync)(`crontab "${tmpFile}"`);
  fs4.unlinkSync(tmpFile);
  console.log(`\u2713 cron \uB4F1\uB85D \uC644\uB8CC (\uB9E4\uC77C ${generateTime})`);
}
function deepMergeDefaults(defaults, existing) {
  const result = { ...existing };
  for (const key of Object.keys(defaults)) {
    if (!(key in result)) {
      result[key] = defaults[key];
    } else if (typeof defaults[key] === "object" && defaults[key] !== null && !Array.isArray(defaults[key]) && typeof result[key] === "object" && result[key] !== null) {
      result[key] = deepMergeDefaults(defaults[key], result[key]);
    }
  }
  return result;
}
function createUserConfigIfAbsent() {
  const userConfigPath = path4.join(DATA_DIR, "user-config.json");
  const defaultConfig = loadDefaultConfig();
  const userConfigTemplate = {
    schedule: {
      use: defaultConfig.schedule.use,
      start: defaultConfig.schedule.start,
      end: defaultConfig.schedule.end,
      generateAt: defaultConfig.schedule.generateAt
    },
    summary: {
      use: defaultConfig.summary.use,
      claudeModel: defaultConfig.summary.claudeModel,
      stylePrompt: defaultConfig.summary.stylePrompt
    },
    journal: {
      stylePrompt: defaultConfig.journal.stylePrompt,
      claudeModel: defaultConfig.journal.claudeModel,
      output_dir: defaultConfig.journal.output_dir
    },
    cleanup: defaultConfig.cleanup,
    save: defaultConfig.save,
    timeZone: defaultConfig.timeZone
  };
  if (!fs4.existsSync(userConfigPath)) {
    fs4.writeFileSync(userConfigPath, JSON.stringify(userConfigTemplate, null, 2), "utf-8");
    console.log(`\u2713 \uC0AC\uC6A9\uC790 \uC124\uC815 \uD30C\uC77C \uC0DD\uC131: ${userConfigPath}`);
    return;
  }
  let existing = {};
  try {
    existing = JSON.parse(fs4.readFileSync(userConfigPath, "utf-8"));
  } catch {
    existing = {};
  }
  const updated = deepMergeDefaults(userConfigTemplate, existing);
  if (JSON.stringify(updated) !== JSON.stringify(existing)) {
    fs4.writeFileSync(userConfigPath, JSON.stringify(updated, null, 2), "utf-8");
    console.log(`\u2713 \uC0AC\uC6A9\uC790 \uC124\uC815 \uD30C\uC77C \uC5C5\uB370\uC774\uD2B8 (\uC0C8 \uC124\uC815 \uCD94\uAC00): ${userConfigPath}`);
  }
}
function main2() {
  setup();
}
function setup() {
  fs4.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`\u2713 \uB370\uC774\uD130 \uB514\uB809\uD1A0\uB9AC \uC0DD\uC131: ${DATA_DIR}`);
  createUserConfigIfAbsent();
  initClaudeSetting();
  const config = loadConfig();
  if (config.schedule.use) {
    registerTaskScheduler(config.schedule.generateAt);
  } else {
    console.log("\uC2A4\uCF00\uC904\uB7EC \uC81C\uAC70. (daily-journal.schedule.use: false)");
    unregisterTaskScheduler();
  }
  try {
    (0, import_child_process2.execSync)("npm link", { cwd: PLUGIN_DIR, stdio: "ignore" });
    console.log("\u2713 CLI \uC804\uC5ED \uB4F1\uB85D \uC644\uB8CC (dj \uBA85\uB839\uC5B4 \uC0AC\uC6A9 \uAC00\uB2A5)");
  } catch {
    console.warn("\u26A0 CLI \uC804\uC5ED \uB4F1\uB85D \uC2E4\uD328. \uC218\uB3D9\uC73C\uB85C \uB4F1\uB85D\uD558\uB824\uBA74:");
    console.warn(`  cd "${PLUGIN_DIR}" && npm link`);
  }
  console.log("\n\u2705 daily-journal \uD50C\uB7EC\uADF8\uC778 \uC124\uCE58 \uC644\uB8CC");
  console.log(`   \uB370\uC774\uD130 \uC704\uCE58: ${DATA_DIR}`);
  if (config.schedule.use) {
    console.log(`   \uC77C\uC9C0 \uC0DD\uC131 \uC2DC\uAC04: \uB9E4\uC77C ${config.schedule.generateAt}`);
  }
  console.log("\n   \uC0AC\uC6A9\uC790 \uC124\uC815 \uD30C\uC77C: ~/.claude/daily-journal/user-config.json");
  console.log("\n   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  console.log("   \uB3C4\uC6C0\uB9D0 dj help");
  console.log("   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
}
function removeClaudeSetting() {
  let settings = {};
  if (fs4.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs4.readFileSync(SETTINGS_PATH, "utf-8"));
    } catch {
      settings = {};
    }
  }
  const hooks = settings.hooks ?? {};
  const stopHooks = hooks.Stop ?? [];
  const postToolUseHooks = hooks.PostToolUse ?? [];
  settings.hooks = {
    ...hooks,
    Stop: stopHooks.filter((h) => !h.hooks?.some((hh) => hh.command?.includes("daily-journal"))),
    PostToolUse: postToolUseHooks.filter((h) => !h.hooks?.some((hh) => hh.command?.includes("daily-journal")))
  };
  const permissions = settings.permissions ?? {};
  const allowList = permissions.allow ?? [];
  const dailyJournalPermission = `Write(${path4.join(DATA_DIR, "**")})`;
  settings.permissions = { ...permissions, allow: allowList.filter((p) => p !== dailyJournalPermission) };
  fs4.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  console.log("\u2713 Stop \uD6C5, PostToolUse \uD6C5, write \uAD8C\uD55C \uC81C\uAC70 \uC644\uB8CC");
}
function uninstall() {
  removeClaudeSetting();
  console.log("\uC2A4\uCF00\uC904\uB7EC \uC81C\uAC70.");
  unregisterTaskScheduler();
  try {
    (0, import_child_process2.execSync)("npm unlink", { cwd: PLUGIN_DIR, stdio: "ignore" });
    console.log("\u2713 CLI \uC804\uC5ED \uC0AD\uC81C \uC644\uB8CC");
  } catch {
    console.warn("\u26A0 CLI \uC804\uC5ED \uC0AD\uC81C \uC2E4\uD328. \uC218\uB3D9\uC73C\uB85C \uC0AD\uC81C\uD558\uB824\uBA74:");
    console.warn(`  cd "${PLUGIN_DIR}" && npm unlink`);
  }
  console.log("\n\u2705 daily-journal \uC81C\uAC70\uC644\uB8CC");
  console.log(`     - \uD50C\uB7EC\uADF8\uC778 \uD3F4\uB354\uB97C \uC644\uC804\uD788 \uC0AD\uC81C\uD558\uB824\uBA74: ${PLUGIN_DIR} \uD3F4\uB354\uB97C \uC0AD\uC81C\uD574\uC8FC\uC138\uC694.`);
  console.log(`     - \uC7AC\uC124\uCE58 \uBA85\uB839\uC5B4 : node "${PLUGIN_DIR}/dist/setup.js"`);
}
var isDirectRun2 = process.argv[1]?.endsWith("setup.js") || process.argv[1]?.endsWith("setup.ts");
if (isDirectRun2) {
  main2();
}

// src/view.ts
var fs5 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
function cmdView() {
  const config = loadConfig();
  const outputDir = config.journal.output_dir;
  let dates = [];
  let contentList = [];
  let histories = [];
  let contentLines = [];
  try {
    if (fs5.existsSync(RUN_HISTORY_PATH)) {
      const history = JSON.parse(fs5.readFileSync(RUN_HISTORY_PATH, "utf-8"));
      dates = Object.values(history).filter((e) => e.status !== "no_data").map((e) => e.date).sort();
    }
  } catch {
  }
  if (dates.length === 0) {
    console.log("\uD45C\uC2DC\uD560 \uC77C\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  let dateIdx = dates.length - 1;
  let dateListOffset = 0;
  let contentListIdx = 0;
  let contentListOffset = 0;
  let historyIdx = 0;
  let scrollOffset = 0;
  let deepCursor = 0;
  let showingFileEdits = false;
  let fileEditIdx = 0;
  let fileEditScrollOffset = 0;
  let fileEditContentLines = [];
  function getTermSize() {
    return {
      rows: process.stdout.rows || 24,
      cols: process.stdout.columns || 80
    };
  }
  function loadContentList() {
    const filePath = path5.join(outputDir, dates[dateIdx], "history");
    try {
      contentList = fs5.readdirSync(filePath);
    } catch {
    }
  }
  function dispWidth(s) {
    let w = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp >= 4352 && cp <= 4447 || cp >= 11904 && cp <= 12350 || cp >= 12352 && cp <= 13311 || cp >= 13312 && cp <= 19903 || cp >= 19968 && cp <= 42191 || cp >= 44032 && cp <= 55295 || cp >= 63744 && cp <= 64255 || cp >= 65281 && cp <= 65376 || cp >= 65504 && cp <= 65510) {
        w += 2;
      } else {
        w += 1;
      }
    }
    return w;
  }
  function wrapLine(line, cols) {
    if (dispWidth(line) <= cols) return [line];
    const result = [];
    let current = "";
    let currentWidth = 0;
    for (const ch of line) {
      const chw = dispWidth(ch);
      if (currentWidth + chw > cols) {
        result.push(current);
        current = ch;
        currentWidth = chw;
      } else {
        current += ch;
        currentWidth += chw;
      }
    }
    if (current) result.push(current);
    return result;
  }
  function buildFileEditLines(hIdx) {
    const h = histories[hIdx];
    if (!h?.fileEdits || h.fileEdits.length === 0) {
      fileEditContentLines = [];
      return;
    }
    fileEditContentLines = h.fileEdits.map((edit) => {
      const lines = [];
      if (edit.tool === "Edit") {
        (edit.before ?? "").split("\n").forEach((l) => lines.push(`\x1B[31m- ${l}\x1B[0m`));
        (edit.after ?? "").split("\n").forEach((l) => lines.push(`\x1B[32m+ ${l}\x1B[0m`));
      } else if (edit.tool === "Write") {
        if (edit.historyRef && fs5.existsSync(edit.historyRef)) {
          fs5.readFileSync(edit.historyRef, "utf-8").split("\n").forEach((l) => lines.push(`\x1B[32m+ ${l}\x1B[0m`));
        } else {
          lines.push("  (file-history \uCC38\uC870\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4)");
        }
      }
      return lines;
    });
  }
  function buildContentLines(cols) {
    const innerCols = cols - 2;
    contentLines = histories.map((h) => {
      const lines = [];
      const addText = (text) => text.split("\n").forEach((l) => wrapLine(l, innerCols).forEach((w) => lines.push(`  ${w}`)));
      lines.push(`\x1B[1;36m[ \uC9C8\uBB38 ]\x1B[0m`);
      addText(h.prompt);
      lines.push(``);
      lines.push(`\x1B[1;32m[ \uC751\uB2F5 ]\x1B[0m`);
      addText(h.answer ?? " - ");
      lines.push(``);
      lines.push(`\x1B[1;33m[ \uC694\uC57D ]\x1B[0m`);
      addText(h.summary);
      lines.push(``);
      return lines;
    });
  }
  function loadContent() {
    const contentPath = path5.join(outputDir, dates[dateIdx], "history", contentList[contentListIdx]);
    try {
      const lines = fs5.readFileSync(contentPath, "utf-8").split("\n");
      histories = lines.flatMap((l) => {
        try {
          return [JSON.parse(l)];
        } catch (e) {
          logError("\uC77C\uC9C0 \uC791\uC131\uC911 \uC190\uC0C1\uB41C history Skip: " + l);
          return [];
        }
      });
      buildContentLines(getTermSize().cols);
    } catch {
    }
  }
  function clampListOffset(idx, offset, contentHeight) {
    if (idx < offset) return idx;
    if (idx >= offset + contentHeight) return idx - contentHeight + 1;
    return offset;
  }
  function renderDateList(contentHeight) {
    const visibleDates = dates.slice(dateListOffset, dateListOffset + contentHeight);
    visibleDates.forEach((d, i) => {
      const actualIdx = dateListOffset + i;
      process.stdout.write(`  ${actualIdx === dateIdx ? "\u25B7  " : "   "}${d}
`);
    });
    for (let i = visibleDates.length; i < contentHeight; i++) {
      process.stdout.write("\n");
    }
  }
  function renderContentList(contentHeight, cols) {
    process.stdout.write("\u2500".repeat(cols) + "\n");
    if (contentList.length === 0) {
      process.stdout.write("- \uC800\uC7A5\uB41C \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.\n");
      for (let i = 1; i < contentHeight; i++) process.stdout.write("\n");
    } else {
      const visibleItems = contentList.slice(contentListOffset, contentListOffset + contentHeight);
      visibleItems.forEach((item, i) => {
        const actualIdx = contentListOffset + i;
        process.stdout.write(`  ${actualIdx === contentListIdx ? "\u25B7  " : "   "}${item}
`);
      });
      for (let i = visibleItems.length; i < contentHeight; i++) {
        process.stdout.write("\n");
      }
    }
  }
  function renderFileEdits(contentHeight, cols) {
    const h = histories[historyIdx];
    const edits = h?.fileEdits ?? [];
    if (edits.length === 0) {
      process.stdout.write("  \uC218\uC815\uB41C \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.\n");
      for (let i = 1; i < contentHeight + 2; i++) process.stdout.write("\n");
      return;
    }
    const edit = edits[fileEditIdx];
    const toolLabel = edit.tool === "Write" ? "\uC2E0\uADDC" : "\uC218\uC815";
    process.stdout.write(`  ${edit.file}  \x1B[2m[${toolLabel}]\x1B[0m  (${fileEditIdx + 1} / ${edits.length})
`);
    process.stdout.write("\u2500".repeat(cols) + "\n");
    const lines = fileEditContentLines[fileEditIdx] ?? [];
    const maxScroll = Math.max(0, lines.length - contentHeight);
    if (fileEditScrollOffset > maxScroll) fileEditScrollOffset = maxScroll;
    const visible = lines.slice(fileEditScrollOffset, fileEditScrollOffset + contentHeight);
    visible.forEach((line) => process.stdout.write(line + "\n"));
    for (let i = visible.length; i < contentHeight; i++) process.stdout.write("\n");
  }
  function renderContent(contentHeight, cols) {
    const content = contentList[contentListIdx];
    process.stdout.write(`  ${content}  (${contentListIdx + 1} / ${contentList.length})
`);
    process.stdout.write("\u2500".repeat(cols) + "\n");
    const currentHistory = histories[historyIdx];
    const hasFileEdits = currentHistory?.fileEdits && currentHistory.fileEdits.length > 0;
    const fileEditsHint = hasFileEdits ? `  \x1B[33m[\uC218\uC815\uD30C\uC77C ${currentHistory.fileEdits?.length ?? 0}\uAC74 \xB7 f]\x1B[0m` : "";
    process.stdout.write(`  history page [${historyIdx + 1} / ${contentLines.length}]${fileEditsHint}
`);
    const history = contentLines[historyIdx];
    const maxScroll = Math.max(0, history.length - contentHeight);
    if (scrollOffset > maxScroll) scrollOffset = maxScroll;
    const visible = history.slice(scrollOffset, scrollOffset + contentHeight);
    visible.forEach((line) => process.stdout.write((line === "" ? "\u2500".repeat(cols) : line) + "\n"));
    for (let i = visible.length; i < contentHeight; i++) {
      process.stdout.write("\n");
    }
  }
  function render() {
    const { rows, cols } = getTermSize();
    const date = dates[dateIdx];
    process.stdout.write("\x1B[H\x1B[2J");
    process.stdout.write(`\uAE30\uB85D \uBCF4\uAE30
`);
    if (deepCursor === 0) {
      renderDateList(rows - 3);
    } else {
      const dateStr = `  ${date}  (${dateIdx + 1} / ${dates.length})`;
      process.stdout.write(`\x1B[1m${dateStr}\x1B[0m
`);
      if (deepCursor === 1) {
        renderContentList(rows - 5, cols);
      } else {
        if (showingFileEdits) {
          renderFileEdits(rows - 6, cols);
        } else {
          renderContent(rows - 7, cols);
        }
      }
    }
    process.stdout.write("\u2500".repeat(cols) + "\n");
    const hint = deepCursor === 2 ? showingFileEdits ? `\u25B2\u25BC \uC2A4\uD06C\uB864  /  \u25C0 \u25B6 \uD30C\uC77C \uC774\uB3D9  /  f\xB7esc \uB300\uD654\uB85C \uB3CC\uC544\uAC00\uAE30  /  q \uC885\uB8CC` : `\u25B2\u25BC \uC2A4\uD06C\uB864  /  \u25C0 \u25B6 history \uC774\uB3D9  /  f \uC218\uC815\uD30C\uC77C \uBCF4\uAE30  /  esc \uB4A4\uB85C\uAC00\uAE30  /  q \uC885\uB8CC` : `\u25B2\u25BC \uC120\uD0DD \uC774\uB3D9  /  enter \uC120\uD0DD  /  esc \uB4A4\uB85C\uAC00\uAE30  /  q \uC885\uB8CC`;
    process.stdout.write(`\x1B[2m${hint}\x1B[0m`);
  }
  function exit() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write("\x1B[?1049l");
  }
  process.stdout.write("\x1B[?1049h");
  render();
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf-8");
  process.stdout.on("resize", () => {
    if (deepCursor === 2) buildContentLines(getTermSize().cols);
    render();
  });
  process.stdin.on("data", (key) => {
    const { rows } = getTermSize();
    const ch0 = rows - 3;
    const ch1 = rows - 5;
    const ch2 = rows - 7;
    const chFile = rows - 6;
    if (key === "q" || key === "") {
      exit();
      process.exit(0);
    } else if (key === "\x1B[A") {
      if (deepCursor === 0) {
        if (dateIdx > 0) {
          dateIdx--;
          dateListOffset = clampListOffset(dateIdx, dateListOffset, ch0);
          render();
        }
      } else if (deepCursor === 1) {
        if (contentListIdx > 0) {
          contentListIdx--;
          contentListOffset = clampListOffset(contentListIdx, contentListOffset, ch1);
          render();
        }
      } else if (deepCursor === 2) {
        if (showingFileEdits) {
          if (fileEditScrollOffset > 0) {
            fileEditScrollOffset--;
            render();
          }
        } else {
          if (scrollOffset > 0) {
            scrollOffset--;
            render();
          }
        }
      }
    } else if (key === "\x1B[B") {
      if (deepCursor === 0) {
        if (dateIdx < dates.length - 1) {
          dateIdx++;
          dateListOffset = clampListOffset(dateIdx, dateListOffset, ch0);
          render();
        }
      } else if (deepCursor === 1) {
        if (contentListIdx < contentList.length - 1) {
          contentListIdx++;
          contentListOffset = clampListOffset(contentListIdx, contentListOffset, ch1);
          render();
        }
      } else if (deepCursor === 2) {
        if (showingFileEdits) {
          const maxScroll = Math.max(0, (fileEditContentLines[fileEditIdx]?.length ?? 0) - chFile);
          if (fileEditScrollOffset < maxScroll) {
            fileEditScrollOffset++;
            render();
          }
        } else {
          const maxScroll = Math.max(0, contentLines[historyIdx].length - ch2);
          if (scrollOffset < maxScroll) {
            scrollOffset++;
            render();
          }
        }
      }
    } else if (key === "\x1B[C") {
      if (deepCursor === 2) {
        if (showingFileEdits) {
          const edits = histories[historyIdx]?.fileEdits ?? [];
          if (fileEditIdx < edits.length - 1) {
            fileEditIdx++;
            fileEditScrollOffset = 0;
            render();
          }
        } else {
          if (historyIdx < contentLines.length - 1) {
            historyIdx++;
            scrollOffset = 0;
            render();
          }
        }
      }
    } else if (key === "\x1B[D") {
      if (deepCursor === 2) {
        if (showingFileEdits) {
          if (fileEditIdx > 0) {
            fileEditIdx--;
            fileEditScrollOffset = 0;
            render();
          }
        } else {
          if (historyIdx > 0) {
            historyIdx--;
            scrollOffset = 0;
            render();
          }
        }
      }
    } else if (key === "f" && deepCursor === 2) {
      if (showingFileEdits) {
        showingFileEdits = false;
      } else {
        buildFileEditLines(historyIdx);
        fileEditIdx = 0;
        fileEditScrollOffset = 0;
        showingFileEdits = true;
      }
      render();
    } else if (key === "\r" || key === "\r\n") {
      if (deepCursor === 0) {
        loadContentList();
        contentListIdx = 0;
        contentListOffset = 0;
        deepCursor++;
        render();
      } else if (deepCursor === 1) {
        loadContent();
        scrollOffset = 0;
        deepCursor++;
        render();
      }
    } else if (key === "\x1B") {
      if (showingFileEdits) {
        showingFileEdits = false;
        render();
      } else if (deepCursor > 0) {
        deepCursor--;
        if (deepCursor === 1) {
          historyIdx = 0;
          scrollOffset = 0;
        }
        if (deepCursor === 0) {
          contentListIdx = 0;
          contentListOffset = 0;
        }
        render();
      }
    }
  });
}

// src/cli.ts
var RUN_HISTORY_PATH = path6.join(DATA_DIR, "run-history.json");
function loadRunHistory() {
  try {
    if (fs6.existsSync(RUN_HISTORY_PATH)) {
      return JSON.parse(fs6.readFileSync(RUN_HISTORY_PATH, "utf-8"));
    }
  } catch {
  }
  return {};
}
function cmdWriteJournal(date) {
  const config = loadConfig();
  const targetDate = date ?? getDateString(config.timeZone);
  console.log(`
${targetDate} \uC77C\uC9C0 \uC0DD\uC131 \uC911...
`);
  writeJournal(targetDate, config);
  console.log("");
}
function cmdConfig() {
  const config = loadConfig();
  const userConfigPath = path6.join(DATA_DIR, "user-config.json");
  const hasUserConfig = fs6.existsSync(userConfigPath);
  console.log(`
\uD604\uC7AC \uC124\uC815 (user-config.json ${hasUserConfig ? "\uC801\uC6A9\uB428" : "\uC5C6\uC74C \u2014 \uAE30\uBCF8\uAC12 \uC0AC\uC6A9"})
`);
  console.log(`  schedule.use         : ${config.schedule.use}`);
  console.log(`                           - false \uC2DC \uC2A4\uCF00\uC974\uB7EC \uB4F1\uB85D \uC548 \uD568. \uC218\uB3D9\uC73C\uB85C dj write-journal \uC0AC\uC6A9 ( \uBCC0\uACBD \uC2DC setup \uD544\uC694 )
`);
  console.log(`  schedule.start       : "${config.schedule.start}"`);
  console.log(`                           - \uD6C5 \uD65C\uC131\uD654 \uC2DC\uC791 \uC2DC\uAC04. \uC774 \uC2DC\uAC04 \uC774\uC804 \uB300\uD654\uB294 \uAE30\uB85D \uC548 \uD568 
`);
  console.log(`  schedule.end         : "${config.schedule.end}"`);
  console.log(`                           - \uD6C5 \uD65C\uC131\uD654 \uC885\uB8CC \uC2DC\uAC04. \uC2A4\uCF00\uC974\uB7EC\uAC00 \uC774 \uC2DC\uAC04\uC5D0 \uC77C\uC9C0 \uC0DD\uC131`);
  console.log(`                           - \uBCC0\uACBD \uC2DC setup \uC7AC\uC2E4\uD589 \uD544\uC694 
`);
  console.log(`  summary.use          : ${config.summary.use}`);
  console.log(`                           - true \uC2DC Claude\uAC00 \uC751\uB2F5\uC744 \uC694\uC57D\uD574 \uC800\uC7A5. \`stylePrompt\`\uB85C SKIP\uC744 \uBC18\uD658\uD558\uB3C4\uB85D \uC124\uC815\uD558\uBA74 \uD574\uB2F9 \uB300\uD654\uB294 \uC800\uC7A5\uD558\uC9C0 \uC54A\uC74C.`);
  console.log(`                           - false \uC2DC \uC751\uB2F5 \uC6D0\uBCF8\uC744 \uADF8\uB300\uB85C \uC800\uC7A5 (Claude \uD638\uCD9C \uC5C6\uC74C, \uD1A0\uD070 \uC808\uC57D) 
`);
  console.log(`  summary.claudeModel  : "${config.summary.claudeModel}"`);
  console.log(`                           - \uC694\uC57D\uC2DC \uC0AC\uC6A9\uB418\uB294 claudeModel 
`);
  console.log(`  summary.stylePrompt  : "${config.summary.stylePrompt.length > 60 ? config.summary.stylePrompt.slice(0, 60) + "..." : config.summary.stylePrompt}"`);
  console.log(`                           - \uB300\uD654 \uC885\uB8CC\uB9C8\uB2E4 \uC751\uB2F5\uC744 \uC694\uC57D\uD560 \uB54C \uC4F0\uB294 \uD504\uB86C\uD504\uD2B8 
`);
  console.log(`  journal.output_dir   : "${config.journal.output_dir}"`);
  console.log(`                           - \uC77C\uC9C0 \uC800\uC7A5 \uACBD\uB85C. YYYY-MM-DD/journal.md \uD615\uD0DC\uB85C \uC800\uC7A5\uB428 
`);
  console.log(`  journal.claudeModel  : "${config.journal.claudeModel}"`);
  console.log(`                           - \uC77C\uC9C0 \uC791\uC131\uC2DC \uC0AC\uC6A9\uB418\uB294 claudeModel 
`);
  console.log(`  journal.stylePrompt  : "${config.journal.stylePrompt.length > 60 ? config.journal.stylePrompt.slice(0, 60) + "..." : config.journal.stylePrompt}"`);
  console.log(`                           - \uC77C\uC9C0 \uC791\uC131 \uC2A4\uD0C0\uC77C \uB4F1\uC744 \uC815\uD558\uB294 \uD504\uB86C\uD504\uD2B8 
`);
  console.log(`  cleanup              : ${config.cleanup}`);
  console.log(`                           - \uC77C\uC9C0 \uC0DD\uC131 \uD6C4 history \uD30C\uC77C \uC0AD\uC81C \uC5EC\uBD80 ( \uB2F9\uC77C \uC0DD\uC131\uB41C history\uB294 \uC0AD\uC81C\uB418\uC9C0 \uC54A\uC74C ) 
`);
  console.log(`  save                 : ${config.save}`);
  console.log(`                           - prompt\uB97C \uC800\uC7A5\uD560\uC9C0 \uC5EC\uBD80 ( false \uC2DC \uC800\uC7A5\uC774 \uC548\uB428 ) 
`);
  console.log(`  timeZone             : ${config.timeZone}`);
  console.log(`                           - \uC6D0\uD558\uB294 timeZone \uC124\uC815 ( \uBBF8\uC124\uC815 \uB610\uB294 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC744 \uC2DC \uAE30\uBCF8 Asia/Seoul\uB85C \uC124\uC815\uB428 ) 
`);
  console.log(`
  \uC124\uC815 \uD30C\uC77C \uC704\uCE58: ${userConfigPath}
`);
}
function cmdLogs() {
  const history = loadRunHistory();
  const entries = Object.values(history).sort((a, b) => b.date.localeCompare(a.date));
  if (entries.length === 0) {
    console.log("\uC2E4\uD589 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  console.log("\n\uC2E4\uD589 \uAE30\uB85D:\n");
  entries.forEach((entry) => {
    switch (entry.status) {
      case "success":
        console.log(entry.date + " : success");
        break;
      case "failed":
        console.log(entry.date + " : failed / error : " + entry.error);
        break;
      case "modified":
        console.log(entry.date + " : modified");
        break;
      case "no_data":
        console.log(entry.date + " : no_data");
        break;
      case "create":
        console.log(entry.date + " : create");
        break;
    }
  });
  console.log("");
  const total = entries.length;
  const success = entries.filter((e) => e.status === "success").length;
  const modified = entries.filter((e) => e.status === "modified").length;
  const failed = entries.filter((e) => e.status === "failed").length;
  const noData = entries.filter((e) => e.status === "no_data").length;
  console.log(`  \uCD1D ${total}\uC77C  |  \uC131\uACF5 ${success}  \uC218\uC815\uB428 ${modified}  \uC2E4\uD328 ${failed}  \uB370\uC774\uD130\uC5C6\uC74C ${noData}
`);
}
function cmdRetry() {
  const history = loadRunHistory();
  const config = loadConfig();
  const dateStr = getDateString(config.timeZone);
  const failed = Object.values(history).filter((e) => e.status === "failed" || e.status === "modified" || e.status === "create" && e.date !== dateStr).sort((a, b) => a.date.localeCompare(b.date));
  if (failed.length === 0) {
    console.log("\uC7AC\uC0DD\uC131\uD560 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  console.log(`
\uC2E4\uD328/\uC218\uC815 \uD56D\uBAA9 ${failed.length}\uAC74 \uC7AC\uC0DD\uC131 \uC2DC\uC791...
`);
  for (const entry of failed) {
    console.log(`  ${entry.date}:`);
    writeJournal(entry.date, config);
  }
  console.log("\n\uC644\uB8CC\n");
}
function cmdUpdate() {
  const PLUGIN_DIR2 = path6.join(os4.homedir(), ".claude", "plugins", "daily-journal");
  console.log("\ndaily-journal \uC5C5\uB370\uC774\uD2B8 \uC911...\n");
  console.log("1. \uCD5C\uC2E0 \uCF54\uB4DC \uBC1B\uB294 \uC911 (git pull)...");
  try {
    const pullOutput = (0, import_child_process3.execSync)("git pull", { cwd: PLUGIN_DIR2, encoding: "utf-8" });
    console.log("  " + pullOutput.trim().replace(/\n/g, "\n  "));
  } catch (e) {
    console.error("  \u2717 git pull \uC2E4\uD328:", e.stderr || String(e));
    process.exit(1);
  }
  console.log("2. \uBE4C\uB4DC \uC911...");
  try {
    (0, import_child_process3.execSync)("npm run build:bundle", { cwd: PLUGIN_DIR2, encoding: "utf-8", stdio: "pipe" });
    console.log("  \u2713 \uBE4C\uB4DC \uC644\uB8CC");
  } catch (e) {
    console.error("  \u2717 \uBE4C\uB4DC \uC2E4\uD328:", e.stderr || String(e));
    process.exit(1);
  }
  console.log("3. \uC124\uC815 \uC7AC\uC801\uC6A9 \uC911...");
  setup();
  console.log("\n\u2705 \uC5C5\uB370\uC774\uD2B8 \uC644\uB8CC\n");
}
function cmdHelp() {
  console.log("\n\uC0AC\uC6A9\uBC95: dj <command>\n");
  console.log("  help                     \uC774 \uB3C4\uC6C0\uB9D0 \uD45C\uC2DC");
  console.log("  config                   \uD604\uC7AC \uC124\uC815 \uBC0F \uC635\uC158 \uD655\uC778");
  console.log("  logs                     \uC77C\uC9C0 \uC0DD\uC131 \uC131\uACF5/\uC2E4\uD328 \uAE30\uB85D \uD655\uC778");
  console.log("  write-journal [date]     \uC624\uB298 \uC77C\uC9C0 \uC218\uB3D9 \uC0DD\uC131 (\uB0A0\uC9DC \uC9C0\uC815 \uC2DC \uD574\uB2F9 \uB0A0\uC9DC, \uC608: dj write-journal 2026-02-25)");
  console.log("  retry                    \uC77C\uC9C0 \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD55C \uB0A0\uC9DC \uB4E4\uC758 \uC77C\uC9C0 \uC7AC\uC0DD\uC131");
  console.log("  view                     \uBC29\uD5A5\uD0A4\uB85C \uB0A0\uC9DC\uBCC4 \uC77C\uC9C0 \uD0D0\uC0C9");
  console.log("  update                   \uCD5C\uC2E0 \uBC84\uC804\uC73C\uB85C \uC5C5\uB370\uC774\uD2B8 (git pull + \uBE4C\uB4DC + setup \uC7AC\uC801\uC6A9)");
  console.log("  setup                    \uC124\uC815\uAC12 \uC801\uC6A9");
  console.log("  uninstall                \uC124\uCE58 \uC0AD\uC81C\n");
}
var command = process.argv[2];
switch (command) {
  case "help":
    cmdHelp();
    break;
  case "config":
    cmdConfig();
    break;
  case "logs":
    cmdLogs();
    break;
  case "write-journal":
    try {
      cmdWriteJournal(process.argv[3]);
    } catch (e) {
      logError(String(e));
      process.exit(1);
    }
    break;
  case "retry":
    try {
      cmdRetry();
    } catch (e) {
      logError(String(e));
      process.exit(1);
    }
    break;
  case "view":
    try {
      cmdView();
    } catch (e) {
      logError(String(e));
      process.exit(1);
    }
    break;
  case "update":
    try {
      cmdUpdate();
    } catch (e) {
      logError(String(e));
      process.exit(1);
    }
    break;
  case "setup":
    try {
      setup();
    } catch (e) {
      logError(String(e));
      process.exit(1);
    }
    break;
  case "uninstall":
    try {
      uninstall();
    } catch (e) {
      logError(String(e));
      process.exit(1);
    }
    break;
  default:
    cmdHelp();
    break;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RUN_HISTORY_PATH
});
