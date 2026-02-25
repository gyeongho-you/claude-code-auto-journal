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

// src/stop-hook.ts
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
function getNowMinutes(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(/* @__PURE__ */ new Date());
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}
function getTodayDir(config) {
  return path.join(config.journal.output_dir, getDateString(config.timeZone));
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

// src/stop-hook.ts
function isInTimeRange(start, end, timeZone) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const nowMinutes = getNowMinutes(timeZone);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}
function extractProjectName(cwd) {
  if (!cwd) return "_unknown";
  const parts = cwd.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "_unknown";
}
function getLastUserMessage(transcriptPath) {
  try {
    const content = fs2.readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === "user" && entry.message?.content) {
          const messageContent = entry.message.content;
          if (typeof messageContent === "string") return messageContent;
          if (Array.isArray(messageContent)) {
            const textPart = messageContent.find((p) => p.type === "text");
            if (textPart?.text) return textPart.text;
          }
        }
      } catch (e) {
        logError("\uC190\uC0C1\uB41C history Skip: " + lines[i]);
      }
    }
  } catch (e) {
    logError(`transcript \uD30C\uC2F1 \uC2E4\uD328: ${e}`);
  }
  return null;
}
function summarize(defaultPrompt, stylePrompt, response) {
  const input = `${defaultPrompt}
${stylePrompt}

---
${response}`;
  const result = callClaude(input);
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "claude CLI \uC2E4\uD328");
  }
  return result.stdout.trim();
}
function main() {
  if (process.env.DAILY_JOURNAL_RUNNING) {
    return;
  }
  const config = loadConfig();
  if (!config.save || !isInTimeRange(config.schedule.start, config.schedule.end, config.timeZone)) {
    return;
  }
  const stdinData = fs2.readFileSync(0, "utf-8");
  let payload;
  try {
    payload = JSON.parse(stdinData);
  } catch (e) {
    logError(`stdin \uD30C\uC2F1 \uC2E4\uD328: ${e}`);
    return;
  }
  const { session_id, cwd, last_assistant_message, transcript_path } = payload;
  if (!last_assistant_message) {
    return;
  }
  const prompt = getLastUserMessage(transcript_path);
  if (!prompt) {
    logError(`user \uBA54\uC2DC\uC9C0 \uCD94\uCD9C \uC2E4\uD328 (session: ${session_id}), skip`);
    return;
  }
  const summary = config.summary.use ? summarize(config.summary.defaultPrompt, config.summary.stylePrompt, last_assistant_message) : last_assistant_message;
  if (summary.length === 0 || summary.trim().toUpperCase() === "SKIP") return;
  const projectName = extractProjectName(cwd);
  const todayDir = getTodayDir(config);
  const historyDir = path2.join(todayDir, "history");
  fs2.mkdirSync(historyDir, { recursive: true });
  const entry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    session_id,
    prompt,
    summary
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
  logError(`stop-hook \uC624\uB958: ${e}`);
}
