export type StrudelDevice = {
  deviceId: string;
  label: string;
  online: boolean;
  capabilities: string[];
};

export type StrudelState = {
  devices: StrudelDevice[];
  defaultTarget: string;
  defaultMapPath: string;
  publicPackRoot: string;
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
      sampleNames: string[];
    }
  | {
      ok: false;
      target: string;
      path: string;
      errorText: string;
    };

export type StagedSampleFile = {
  sourcePath: string;
  destinationPath: string;
  samplePath: string;
  size?: number;
  contentType?: string;
};

export type SkippedSampleFile = {
  samplePath: string;
  reason: string;
};

export type StageSamplePackResult =
  | {
      ok: true;
      target: string;
      sourcePath: string;
      packId: string;
      packLabel: string;
      publicBasePath: string;
      stagedMapPath: string;
      map: SampleMapDocument;
      sampleCount: number;
      sampleNames: string[];
      copiedFiles: StagedSampleFile[];
      skippedFiles: SkippedSampleFile[];
      warnings: string[];
    }
  | {
      ok: false;
      target: string;
      sourcePath: string;
      packLabel: string;
      errorText: string;
      copiedFiles: StagedSampleFile[];
      skippedFiles: SkippedSampleFile[];
    };

export type SourceMode = "remote" | "map" | "staged";

export type LoadedSampleMap = Extract<SampleMapLoadResult, { ok: true }>;
export type StagedSamplePack = Extract<StageSamplePackResult, { ok: true }>;

export type SourcePreludeResult =
  | {
      ok: true;
      code: string;
      label: string;
      sampleNames: string[];
      warningText: string;
    }
  | {
      ok: false;
      code: "";
      label: string;
      sampleNames: string[];
      warningText: string;
    };

export type RuntimeStatus = "idle" | "initializing" | "evaluating" | "playing" | "stopped" | "error";

export type RuntimeState = {
  status: RuntimeStatus;
  errorText: string;
  lastEvaluatedAt: number | null;
};

export type WorkspaceScene = {
  slot: number;
  title: string;
  pattern: string;
  sourceMode: SourceMode;
  sourceLabel: string;
  sourceTarget: string;
  sourcePath: string;
  remoteSource: string;
  sampleNames: string[];
  capturedAt: number;
};

export type CoProducerMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  runId?: string;
};

export type CoProducerSession = {
  pid: string;
  label: string;
  runId?: string;
  activeRunId?: string;
  messages: CoProducerMessage[];
};

export type StartCoProducerArgs = {
  pattern: string;
  sourceLabel: string;
  sampleNames: string[];
};

export type StartCoProducerResult =
  | {
      ok: true;
      pid: string;
      label: string;
      messages: CoProducerMessage[];
    }
  | {
      ok: false;
      errorText: string;
    };

export type SendCoProducerArgs = {
  pid: string;
  prompt: string;
  pattern: string;
  sourceLabel: string;
  sampleNames: string[];
};

export type SendCoProducerResult =
  | {
      ok: true;
      runId: string;
    }
  | {
      ok: false;
      errorText: string;
    };

export type CoProducerHistoryResult =
  | {
      ok: true;
      pid: string;
      activeRunId?: string;
      messages: CoProducerMessage[];
    }
  | {
      ok: false;
      errorText: string;
    };

export type StrudelBackend = {
  loadState(args?: Record<string, never>): Promise<StrudelState>;
  loadSampleMap(args: { target: string; path: string }): Promise<SampleMapLoadResult>;
  stageSamplePack(args: { target: string; mapPath: string; packLabel: string }): Promise<StageSamplePackResult>;
  startCoProducer(args: StartCoProducerArgs): Promise<StartCoProducerResult>;
  sendCoProducer(args: SendCoProducerArgs): Promise<SendCoProducerResult>;
  readCoProducer(args: { pid: string }): Promise<CoProducerHistoryResult>;
};
