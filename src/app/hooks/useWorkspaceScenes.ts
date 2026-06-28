import { useCallback, useEffect, useState } from "preact/hooks";
import { EMPTY_SCENES } from "../domain/strudel";
import type { SourceMode, WorkspaceScene } from "../types";

const STORAGE_KEY = "strudel-live.workspace-scenes.v1";

type CaptureSceneInput = {
  slot: number;
  pattern: string;
  sourceMode: SourceMode;
  sourceLabel: string;
  sourceTarget: string;
  sourcePath: string;
  remoteSource: string;
  sampleNames: string[];
};

type WorkspaceScenesApi = {
  scenes: WorkspaceScene[];
  captureScene(input: CaptureSceneInput): void;
  clearScene(slot: number): void;
};

function parseScenes(value: string | null): WorkspaceScene[] {
  if (!value) {
    return EMPTY_SCENES;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return EMPTY_SCENES;
    }
    return EMPTY_SCENES.map((empty) => {
      const found = parsed.find((entry) => (
        entry && typeof entry === "object" && (entry as { slot?: unknown }).slot === empty.slot
      )) as Partial<WorkspaceScene> | undefined;
      if (!found || typeof found.pattern !== "string") {
        return empty;
      }
      return {
        slot: empty.slot,
        title: typeof found.title === "string" ? found.title : empty.title,
        pattern: found.pattern,
        sourceMode: found.sourceMode === "map" || found.sourceMode === "staged" ? found.sourceMode : "remote",
        sourceLabel: typeof found.sourceLabel === "string" ? found.sourceLabel : "",
        sourceTarget: typeof found.sourceTarget === "string" ? found.sourceTarget : "gsv",
        sourcePath: typeof found.sourcePath === "string" ? found.sourcePath : "",
        remoteSource: typeof found.remoteSource === "string" ? found.remoteSource : empty.remoteSource,
        sampleNames: Array.isArray(found.sampleNames)
          ? found.sampleNames.filter((name): name is string => typeof name === "string")
          : [],
        capturedAt: typeof found.capturedAt === "number" ? found.capturedAt : 0,
      };
    });
  } catch {
    return EMPTY_SCENES;
  }
}

export function useWorkspaceScenes(): WorkspaceScenesApi {
  const [scenes, setScenes] = useState<WorkspaceScene[]>(() => (
    typeof window === "undefined" ? EMPTY_SCENES : parseScenes(window.localStorage.getItem(STORAGE_KEY))
  ));

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes));
  }, [scenes]);

  const captureScene = useCallback((input: CaptureSceneInput) => {
    setScenes((current) => current.map((scene) => (
      scene.slot === input.slot
        ? {
            slot: input.slot,
            title: `Scene ${input.slot}`,
            pattern: input.pattern,
            sourceMode: input.sourceMode,
            sourceLabel: input.sourceLabel,
            sourceTarget: input.sourceTarget,
            sourcePath: input.sourcePath,
            remoteSource: input.remoteSource,
            sampleNames: input.sampleNames,
            capturedAt: Date.now(),
          }
        : scene
    )));
  }, []);

  const clearScene = useCallback((slot: number) => {
    setScenes((current) => current.map((scene) => (
      scene.slot === slot ? EMPTY_SCENES[slot - 1] ?? scene : scene
    )));
  }, []);

  return { scenes, captureScene, clearScene };
}
