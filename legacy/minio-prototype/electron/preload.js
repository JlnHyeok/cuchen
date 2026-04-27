import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("viewerApi", {
  getConfig: () => ipcRenderer.invoke("viewer:get-config"),
  setConfig: (config) => ipcRenderer.invoke("viewer:set-config", config),
  listBuckets: () => ipcRenderer.invoke("viewer:list-buckets"),
  listFiles: (params) => ipcRenderer.invoke("viewer:list-files", params),
  listImages: (params) => ipcRenderer.invoke("viewer:list-images", params),
  getDetails: (params) => ipcRenderer.invoke("viewer:get-details", params),
  getImageDataUrl: (params) => ipcRenderer.invoke("viewer:get-image-data-url", params)
});
