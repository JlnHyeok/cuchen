import { downloadFile, downloadFiles } from '@entities/file/api';
import type { FileListItem } from '@entities/file/model';

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

type FileSystemFileHandleLike = {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
};

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
};

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

function canPickSavePath(): boolean {
  return typeof window !== 'undefined' && typeof (window as WindowWithSaveFilePicker).showSaveFilePicker === 'function';
}

async function saveWithPicker(fileName: string, loadBlob: () => Promise<Blob>): Promise<{ canceled: boolean; filePath?: string }> {
  if (!canPickSavePath()) {
    return saveBlob(await loadBlob(), fileName);
  }

  let handle: FileSystemFileHandleLike;

  try {
    handle = await (window as WindowWithSaveFilePicker).showSaveFilePicker?.({
      suggestedName: fileName,
      types: [
        {
          description: 'Download file',
          accept: {
            'application/zip': ['.zip'],
            'image/png': ['.png'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'application/octet-stream': ['.bin']
          }
        }
      ]
    }) as FileSystemFileHandleLike;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { canceled: true };
    }
    throw error;
  }

  const blob = await loadBlob();
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();

  return {
    canceled: false,
    filePath: fileName
  };
}

export async function saveFileToDisk(file: FileListItem): Promise<{ canceled: boolean; filePath?: string }> {
  const suggestedName = file.fileCount && file.fileCount > 1 ? `${file.productId}.zip` : file.fileName;
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
