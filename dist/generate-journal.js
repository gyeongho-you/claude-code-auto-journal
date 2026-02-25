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

// src/generate-journal.ts
var generate_journal_exports = {};
__export(generate_journal_exports, {
  writeJournal: () => writeJournal
});
module.exports = __toCommonJS(generate_journal_exports);
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// src/config.ts
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var DATA_DIR = path.join(os.homedir(), ".claude", "daily-journal");
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
  } catch {
    return defaultConfig;
  }
}
function getDateString(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(/* @__PURE__ */ new Date());
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
    fs.appendFileSync(logPath, `[${(/* @__PURE__ */ new Date()).toISOString()}] ${message}
`);
  } catch {
  }
}

// src/claude.ts
var import_child_process = require("child_process");
function callClaude(input) {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  env.DAILY_JOURNAL_RUNNING = "1";
  return (0, import_child_process.spawnSync)("claude", ["--print"], {
    input,
    encoding: "utf-8",
    timeout: 6e4,
    shell: true,
    env
  });
}

// src/generate-journal.ts
var MAX_DATA_TOKENS = 14e4;
function estimateTokens(text) {
  return Math.ceil(text.length / 2.5);
}
function loadHistoryByProject(historyDir) {
  const result = {};
  const files = fs2.readdirSync(historyDir).filter((f) => f.endsWith(".jsonl"));
  for (const file of files) {
    const project = file.replace(".jsonl", "");
    const lines = fs2.readFileSync(path2.join(historyDir, file), "utf-8").trim().split("\n").filter(Boolean);
    result[project] = lines.map((l) => JSON.parse(l));
  }
  return result;
}
function buildPromptData(historyByProject) {
  return Object.entries(historyByProject).map(([project, entries]) => {
    const items = entries.map((e) => `- ${e.prompt}
  \u2192 ${e.summary}`).join("\n");
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
function summarizeChunk(chunkData, chunkIndex, totalChunks) {
  const input = `\uB2E4\uC74C\uC740 \uB300\uD654 \uAE30\uB85D\uC758 \uC77C\uBD80. (\uD30C\uD2B8 ${chunkIndex + 1}/${totalChunks}).
\uD575\uC2EC \uC791\uC5C5 \uB0B4\uC6A9, \uD574\uACB0\uD55C \uBB38\uC81C, \uC911\uC694\uD55C \uACB0\uC815 \uC0AC\uD56D\uC744 \uAC04\uACB0\uD558\uAC8C \uC815\uB9AC.

${chunkData}`;
  const result = callClaude(input);
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
  const dateDir = path2.join(config.journal.output_dir, date);
  const historyDir = path2.join(dateDir, "history");
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  if (!fs2.existsSync(historyDir)) {
    console.log(`  \uB370\uC774\uD130 \uC5C6\uC74C (history \uB514\uB809\uD1A0\uB9AC \uC5C6\uC74C)`);
    recordRunHistory({ date, status: "no_data", timestamp });
    return;
  }
  const historyByProject = loadHistoryByProject(historyDir);
  const entryCount = Object.values(historyByProject).reduce((sum, e) => sum + e.length, 0);
  const data = buildPromptData(historyByProject);
  console.log(`  \uD56D\uBAA9 ${entryCount}\uAC1C \u2192 \uC815\uB9AC\uC911 ...`);
  const journalContent = estimateTokens(data) <= MAX_DATA_TOKENS ? generateSingle(date, data, config) : generateChunked(date, data, config);
  if (!journalContent) return;
  fs2.mkdirSync(dateDir, { recursive: true });
  fs2.writeFileSync(path2.join(dateDir, "journal.md"), journalContent, "utf-8");
  recordRunHistory({ date, status: "success", timestamp });
  console.log(`  \u2713 \uC644\uB8CC \u2192 ${path2.join(dateDir, "journal.md")}`);
  if (config.cleanup && date !== getDateString(config.timeZone)) {
    fs2.rmSync(historyDir, { recursive: true, force: true });
  }
}
function generateSingle(date, data, config) {
  const input = `${config.journal.defaultPrompt}
${config.journal.stylePrompt}

\uB0A0\uC9DC: ${date}

${data}`;
  const result = callClaude(input);
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
  return content;
}
function generateChunked(date, data, config) {
  const chunks = splitIntoChunks(data, MAX_DATA_TOKENS);
  console.log(`  \uCEE8\uD14D\uC2A4\uD2B8 \uCD08\uACFC \u2192 ${chunks.length}\uAC1C \uCCAD\uD06C\uB85C \uBD84\uD560 \uCC98\uB9AC`);
  const partialSummaries = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  \uCCAD\uD06C ${i + 1}/${chunks.length} \uCC98\uB9AC \uC911...`);
    const summary = summarizeChunk(chunks[i], i, chunks.length);
    partialSummaries.push(summary);
  }
  const combined = partialSummaries.map((s, i) => `### \uD30C\uD2B8 ${i + 1}
${s}`).join("\n\n");
  const finalInput = `${config.journal.defaultPrompt}
${config.journal.stylePrompt}

\uB0A0\uC9DC: ${date}

\uC544\uB798\uB294 \uC624\uB298 \uD558\uB8E8 \uB300\uD654 \uAE30\uB85D\uC744 \uC5EC\uB7EC \uD30C\uD2B8\uB85C \uB098\uB204\uC5B4 \uC815\uB9AC\uD55C \uB0B4\uC6A9. \uC774\uB97C \uD558\uB098\uC758 \uC77C\uAD00\uB41C \uC77C\uC9C0\uB85C \uD1B5\uD569.

${combined}`;
  const result = callClaude(finalInput);
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
  return content;
}
var isDirectRun = process.argv[1]?.endsWith("generate-journal.js") || process.argv[1]?.endsWith("generate-journal.ts");
if (isDirectRun) {
  main();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  writeJournal
});
