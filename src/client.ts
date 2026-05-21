import { CloudmotionError } from './errors.js';
import { uploadBundle as uploadBundleImpl } from './upload.js';
import {
  getRenderProgress as getRenderProgressImpl,
  renderMedia as renderMediaImpl,
  renderStill as renderStillImpl
} from './render.js';
import {
  DEFAULT_API_URL,
  type ClientOptions,
  type FetchLike,
  type RenderMediaInput,
  type RenderStillInput,
  type RequestOptions,
  type UploadBundleInput
} from './types.js';

export function resolveRequestUrl(baseUrl: string, pathname: string) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPathname = pathname.replace(/^\/+/, '');

  return new URL(normalizedPathname, normalizedBaseUrl);
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

export class CloudmotionClient {
  public readonly token: string;
  public readonly baseUrl: string;
  public readonly fetch: FetchLike;

  public constructor(options: ClientOptions) {
    this.token = options.token;
    this.baseUrl = options.baseUrl ?? DEFAULT_API_URL;
    this.fetch = options.fetch ?? fetch;
  }

  public uploadBundle(input: UploadBundleInput) {
    return uploadBundleImpl(this, input);
  }

  public renderMedia(input: RenderMediaInput) {
    return renderMediaImpl(this, input);
  }

  public renderStill(input: RenderStillInput) {
    return renderStillImpl(this, input);
  }

  public getRenderProgress(renderId: string) {
    return getRenderProgressImpl(this, renderId);
  }

  public async request<T>(options: RequestOptions): Promise<T> {
    const url = resolveRequestUrl(this.baseUrl, options.pathname);

    const response = await this.fetch(url, {
      method: options.method,
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json'
      },
      body: options.json === undefined ? undefined : JSON.stringify(options.json)
    });

    const payload = await parseResponse(response);

    if (!response.ok) {
      const message =
        typeof payload === 'object' &&
        payload !== null &&
        'message' in payload &&
        typeof payload.message === 'string'
          ? payload.message
          : `Cloudmotion API request failed with ${response.status}`;

      throw new CloudmotionError(message, response.status, payload);
    }

    return payload as T;
  }
}

export function createClient(options: ClientOptions) {
  return new CloudmotionClient(options);
}
