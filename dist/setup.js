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

// src/setup.ts
var setup_exports = {};
__export(setup_exports, {
  setup: () => setup
});
module.exports = __toCommonJS(setup_exports);
var fs2 = __toESM(require("fs"));
var os2 = __toESM(require("os"));
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
      save: userConfig.save ?? defaultConfig.save
    };
  } catch {
    return defaultConfig;
  }
}

// src/setup.ts
var import_child_process = require("child_process");
var HOME = os2.homedir();
var CLAUDE_DIR = path2.join(HOME, ".claude");
var PLUGIN_DIR = path2.join(CLAUDE_DIR, "plugins", "daily-journal");
var SETTINGS_PATH = path2.join(CLAUDE_DIR, "settings.json");
function registerStopHook() {
  const hookCommand = `node "${path2.join(PLUGIN_DIR, "dist", "stop-hook.js")}"`;
  let settings = {};
  if (fs2.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs2.readFileSync(SETTINGS_PATH, "utf-8"));
    } catch {
      settings = {};
    }
  }
  const hooks = settings.hooks ?? {};
  const stopHooks = hooks.Stop ?? [];
  const alreadyRegistered = stopHooks.some(
    (h) => h.hooks?.some((hh) => hh.command?.includes("daily-journal"))
  );
  if (!alreadyRegistered) {
    stopHooks.push({
      hooks: [{ type: "command", command: hookCommand }]
    });
  }
  settings.hooks = { ...hooks, Stop: stopHooks };
  fs2.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  console.log("\u2713 Stop \uD6C5 \uB4F1\uB85D \uC644\uB8CC");
}
function registerTaskScheduler(endTime) {
  if (process.platform === "win32") {
    registerWindowsScheduler(endTime);
  } else {
    registerCronJob(endTime);
  }
}
function unregisterTaskScheduler() {
  if (process.platform === "win32") {
    try {
      (0, import_child_process.execSync)(`schtasks /delete /tn "DailyJournalPlugin" /f`, { stdio: "ignore" });
    } catch {
    }
  } else {
    let currentCrontab = "";
    try {
      currentCrontab = (0, import_child_process.execSync)("crontab -l", { encoding: "utf-8" });
    } catch {
    }
    const filtered = currentCrontab.split("\n").filter((l) => !l.includes("daily-journal-plugin")).filter(Boolean);
    if (filtered.length > 0) {
      const tmpFile = path2.join(os2.tmpdir(), "daily-journal-crontab.tmp");
      fs2.writeFileSync(tmpFile, filtered.join("\n") + "\n", "utf-8");
      (0, import_child_process.execSync)(`crontab "${tmpFile}"`);
      fs2.unlinkSync(tmpFile);
    } else {
      try {
        (0, import_child_process.execSync)("crontab -r", { stdio: "ignore" });
      } catch {
      }
    }
  }
  console.log("- \uC2A4\uCF00\uC974\uB7EC \uC81C\uAC70 \uC644\uB8CC");
}
function registerWindowsScheduler(endTime) {
  const [hour, minute] = endTime.split(":");
  const generateScript = path2.join(PLUGIN_DIR, "dist", "generate-journal.js");
  const taskName = "DailyJournalPlugin";
  const deleteCmd = `schtasks /delete /tn "${taskName}" /f 2>nul`;
  const createCmd = [
    `schtasks /create /tn "${taskName}"`,
    `/tr "node \\"${generateScript}\\""`,
    `/sc daily /st ${hour}:${minute}`,
    `/f`
  ].join(" ");
  try {
    (0, import_child_process.execSync)(deleteCmd, { stdio: "ignore" });
  } catch {
  }
  (0, import_child_process.execSync)(createCmd, { stdio: "inherit" });
  console.log(`\u2713 Task Scheduler \uB4F1\uB85D \uC644\uB8CC (\uB9E4\uC77C ${endTime})`);
}
function registerCronJob(endTime) {
  const [hour, minute] = endTime.split(":");
  const generateScript = path2.join(PLUGIN_DIR, "dist", "generate-journal.js");
  const cronLine = `${minute} ${hour} * * * node "${generateScript}" # daily-journal-plugin`;
  let currentCrontab = "";
  try {
    currentCrontab = (0, import_child_process.execSync)("crontab -l", { encoding: "utf-8" });
  } catch {
  }
  const filtered = currentCrontab.split("\n").filter((l) => !l.includes("daily-journal-plugin")).filter(Boolean);
  filtered.push(cronLine);
  const tmpFile = path2.join(os2.tmpdir(), "daily-journal-crontab.tmp");
  fs2.writeFileSync(tmpFile, filtered.join("\n") + "\n", "utf-8");
  (0, import_child_process.execSync)(`crontab "${tmpFile}"`);
  fs2.unlinkSync(tmpFile);
  console.log(`\u2713 cron \uB4F1\uB85D \uC644\uB8CC (\uB9E4\uC77C ${endTime})`);
}
function createUserConfigIfAbsent() {
  const userConfigPath = path2.join(DATA_DIR, "user-config.json");
  if (fs2.existsSync(userConfigPath)) return;
  const defaultConfig = {
    schedule: {
      use: true,
      start: "09:00",
      end: "18:00"
    },
    summary: {
      use: true,
      stylePrompt: "\uD575\uC2EC\uB9CC 3\uC904 \uC774\uB0B4\uB85C \uC694\uC57D. \uBCC0\uACBD\uB41C \uD30C\uC77C, \uC0AC\uC6A9\uB41C \uAE30\uC220, \uD574\uACB0\uB41C \uBB38\uC81C\uB97C \uC911\uC2EC\uC73C\uB85C"
    },
    journal: {
      stylePrompt: "\uAC01 \uD504\uB85C\uC81D\uD2B8\uBCC4\uB85C \uD615\uC2DD\uC740 \uB9C8\uD06C\uB2E4\uC6B4 \uD615\uC2DD\uC73C\uB85C \uC791\uC131",
      output_dir: ""
    },
    cleanup: false,
    save: true
  };
  fs2.writeFileSync(userConfigPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
  console.log(`\u2713 \uC0AC\uC6A9\uC790 \uC124\uC815 \uD30C\uC77C \uC0DD\uC131: ${userConfigPath}`);
}
function main() {
  setup();
}
function setup() {
  fs2.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`\u2713 \uB370\uC774\uD130 \uB514\uB809\uD1A0\uB9AC \uC0DD\uC131: ${DATA_DIR}`);
  createUserConfigIfAbsent();
  registerStopHook();
  const config = loadConfig();
  if (config.schedule.use) {
    registerTaskScheduler(config.schedule.end);
  } else {
    console.log("\uC2A4\uCF00\uC904\uB7EC \uC81C\uAC70. (daily-journal.schedule.use: false)");
    unregisterTaskScheduler();
  }
  try {
    (0, import_child_process.execSync)("npm link", { cwd: PLUGIN_DIR, stdio: "ignore" });
    console.log("\u2713 CLI \uC804\uC5ED \uB4F1\uB85D \uC644\uB8CC (dj \uBA85\uB839\uC5B4 \uC0AC\uC6A9 \uAC00\uB2A5)");
  } catch {
    console.warn("\u26A0 CLI \uC804\uC5ED \uB4F1\uB85D \uC2E4\uD328. \uC218\uB3D9\uC73C\uB85C \uB4F1\uB85D\uD558\uB824\uBA74:");
    console.warn(`  cd "${PLUGIN_DIR}" && npm link`);
  }
  console.log("\n\u2705 daily-journal \uD50C\uB7EC\uADF8\uC778 \uC124\uCE58 \uC644\uB8CC");
  console.log(`   \uB370\uC774\uD130 \uC704\uCE58: ${DATA_DIR}`);
  if (config.schedule.use) {
    console.log(`   \uC77C\uC9C0 \uC0DD\uC131 \uC2DC\uAC04: \uB9E4\uC77C ${config.schedule.end}`);
  }
  console.log("\n   \uC0AC\uC6A9\uC790 \uC124\uC815 \uD30C\uC77C: ~/.claude/daily-journal/user-config.json");
  console.log("\n   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  console.log("   \uB3C4\uC6C0\uB9D0 dj help");
  console.log("   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
}
var isDirectRun = process.argv[1]?.endsWith("setup.js") || process.argv[1]?.endsWith("setup.ts");
if (isDirectRun) {
  main();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  setup
});
