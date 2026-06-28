import type {
  LoadedSampleMap,
  SampleMapDocument,
  SourcePreludeResult,
  StagedSamplePack,
  WorkspaceScene,
} from "../types";

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
    code: `samples(${JSON.stringify(source)});`,
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
      ? `samples(${JSON.stringify(sampleMap, null, 2)}, ${JSON.stringify(base.value)});`
      : `samples(${JSON.stringify(sampleMap, null, 2)});`,
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
    code: `samples(${JSON.stringify(sampleMap, null, 2)}, ${JSON.stringify(publicBase)});`,
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
