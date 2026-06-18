import { contextBridge, ipcRenderer } from 'electron';

function sync(channel, ...args) {
  return ipcRenderer.sendSync(channel, ...args);
}

contextBridge.exposeInMainWorld('maseposDesktop', {
  getRuntimeInfo() {
    return sync('masepos:runtime-info');
  },
  storageGetItem(key) {
    return sync('masepos:storage-get', key);
  },
  storageSetItem(key, value) {
    return sync('masepos:storage-set', key, value);
  },
  storageRemoveItem(key) {
    return sync('masepos:storage-remove', key);
  },
});
