const fs = require("fs");
const path = require("path");
const os = require("os");
const fetch = require("node-fetch");
const yauzl = require("yauzl");
const { getSporeInstallPath } = require("./gameRegistry");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

const MODAPI_DEBUG = String(process.env.MODAPI_DEBUG || "").trim() === "1";

const MODAPI_LOG_FILE = MODAPI_DEBUG
  ? String(process.env.MODAPI_LOG_FILE || "").trim()
  : "";

function appendLog(line) {
  try {
    if (!MODAPI_LOG_FILE) return;
    const ts = new Date().toISOString();
    fs.appendFileSync(MODAPI_LOG_FILE, `[${ts}] ${line}\n`, "utf8");
  } catch {}
}

function logInfo(event, data) {
  try {
    if (!MODAPI_LOG_FILE) return;
    appendLog(`${event} ${data ? JSON.stringify(data) : ""}`);
  } catch {}
}

function logError(event, err, data) {
  try {
    if (!MODAPI_LOG_FILE) return;
    appendLog(
      `${event} ${JSON.stringify({
        error: String(err?.message || err || ""),
        code: err?.code,
        ...(data || {}),
      })}`
    );
  } catch {}
}

const INSTALLED_CONFIG_CACHE_LOG_EVERY = Math.max(
  0,
  Number(process.env.MODAPI_INSTALLED_CACHE_LOG_EVERY || 0)
);
const INSTALLED_CONFIG_CACHE_LOG_CALLSITE =
  String(process.env.MODAPI_INSTALLED_CACHE_LOG_CALLSITE || "").trim() === "1";

const INSTALLED_CONFIG_CACHE_TTL_MS = Number(
  process.env.MODAPI_INSTALLED_CONFIG_CACHE_TTL_MS || 750
);
let _installedConfigCache = {
  at: 0,
  value: null,
  inflight: null,
  stats: { hits: 0, misses: 0, waits: 0 },
};

function _cacheValid() {
  return (
    _installedConfigCache.value &&
    _installedConfigCache.at &&
    Date.now() - _installedConfigCache.at < INSTALLED_CONFIG_CACHE_TTL_MS
  );
}

function invalidateInstalledModsConfigCache(reason) {
  try {
    _installedConfigCache.at = 0;
    _installedConfigCache.value = null;

    if (MODAPI_DEBUG) dbg("InstalledMods.config cache invalidated", { reason });
  } catch {}
}

function dbg(...args) {
  try {
    if (MODAPI_DEBUG) console.log("[modInstaller]", ...args);
  } catch {}
}

function dbgErr(label, err, extra) {
  try {
    if (!MODAPI_DEBUG) return;
    console.error("[modInstaller]", label, {
      error: String(err?.message || err || ""),
      code: err?.code,
      ...(extra || {}),
    });
  } catch {}
}

function dbgFs(op, extra) {
  try {
    if (!MODAPI_DEBUG) return;
    console.log("[modInstaller][fs]", op, extra || "");
  } catch {}
}

function timeStart(label) {
  const t0 = Date.now();
  return {
    end(extra) {
      const ms = Date.now() - t0;
      dbg(`${label} (${ms}ms)`, extra || "");
      return ms;
    },
  };
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);
  const fileStream = fs.createWriteStream(dest);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
}

async function extractFilesFromZip(zipPath, filenames, destDir) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      const extracted = [];
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        const fileName = path.basename(entry.fileName);
        if (filenames.includes(fileName)) {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);
            const destPath = path.join(destDir, fileName);
            const writeStream = fs.createWriteStream(destPath);
            readStream.pipe(writeStream);
            writeStream.on("finish", () => {
              extracted.push(destPath);
              if (extracted.length === filenames.length) {
                zipfile.close();
                resolve(extracted);
              } else {
                zipfile.readEntry();
              }
            });
            writeStream.on("error", reject);
          });
        } else {
          zipfile.readEntry();
        }
      });
      zipfile.on("end", () => {
        if (extracted.length !== filenames.length) {
          reject(new Error("Not all required files found in zip"));
        }
      });
      zipfile.on("error", reject);
    });
  });
}

function cleanupTempFiles(files) {
  for (const file of files) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }
}

function isLegacyDirectInstallMod(modKey) {
  return modKey === "4gbpatch" || modKey === "60fps";
}

function legacyModRequiresBackup(modKey) {
  return modKey === "4gbpatch" || modKey === "60fps";
}

function getRoamingAppDataPath() {
  return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
}

function readPathInfoForKitBase() {
  const pathInfo = path.join(
    getRoamingAppDataPath(),
    "Spore ModAPI Launcher",
    "path.info"
  );
  if (!fs.existsSync(pathInfo)) {
    const e = new Error(
      "Spore ModAPI Launcher not configured: path.info not found in %APPDATA%\\Spore ModAPI Launcher\\path.info"
    );
    logError("modapi:pathinfo:missing", e, { pathInfo });
    throw e;
  }
  const raw = fs.readFileSync(pathInfo, "utf8");
  const base = (raw || "").trim().replace(/^\"|\"$/g, "");
  if (!base) {
    const e = new Error("Spore ModAPI Launcher path.info is empty/invalid.");
    logError("modapi:pathinfo:invalid", e, {
      pathInfo,
      rawSnippet: String(raw || "").slice(0, 200),
    });
    throw e;
  }
  const normalized = path.normalize(base);
  logInfo("modapi:pathinfo:base", { base: normalized });
  return normalized;
}

function getModApiEasyInstallerExePathFromPathInfo() {
  const base = readPathInfoForKitBase();
  const exe = path.join(base, "Spore ModAPI Easy Installer.exe");
  if (!fs.existsSync(exe)) {
    const e = new Error(`Spore ModAPI Easy Installer.exe not found at: ${exe}`);
    logError("modapi:easyinstaller:notfound", e, { exe, base });
    throw e;
  }
  logInfo("modapi:easyinstaller:path", { exe });
  return exe;
}

function getInstalledModsConfigPathFromPathInfo() {
  const kitBase = readPathInfoForKitBase();
  return path.join(kitBase, "InstalledMods.config");
}

function parseInstalledModsConfig(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
    trimValues: true,
  });

  const doc = parser.parse(xmlText || "") || {};
  const root = doc.InstalledMods || {};
  let mods = root.mod || [];
  if (!Array.isArray(mods)) mods = [mods].filter(Boolean);

  return { doc, root, mods };
}

