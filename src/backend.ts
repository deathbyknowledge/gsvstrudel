import { PackageBackendEntrypoint } from "@humansandmachines/gsv/sdk";
import type {
  CoProducerHistoryResult,
  CoProducerMessage,
  SampleMapDocument,
  SampleMapLoadResult,
  SendCoProducerArgs,
  SendCoProducerResult,
  SkippedSampleFile,
  StageSamplePackResult,
  StagedSampleFile,
  StartCoProducerArgs,
  StartCoProducerResult,
  StrudelDevice,
  StrudelState,
} from "./app/types";

type KernelClient = {
  request<T = unknown>(call: string, args?: Record<string, unknown>): Promise<T>;
};

type CopyFilePlan = {
  sourcePath: string;
  destinationPath: string;
  samplePath: string;
};

type TransformResult = {
  map: SampleMapDocument;
  files: CopyFilePlan[];
  skippedFiles: SkippedSampleFile[];
  warnings: string[];
};

type SampleSourceBase =
  | {
      kind: "copy";
      sourceBasePath: string;
    }
  | {
      kind: "remote";
      remoteBase: string;
    };

const PUBLIC_PACK_ROOT = "/public/strudel-live/packs";
const DEFAULT_MAP_PATH = "/public/strudel/strudel.json";
const MAX_SAMPLE_FILES = 600;
const MAX_PROMPT_CHARS = 2_000;
const MAX_PATTERN_CHARS = 12_000;
const MAX_SAMPLE_NAMES = 96;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function normalizeTarget(target: unknown): string {
  const value = String(target ?? "").trim();
  return value.length > 0 ? value : "gsv";
}

function normalizeLabel(value: unknown, fallback: string): string {
  const label = String(value ?? "").trim();
  return label.length > 0 ? label.slice(0, 80) : fallback;
}

function withTarget(target: string, args: Record<string, unknown>): Record<string, unknown> {
  return target === "gsv" ? args : { ...args, target };
}

function decodeNumberedText(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\t/, ""))
    .join("\n");
}

function readTextContent(payload: unknown): string | null {
  const record = asRecord(payload);
  const content = record?.content;
  if (typeof content === "string") {
    return decodeNumberedText(content);
  }
  if (Array.isArray(content)) {
    const text = content
      .map((entry) => {
        const block = asRecord(entry);
        return block?.type === "text" ? asString(block.text) ?? "" : "";
      })
      .join("");
    return text.trim().length > 0 ? decodeNumberedText(text) : null;
  }
  return null;
}

function parseSampleMap(text: string): SampleMapDocument {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Sample map must be a JSON object.");
  }
  return parsed as SampleMapDocument;
}

