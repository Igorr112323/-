const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridge", {
  isElectron: true,
  database: {
    load: () => ipcRenderer.invoke("db:load"),
    save: (bytes) => ipcRenderer.invoke("db:save", bytes)
  }
});
