import { downloadAllFiles, downloadFile } from '@entities/file/api';
import type { FileListItem, FileListQuery } from '@entities/file/model';

type DownloadProgressHandler = (progress: { completed: number; total: number; message: string }) => void;

function saveBlob(blob: Blob, fileName: string): { canceled: boolean; filePath: string } {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return {
    canceled: false,
    filePath: fileName
  };
}

async function saveWithPicker(fileName: string, loadBlob: () => Promise<Blob>): Promise<{ canceled: boolean; filePath?: string }> {
  return saveBlob(await loadBlob(), fileName);
}

export async function saveFileToDisk(file: FileListItem): Promise<{ canceled: boolean; filePath?: string }> {
  const suggestedName = `${file.productId}.zip`;
  return saveWithPicker(suggestedName, async () => {
    const { blob } = await downloadFile(file.id);
    return blob;
  });
}

export async function saveSelectedFilesToDisk(fileIds: string[], onProgress?: DownloadProgressHandler): Promise<{ canceled: boolean; filePath?: string }> {
  const uniqueFileIds = [...new Set(fileIds)];
  if (uniqueFileIds.length === 0) {
    throw new Error('선택된 제품이 없습니다.');
  }

  let completed = 0;
  for (const fileId of uniqueFileIds) {
    const { blob, fileName } = await downloadFile(fileId, (productName) => {
      onProgress?.({ completed, total: uniqueFileIds.length, message: `${productName} 다운로드중 ${completed + 1}/${uniqueFileIds.length}` });
    });
    saveBlob(blob, fileName);
    completed += 1;
  }

  return {
    canceled: false,
    filePath: `${completed}개 제품 ZIP`
  };
}

export async function saveAllFilesToDisk(query: FileListQuery, totalProducts: number, onProgress?: DownloadProgressHandler): Promise<{ canceled: boolean; filePath?: string }> {
  return saveWithPicker(`cuchen-all-${totalProducts}-products.zip`, async () => {
    const { blob } = await downloadAllFiles(query, onProgress);
    return blob;
  });
}