function sampleNamesFromMap(map: SampleMapDocument): string[] {
  return Object.keys(map)
    .filter((key) => key !== "_base" && !key.startsWith("_"))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeDevice(device: unknown): StrudelDevice | null {
  const record = asRecord(device);
  if (!record) {
    return null;
  }
  const deviceId = asString(record.deviceId) ?? asString(record.id) ?? "";
  if (!deviceId) {
    return null;
  }
  const capabilities = Array.isArray(record.capabilities)
    ? record.capabilities.filter((capability): capability is string => typeof capability === "string")
    : [];
  return {
    deviceId,
    label: asString(record.label) ?? deviceId,
    online: asBoolean(record.online) ?? false,
    capabilities,
  };
}

function deviceListFromPayload(payload: unknown): StrudelDevice[] {
  const record = asRecord(payload);
  const devices = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.devices)
      ? record.devices
      : [];
  return devices
    .map(normalizeDevice)
    .filter((device): device is StrudelDevice => Boolean(device))
    .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

async function listDevices(kernel: KernelClient): Promise<{ devices: StrudelDevice[]; errorText: string }> {
  try {
    const payload = await kernel.request("sys.device.list", { includeOffline: true });
    return { devices: deviceListFromPayload(payload), errorText: "" };
  } catch (error) {
    return { devices: [], errorText: errorMessage(error) };
  }
}

async function loadMapFromKernel(
  kernel: KernelClient,
  target: string,
  path: string,
): Promise<SampleMapLoadResult> {
  if (!path) {
    return { ok: false, target, path, errorText: "Sample map path is required." };
  }

  try {
    const payload = await kernel.request("fs.read", withTarget(target, { path }));
    const result = asRecord(payload);
    if (result?.ok === false) {
      return { ok: false, target, path, errorText: asString(result.error) ?? "Unable to read sample map." };
    }
    const text = readTextContent(payload);
    if (!text) {
      return { ok: false, target, path, errorText: "Sample map did not contain readable JSON text." };
    }
    const map = parseSampleMap(text);
    const sampleNames = sampleNamesFromMap(map);
    return {
      ok: true,
      target,
      path: asString(result?.path) ?? path,
      map,
      sampleCount: sampleNames.length,
      sampleNames,
    };
  } catch (error) {
    return { ok: false, target, path, errorText: errorMessage(error) };
  }
}

function isRemoteSamplePath(value: string): boolean {
  return /^(https?:\/\/|github:|shabda:|shabda\/speech:|shabda\/speech\/|data:)/i.test(value);
}

function parentPath(path: string): string {
  const trimmed = path.trim();
  const index = trimmed.lastIndexOf("/");
  if (index <= 0) {
    return "/";
  }
  return trimmed.slice(0, index + 1);
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}

function joinPath(base: string, child: string): string {
  if (child.startsWith("/")) {
    return normalizePath(child);
  }
  return normalizePath(`${base.replace(/\/+$/, "")}/${child}`);
}

function normalizePath(path: string): string {
  const absolute = path.startsWith("/");
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `${absolute ? "/" : ""}${parts.join("/")}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "pack";
}

function safeRelativeSamplePath(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? value;
  const relative = withoutQuery.startsWith("/")
    ? withoutQuery.replace(/^\/+/, "")
    : withoutQuery;
  const cleaned = normalizePath(relative).replace(/^\/+/, "");
  const parts = cleaned
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9._-]+/g, "-"))
    .filter((part) => part !== "." && part !== "..");
  return parts.join("/") || basename(value) || "sample.wav";
}

function copyableSourcePath(samplePath: string, sourceBasePath: string): string {
  return samplePath.startsWith("/") ? normalizePath(samplePath) : joinPath(sourceBasePath, samplePath);
}

function resolveSampleSourceBase(map: SampleMapDocument, mapPath: string): SampleSourceBase {
  const mapDirectory = parentPath(mapPath);
  const rawBase = typeof map._base === "string" ? map._base.trim() : "";
  if (!rawBase) {
    return { kind: "copy", sourceBasePath: mapDirectory };
  }
  if (isRemoteSamplePath(rawBase)) {
    return { kind: "remote", remoteBase: rawBase };
  }
  if (rawBase.startsWith("/")) {
    return { kind: "copy", sourceBasePath: normalizePath(rawBase) };
  }
  return { kind: "copy", sourceBasePath: joinPath(mapDirectory, rawBase) };
}

function transformSampleValue(
  value: unknown,
  sourceBase: SampleSourceBase,
  publicBasePath: string,
  files: CopyFilePlan[],
  skippedFiles: SkippedSampleFile[],
): unknown {
  if (typeof value === "string") {
    const samplePath = value.trim();
    if (!samplePath) {
      return value;
    }
    if (isRemoteSamplePath(samplePath)) {
      skippedFiles.push({ samplePath, reason: "remote sample URL" });
      return samplePath;
    }
    if (samplePath.startsWith("/public/")) {
      skippedFiles.push({ samplePath, reason: "already public in GSV" });
      return samplePath;
    }
    if (sourceBase.kind === "remote") {
      skippedFiles.push({ samplePath, reason: "remote sample base" });
      return samplePath;
    }

    const safePath = safeRelativeSamplePath(samplePath);
    const destinationPath = joinPath(publicBasePath, safePath);
    files.push({
      sourcePath: copyableSourcePath(samplePath, sourceBase.sourceBasePath),
      destinationPath,
      samplePath: safePath,
    });
    return safePath;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => transformSampleValue(entry, sourceBase, publicBasePath, files, skippedFiles));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = transformSampleValue(child, sourceBase, publicBasePath, files, skippedFiles);
    }
    return output;
  }

  return value;
}

function buildStageTransform(map: SampleMapDocument, mapPath: string, publicBasePath: string): TransformResult {
  const sourceBase = resolveSampleSourceBase(map, mapPath);
  const files: CopyFilePlan[] = [];
  const skippedFiles: SkippedSampleFile[] = [];
  const transformed: SampleMapDocument = {};
  if (sourceBase.kind === "remote") {
    transformed._base = sourceBase.remoteBase;
  }

  for (const [key, value] of Object.entries(map)) {
    if (key === "_base") {
      continue;
    }
    transformed[key] = transformSampleValue(value, sourceBase, publicBasePath, files, skippedFiles);
  }

  const uniqueFiles = [...new Map(files.map((file) => [file.destinationPath, file])).values()];
  const warnings: string[] = [];
  if (uniqueFiles.length > MAX_SAMPLE_FILES) {
    warnings.push(`Only the first ${MAX_SAMPLE_FILES} local sample files were staged.`);
  }

  return {
    map: transformed,
    files: uniqueFiles.slice(0, MAX_SAMPLE_FILES),
    skippedFiles,
    warnings,
  };
}

async function copySampleFile(kernel: KernelClient, target: string, file: CopyFilePlan): Promise<StagedSampleFile> {
  const payload = await kernel.request("fs.copy", {
    source: { target, path: file.sourcePath },
    destination: { target: "gsv", path: file.destinationPath },
  });
  const result = asRecord(payload);
  if (result?.ok === false) {
    throw new Error(asString(result.error) ?? `Unable to stage ${file.sourcePath}.`);
  }
  return {
    sourcePath: file.sourcePath,
    destinationPath: file.destinationPath,
    samplePath: file.samplePath,
    size: typeof result?.size === "number" ? result.size : undefined,
    contentType: asString(result?.contentType) ?? undefined,
  };
}

async function writeStagedMap(kernel: KernelClient, path: string, map: SampleMapDocument): Promise<void> {
  const payload = await kernel.request("fs.write", {
    path,
    content: `${JSON.stringify(map, null, 2)}\n`,
  });
  const result = asRecord(payload);
  if (result?.ok === false) {
    throw new Error(asString(result.error) ?? "Unable to write staged sample map.");
  }
}

function messageText(message: unknown): string {
  const record = asRecord(message);
  if (!record) {
    return "";
  }
  const content = record.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        const block = asRecord(entry);
        return block?.type === "text" ? asString(block.text) ?? "" : "";
      })
      .join("")
      .trim();
  }
  const contentRecord = asRecord(content);
  return asString(contentRecord?.text)?.trim() ?? "";
}

function normalizeCoProducerMessages(history: unknown): CoProducerMessage[] {
  const record = asRecord(history);
  const messages = Array.isArray(record?.messages) ? record.messages : [];
  return messages
    .map((message, index): CoProducerMessage | null => {
      const item = asRecord(message);
      if (!item) {
        return null;
      }
      const role = asString(item.role);
      if (role !== "user" && role !== "assistant" && role !== "tool" && role !== "system") {
        return null;
      }
      const text = messageText(item);
      if (!text) {
        return null;
      }
      return {
        id: asString(item.id) ?? `${index}`,
        role,
        text,
        runId: asString(item.runId) ?? undefined,
      };
    })
    .filter((message): message is CoProducerMessage => Boolean(message));
}

function buildCoProducerContext(args: StartCoProducerArgs): string {
  return [
    "# Strudel Live co-producer",
    "",
    "You are the Strudel Live co-producer inside GSV.",
    "Work like a live-coding collaborator, not a detached code generator.",
    "Keep responses compact and stage-ready.",
    "",
    "Rules:",
    "- Strudel code suggestions must omit samples(...); the app owns sample sources.",
    "- Prefer short playable diffs and explain what musical decision changed.",
    "- Use available sample names when useful.",
    "- Do not use browser APIs, fetch, import, document, window, storage, or network code.",
    "- When proposing code, put only the pattern body in one fenced strudel block.",
    "",
    `Current source: ${args.sourceLabel || "not selected"}`,
    `Known sample names: ${args.sampleNames.slice(0, MAX_SAMPLE_NAMES).join(", ") || "none"}`,
    "",
    "Current pattern:",
    "```strudel",
    truncate(args.pattern, MAX_PATTERN_CHARS),
    "```",
  ].join("\n");
}

