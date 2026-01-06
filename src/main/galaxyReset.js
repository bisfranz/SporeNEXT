const fs = require('fs');
const path = require('path');
const os = require('os');

function getSporeRoamingPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Spore');
}

function findNextBackupPath(parentDir, baseName) {
  const first = path.join(parentDir, baseName);
  if (!fs.existsSync(first)) return first;
  for (let i = 1; i < 10000; i++) {
    const candidate = path.join(parentDir, `${baseName}${i}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Too many backups exist (Games.backup1...Games.backup9999).');
}

async function galaxyReset() {
  const sporeDir = getSporeRoamingPath();
  const gamesDir = path.join(sporeDir, 'Games');
  if (!fs.existsSync(sporeDir)) {
    return {
      ok: false,
      code: 'SPORE_FOLDER_NOT_FOUND',
      path: sporeDir,
    };
  }
  if (!fs.existsSync(gamesDir)) {
    return {
      ok: false,
      code: 'GAMES_FOLDER_NOT_FOUND',
      path: gamesDir,
    };
  }
  const backupPath = findNextBackupPath(sporeDir, 'Games.backup');
  fs.renameSync(gamesDir, backupPath);
  return {
    ok: true,
    from: gamesDir,
    to: backupPath,
  };
}

module.exports = {
  galaxyReset,
};
