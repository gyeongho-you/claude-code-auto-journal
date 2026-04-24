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
var fs = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// src/config.ts
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var DATA_DIR = path.join(os.homedir(), ".claude", "daily-journal");
var SESSION_EDITS_DIR = path.join(os.homedir(), ".claude", "session-edits");
var DEFAULT_OUTPUT_DIR = path.join(DATA_DIR, "data");

// src/file-edit-hook.ts
var FILE_HISTORY_DIR = path2.join(require("os").homedir(), ".claude", "file-history");
function readState(sessionId) {
  const filePath = path2.join(SESSION_EDITS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return { edits: [], lastScan: [] };
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return { edits: [], lastScan: [] };
  }
}
function writeState(sessionId, state) {
  fs.mkdirSync(SESSION_EDITS_DIR, { recursive: true });
  fs.writeFileSync(path2.join(SESSION_EDITS_DIR, `${sessionId}.json`), JSON.stringify(state), "utf-8");
}
function scanHistoryDir(sessionId) {
  const dir = path2.join(FILE_HISTORY_DIR, sessionId);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
function findNewestFile(sessionId, files) {
  if (files.length === 0) return void 0;
  const dir = path2.join(FILE_HISTORY_DIR, sessionId);
  try {
    return files.map((f) => ({ name: f, mtime: fs.statSync(path2.join(dir, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime)[0].name;
  } catch {
    return files[files.length - 1];
  }
}
function main() {
  const stdinData = fs.readFileSync(0, "utf-8");
  let payload;
  try {
    payload = JSON.parse(stdinData);
  } catch {
    return;
  }
  const { session_id, tool_name, tool_input } = payload;
  const filePath = tool_input?.file_path;
  if (!filePath) return;
  const state = readState(session_id);
  if (tool_name === "Edit") {
    state.edits.push({
      tool: "Edit",
      file: filePath,
      before: tool_input.old_string ?? "",
      after: tool_input.new_string ?? ""
    });
    state.lastScan = scanHistoryDir(session_id);
  } else if (tool_name === "Write") {
    const currentScan = scanHistoryDir(session_id);
    const prevSet = new Set(state.lastScan);
    const newFiles = currentScan.filter((f) => !prevSet.has(f));
    const newest = findNewestFile(session_id, newFiles);
    const historyRef = newest ? path2.join(FILE_HISTORY_DIR, session_id, newest) : void 0;
    state.edits.push({ tool: "Write", file: filePath, historyRef });
    state.lastScan = currentScan;
  }
  writeState(session_id, state);
}
try {
  main();
} catch {
}