function readInstalledModsConfigSafe() {
  const configPath = getInstalledModsConfigPathFromPathInfo();
  try {
    if (_cacheValid()) {
      _installedConfigCache.stats.hits++;
      if (MODAPI_DEBUG) {
        const n = INSTALLED_CONFIG_CACHE_LOG_EVERY;
        if (n > 0 && _installedConfigCache.stats.hits % n === 0) {
          const extra = {
            configPath,
            hits: _installedConfigCache.stats.hits,
            misses: _installedConfigCache.stats.misses,
            waits: _installedConfigCache.stats.waits,
          };
          if (INSTALLED_CONFIG_CACHE_LOG_CALLSITE) {
            extra.callsite = new Error("callsite").stack
              ?.split("\n")
              .slice(2, 7)
              .join("\n");
          }
          dbg("InstalledMods.config cache hit", extra);
        }
      }
      return { configPath, ..._installedConfigCache.value };
    }

    if (_installedConfigCache.inflight) {
      _installedConfigCache.stats.waits++;
      if (MODAPI_DEBUG)
        dbg("InstalledMods.config cache wait (inflight)", {
          configPath,
          waits: _installedConfigCache.stats.waits,
        });
      return { configPath, ..._installedConfigCache.inflight() };
    }

    _installedConfigCache.stats.misses++;

    const doRead = () => {
      try {
        if (!fs.existsSync(configPath)) {
          dbgFs("readInstalledModsConfigSafe missing", { configPath });
          const value = { doc: { InstalledMods: {} }, mods: [] };
          _installedConfigCache.value = value;
          _installedConfigCache.at = Date.now();
          return value;
        }
        dbgFs("readFile", { filePath: configPath });
        const xmlText = fs.readFileSync(configPath, "utf8");
        const { doc, mods } = parseInstalledModsConfig(xmlText);
        const value = { doc, mods };
        _installedConfigCache.value = value;
        _installedConfigCache.at = Date.now();
        return value;
      } catch (e) {
        dbgErr("readInstalledModsConfigSafe failed", e, { configPath });
        const value = { doc: { InstalledMods: {} }, mods: [] };
        _installedConfigCache.value = value;
        _installedConfigCache.at = Date.now();
        return value;
      } finally {
        _installedConfigCache.inflight = null;
      }
    };

    _installedConfigCache.inflight = doRead;
    const value = doRead();

    if (MODAPI_DEBUG) {
      dbg("InstalledMods.config cache miss", {
        configPath,
        ttlMs: INSTALLED_CONFIG_CACHE_TTL_MS,
        hits: _installedConfigCache.stats.hits,
        misses: _installedConfigCache.stats.misses,
        waits: _installedConfigCache.stats.waits,
      });
    }

    return { configPath, ...value };
  } catch (e) {
    dbgErr("readInstalledModsConfigSafe failed (outer)", e, { configPath });
    return { configPath, doc: { InstalledMods: {} }, mods: [] };
  }
}

function writeInstalledModsConfig(configPath, doc) {
  try {
    if (!doc || typeof doc !== "object") doc = { InstalledMods: {} };
    if (!doc.InstalledMods) doc.InstalledMods = {};

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      format: true,
      indentBy: "  ",
      suppressEmptyNode: true,
    });

    const xml = builder.build(doc);
    dbgFs("writeFile", {
      filePath: configPath,
      bytes: xml ? Buffer.byteLength(xml, "utf8") : 0,
    });
    fs.writeFileSync(configPath, xml, "utf8");
    invalidateInstalledModsConfigCache("writeInstalledModsConfig");
  } catch (e) {
    dbgErr("writeInstalledModsConfig failed", e, { configPath });
    throw e;
  }
}

function findInstalledModEntry(mods, modKey) {
  if (!modKey) return null;
  const keyLower = String(modKey).toLowerCase();

  return (
    (mods || []).find((m) => {
      const unique = (m && (m.unique || "")) + "";
      const name = (m && (m.name || "")) + "";
      const displayName = (m && (m.displayName || "")) + "";

      return (
        unique.toLowerCase() === keyLower ||
        name.toLowerCase() === keyLower ||
        displayName.toLowerCase() === keyLower
      );
    }) || null
  );
}

function getModApiKitMLibsPath() {
  const kitBase = readPathInfoForKitBase();
  return path.join(kitBase, "mLibs");
}

function getModApiKitModConfigsPath() {
  const kitBase = readPathInfoForKitBase();
  return path.join(kitBase, "ModConfigs");
}

function getModApiKitModSettingsPath() {
  const kitBase = readPathInfoForKitBase();
  return path.join(kitBase, "ModSettings");
}

