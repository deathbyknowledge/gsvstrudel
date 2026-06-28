import { useCallback, useState } from "preact/hooks";
import { EMPTY_SCENES } from "../domain/strudel";
import type { SourceMode, WorkspaceScene } from "../types";

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

function createEmptyScenes(): WorkspaceScene[] {
  return EMPTY_SCENES.map((scene) => ({
    ...scene,
    sampleNames: [...scene.sampleNames],
  }));
}

export function useWorkspaceScenes(): WorkspaceScenesApi {
  const [scenes, setScenes] = useState<WorkspaceScene[]>(createEmptyScenes);

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
    const emptyScene = createEmptyScenes()[slot - 1];
    setScenes((current) => current.map((scene) => (
      scene.slot === slot ? emptyScene ?? scene : scene
    )));
  }, []);

  return { scenes, captureScene, clearScene };
}
