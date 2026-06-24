import { PackageBackendEntrypoint } from "@humansandmachines/gsv/sdk/backend";
import type {
  GeneratePatternArgs,
  GeneratePatternIntent,
  GeneratePatternResult,
  SampleMapDocument,
  SampleMapLoadResult,
  StrudelDevice,
  StrudelState,
} from "./app/types";

type KernelClient = {
  request<T = unknown>(call: string, args?: Record<string, unknown>): Promise<T>;
};

const AI_PROCESS_CONTEXT = `You are a Strudel live-coding assistant inside a GSV package app.

Generate concise Strudel pattern code for the browser REPL. Return only JSON with:
{
  "title": "short label",
  "notes": "one sentence about the musical change",
  "code": "Strudel pattern body"
}

Rules:
- code must be valid Strudel/JavaScript pattern code, not Markdown.
- do not include samples(...); the app provides sample sources separately.
- do not use fetch, import, window, document, localStorage, or other browser APIs.
- prefer playable, compact patterns that fit a live-coding editor.
- use available sample names when provided.
- if changing an existing pattern, preserve its intent unless asked otherwise.`;

const AI_GENERATION_TIMEOUT_MS = 60_000;
const AI_GENERATION_POLL_MS = 1_000;
const MAX_PATTERN_CHARS = 8_000;
const MAX_PROMPT_CHARS = 1_200;
const MAX_SAMPLE_NAMES = 48;
const GENERATE_INTENTS = new Set<GeneratePatternIntent>(["new", "variation", "add-layer", "simplify"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function normalizeTarget(target: unknown): string {
  const value = String(target ?? "").trim();
  return value.length > 0 ? value : "gsv";
}

function normalizeIntent(value: unknown): GeneratePatternIntent {
  return typeof value === "string" && GENERATE_INTENTS.has(value as GeneratePatternIntent)
    ? value as GeneratePatternIntent
    : "variation";
}

function normalizeSampleNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter(Boolean)
    .slice(0, MAX_SAMPLE_NAMES);
}

function withTarget(target: string, args: Record<string, unknown>): Record<string, unknown> {
  return target === "gsv" ? args : { ...args, target };
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
  return {
    deviceId,
    label: asString(record.label) ?? deviceId,
    online: asBoolean(record.online) ?? false,
  };
}

function deviceListFromPayload(payload: unknown): StrudelDevice[] {
  const devices = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload)?.devices)
      ? asRecord(payload)?.devices as unknown[]
      : [];
  return devices
    .map(normalizeDevice)
    .filter((device): device is StrudelDevice => Boolean(device))
    .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function countSampleNames(map: SampleMapDocument): number {
  return Object.keys(map).filter((key) => key !== "_base" && !key.startsWith("_")).length;
}

function parseSampleMap(text: string): SampleMapDocument {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Sample map must be a JSON object.");
  }
  return parsed as SampleMapDocument;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assistantTextFromMessage(message: unknown): string {
  const record = asRecord(message);
  if (!record || record.role !== "assistant") {
    return "";
  }
  const content = record.content;
  if (typeof content === "string") {
    return content.trim();
  }
  const contentRecord = asRecord(content);
  return asString(contentRecord?.text)?.trim() ?? "";
}

