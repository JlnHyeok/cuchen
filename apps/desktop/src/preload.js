const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("viewerApi", {
  listImages: (query) => ipcRenderer.invoke("viewer:list-images", query),
  search: (query) => ipcRenderer.invoke("viewer:search", query),
  listBuckets: () => ipcRenderer.invoke("viewer:list-buckets"),
  health: () => ipcRenderer.invoke("viewer:health"),
  getMetadata: (imageId) => ipcRenderer.invoke("viewer:get-metadata", imageId),
  getImageDataUrl: (imageId) => ipcRenderer.invoke("viewer:get-image-data-url", imageId),
  getImageUrl: (imageId) => ipcRenderer.invoke("viewer:get-image-url", imageId),
  getThumbnailUrl: (imageId) => ipcRenderer.invoke("viewer:get-thumbnail-url", imageId),
  saveImage: (imageId, options) => ipcRenderer.invoke("viewer:save-image", imageId, options),
  saveImages: (imageIds, options) => ipcRenderer.invoke("viewer:save-images", imageIds, options)
});
