#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CloudmotionError,
  createClient,
  type ClientOptions,
  type RenderStatusResponse
} from '../src/index.js';

interface ParsedArgs {
  command: string[];
  flags: Record<string, string | boolean>;
}

function getPackageVersion(): string {
  const packageJsonPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'package.json'
  );
  const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    version: string;
  };

  return version;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      command.push(token);
      continue;
    }

    const [flagName, inlineValue] = token.slice(2).split('=', 2);

    if (inlineValue !== undefined) {
      flags[flagName] = inlineValue;
      continue;
    }

    const nextToken = argv[index + 1];

    if (nextToken && !nextToken.startsWith('--')) {
      flags[flagName] = nextToken;
      index += 1;
      continue;
    }

    flags[flagName] = true;
  }

  return { command, flags };
}

function printHelp() {
  const version = getPackageVersion();

  process.stdout.write(`cloudmotion ${version}

Usage:
  cloudmotion bundles upload <bundle-dir> --bundle-id <id>
  cloudmotion render --bundle-id <id> --composition-id <id>

Options:
  --bundle-id <id>        Required bundle ID slug (letters, numbers, _, -)
  --composition-id <id>   Required for render
  --bundle-version <ver>  Pin bundle version (e.g. v2); default is latest
  --input-props <json>    JSON object passed to the composition
  --json                  Print raw JSON output

Environment:
  CLOUDMOTION_TOKEN       Required API token
  CLOUDMOTION_BASE_URL    Optional API base URL override
`);
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function resolveClientOptions(flags: Record<string, string | boolean>): ClientOptions {
  const token = process.env.CLOUDMOTION_TOKEN;

  if (!token) {
    throw new Error('Missing Cloudmotion token. Set CLOUDMOTION_TOKEN.');
  }

  const baseUrl =
    (typeof flags['base-url'] === 'string' ? flags['base-url'] : undefined) ??
    process.env.CLOUDMOTION_BASE_URL;

  return {
    token,
    baseUrl
  };
}

function parseInputProps(flags: Record<string, string | boolean>): unknown | undefined {
  const raw = flags['input-props'];

  if (raw === undefined || raw === true) {
    return undefined;
  }

  if (typeof raw !== 'string') {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('--input-props must be valid JSON.');
  }
}

function formatProgressPercent(progress: number): number {
  if (!Number.isFinite(progress) || progress < 0) {
    return 0;
  }

  const percent = progress <= 1 ? progress * 100 : progress;
  return Math.min(100, Math.round(percent));
}

function reportRenderProgress(status: RenderStatusResponse) {
  const percent = formatProgressPercent(status.progress);
  process.stderr.write(`[${status.status}] ${percent}%\n`);
}

async function waitForRender(
  client: ReturnType<typeof createClient>,
  renderId: string
) {
  let status = await client.getRenderProgress(renderId);
  let lastReportedStatus: string | undefined;
  let lastReportedPercent: number | undefined;

  while (status.status !== 'completed' && status.status !== 'failed') {
    const percent = formatProgressPercent(status.progress);

    if (
      status.status !== lastReportedStatus ||
      percent !== lastReportedPercent
    ) {
      reportRenderProgress(status);
      lastReportedStatus = status.status;
      lastReportedPercent = percent;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
    status = await client.getRenderProgress(renderId);
  }

  const finalPercent = formatProgressPercent(status.progress);

  if (
    status.status !== lastReportedStatus ||
    finalPercent !== lastReportedPercent
  ) {
    reportRenderProgress(status);
  }

  return status;
}

async function runBundlesUpload(
  client: ReturnType<typeof createClient>,
  flags: Record<string, string | boolean>,
  bundleDir: string | undefined
) {
  const bundleId = typeof flags['bundle-id'] === 'string' ? flags['bundle-id'] : undefined;

  if (!bundleDir) {
    throw new Error('Missing <bundle-dir>. Example: npx cloudmotion bundles upload dist/bundle --bundle-id my-site');
  }

  if (!bundleId) {
    throw new Error('Missing --bundle-id. Example: npx cloudmotion bundles upload dist/bundle --bundle-id my-site');
  }

  const result = await client.uploadBundle({
    bundleDir,
    bundleId
  });

  if (flags.json === true) {
    printJson(result);
    return;
  }

  process.stdout.write(
    `Uploaded bundle ${result.bundleId}@${result.bundleVersion}\n`
  );
}

async function runRender(
  client: ReturnType<typeof createClient>,
  flags: Record<string, string | boolean>
) {
  const bundleId = typeof flags['bundle-id'] === 'string' ? flags['bundle-id'] : undefined;
  const compositionId =
    typeof flags['composition-id'] === 'string' ? flags['composition-id'] : undefined;
  const bundleVersion =
    typeof flags['bundle-version'] === 'string' ? flags['bundle-version'] : undefined;

  if (!bundleId) {
    throw new Error(
      'Missing --bundle-id. Example: npx cloudmotion render --bundle-id my-site --composition-id Main'
    );
  }

  if (!compositionId) {
    throw new Error(
      'Missing --composition-id. Example: npx cloudmotion render --bundle-id my-site --composition-id Main'
    );
  }

  const { renderId } = await client.renderMedia({
    bundleId,
    bundleVersion,
    compositionId,
    inputProps: parseInputProps(flags)
  });

  if (flags.json !== true) {
    process.stderr.write(`Render ${renderId} started\n`);
  }

  const status = await waitForRender(client, renderId);

  if (flags.json === true) {
    printJson({ renderId, ...status });
    return;
  }

  if (status.status === 'failed') {
    throw new Error(status.error ?? 'Render failed');
  }

  process.stdout.write(`${status.outputUrl ?? ''}\n`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const [resource, action, ...rest] = command;

  if (!resource || resource === 'help' || flags.help === true) {
    printHelp();
    return;
  }

  const client = createClient(resolveClientOptions(flags));

  if (resource === 'bundles' && action === 'upload') {
    await runBundlesUpload(client, flags, rest[0]);
    return;
  }

  if (resource === 'render') {
    await runRender(client, flags);
    return;
  }

  throw new Error(`Unknown command. Run "npx cloudmotion help".`);
}

main().catch((error: unknown) => {
  if (error instanceof CloudmotionError) {
    process.stderr.write(`Cloudmotion API error (${error.statusCode}): ${error.message}\n`);
  } else if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write('Unexpected error.\n');
  }

  process.exitCode = 1;
});