function extractModConfigsFolderFromEntry(entry) {
  const cfg = entry && entry.configurator ? String(entry.configurator) : "";
  if (!cfg) return null;
  const parts = cfg.split(/\\|\//g);
  const idx = parts.findIndex((p) => p && p.toLowerCase() === "modconfigs");
  if (idx === -1) return null;
  const folder = parts[idx + 1];
  if (!folder) return null;

  const base = getModApiKitModConfigsPath();
  return path.join(base, folder);
}

function safeRmDirRecursive(dirPath) {
  try {
    if (!dirPath) return;
    if (fs.existsSync(dirPath)) {
      dbgFs("rmDirRecursive", { dirPath });
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (e) {
    dbgErr("rmDirRecursive failed", e, { dirPath });
  }
}

function getDirSnapshot(dirPath) {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return [];
    dbgFs("readdir", { dirPath });
    return fs.readdirSync(dirPath).map((n) => n);
  } catch (e) {
    dbgErr("readdir failed", e, { dirPath });
    return [];
  }
}

function normalizeDllToken(name) {
  return String(name || "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.dll$/i, "")
    .trim()
    .toLowerCase()
    .replace(/!/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractAlphaTokens(name) {
  const base = String(name || "")
    .replace(/^.*[\\/]/, "")
    .replace(/\.(dll|package|xml|txt|ini)$/i, "")
    .trim()
    .toLowerCase()
    .replace(/!/g, " ");

  const parts = base
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts;
}

function buildEntryTokens(entry, modKey) {
  const tokens = [];
  if (modKey) tokens.push(modKey);
  if (entry?.unique) tokens.push(entry.unique);
  if (entry?.displayName) tokens.push(entry.displayName);
  if (entry?.name) tokens.push(entry.name);
  return tokens
    .map((t) => String(t || ""))
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/-[0-9a-f]{6,}$/i, ""))
    .map(normalizeDllToken)
    .filter(Boolean);
}

function shouldDeleteByTokenHeuristic(fileName, tokenSegments, minOverlap = 2) {
  const tok = normalizeDllToken(fileName);
  if (!tok) return false;
  const segs = tok.split("-").filter(Boolean);

  try {
    const fileAlpha = extractAlphaTokens(fileName);
    const baseAlpha = (tokenSegments || [])
      .map((segArr) => (segArr || []).join(" "))
      .flatMap(extractAlphaTokens);

    const fileSet = new Set(fileAlpha);
    let longOverlap = 0;
    let shortOverlap = 0;
    for (const t of baseAlpha) {
      if (!t) continue;
      if (fileSet.has(t)) {
        if (t.length >= 5) longOverlap++;
        else shortOverlap++;
      }
    }

    if (longOverlap >= 1 || shortOverlap >= 2) return true;
  } catch {}

  const joined = segs.join("");
  for (const base of tokenSegments) {
    const baseJoined = (base || []).join("");
    if (baseJoined && (tok.includes(baseJoined) || joined.includes(baseJoined)))
      return true;
  }

  if (segs.length < minOverlap) return false;
  for (const base of tokenSegments) {
    if (segmentsOverlapCount(base, segs) >= minOverlap) return true;
  }
  return false;
}

function tryDeleteMlibsDllsByTokens(modKey, entry) {
  try {
    const mlibs = getModApiKitMLibsPath();
    if (!fs.existsSync(mlibs)) return;

    const mlibsFiles = fs
      .readdirSync(mlibs)
      .filter((n) => n && n.toLowerCase().endsWith(".dll"));

    const tokens = buildEntryTokens(entry, modKey);
    if (!tokens.length) return;

    for (const dll of mlibsFiles) {
      const dllToken = normalizeDllToken(dll);
      if (!dllToken) continue;

      if (tokens.some((t) => t && dllToken.includes(t))) {
        const full = path.join(mlibs, dll);
        try {
          fs.unlinkSync(full);
        } catch {}
      }
    }
  } catch {}
}

function tryDeleteMlibsDllsBySharedSegments(entry, modKey, beforeMlibsLower) {
  try {
    const mlibs = getModApiKitMLibsPath();
    if (!fs.existsSync(mlibs)) return;

    const beforeSet = new Set(
      (beforeMlibsLower || []).map((n) => String(n).toLowerCase())
    );
    const after = fs
      .readdirSync(mlibs)
      .filter((n) => n && n.toLowerCase().endsWith(".dll"));
    const created = after.filter(
      (n) => !beforeSet.has(String(n).toLowerCase())
    );
    if (!created.length) return;

    const tokens = buildEntryTokens(entry, modKey);
    if (!tokens.length) return;

    const tokenSegments = tokens
      .map((t) => String(t).split("-").filter(Boolean))
      .filter((arr) => arr.length);

    for (const dll of created) {
      const dllToken = normalizeDllToken(dll);
      const dllSegs = dllToken.split("-").filter(Boolean);
      if (dllSegs.length < 2) continue;

      let match = false;
      for (const segs of tokenSegments) {
        const set = new Set(segs);
        let overlap = 0;
        for (const s of dllSegs) if (set.has(s)) overlap++;
        if (overlap >= 2) {
          match = true;
          break;
        }
      }

      if (match) {
        safeUnlinkInDirByNameInsensitive(mlibs, dll);
      }
    }
  } catch {}
}

function normalizeFileNameForCompare(p) {
  return String(p || "")
    .replace(/^.*[\\/]/, "")
    .trim()
    .toLowerCase();
}

function findInstalledModEntryFlexible(mods, modKey) {
  if (!modKey) return null;

  const direct = findInstalledModEntry(mods, modKey);
  if (direct) return direct;

  const keyLower = String(modKey).toLowerCase();

  const byNamePrefix = (mods || []).find((m) => {
    const name = (m && (m.name || "")) + "";
    return name.toLowerCase().startsWith(keyLower + "-");
  });
  if (byNamePrefix) return byNamePrefix;

  const byFileToken = (mods || []).find((m) => {
    const files = getModFilesFromEntry(m);
    const fileNames = files.map((f) => normalizeFileNameForCompare(f.path));
    return fileNames.some((fn) => fn && fn.includes(keyLower));
  });
  if (byFileToken) return byFileToken;

  return null;
}

function normalizeToArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function getModFilesFromEntry(modEntry) {
  const files = normalizeToArray(modEntry?.file);
  return files
    .map((f) => {
      if (typeof f === "string") return { path: f, game: null };
      const text = (f && (f["#text"] || f["text"] || "")) + "";
      const game = f && (f.game || null);
      return { path: text, game: game || null };
    })
    .filter((x) => x.path && typeof x.path === "string");
}

function resolveSporeModFileAbsolutePath(sporeInstallPath, fileEntry) {
  const rel = (fileEntry.path || "").replace(/^\\+/, "");
  const game = (fileEntry.game || "").toLowerCase();

  if (!fileEntry.game) {
    const kitBase = readPathInfoForKitBase();

    const hasDir = rel.includes("\\") || rel.includes("/");
    const ext = path.extname(rel).toLowerCase();

    if (hasDir) {
      return path.join(kitBase, rel);
    }

    if (ext === ".dll") {
      return path.join(kitBase, "mLibs", rel);
    }

    return path.join(kitBase, rel);
  }

  if (game === "galacticadventures" || game === "ga") {
    return path.join(sporeInstallPath, "DataEP1", rel);
  }

  return path.join(sporeInstallPath, "Data", rel);
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      dbgFs("unlink", { filePath });
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    dbgErr("unlink failed", e, { filePath });
  }
}

function safeUnlinkIfExists(p) {
  try {
    if (p && fs.existsSync(p)) {
      dbgFs("unlink", { filePath: p });
      fs.unlinkSync(p);
    }
  } catch (e) {
    dbgErr("unlink failed", e, { filePath: p });
  }
}

function safeUnlinkInDirByNameInsensitive(dirPath, fileName) {
  try {
    if (!dirPath || !fileName) return false;
    if (!fs.existsSync(dirPath)) return false;

    const targetLower = String(fileName).toLowerCase();
    const entries = fs.readdirSync(dirPath);
    const actual = entries.find((n) => String(n).toLowerCase() === targetLower);
    if (!actual) return false;

    const full = path.join(dirPath, actual);
    safeUnlinkIfExists(full);
    return true;
  } catch {
    return false;
  }
}

function safeRmIfExists(p) {
  try {
    if (!p || !fs.existsSync(p)) return;
    const st = fs.statSync(p);
    dbgFs("rm", { path: p, isDir: st.isDirectory() });
    if (st.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
    else fs.unlinkSync(p);
  } catch (e) {
    dbgErr("rm failed", e, { path: p });
  }
}

async function downloadSporemodToTemp(downloadUrl, modKey) {
  if (!downloadUrl) throw new Error("Missing downloadUrl");

  const tempDir = os.tmpdir();
  const suffix = crypto.randomBytes(6).toString("hex");
  const fileName = `${modKey || "mod"}-${suffix}.sporemod`;
  const dest = path.join(tempDir, fileName);

  await downloadFile(downloadUrl, dest);
  return dest;
}

function runModApiEasyInstaller(installerExe, sporemodPath) {
  return new Promise((resolve, reject) => {
    try {
      dbg("spawn ModAPI Easy Installer", { installerExe, sporemodPath });
      logInfo("modapi:easyinstaller:spawn", { installerExe, sporemodPath });

      const child = spawn(installerExe, [sporemodPath], {
        windowsHide: false,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (d) => {
        const s = String(d || "");
        if (MODAPI_DEBUG) dbg("installer stdout", s.slice(0, 500));
        logInfo("modapi:easyinstaller:stdout", { chunk: s.slice(0, 2000) });
      });
      child.stderr?.on("data", (d) => {
        const s = String(d || "");
        if (MODAPI_DEBUG) dbg("installer stderr", s.slice(0, 500));
        logInfo("modapi:easyinstaller:stderr", { chunk: s.slice(0, 2000) });
      });

      child.on("error", (e) => {
        dbgErr("installer spawn error", e, { installerExe, sporemodPath });
        logError("modapi:easyinstaller:spawn_error", e, {
          installerExe,
          sporemodPath,
        });
        reject(e);
      });
      child.on("close", (code) => {
        dbg("installer close", { code });
        logInfo("modapi:easyinstaller:close", { code });
        resolve({ code });
      });
    } catch (e) {
      dbgErr("installer wrapper error", e, { installerExe, sporemodPath });
      logError("modapi:easyinstaller:wrapper_error", e, {
        installerExe,
        sporemodPath,
      });
      reject(e);
    }
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureValidInstalledModsConfig() {
  const configPath = getInstalledModsConfigPathFromPathInfo();
  try {
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, "<InstalledMods></InstalledMods>", "utf8");
      invalidateInstalledModsConfigCache(
        "ensureValidInstalledModsConfig:create"
      );
      return configPath;
    }

    const text = fs.readFileSync(configPath, "utf8");
    const trimmed = (text || "").trim();

    if (!trimmed) {
      fs.writeFileSync(configPath, "<InstalledMods></InstalledMods>", "utf8");
      invalidateInstalledModsConfigCache(
        "ensureValidInstalledModsConfig:empty"
      );
      return configPath;
    }

    try {
      parseInstalledModsConfig(trimmed);
    } catch {
      fs.writeFileSync(configPath, "<InstalledMods></InstalledMods>", "utf8");
      invalidateInstalledModsConfigCache(
        "ensureValidInstalledModsConfig:invalid"
      );
      return configPath;
    }

    return configPath;
  } catch (e) {
    throw e;
  }
}

function getLauncherAppDataDir() {
  return path.join(getRoamingAppDataPath(), "Spore NEXT Launcher");
}

function getModApiArtifactsStorePath() {
  return path.join(getLauncherAppDataDir(), "modapi-artifacts.json");
}

function readModApiArtifactsStore() {
  try {
    const p = getModApiArtifactsStorePath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, "utf8");
    const obj = JSON.parse(raw || "{}");
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function writeModApiArtifactsStore(store) {
  try {
    const dir = getLauncherAppDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const p = getModApiArtifactsStorePath();
    fs.writeFileSync(p, JSON.stringify(store || {}, null, 2), "utf8");
  } catch {}
}

function captureModApiArtifactsSnapshot() {
  const mlibs = getModApiKitMLibsPath();
  const settings = getModApiKitModSettingsPath();
  const configs = getModApiKitModConfigsPath();

  return {
    mLibs: getDirSnapshot(mlibs)
      .filter((n) => n && n.toLowerCase().endsWith(".dll"))
      .map((n) => n.toLowerCase()),
    modSettings: getDirSnapshot(settings).map((n) => String(n).toLowerCase()),
    modConfigs: getDirSnapshot(configs).map((n) => String(n).toLowerCase()),
  };
}

function diffArtifacts(before, after) {
  const bDll = new Set(
    (before?.mLibs || []).map((n) => String(n).toLowerCase())
  );
  const aDll = (after?.mLibs || []).map((n) => String(n).toLowerCase());
  const createdDlls = aDll.filter((n) => !bDll.has(n));

  const bSet = new Set(
    (before?.modSettings || []).map((n) => String(n).toLowerCase())
  );
  const aSet = (after?.modSettings || []).map((n) => String(n).toLowerCase());
  const createdSettings = aSet.filter((n) => !bSet.has(n));

  const bCfg = new Set(
    (before?.modConfigs || []).map((n) => String(n).toLowerCase())
  );
  const aCfg = (after?.modConfigs || []).map((n) => String(n).toLowerCase());
  const createdConfigs = aCfg.filter((n) => !bCfg.has(n));

  return { createdDlls, createdSettings, createdConfigs };
}

function captureGamePackagesSnapshot(sporeInstallPath) {
  try {
    if (!sporeInstallPath) return { data: [], dataEp1: [] };

    let root = sporeInstallPath;
    if (root.endsWith("DataEP1") || root.endsWith("DataEP1\\")) {
      root = root.replace(/DataEP1[\\/]*$/, "");
    }

    const dataDir = path.join(root, "Data");
    const ep1Dir = path.join(root, "DataEP1");

    const snap = (dir) =>
      getDirSnapshot(dir)
        .filter((n) => n && String(n).toLowerCase().endsWith(".package"))
        .map((n) => String(n).toLowerCase());

    return {
      data: snap(dataDir),
      dataEp1: snap(ep1Dir),
    };
  } catch {
    return { data: [], dataEp1: [] };
  }
}

function diffGamePackages(before, after) {
  const bData = new Set(
    (before?.data || []).map((n) => String(n).toLowerCase())
  );
  const aData = (after?.data || []).map((n) => String(n).toLowerCase());
  const createdData = aData.filter((n) => !bData.has(n));

  const bEp1 = new Set(
    (before?.dataEp1 || []).map((n) => String(n).toLowerCase())
  );
  const aEp1 = (after?.dataEp1 || []).map((n) => String(n).toLowerCase());
  const createdDataEp1 = aEp1.filter((n) => !bEp1.has(n));

  return { createdData, createdDataEp1 };
}

async function installMod(
  { downloadUrl, files, destSubfolder, modKey },
  onProgress
) {
  if (!isLegacyDirectInstallMod(modKey)) {
    let sporemodTempPath;
    const beforeArtifacts = captureModApiArtifactsSnapshot();

    let sporePathForPackages = null;
    let beforePkgs = null;
    try {
      sporePathForPackages = getSporeInstallPath();
      if (sporePathForPackages) {
        beforePkgs = captureGamePackagesSnapshot(sporePathForPackages);
      }
    } catch {}

    const op = timeStart(`installMod:${modKey}`);
    dbg("install start", { modKey, downloadUrl: Boolean(downloadUrl) });
    logInfo("install:start", { modKey, hasDownloadUrl: Boolean(downloadUrl) });

    try {
      if (onProgress)
        onProgress({
          step: "downloading",
          percent: 0,
          message: "modprofiles-downloading",
        });
      {
        const t = timeStart(`downloadSporemodToTemp:${modKey}`);
        sporemodTempPath = await downloadSporemodToTemp(downloadUrl, modKey);
        t.end({ sporemodTempPath });
        logInfo("install:downloaded", { modKey, sporemodTempPath });
      }
      if (onProgress)
        onProgress({
          step: "downloading",
          percent: 100,
          message: "modprofiles-download-complete",
        });

      if (onProgress)
        onProgress({
          step: "installing",
          percent: 0,
          message: "modprofiles-installing",
        });

      const configPath = ensureValidInstalledModsConfig();
      logInfo("modapi:installedmods:config", { configPath });

      const installerExe = getModApiEasyInstallerExePathFromPathInfo();

      const tRun = timeStart(`runModApiEasyInstaller:${modKey}`);
      const { code } = await runModApiEasyInstaller(
        installerExe,
        sporemodTempPath
      );
      tRun.end({ code });
      logInfo("install:easyinstaller:exit", { modKey, code });

      if (code === 4294967295 || code === -1) {
        const err = new Error("INSTALL_CANCELLED");
        err.code = "INSTALL_CANCELLED";
        logError("install:cancelled", err, { modKey, code });
        throw err;
      }

      try {
        await sleep(350);
      } catch {}

      let verified = false;
      let verifyDetails = null;
      try {
        const tVerify = timeStart(`verifyInstalledModsConfig:${modKey}`);
        const { mods } = readInstalledModsConfigSafe();
        const entry = findInstalledModEntryFlexible(mods, modKey);
        verified = Boolean(entry);

        if (MODAPI_DEBUG) {
          const keyLower = String(modKey || "").toLowerCase();
          const candidates = (mods || [])
            .map((m) => ({
              unique: (m?.unique || "") + "",
              name: (m?.name || "") + "",
              displayName: (m?.displayName || "") + "",
            }))
            .filter((m) => {
              const u = m.unique.toLowerCase();
              const n = m.name.toLowerCase();
              const d = m.displayName.toLowerCase();
              return (
                (keyLower && u.includes(keyLower)) ||
                (keyLower && n.includes(keyLower)) ||
                (keyLower && d.includes(keyLower))
              );
            })
            .slice(0, 12);

          verifyDetails = {
            verified,
            matched: entry
              ? {
                  unique: (entry?.unique || "") + "",
                  name: (entry?.name || "") + "",
                  displayName: (entry?.displayName || "") + "",
                }
              : null,
            candidates,
            modsCount: Array.isArray(mods) ? mods.length : 0,
          };
        }

        tVerify.end(verifyDetails);
        logInfo("install:verify", { modKey, verified, details: verifyDetails });
      } catch (e) {
        dbg("verify error", { modKey, error: String(e?.message || e || "") });
        logError("install:verify_error", e, { modKey });
      }

      if (!verified) {
        const err = new Error("INSTALL_NOT_REGISTERED");
        err.code = "INSTALL_NOT_REGISTERED";
        err.details = verifyDetails || `exit code ${code}`;
        logError("install:not_registered", err, {
          modKey,
          details: err.details,
        });
        throw err;
      }

      try {
        const afterArtifacts = captureModApiArtifactsSnapshot();
        const diff = diffArtifacts(beforeArtifacts, afterArtifacts);

        let pkgDiff = null;
        try {
          if (sporePathForPackages && beforePkgs) {
            const afterPkgs = captureGamePackagesSnapshot(sporePathForPackages);
            pkgDiff = diffGamePackages(beforePkgs, afterPkgs);
          }
        } catch {
          pkgDiff = null;
        }

        if (
          (diff.createdDlls?.length || 0) > 0 ||
          (diff.createdSettings?.length || 0) > 0 ||
          (diff.createdConfigs?.length || 0) > 0 ||
          (pkgDiff &&
            ((pkgDiff.createdData?.length || 0) > 0 ||
              (pkgDiff.createdDataEp1?.length || 0) > 0))
        ) {
          const store = readModApiArtifactsStore();
          store[modKey] = {
            updatedAt: new Date().toISOString(),
            createdDlls: diff.createdDlls,
            createdSettings: diff.createdSettings,
            createdConfigs: diff.createdConfigs,
            createdDataPackages: pkgDiff?.createdData || [],
            createdDataEp1Packages: pkgDiff?.createdDataEp1 || [],
          };
          writeModApiArtifactsStore(store);
        }
      } catch {}

      if (onProgress)
        onProgress({
          step: "done",
          percent: 100,
          message: "modprofiles-installation-complete",
        });
      op.end({ ok: true });
      logInfo("install:done", { modKey });
      return true;
    } catch (e) {
      logError("install:failed", e, { modKey });
      throw e;
    } finally {
      safeUnlink(sporemodTempPath);
    }
  }

  const fsPromises = fs.promises;
  const tempDir = os.tmpdir();
  const zipPath = path.join(tempDir, "mod_temp.zip");
  let sporePath = getSporeInstallPath();
  if (!sporePath) throw new Error("Spore installation not found.");

  if (
    destSubfolder === "SporebinEP1" &&
    (sporePath.endsWith("DataEP1") || sporePath.endsWith("DataEP1\\"))
  ) {
    sporePath = sporePath.replace(/DataEP1[\\/]?$/, "");
  }

  const destDir = path.join(sporePath, destSubfolder);

  await fsPromises.mkdir(destDir, { recursive: true });

  if (onProgress)
    onProgress({
      step: "downloading",
      percent: 0,
      message: "modprofiles-downloading",
    });
  await downloadFile(downloadUrl, zipPath);
  if (onProgress)
    onProgress({
      step: "downloading",
      percent: 100,
      message: "modprofiles-download-complete",
    });

  if (onProgress)
    onProgress({
      step: "extracting",
      percent: 0,
      message: "modprofiles-extracting",
    });
  const extractedFiles = await extractFilesFromZip(zipPath, files, tempDir);
  if (onProgress)
    onProgress({
      step: "extracting",
      percent: 100,
      message: "modprofiles-extraction-complete",
    });

  if (onProgress)
    onProgress({
      step: "installing",
      percent: 0,
      message: "modprofiles-installing",
    });
  const needsBackup = legacyModRequiresBackup(modKey);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const orig = path.join(destDir, file);
    const backup = path.join(destDir, file + ".backup");
    const modded = path.join(tempDir, file);

    if (needsBackup) {
      if (
        (await fsPromises.stat(orig).catch(() => false)) &&
        !(await fsPromises.stat(backup).catch(() => false))
      ) {
        await fsPromises.rename(orig, backup);
      }
    }

    await fsPromises.copyFile(modded, orig);

    if (onProgress)
      onProgress({
        step: "installing",
        percent: Math.round(((i + 1) / files.length) * 100),
        message: "modprofiles-installing",
      });
  }

  cleanupTempFiles([zipPath, ...extractedFiles]);
  if (onProgress)
    onProgress({
      step: "done",
      percent: 100,
      message: "modprofiles-installation-complete",
    });
  return true;
}

function tokenSegmentsFromStrings(strings) {
  return (strings || [])
    .map((s) => normalizeDllToken(s))
    .filter(Boolean)
    .map((t) => t.split("-").filter(Boolean))
    .filter((arr) => arr.length);
}

function alphaTokensFromStrings(strings) {
  const out = new Set();

  const genericTokens = new Set([
    "spore",
    "ep1",
    "ga",
    "galactic",
    "adventures",
    "data",
    "content",
    "locale",
    "patch",
  ]);

  for (const s of strings || []) {
    const raw = String(s || "");
    const base = raw
      .replace(/^.*[\\/]/, "")
      .replace(/\.(dll|package|xml|txt|ini)$/i, "")
      .toLowerCase();

    const parts = base.split(/[^a-z0-9]+/g).filter(Boolean);

    for (const p of parts) {
      const letters = p.replace(/[^a-z]+/g, "");
      if (letters && letters.length >= 2 && !genericTokens.has(letters)) {
        out.add(letters);
      }
    }
  }
  return Array.from(out);
}

function segmentsOverlapCount(a, b) {
  const set = new Set(a);
  let overlap = 0;
  for (const s of b) if (set.has(s)) overlap++;
  return overlap;
}

function shouldDeleteByTokenHeuristicWithAlpha(
  fileName,
  tokenSegments,
  alphaTokens
) {
  const tok = normalizeDllToken(fileName);
  if (!tok) return false;

  const baseMinOverlap = 2;

  const fileAlpha = alphaTokensFromStrings([fileName]);
  const fileAlphaSet = new Set(fileAlpha);
  const alphaHits = (alphaTokens || []).filter((t) => fileAlphaSet.has(t));

  const longAlphaHits = alphaHits.filter((t) => t && t.length >= 5);

  if (longAlphaHits.length >= 1) {
    return shouldDeleteByTokenHeuristic(fileName, tokenSegments, 1);
  }

  if (alphaHits.length >= 2) {
    return shouldDeleteByTokenHeuristic(fileName, tokenSegments, 1);
  }

  return shouldDeleteByTokenHeuristic(fileName, tokenSegments, baseMinOverlap);
}

function isBaseGamePackage(fileName) {
  const nameLower = String(fileName || "").toLowerCase();

  const baseGamePatterns = [
    "spore_ep1_content",
    "spore_ep1_data",
    "spore_ep1_locale",
    "spore_ep1_patch",
    "spore_content",
    "spore_data",
    "spore_locale",
    "spore_patch",
    "spore_graphics",
    "spore_game",
    "ep1_patch",
    "ep1_data",
    "ep1_locale",
  ];

  return baseGamePatterns.some((pattern) => nameLower.includes(pattern));
}

function safeDeletePackagesByTokens(sporeRoot, tokenSegments, alphaTokens) {
  const dataDir = path.join(sporeRoot, "Data");
  const ep1Dir = path.join(sporeRoot, "DataEP1");

  const deleteInDir = (dir) => {
    if (!fs.existsSync(dir)) return 0;
    let deleted = 0;
    const entries = fs
      .readdirSync(dir)
      .filter((n) => n && String(n).toLowerCase().endsWith(".package"));

    for (const name of entries) {
      if (isBaseGamePackage(name)) {
        continue;
      }

      const match = shouldDeleteByTokenHeuristicWithAlpha(
        name,
        tokenSegments,
        alphaTokens
      );
      if (!match) {
        continue;
      }
      const ok = safeUnlinkInDirByNameInsensitive(dir, name);
      if (ok) deleted++;
    }
    return deleted;
  };

  return {
    deletedData: deleteInDir(dataDir),
    deletedDataEp1: deleteInDir(ep1Dir),
  };
}

function safeDeleteMlibsDllsByTokens(mlibsDir, tokenSegments, alphaTokens) {
  if (!fs.existsSync(mlibsDir)) return 0;
  let deleted = 0;
  const dlls = fs
    .readdirSync(mlibsDir)
    .filter((n) => n && n.toLowerCase().endsWith(".dll"));

  for (const name of dlls) {
    const match = shouldDeleteByTokenHeuristicWithAlpha(
      name,
      tokenSegments,
      alphaTokens
    );
    if (!match) {
      continue;
    }

    const ok = safeUnlinkInDirByNameInsensitive(mlibsDir, name);
    if (ok) deleted++;
  }

  return deleted;
}

function safeDeleteKitDirsByTokens(dir, tokenSegments, alphaTokens) {
  if (!fs.existsSync(dir)) return 0;
  let deleted = 0;
  const entries = fs.readdirSync(dir);

  for (const name of entries) {
    if (
      !shouldDeleteByTokenHeuristicWithAlpha(name, tokenSegments, alphaTokens)
    )
      continue;
    const full = path.join(dir, name);
    safeRmIfExists(full);
    deleted++;
  }

  return deleted;
}

async function uninstallMod({ files, destSubfolder, modKey }, onProgress) {
  if (!isLegacyDirectInstallMod(modKey)) {
    let sporePath = getSporeInstallPath();
    if (!sporePath) throw new Error("Spore installation not found.");

    if (sporePath.endsWith("DataEP1") || sporePath.endsWith("DataEP1\\")) {
      sporePath = sporePath.replace(/DataEP1[\\/]?$/, "");
    }

    if (onProgress)
      onProgress({
        step: "uninstalling",
        percent: 0,
        message: "modprofiles-uninstalling",
      });

    let hadTrackedArtifacts = false;
    try {
      const store = readModApiArtifactsStore();
      const tracked = store?.[modKey];
      hadTrackedArtifacts = Boolean(tracked);

      if (tracked) {
        const mlibs = getModApiKitMLibsPath();
        const settings = getModApiKitModSettingsPath();
        const configs = getModApiKitModConfigsPath();

        for (const dllLower of tracked.createdDlls || []) {
          const ok = safeUnlinkInDirByNameInsensitive(mlibs, dllLower);
          if (!ok) {
            const full = path.join(mlibs, dllLower);
            safeUnlinkIfExists(full);
          }
        }

        for (const itemLower of tracked.createdSettings || []) {
          const full = path.join(settings, itemLower);
          safeRmIfExists(full);
        }

        for (const cfgLower of tracked.createdConfigs || []) {
          const full = path.join(configs, cfgLower);
          safeRmIfExists(full);
        }

        try {
          const dataDir = path.join(sporePath, "Data");
          const ep1Dir = path.join(sporePath, "DataEP1");
          for (const pLower of tracked.createdDataPackages || []) {
            safeUnlinkInDirByNameInsensitive(dataDir, pLower);
          }
          for (const pLower of tracked.createdDataEp1Packages || []) {
            safeUnlinkInDirByNameInsensitive(ep1Dir, pLower);
          }
        } catch {}

        delete store[modKey];
        writeModApiArtifactsStore(store);
      }
    } catch {}

    const { configPath, doc, mods } = readInstalledModsConfigSafe();
    const entry = findInstalledModEntryFlexible(mods, modKey);

    if (!hadTrackedArtifacts) {
      try {
        const entryTokens = buildEntryTokens(entry, modKey);
        const fileTokens = (getModFilesFromEntry(entry) || [])
          .map((f) => f.path)
          .filter(Boolean);
        const tokens = Array.from(
          new Set([...(entryTokens || []), ...(fileTokens || [])])
        );

        const tokenSegments = tokenSegmentsFromStrings(tokens);
        const alphaTokens = alphaTokensFromStrings(tokens);

        const mlibsDir = getModApiKitMLibsPath();
        safeDeleteMlibsDllsByTokens(mlibsDir, tokenSegments, alphaTokens);

        safeDeleteKitDirsByTokens(
          getModApiKitModSettingsPath(),
          tokenSegments,
          alphaTokens
        );
        safeDeleteKitDirsByTokens(
          getModApiKitModConfigsPath(),
          tokenSegments,
          alphaTokens
        );

        safeDeletePackagesByTokens(sporePath, tokenSegments, alphaTokens);
      } catch {}
    }

    if (!entry) {
      if (onProgress)
        onProgress({
          step: "done",
          percent: 100,
          message: "modprofiles-uninstall-complete",
        });
      return true;
    }

    const mlibsPath = getModApiKitMLibsPath();
    const modSettingsPath = getModApiKitModSettingsPath();
    const beforeMlibs = getDirSnapshot(mlibsPath).map((n) => n.toLowerCase());
    const beforeSettings = getDirSnapshot(modSettingsPath).map((n) =>
      n.toLowerCase()
    );

    const fileEntries = getModFilesFromEntry(entry);
    const targets = fileEntries.map((fe) =>
      resolveSporeModFileAbsolutePath(sporePath, fe)
    );

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        if (t && fs.existsSync(t)) {
          fs.unlinkSync(t);
        }
      } catch {}

      if (onProgress)
        onProgress({
          step: "uninstalling",
          percent: targets.length
            ? Math.round(((i + 1) / targets.length) * 100)
            : 100,
          message: "modprofiles-uninstalling",
        });
    }

    try {
      const mlibs = getModApiKitMLibsPath();
      const hintedDllNames = fileEntries
        .map((fe) => normalizeFileNameForCompare(fe.path))
        .filter((fn) => fn && fn.endsWith(".dll"));

      if (hintedDllNames.length && fs.existsSync(mlibs)) {
        const mlibsFiles = fs
          .readdirSync(mlibs)
          .filter((n) => n && n.toLowerCase().endsWith(".dll"));

        const hintedTokens = hintedDllNames.map(normalizeDllToken);

        for (const dll of mlibsFiles) {
          const dllToken = normalizeDllToken(dll);
          if (!dllToken) continue;

          if (hintedTokens.some((t) => t && t === dllToken)) {
            const full = path.join(mlibs, dll);
            try {
              if (fs.existsSync(full)) {
                fs.unlinkSync(full);
              }
            } catch {}
          }
        }
      }
    } catch {}

    try {
      tryDeleteMlibsDllsByTokens(modKey, entry);
      tryDeleteMlibsDllsBySharedSegments(entry, modKey, beforeMlibs);

      const modConfigsFolder = extractModConfigsFolderFromEntry(entry);
      if (modConfigsFolder) {
        safeRmDirRecursive(modConfigsFolder);
      }

      try {
        const afterSettings = getDirSnapshot(modSettingsPath);
        const beforeSet = new Set(beforeSettings);
        const created = afterSettings.filter(
          (n) => !beforeSet.has(String(n).toLowerCase())
        );

        const tokens = buildEntryTokens(entry, modKey);
        const candidates = created.length
          ? created
          : afterSettings.filter((n) => {
              const tok = normalizeDllToken(n);
              return tokens.some((t) => t && tok.includes(t));
            });

        for (const name of candidates) {
          const full = path.join(modSettingsPath, name);
          safeRmIfExists(full);
        }
      } catch {}

      try {
        const afterMlibs = getDirSnapshot(mlibsPath);
        const beforeSet = new Set(beforeMlibs);
        const createdDlls = afterMlibs
          .filter((n) => n && n.toLowerCase().endsWith(".dll"))
          .filter((n) => !beforeSet.has(String(n).toLowerCase()));

        const tokens = buildEntryTokens(entry, modKey);
        for (const dll of createdDlls) {
          const dllToken = normalizeDllToken(dll);
          if (!tokens.some((t) => t && dllToken.includes(t))) continue;
          const full = path.join(mlibsPath, dll);
          safeUnlinkIfExists(full);
        }
      } catch {}
    } catch {}

    try {
      const remaining = (mods || []).filter((m) => m !== entry);
      if (!doc.InstalledMods) doc.InstalledMods = {};
      if (remaining.length === 0) {
        delete doc.InstalledMods.mod;
      } else {
        doc.InstalledMods.mod = remaining;
      }
      writeInstalledModsConfig(configPath, doc);
    } catch {}

    if (onProgress)
      onProgress({
        step: "done",
        percent: 100,
        message: "modprofiles-uninstall-complete",
      });
    return true;
  }

  const fsPromises = fs.promises;
  let sporePath = getSporeInstallPath();
  if (!sporePath) throw new Error("Spore installation not found.");

  if (
    destSubfolder === "SporebinEP1" &&
    (sporePath.endsWith("DataEP1") || sporePath.endsWith("DataEP1\\"))
  ) {
    sporePath = sporePath.replace(/DataEP1[\\/]?$/, "");
  }

  const destDir = path.join(sporePath, destSubfolder);

  if (onProgress)
    onProgress({
      step: "uninstalling",
      percent: 0,
      message: "modprofiles-uninstalling",
    });

  const needsBackup = legacyModRequiresBackup(modKey);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const orig = path.join(destDir, file);
    const backup = path.join(destDir, file + ".backup");

    if (await fsPromises.stat(orig).catch(() => false))
      await fsPromises.unlink(orig);

    if (needsBackup && (await fsPromises.stat(backup).catch(() => false))) {
      await fsPromises.rename(backup, orig);
    }

    if (onProgress)
      onProgress({
        step: "uninstalling",
        percent: Math.round(((i + 1) / files.length) * 100),
        message: "modprofiles-uninstalling",
      });
  }

  if (onProgress)
    onProgress({
      step: "done",
      percent: 100,
      message: "modprofiles-uninstall-complete",
    });
  return true;
}

async function isModInstalled({ files, destSubfolder, modKey }) {
  if (isLegacyDirectInstallMod(modKey)) {
    let sporePath = getSporeInstallPath();
    if (!sporePath) return false;

    if (
      destSubfolder === "SporebinEP1" &&
      (sporePath.endsWith("DataEP1") || sporePath.endsWith("DataEP1\\"))
    ) {
      sporePath = sporePath.replace(/DataEP1[\\/]?$/, "");
    }

    const destDir = path.join(sporePath, destSubfolder);
    const needsBackup = legacyModRequiresBackup(modKey);

    for (const file of files) {
      const installedPath = path.join(destDir, file);
      if (!fs.existsSync(installedPath)) {
        return false;
      }

      if (needsBackup) {
        const backupPath = path.join(destDir, file + ".backup");
        if (!fs.existsSync(backupPath)) {
          return false;
        }
      }
    }
    return true;
  }

  try {
    if (!modKey) return false;
    const { mods } = readInstalledModsConfigSafe();
    return !!findInstalledModEntryFlexible(mods, modKey);
  } catch {
    return false;
  }
}

module.exports = {
  installMod,
  uninstallMod,
  isModInstalled,
};