function buildCoProducerPrompt(args: SendCoProducerArgs): string {
  return [
    `Request: ${truncate(args.prompt.trim(), MAX_PROMPT_CHARS)}`,
    "",
    `Source: ${args.sourceLabel || "not selected"}`,
    `Available sample names: ${args.sampleNames.slice(0, MAX_SAMPLE_NAMES).join(", ") || "none"}`,
    "",
    "Current pattern:",
    "```strudel",
    truncate(args.pattern, MAX_PATTERN_CHARS),
    "```",
    "",
    "Return a concise answer. If you suggest code, include one fenced strudel block with the full replacement pattern body.",
  ].join("\n");
}

export default class StrudelLiveBackend extends PackageBackendEntrypoint {
  async loadState(): Promise<StrudelState> {
    const { devices, errorText } = await listDevices(this.kernel);
    return {
      devices,
      defaultTarget: "gsv",
      defaultMapPath: DEFAULT_MAP_PATH,
      publicPackRoot: PUBLIC_PACK_ROOT,
      deviceErrorText: errorText,
    };
  }

  async loadSampleMap(args: unknown): Promise<SampleMapLoadResult> {
    const record = asRecord(args) ?? {};
    const target = normalizeTarget(record.target);
    const path = String(record.path ?? "").trim();
    return await loadMapFromKernel(this.kernel, target, path);
  }

