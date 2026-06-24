export type StrudelDevice = {
  deviceId: string;
  label: string;
  online: boolean;
};

export type StrudelState = {
  devices: StrudelDevice[];
  defaultTarget: string;
  defaultMapPath: string;
  deviceErrorText: string;
};

export type SampleMapDocument = Record<string, unknown> & {
  _base?: unknown;
};

export type SampleMapLoadResult =
  | {
      ok: true;
      target: string;
      path: string;
      map: SampleMapDocument;
      sampleCount: number;
    }
  | {
      ok: false;
      target: string;
      path: string;
      errorText: string;
    };

export type SourceMode = "target-map" | "url";

export type LoadedSampleMap = Extract<SampleMapLoadResult, { ok: true }>;

export type StrudelBackend = {
  loadState(args?: Record<string, never>): Promise<StrudelState>;
  loadSampleMap(args: { target: string; path: string }): Promise<SampleMapLoadResult>;
  generatePattern(args: GeneratePatternArgs): Promise<GeneratePatternResult>;
};

export type SourcePreludeResult =
  | {
      ok: true;
      code: string;
      label: string;
      warningText: string;
    }
  | {
      ok: false;
      code: "";
      label: string;
      warningText: string;
    };

export type GeneratePatternIntent = "new" | "variation" | "add-layer" | "simplify";

export type GeneratePatternArgs = {
  intent: GeneratePatternIntent;
  prompt: string;
  currentPattern: string;
  sourceLabel: string;
  sampleNames: string[];
};

export type GeneratePatternResult =
  | {
      ok: true;
      code: string;
      notes: string;
      title: string;
    }
  | {
      ok: false;
      errorText: string;
    };
