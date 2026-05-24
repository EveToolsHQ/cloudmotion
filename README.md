# cloudmotion

Node.js client and CLI for [Cloudmotion](https://cloudmotion.dev). The HTTP API at [api.cloudmotion.dev](https://api.cloudmotion.dev) is canonical; this package adds bundle upload orchestration and typed render calls for Node scripts and CI. Full API reference: [cloudmotion.dev/docs](https://cloudmotion.dev/docs).

## Install

```bash
npm install cloudmotion
```

## CLI

```bash
export CLOUDMOTION_TOKEN=cm_...
```

Upload a Remotion bundle directory (after `npx remotion bundle`), then start a render:

```bash
npx cloudmotion bundles upload dist/bundle --bundle-id my-project

npx cloudmotion render \
  --bundle-id my-project \
  --composition-id MyComp
```

Re-uploading under the same bundle ID replaces the latest bundle used for renders. Upload complete returns whether render infra is ready (`runtimeReady`); if not, wait before rendering (API may return 409). The render command prints progress to stderr and the output URL on stdout when finished.

## SDK

Pass `token` in the client constructor (the SDK does not read environment variables).

```ts
import { createClient } from "cloudmotion";

const client = createClient({ token: "cm_..." });

const bundle = await client.uploadBundle({
  bundleDir: "dist/bundle",
  bundleId: "my-project",
});

const { renderId } = await client.renderMedia({
  bundleId: bundle.bundleId,
  compositionId: "MyComp",
  inputProps: { title: "Hello" },
});

let status = await client.getRenderProgress(renderId);
while (status.status !== "completed" && status.status !== "failed") {
  await new Promise((r) => setTimeout(r, 2000));
  status = await client.getRenderProgress(renderId);
}

console.log(status.outputUrl);
```

### API surface

- `createClient({ token, fetch? })` — optional custom `fetch` (e.g. for timeouts or logging)
- `client.uploadBundle({ bundleDir, bundleId, onUploadProgress? })` — returns `{ bundleId, uploadId, remotionVersion, runtimeReady }`
- `client.renderMedia(input)` / `client.renderStill(input)` — returns `{ renderId }`
- `client.getRenderProgress(renderId)` — poll `{ status, progress, error?, outputUrl? }` (server refreshes from Lambda)

### curl (no SDK)

See the full reference at [cloudmotion.dev/docs](https://cloudmotion.dev/docs).

```bash
# Start render
curl -sS -X POST "https://api.cloudmotion.dev/v1/renders" \
  -H "Authorization: Bearer cm_..." \
  -H "Content-Type: application/json" \
  -d '{"bundleId":"my-project","compositionId":"MyComp","kind":"media"}'

# Poll status
curl -sS "https://api.cloudmotion.dev/v1/renders/$RENDER_ID" \
  -H "Authorization: Bearer cm_..."
```

Bundle upload via curl uses `POST /v1/bundles/upload/init` → PUT files to `uploadUrls` → `POST /v1/bundles/upload/complete`; the CLI/SDK automates that flow.
