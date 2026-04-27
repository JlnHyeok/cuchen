import { downloadFile, downloadFiles } from '@entities/file/api';
import type { FileListItem } from '@entities/file/model';

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

export async function saveSelectedFilesToDisk(fileIds: string[]): Promise<{ canceled: boolean; filePath?: string }> {
  return saveWithPicker(`cuchen-selected-${fileIds.length}-products.zip`, async () => {
    const { blob } = await downloadFiles(fileIds);
    return blob;
  });
}
