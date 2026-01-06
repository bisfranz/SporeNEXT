const fs = require("fs");
const path = require("path");
const os = require("os");

function getRoamingPath() {
  return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
}

function getLegacyPathInfoFile() {
  return path.join(getRoamingPath(), "Spore ModAPI Launcher", "path.info");
}

function normalizeInstallPath(p) {
  if (!p || typeof p !== "string") return null;
  const trimmed = p.trim().replace(/^"|"$/g, "");
  if (!trimmed) return null;
  return path.normalize(trimmed);
}

function readTextFileSafe(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function existsDir(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDirRecursive(srcDir, destDir) {
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(src, dst);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

function getExistingModApiInstallPath() {
  const pathInfo = getLegacyPathInfoFile();
  if (!fs.existsSync(pathInfo)) return null;
  const raw = readTextFileSafe(pathInfo);
  const candidate = normalizeInstallPath(raw);
  if (!candidate) return null;
  return existsDir(candidate) ? candidate : null;
}

function getModApiBasePathFromPathInfo() {
  const p = getExistingModApiInstallPath();
  return p || null;
}

function getModApiLauncherExePath() {
  const base = getModApiBasePathFromPathInfo();
  if (!base) return null;
  return path.join(base, "Spore ModAPI Launcher.exe");
}

function ensureModApiKitInstalled() {
  const programData = process.env.ProgramData || path.join("C:\\", "ProgramData");
  const dest = path.join(programData, "SPORE ModAPI Launcher Kit");
  const markerExe = path.join(dest, "Spore ModAPI Easy Installer.exe");
  if (existsDir(dest) && fs.existsSync(markerExe)) {
    return { path: dest, action: "existing" };
  }
  const src = path.join(__dirname, "..", "..", "resources", "SPORE ModAPI Launcher Kit");
  if (!existsDir(src)) {
    throw new Error(`Bundled resource folder not found: ${src}`);
  }
  copyDirRecursive(src, dest);
  try {
    const roamingDest = path.join(getRoamingPath(), "Spore ModAPI Launcher");
    const roamingSrc = path.join(__dirname, "..", "..", "resources", "Spore ModAPI Launcher");
    if (existsDir(roamingSrc)) {
      copyDirRecursive(roamingSrc, roamingDest);
    }
  } catch {
  }
  return { path: dest, action: "copied" };
}

function resolveModApiBasePath() {
  const existing = getExistingModApiInstallPath();
  if (existing) return { path: existing, source: "path.info" };
  const ensured = ensureModApiKitInstalled();
  return { path: ensured.path, source: ensured.action === "copied" ? "programdata-copied" : "programdata-existing" };
}

module.exports = {
  getLegacyPathInfoFile,
  getExistingModApiInstallPath,
  ensureModApiKitInstalled,
  resolveModApiBasePath,
  getModApiBasePathFromPathInfo,
  getModApiLauncherExePath,
};
