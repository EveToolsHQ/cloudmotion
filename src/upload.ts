import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { FetchLike } from './types.js';

import type { ApiClient, Bundle, UploadBundleInput } from './types.js';
import { API_VERSION } from './types.js';

interface InitBundleUploadResponse {
  bundleId: string;
  uploadId: string;
  uploadUrls: Record<string, string>;
  contentTypes: Record<string, string>;
}

interface CompleteBundleUploadResponse {
  ok: boolean;
  remotionVersion: string;
  runtimeReady: boolean;
}

interface BundleFile {
  path: string;
  absolutePath: string;
  size: number;
}

async function collectBundleFiles(bundleDir: string): Promise<BundleFile[]> {
  const files: BundleFile[] = [];
  const absoluteRootDirectory = path.resolve(bundleDir);

  async function walk(currentDirectory: string) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const entryStats = await stat(absolutePath);
      const relativePath = path.relative(absoluteRootDirectory, absolutePath).split(path.sep).join('/');

      files.push({
        path: relativePath,
        absolutePath,
        size: entryStats.size
      });
    }
  }

  await walk(absoluteRootDirectory);
  return files;
}

const DEFAULT_UPLOAD_CONCURRENCY = 8;

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
}

async function uploadFileToPresignedUrl(
  fetchFn: FetchLike,
  uploadUrl: string,
  file: BundleFile,
  contentType: string
): Promise<void> {
  const fileStream = createReadStream(file.absolutePath);

  try {
    const putResponse = await fetchFn(uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': contentType,
        'content-length': String(file.size)
      },
      body: Readable.toWeb(fileStream),
      duplex: 'half'
    } as RequestInit);

    if (!putResponse.ok) {
      const errorText = await putResponse.text().catch(() => '');
      const detail = errorText.trim().length > 0 ? ` - ${errorText.trim().slice(0, 500)}` : '';
      throw new Error(
        `Failed to upload ${file.path}: ${putResponse.status} ${putResponse.statusText}${detail}`
      );
    }
  } finally {
    if (!fileStream.destroyed) {
      fileStream.destroy();
    }
  }
}

export async function uploadBundle(client: ApiClient, input: UploadBundleInput): Promise<Bundle> {
  const bundleDir = input.bundleDir?.trim();
  const bundleId = input.bundleId?.trim();

  if (!bundleDir) {
    throw new Error('uploadBundle() requires bundleDir.');
  }

  if (!bundleId) {
    throw new Error('uploadBundle() requires bundleId.');
  }

  const bundleFiles = await collectBundleFiles(bundleDir);
  const totalSize = bundleFiles.reduce((acc, file) => acc + file.size, 0);

  const initResponse = await client.request<InitBundleUploadResponse>({
    method: 'POST',
    pathname: `/${API_VERSION}/bundles/upload/init`,
    json: {
      files: bundleFiles.map((file) => ({
        path: file.path,
        sizeBytes: file.size
      })),
      bundleId
    }
  });

  let sizeUploaded = 0;
  let filesUploaded = 0;

  input.onUploadProgress?.({
    totalFiles: bundleFiles.length,
    filesUploaded: 0,
    totalSize,
    sizeUploaded: 0
  });

  await runWithConcurrency(bundleFiles, DEFAULT_UPLOAD_CONCURRENCY, async (file) => {
    const uploadUrl = initResponse.uploadUrls[file.path];
    const contentType = initResponse.contentTypes[file.path];

    if (!uploadUrl) {
      throw new Error(`No presigned URL returned for file: ${file.path}`);
    }

    if (!contentType) {
      throw new Error(`No Content-Type returned for file: ${file.path}`);
    }

    await uploadFileToPresignedUrl(client.fetch, uploadUrl, file, contentType);

    sizeUploaded += file.size;
    filesUploaded += 1;

    input.onUploadProgress?.({
      totalFiles: bundleFiles.length,
      filesUploaded,
      totalSize,
      sizeUploaded
    });
  });

  const completeResponse = await client.request<CompleteBundleUploadResponse>({
    method: 'POST',
    pathname: `/${API_VERSION}/bundles/upload/complete`,
    json: {
      bundleId: initResponse.bundleId,
      uploadId: initResponse.uploadId
    }
  });

  return {
    bundleId: initResponse.bundleId,
    uploadId: initResponse.uploadId,
    remotionVersion: completeResponse.remotionVersion,
    runtimeReady: completeResponse.runtimeReady === true
  };
}
