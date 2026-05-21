export const DEFAULT_API_URL = 'https://api.cloudmotion.dev';

/** URL path version segment for org API routes (e.g. /v1/renders). */
export const API_VERSION = 'v1';

export type FetchLike = typeof fetch;

export interface ClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export interface Bundle {
  bundleId: string;
  bundleVersion: string;
}

export type RenderStatus = 'queued' | 'rendering' | 'completed' | 'failed';

export interface RenderStatusResponse {
  status: RenderStatus;
  progress: number;
  error?: string;
  outputUrl?: string;
}

export interface StartRenderResult {
  renderId: string;
}

export interface UploadProgress {
  totalFiles: number;
  filesUploaded: number;
  totalSize: number;
  sizeUploaded: number;
}

export interface UploadBundleInput {
  bundleDir: string;
  bundleId: string;
  onUploadProgress?: (progress: UploadProgress) => void;
}

export interface RenderMediaInput {
  bundleId: string;
  bundleVersion?: string;
  compositionId: string;
  inputProps?: unknown;
  codec?: string;
  width?: number;
  height?: number;
}

export interface RenderStillInput {
  bundleId: string;
  bundleVersion?: string;
  compositionId: string;
  inputProps?: unknown;
  imageFormat?: string;
  width?: number;
  height?: number;
  frame?: number;
}

export interface RequestOptions {
  method: 'GET' | 'POST';
  pathname: string;
  json?: unknown;
}

/** @internal */
export interface ApiClient {
  readonly fetch: FetchLike;
  request<T>(options: RequestOptions): Promise<T>;
}