  async stageSamplePack(args: unknown): Promise<StageSamplePackResult> {
    const record = asRecord(args) ?? {};
    const target = normalizeTarget(record.target);
    const sourcePath = String(record.mapPath ?? "").trim();
    const packLabel = normalizeLabel(record.packLabel, basename(sourcePath) || "Strudel pack");
    const copiedFiles: StagedSampleFile[] = [];
    const skippedFiles: SkippedSampleFile[] = [];

    if (!sourcePath) {
      return {
        ok: false,
        target,
        sourcePath,
        packLabel,
        errorText: "Sample map path is required.",
        copiedFiles,
        skippedFiles,
      };
    }

    try {
      const loaded = await loadMapFromKernel(this.kernel, target, sourcePath);
      if (!loaded.ok) {
        return {
          ok: false,
          target,
          sourcePath,
          packLabel,
          errorText: loaded.errorText,
          copiedFiles,
          skippedFiles,
        };
      }

      const packId = `${slugify(packLabel)}-${Date.now().toString(36)}`;
      const publicBasePath = `${PUBLIC_PACK_ROOT}/${packId}/`;
      const stagedMapPath = `${publicBasePath}strudel.json`;
      const transformed = buildStageTransform(loaded.map, loaded.path, publicBasePath);
      skippedFiles.push(...transformed.skippedFiles);

      for (const file of transformed.files) {
        try {
          copiedFiles.push(await copySampleFile(this.kernel, target, file));
        } catch (error) {
          skippedFiles.push({ samplePath: file.samplePath, reason: errorMessage(error) });
        }
      }

      await writeStagedMap(this.kernel, stagedMapPath, transformed.map);
      const sampleNames = sampleNamesFromMap(transformed.map);

      return {
        ok: true,
        target,
        sourcePath,
        packId,
        packLabel,
        publicBasePath,
        stagedMapPath,
        map: transformed.map,
        sampleCount: sampleNames.length,
        sampleNames,
        copiedFiles,
        skippedFiles,
        warnings: transformed.warnings,
      };
    } catch (error) {
      return {
        ok: false,
        target,
        sourcePath,
        packLabel,
        errorText: errorMessage(error),
        copiedFiles,
        skippedFiles,
      };
    }
  }