function latestAssistantText(history: unknown, runId: string): string {
  const record = asRecord(history);
  const messages = Array.isArray(record?.messages) ? record.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = asRecord(messages[index]);
    if (!message || message.role !== "assistant") {
      continue;
    }
    if (runId && message.runId && message.runId !== runId) {
      continue;
    }
    const text = assistantTextFromMessage(message);
    if (text) {
      return text;
    }
  }
  return "";
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json|js|javascript|strudel)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function parseAiJson(text: string): Record<string, unknown> | null {
  const stripped = stripCodeFence(text);
  const candidates = [
    stripped,
    stripped.slice(stripped.indexOf("{"), stripped.lastIndexOf("}") + 1),
  ].filter((candidate) => candidate.trim().startsWith("{") && candidate.trim().endsWith("}"));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const record = asRecord(parsed);
      if (record) {
        return record;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function isUnsafePatternCode(code: string): boolean {
  return /\b(fetch|XMLHttpRequest|localStorage|sessionStorage)\s*\(/i.test(code)
    || /\b(import)\s*\(/i.test(code)
    || /\b(window|document)\s*\./i.test(code)
    || /\bnew\s+Function\b/i.test(code)
    || /<script\b/i.test(code);
}

function normalizeAiResult(text: string): GeneratePatternResult {
  const record = parseAiJson(text);
  const rawCode = asString(record?.code) ?? stripCodeFence(text);
  const code = stripCodeFence(rawCode).trim();
  if (!code) {
    return { ok: false, errorText: "AI response did not include Strudel code." };
  }
  if (code.length > MAX_PATTERN_CHARS) {
    return { ok: false, errorText: "AI response was too large for the live editor." };
  }
  if (isUnsafePatternCode(code)) {
    return { ok: false, errorText: "AI response included unsupported browser-side JavaScript." };
  }
  return {
    ok: true,
    code,
    title: truncate(asString(record?.title)?.trim() || "Generated pattern", 80),
    notes: truncate(asString(record?.notes)?.trim() || "Generated a Strudel pattern from the current context.", 220),
  };
}

function buildGeneratePrompt(args: GeneratePatternArgs): string {
  const sampleNames = args.sampleNames.length > 0
    ? args.sampleNames.join(", ")
    : "default Strudel drum/synth names such as bd, sd, hh, cp, rim, oh, sawtooth";
  const currentPattern = args.currentPattern.trim()
    ? truncate(args.currentPattern.trim(), MAX_PATTERN_CHARS)
    : "(empty)";

  return [
    `Intent: ${args.intent}`,
    `User prompt: ${truncate(args.prompt.trim(), MAX_PROMPT_CHARS)}`,
    `Sample source: ${args.sourceLabel || "not specified"}`,
    `Available sample names: ${sampleNames}`,
    "",
    "Current pattern:",
    "```js",
    currentPattern,
    "```",
    "",
    "Return JSON only.",
  ].join("\n");
}

async function listDevices(kernel: KernelClient): Promise<{ devices: StrudelDevice[]; errorText: string }> {
  try {
    const payload = await kernel.request("sys.device.list", { includeOffline: true });
    return { devices: deviceListFromPayload(payload), errorText: "" };
  } catch (error) {
    return { devices: [], errorText: errorMessage(error) };
  }
}

export default class StrudelLiveBackend extends PackageBackendEntrypoint {
  async loadState(): Promise<StrudelState> {
    const { devices, errorText } = await listDevices(this.kernel);
    return {
      devices,
      defaultTarget: "gsv",
      defaultMapPath: "/public/strudel/strudel.json",
      deviceErrorText: errorText,
    };
  }

  async loadSampleMap(args: unknown): Promise<SampleMapLoadResult> {
    const record = asRecord(args) ?? {};
    const target = normalizeTarget(record.target);
    const path = String(record.path ?? "").trim();

    if (!path) {
      return { ok: false, target, path, errorText: "Sample map path is required." };
    }

    try {
      const payload = await this.kernel.request("fs.read", withTarget(target, { path }));
      const result = asRecord(payload);
      if (result?.ok === false) {
        return { ok: false, target, path, errorText: asString(result.error) ?? "Unable to read sample map." };
      }
      const text = readTextContent(payload);
      if (!text) {
        return { ok: false, target, path, errorText: "Sample map did not contain readable JSON text." };
      }
      const map = parseSampleMap(text);
      return {
        ok: true,
        target,
        path: asString(result?.path) ?? path,
        map,
        sampleCount: countSampleNames(map),
      };
    } catch (error) {
      return { ok: false, target, path, errorText: errorMessage(error) };
    }
  }

  async generatePattern(args: unknown): Promise<GeneratePatternResult> {
    const record = asRecord(args) ?? {};
    const prompt = String(record.prompt ?? "").trim();
    if (!prompt) {
      return { ok: false, errorText: "Prompt is required." };
    }

    let pid = "";
    try {
      const request: GeneratePatternArgs = {
        intent: normalizeIntent(record.intent),
        prompt,
        currentPattern: String(record.currentPattern ?? ""),
        sourceLabel: String(record.sourceLabel ?? "").trim(),
        sampleNames: normalizeSampleNames(record.sampleNames),
      };
      const spawn = await this.kernel.request("proc.spawn", {
        interactive: false,
        label: "Strudel Live AI",
        assignment: {
          contextFiles: [{ name: "strudel-live-ai.md", text: AI_PROCESS_CONTEXT }],
        },
      });
      const spawnRecord = asRecord(spawn);
      if (spawnRecord?.ok !== true) {
        return { ok: false, errorText: asString(spawnRecord?.error) ?? "Unable to start AI process." };
      }
      pid = asString(spawnRecord.pid) ?? "";
      if (!pid) {
        return { ok: false, errorText: "AI process did not return a process id." };
      }

      const send = await this.kernel.request("proc.send", {
        pid,
        message: buildGeneratePrompt(request),
      });
      const sendRecord = asRecord(send);
      if (sendRecord?.ok !== true) {
        return { ok: false, errorText: asString(sendRecord?.error) ?? "Unable to send prompt to AI process." };
      }
      const runId = asString(sendRecord.runId) ?? "";
      const deadline = Date.now() + AI_GENERATION_TIMEOUT_MS;

      while (Date.now() < deadline) {
        const history = await this.kernel.request("proc.history", { pid, limit: 40, tail: true });
        const historyRecord = asRecord(history);
        if (historyRecord?.ok === false) {
          return { ok: false, errorText: asString(historyRecord.error) ?? "Unable to read AI process output." };
        }
        const text = latestAssistantText(history, runId);
        if (text && historyRecord?.activeRunId !== runId) {
          return normalizeAiResult(text);
        }
        await sleep(AI_GENERATION_POLL_MS);
      }

      return { ok: false, errorText: "AI generation timed out." };
    } catch (error) {
      return { ok: false, errorText: errorMessage(error) };
    } finally {
      if (pid) {
        await this.kernel.request("proc.kill", { pid, archive: false }).catch(() => {});
      }
    }
  }
}
