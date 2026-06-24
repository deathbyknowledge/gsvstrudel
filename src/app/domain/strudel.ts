import type { LoadedSampleMap, SampleMapDocument, SourcePreludeResult } from "../types";

const STRUDEL_REPL_URL = "https://strudel.cc/";
export const DEFAULT_SOURCE_URL = "github:tidalcycles/dirt-samples";

export const DEFAULT_PATTERN = `setcps(0.8)

stack(
  s("bd*4").gain(0.9),
  s("~ sd ~ sd").room(0.25),
  s("hh*8").gain(0.35),
  note("<c3 eb3 g3 bb3>*2").s("sawtooth").lpf(900).room(0.4)
)`;

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function buildStrudelUrl(code: string): string {
  return `${STRUDEL_REPL_URL}#${encodeURIComponent(utf8ToBase64(code))}`;
}

export function buildSessionCode(pattern: string, source: SourcePreludeResult): string {
  const body = pattern.trim();
  if (!source.ok || source.code.trim().length === 0) {
    return body;
  }
  return `${source.code.trim()}\n\n${body}`;
}

export function sourcePreludeFromUrl(rawUrl: string, pageOrigin: string): SourcePreludeResult {
  const source = rawUrl.trim();
  if (!source) {
    return {
      ok: false,
      code: "",
      label: "No source",
      warningText: "Sample source URL is required.",
    };
  }

  const normalized = normalizeSampleBase(source, "gsv", "", pageOrigin);
  if (!normalized.ok) {
    return {
      ok: false,
      code: "",
      label: source,
      warningText: normalized.errorText,
    };
  }

  return {
    ok: true,
    code: `samples(${JSON.stringify(normalized.value)});`,
    label: normalized.value,
    warningText: normalized.warningText,
  };
}

export function sourcePreludeFromMap(loaded: LoadedSampleMap | null, pageOrigin: string): SourcePreludeResult {
  if (!loaded) {
    return {
      ok: false,
      code: "",
      label: "No target map",
      warningText: "Load a target sample map first.",
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
      warningText: base.errorText,
    };
  }

  return {
    ok: true,
    code: base.value
      ? `samples(${JSON.stringify(sampleMap, null, 2)}, ${JSON.stringify(base.value)});`
      : `samples(${JSON.stringify(sampleMap, null, 2)});`,
    label,
    warningText: base.warningText,
  };
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
      value: absolutePublicBase(parentPath(path), pageOrigin),
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
    warningText: "Relative audio paths need a _base URL, github shortcut, or GSV /public path.",
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
        errorText: "Device target sample maps need HTTP(S), github:, or another browser-reachable base.",
      };
    }
    return { ok: true, value: absolutePublicBase(rawBase, pageOrigin), warningText: "" };
  }

  if (target === "gsv" && mapPath.startsWith("/public/") && !rawBase.startsWith("/")) {
    return {
      ok: true,
      value: absolutePublicBase(`${parentPath(mapPath)}/${rawBase}`, pageOrigin),
      warningText: "",
    };
  }

  return {
    ok: false,
    errorText: "Sample source must be HTTP(S), github:, shabda:, or a GSV /public path.",
  };
}

function isSupportedRemoteBase(value: string): boolean {
  return /^(https?:\/\/|github:|shabda:|shabda\/speech:|shabda\/speech\/)/i.test(value);
}

function normalizeSampleValue(value: unknown, target: string, pageOrigin: string): unknown {
  if (typeof value === "string") {
    return target === "gsv" && value.startsWith("/public/")
      ? absolutePublicBase(value, pageOrigin)
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
    return isSupportedRemoteBase(value);
  }
  if (Array.isArray(value)) {
    return value.every(allSampleValuesAreBrowserReachable);
  }
  if (value && typeof value === "object") {
    return Object.values(value).every(allSampleValuesAreBrowserReachable);
  }
  return true;
}

function absolutePublicBase(path: string, pageOrigin: string): string {
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