  async startCoProducer(args: unknown): Promise<StartCoProducerResult> {
    const record = asRecord(args) ?? {};
    const request: StartCoProducerArgs = {
      pattern: String(record.pattern ?? ""),
      sourceLabel: String(record.sourceLabel ?? "").trim(),
      sampleNames: Array.isArray(record.sampleNames)
        ? record.sampleNames.filter((name): name is string => typeof name === "string")
        : [],
    };

    try {
      const payload = await this.kernel.request("proc.spawn", {
        runAs: "strudel-live#coproducer",
        interactive: true,
        fresh: true,
        label: "Strudel co-producer",
        assignment: {
          autoStart: false,
          contextFiles: [{ name: "strudel-live-session.md", text: buildCoProducerContext(request) }],
        },
      });
      const result = asRecord(payload);
      if (result?.ok !== true) {
        return { ok: false, errorText: asString(result?.error) ?? "Unable to start co-producer." };
      }
      const pid = asString(result.pid) ?? "";
      if (!pid) {
        return { ok: false, errorText: "Co-producer did not return a process id." };
      }
      return {
        ok: true,
        pid,
        label: asString(result.label) ?? "Strudel co-producer",
        messages: [],
      };
    } catch (error) {
      return { ok: false, errorText: errorMessage(error) };
    }
  }

  async sendCoProducer(args: unknown): Promise<SendCoProducerResult> {
    const record = asRecord(args) ?? {};
    const request: SendCoProducerArgs = {
      pid: String(record.pid ?? "").trim(),
      prompt: String(record.prompt ?? "").trim(),
      pattern: String(record.pattern ?? ""),
      sourceLabel: String(record.sourceLabel ?? "").trim(),
      sampleNames: Array.isArray(record.sampleNames)
        ? record.sampleNames.filter((name): name is string => typeof name === "string")
        : [],
    };

    if (!request.pid) {
      return { ok: false, errorText: "Co-producer process is not running." };
    }
    if (!request.prompt) {
      return { ok: false, errorText: "Prompt is required." };
    }

    try {
      const payload = await this.kernel.request("proc.send", {
        pid: request.pid,
        message: buildCoProducerPrompt(request),
      });
      const result = asRecord(payload);
      if (result?.ok !== true) {
        return { ok: false, errorText: asString(result?.error) ?? "Unable to send prompt." };
      }
      return { ok: true, runId: asString(result.runId) ?? "" };
    } catch (error) {
      return { ok: false, errorText: errorMessage(error) };
    }
  }

  async readCoProducer(args: unknown): Promise<CoProducerHistoryResult> {
    const record = asRecord(args) ?? {};
    const pid = String(record.pid ?? "").trim();
    if (!pid) {
      return { ok: false, errorText: "Co-producer process is not running." };
    }
    try {
      const payload = await this.kernel.request("proc.history", { pid, limit: 40, tail: true });
      const result = asRecord(payload);
      if (result?.ok === false) {
        return { ok: false, errorText: asString(result.error) ?? "Unable to read co-producer history." };
      }
      return {
        ok: true,
        pid,
        activeRunId: asString(result?.activeRunId) ?? undefined,
        messages: normalizeCoProducerMessages(payload),
      };
    } catch (error) {
      return { ok: false, errorText: errorMessage(error) };
    }
  }
}
