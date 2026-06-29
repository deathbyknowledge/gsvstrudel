import { parse } from "acorn";
import type {
  LoadedSampleMap,
  SampleMapDocument,
  SourcePreludeResult,
  StagedSamplePack,
  WorkspaceScene,
} from "../types";

type ParsedNode = {
  type: string;
  start: number;
  end: number;
};

type ParsedProgram = ParsedNode & {
  body: ParsedNode[];
};

type ParsedExpressionStatement = ParsedNode & {
  expression: ParsedNode;
};

type ParsedLabeledStatement = ParsedNode & {
  label: ParsedNode & { name: string };
  body: ParsedNode;
};

type SourceEdit = {
  start: number;
  end: number;
  text: string;
};

export const DEFAULT_REMOTE_SOURCE = "github:tidalcycles/dirt-samples";
export const DEFAULT_MAP_PATH = "/public/strudel/strudel.json";

export const DEFAULT_PATTERN = `setcps(0.8)

stack(
  s("bd*4").gain(0.9),
  s("~ sd ~ sd").room(0.25),
  s("hh*8").gain(0.35),
  note("<c3 eb3 g3 bb3>*2").s("sawtooth").lpf(900).room(0.4)
)`;

export const EMPTY_SCENES: WorkspaceScene[] = [1, 2, 3, 4].map((slot) => ({
  slot,
  title: `Scene ${slot}`,
  pattern: "",
  sourceMode: "remote",
  sourceLabel: "",
  sourceTarget: "gsv",
  sourcePath: "",
  remoteSource: DEFAULT_REMOTE_SOURCE,
  sampleNames: [],
  capturedAt: 0,
}));

export function buildSessionCode(pattern: string, source: SourcePreludeResult): string {
  const body = pattern.trim();
  if (!source.ok || source.code.trim().length === 0) {
    return body;
  }
  return `${source.code.trim()}\n\n${body}`;
}

export function normalizeStrudelCode(code: string): string {
  const edits = strudelLabelEdits(code);
  if (edits.length === 0) {
    return code;
  }
  return applySourceEdits(code, edits);
}

export function sourcePreludeFromRemote(rawUrl: string): SourcePreludeResult {
  const source = rawUrl.trim();
  if (!source) {
    return {
      ok: false,
      code: "",
      label: "No remote source",
      sampleNames: [],
      warningText: "Remote sample source is required.",
    };
  }
  if (!isSupportedRemoteBase(source)) {
    return {
      ok: false,
      code: "",
      label: source,
      sampleNames: [],
      warningText: "Remote source must be HTTP(S), github:, or shabda:.",
    };
  }
  return {
    ok: true,
    code: `samples(${strudelJsLiteral(source)});`,
    label: source,
    sampleNames: [],
    warningText: "",
  };
}

export function sourcePreludeFromMap(loaded: LoadedSampleMap | null, pageOrigin: string): SourcePreludeResult {
  if (!loaded) {
    return {
      ok: false,
      code: "",
      label: "No loaded map",
      sampleNames: [],
      warningText: "Load a sample map first.",
    };
  }

  const sampleMap = cleanSampleMap(loaded.map, loaded.target, pageOrigin);
  const base = sampleMapBase(loaded.map, sampleMap, loaded.target, loaded.path, pageOrigin);
  const label = `${loaded.target}:${loaded.path}`;
  if (!base.ok) {
    return {
      ok: false,
      code: "",
      label,
      sampleNames: loaded.sampleNames,
      warningText: base.errorText,
    };
  }

  return {
    ok: true,
    code: base.value
      ? `samples(${strudelJsLiteral(sampleMap, 2)}, ${strudelJsLiteral(base.value)});`
      : `samples(${strudelJsLiteral(sampleMap, 2)});`,
    label,
    sampleNames: loaded.sampleNames,
    warningText: base.warningText,
  };
}

