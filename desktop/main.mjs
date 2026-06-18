import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let staticServer;
let ipcRegistered = false;
let desktopRuntimeCache = null;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function resolveDistDir() {
  const appPath = app.getAppPath();
  const packagedDist = path.join(appPath, 'dist');
  if (fs.existsSync(packagedDist)) return packagedDist;
  return path.join(__dirname, '..', 'dist');
}

function resolvePreloadPath() {
  const appPath = app.getAppPath();
  const packagedPreload = path.join(appPath, 'desktop', 'preload.mjs');
  if (fs.existsSync(packagedPreload)) return packagedPreload;
  return path.join(__dirname, 'preload.mjs');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runtimeStoreDir() {
  const dirPath = path.join(app.getPath('userData'), 'runtime');
  ensureDir(dirPath);
  return dirPath;
}

function runtimeStorePath() {
  return path.join(runtimeStoreDir(), 'desktop-store.json');
}

function readRuntimeStore() {
  try {
    const raw = fs.readFileSync(runtimeStorePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRuntimeStore(store) {
  fs.writeFileSync(runtimeStorePath(), JSON.stringify(store, null, 2), 'utf8');
}

function readRuntimeValue(key) {
  const store = readRuntimeStore();
  const value = store[key];
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function writeRuntimeValue(key, value) {
  const store = readRuntimeStore();
  store[key] = value;
  writeRuntimeStore(store);
  return true;
}

function removeRuntimeValue(key) {
  const store = readRuntimeStore();
  delete store[key];
  writeRuntimeStore(store);
  return true;
}

function getOrCreateDesktopDeviceId() {
  const key = 'desktopDeviceId';
  const existing = readRuntimeValue(key);
  if (existing) return existing;
  const created = randomUUID();
  writeRuntimeValue(key, created);
  return created;
}

function getDesktopRuntimeInfo() {
  if (desktopRuntimeCache) return desktopRuntimeCache;
  desktopRuntimeCache = {
    isDesktop: true,
    packaged: app.isPackaged,
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    storageBackend: 'electron-file',
    desktopDeviceId: getOrCreateDesktopDeviceId(),
  };
  return desktopRuntimeCache;
}

function registerDesktopRuntimeIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.on('masepos:runtime-info', (event) => {
    event.returnValue = getDesktopRuntimeInfo();
  });

  ipcMain.on('masepos:storage-get', (event, key) => {
    event.returnValue = readRuntimeValue(String(key || ''));
  });

  ipcMain.on('masepos:storage-set', (event, key, value) => {
    event.returnValue = writeRuntimeValue(String(key || ''), String(value ?? ''));
  });

  ipcMain.on('masepos:storage-remove', (event, key) => {
    event.returnValue = removeRuntimeValue(String(key || ''));
  });
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(filePath).pipe(res);
}

function startStaticServer() {
  const distDir = resolveDistDir();
  const indexPath = path.join(distDir, 'index.html');

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
        const requestedPath = decodeURIComponent(requestUrl.pathname);
        const normalizedPath = requestedPath === '/' ? '/index.html' : requestedPath;
        const safePath = path.normalize(normalizedPath).replace(/^(\.\.[\\/])+/, '');
        const candidatePath = path.join(distDir, safePath);
        const insideDist = candidatePath.startsWith(distDir);

        if (insideDist && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
          sendFile(res, candidatePath);
          return;
        }

        sendFile(res, indexPath);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Failed to serve app: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

async function createWindow() {
  if (!staticServer) {
    staticServer = await startStaticServer();
  }
  registerDesktopRuntimeIpc();

  const address = staticServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine local app server address.');
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#020617',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: resolvePreloadPath(),
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const allowedPrefix = `http://127.0.0.1:${address.port}`;
    if (!url.startsWith(allowedPrefix)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await win.loadURL(`http://127.0.0.1:${address.port}`);
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
});
