import type {
  ApiClient,
  RenderMediaInput,
  RenderStatusResponse,
  RenderStillInput,
  StartRenderResult
} from './types.js';
import { API_VERSION } from './types.js';

type RenderRequestBody = {
  bundleId: string;
  compositionId: string;
  kind?: 'media' | 'still';
  inputProps?: unknown;
  codec?: string;
  imageFormat?: string;
  width?: number;
  height?: number;
  frame?: number;
};

function buildRenderRequestBody(
  input: RenderMediaInput | RenderStillInput,
  kind: 'media' | 'still'
): RenderRequestBody {
  const body: RenderRequestBody = {
    bundleId: input.bundleId,
    compositionId: input.compositionId
  };

  if (input.inputProps !== undefined) {
    body.inputProps = input.inputProps;
  }

  if (input.width !== undefined) {
    body.width = input.width;
  }

  if (input.height !== undefined) {
    body.height = input.height;
  }

  if (kind === 'still') {
    body.kind = 'still';
    const stillInput = input as RenderStillInput;

    if (stillInput.imageFormat) {
      body.imageFormat = stillInput.imageFormat;
    }

    if (stillInput.frame !== undefined) {
      body.frame = stillInput.frame;
    }
  } else {
    const mediaInput = input as RenderMediaInput;

    if (mediaInput.codec) {
      body.codec = mediaInput.codec;
    }
  }

  return body;
}

async function startRender(
  client: ApiClient,
  input: RenderMediaInput | RenderStillInput,
  kind: 'media' | 'still'
): Promise<StartRenderResult> {
  const body = await client.request<StartRenderResult>({
    method: 'POST',
    pathname: `/${API_VERSION}/renders`,
    json: buildRenderRequestBody(input, kind)
  });

  if (!body.renderId) {
    throw new Error('Cloudmotion API did not return a render id.');
  }

  return body;
}

export function renderMedia(client: ApiClient, input: RenderMediaInput) {
  return startRender(client, input, 'media');
}

export function renderStill(client: ApiClient, input: RenderStillInput) {
  return startRender(client, input, 'still');
}

export function getRenderProgress(client: ApiClient, renderId: string) {
  return client.request<RenderStatusResponse>({
    method: 'GET',
    pathname: `/${API_VERSION}/renders/${encodeURIComponent(renderId)}`
  });
}