export function sourcePreludeFromStagedPack(pack: StagedSamplePack | null, pageOrigin: string): SourcePreludeResult {
  if (!pack) {
    return {
      ok: false,
      code: "",
      label: "No staged pack",
      sampleNames: [],
      warningText: "Stage a sample pack first.",
    };
  }
  const rawBase = typeof pack.map._base === "string" ? pack.map._base.trim() : "";
  const publicBase = rawBase && isSupportedRemoteBase(rawBase)
    ? rawBase
    : absolutePublicPath(pack.publicBasePath, pageOrigin);
  const sampleMap = cleanSampleMap(pack.map, "gsv", pageOrigin);
  return {
    ok: true,
    code: `samples(${strudelJsLiteral(sampleMap, 2)}, ${strudelJsLiteral(publicBase)});`,
    label: pack.packLabel,
    sampleNames: pack.sampleNames,
    warningText: pack.warnings.join(" "),
  };
}

export function sampleNamesFromMap(map: SampleMapDocument): string[] {
  return Object.keys(map)
    .filter((key) => key !== "_base" && !key.startsWith("_"))
    .sort((left, right) => left.localeCompare(right));
}

export function formatTimestamp(timestamp: number): string {
  if (!timestamp) {
    return "empty";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function summarizeSamples(sampleNames: string[], limit = 12): string {
  if (sampleNames.length === 0) {
    return "no named samples";
  }
  const visible = sampleNames.slice(0, limit).join(", ");
  const hidden = sampleNames.length - limit;
  return hidden > 0 ? `${visible} +${hidden}` : visible;
}

function strudelJsLiteral(value: unknown, indent = 0): string {
  return formatJsLiteral(value, indent, 0);
}

function formatJsLiteral(value: unknown, indent: number, depth: number): string {
  if (typeof value === "string") {
    return singleQuotedString(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    const entries = value.map((entry) => formatJsLiteral(entry, indent, depth + 1));
    if (!indent) {
      return `[${entries.join(",")}]`;
    }
    if (entries.length === 0) {
      return "[]";
    }
    const pad = " ".repeat(indent * (depth + 1));
    const endPad = " ".repeat(indent * depth);
    return `[\n${pad}${entries.join(`,\n${pad}`)}\n${endPad}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const formatted = formatJsLiteral(entry, indent, depth + 1);
      return indent
        ? `${" ".repeat(indent * (depth + 1))}${singleQuotedString(key)}: ${formatted}`
        : `${singleQuotedString(key)}:${formatted}`;
    });
    if (!indent) {
      return `{${entries.join(",")}}`;
    }
    if (entries.length === 0) {
      return "{}";
    }
    return `{\n${entries.join(",\n")}\n${" ".repeat(indent * depth)}}`;
  }
  return "null";
}

function singleQuotedString(value: string): string {
  return `'${value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")}'`;
}

function strudelLabelEdits(code: string): SourceEdit[] {
  let program: ParsedProgram;
  try {
    program = parse(code, {
      allowAwaitOutsideFunction: true,
      ecmaVersion: 2022,
      locations: true,
      sourceType: "script",
    }) as ParsedProgram;
  } catch {
    return [];
  }

  const edits: SourceEdit[] = [];
  for (const statement of program.body) {
    if (!isLabeledExpressionStatement(statement)) {
      continue;
    }

    const colonEnd = labelColonEnd(code, statement);
    if (statement.label.name === "$") {
      edits.push({ start: statement.start, end: colonEnd, text: "" });
      continue;
    }

    edits.push({ start: statement.start, end: colonEnd, text: "(" });
    edits.push({
      start: statement.body.expression.end,
      end: statement.body.expression.end,
      text: `).p(${singleQuotedString(statement.label.name)});`,
    });
  }
  return edits;
}

function isLabeledExpressionStatement(statement: ParsedNode): statement is ParsedLabeledStatement & {
  body: ParsedExpressionStatement;
} {
  return statement.type === "LabeledStatement"
    && (statement as ParsedLabeledStatement).body?.type === "ExpressionStatement"
    && typeof (statement as ParsedLabeledStatement).label?.name === "string";
}

function labelColonEnd(code: string, statement: ParsedLabeledStatement): number {
  const colon = code.indexOf(":", statement.label.end);
  if (colon < 0 || colon > statement.body.start) {
    return statement.body.start;
  }
  return colon + 1;
}

function applySourceEdits(code: string, edits: SourceEdit[]): string {
  return edits
    .sort((left, right) => right.start - left.start || right.end - left.end)
    .reduce((current, edit) => (
      `${current.slice(0, edit.start)}${edit.text}${current.slice(edit.end)}`
    ), code);
}

function cleanSampleMap(map: SampleMapDocument, target: string, pageOrigin: string): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(map)) {
    if (key === "_base") {
      continue;
    }
    clean[key] = normalizeSampleValue(value, target, pageOrigin);
  }
  return clean;
}

function sampleMapBase(
  map: SampleMapDocument,
  cleanMap: Record<string, unknown>,
  target: string,
  path: string,
  pageOrigin: string,
): { ok: true; value: string; warningText: string } | { ok: false; errorText: string } {
  const rawBase = typeof map._base === "string" ? map._base.trim() : "";
  if (rawBase) {
    return normalizeSampleBase(rawBase, target, path, pageOrigin);
  }

  if (target === "gsv" && path.startsWith("/public/")) {
    return {
      ok: true,
      value: absolutePublicPath(parentPath(path), pageOrigin),
      warningText: "",
    };
  }

  if (allSampleValuesAreBrowserReachable(cleanMap)) {
    return {
      ok: true,
      value: "",
      warningText: "",
    };
  }

  return {
    ok: true,
    value: "",
    warningText: "Relative audio paths need staging before the browser can play them.",
  };
}

function normalizeSampleBase(
  rawBase: string,
  target: string,
  mapPath: string,
  pageOrigin: string,
): { ok: true; value: string; warningText: string } | { ok: false; errorText: string } {
  if (isSupportedRemoteBase(rawBase)) {
    return { ok: true, value: rawBase, warningText: "" };
  }

  if (rawBase.startsWith("/public/")) {
    if (target !== "gsv") {
      return {
        ok: false,
        errorText: "Device sample maps with /public bases must be staged into GSV first.",
      };
    }
    return { ok: true, value: absolutePublicPath(rawBase, pageOrigin), warningText: "" };
  }

  if (target === "gsv" && mapPath.startsWith("/public/") && !rawBase.startsWith("/")) {
    return {
      ok: true,
      value: absolutePublicPath(`${parentPath(mapPath)}/${rawBase}`, pageOrigin),
      warningText: "",
    };
  }

  return {
    ok: false,
    errorText: "Sample source must be HTTP(S), github:, shabda:, or staged under GSV /public.",
  };
}

function isSupportedRemoteBase(value: string): boolean {
  return /^(https?:\/\/|github:|shabda:|shabda\/speech:|shabda\/speech\/)/i.test(value);
}

function normalizeSampleValue(value: unknown, target: string, pageOrigin: string): unknown {
  if (typeof value === "string") {
    return target === "gsv" && value.startsWith("/public/")
      ? absolutePublicPath(value, pageOrigin)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeSampleValue(entry, target, pageOrigin));
  }
  if (value && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      normalized[key] = normalizeSampleValue(child, target, pageOrigin);
    }
    return normalized;
  }
  return value;
}

function allSampleValuesAreBrowserReachable(value: unknown): boolean {
  if (typeof value === "string") {
    return isSupportedRemoteBase(value) || value.startsWith("http://") || value.startsWith("https://");
  }
  if (Array.isArray(value)) {
    return value.every(allSampleValuesAreBrowserReachable);
  }
  if (value && typeof value === "object") {
    return Object.values(value).every(allSampleValuesAreBrowserReachable);
  }
  return true;
}

function absolutePublicPath(path: string, pageOrigin: string): string {
  return new URL(normalizeSlashes(path), pageOrigin).toString();
}

function normalizeSlashes(path: string): string {
  return path.replace(/\/{2,}/g, "/");
}

function parentPath(path: string): string {
  const trimmed = path.trim();
  const index = trimmed.lastIndexOf("/");
  if (index <= 0) {
    return "/";
  }
  return trimmed.slice(0, index + 1);
}
