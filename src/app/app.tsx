import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { CoProducerPanel } from "./components/CoProducerPanel";
import { EditorPane } from "./components/EditorPane";
import { InspectorPanel } from "./components/InspectorPanel";
import { SceneSlots } from "./components/SceneSlots";
import { SourcePanel } from "./components/SourcePanel";
import { TransportBar } from "./components/TransportBar";
import {
  DEFAULT_MAP_PATH,
  DEFAULT_PATTERN,
  DEFAULT_REMOTE_SOURCE,
  buildSessionCode,
  sourcePreludeFromMap,
  sourcePreludeFromRemote,
  sourcePreludeFromStagedPack,
} from "./domain/strudel";
import { useStrudelRuntime } from "./hooks/useStrudelRuntime";
import { useStrudelState } from "./hooks/useStrudelState";
import { useWorkspaceScenes } from "./hooks/useWorkspaceScenes";
import type {
  CoProducerMessage,
  CoProducerSession,
  LoadedSampleMap,
  SourceMode,
  StageSamplePackResult,
  StagedSamplePack,
  StrudelBackend,
  WorkspaceScene,
} from "./types";

type Props = {
  backend: StrudelBackend;
};

function browserOrigin(): string {
  return window.location.origin;
}

function extractLatestCodeBlock(messages: CoProducerMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") {
      continue;
    }
    const matches = [...message.text.matchAll(/```(?:strudel|js|javascript)?\s*([\s\S]*?)```/gi)];
    const latest = matches.at(-1)?.[1]?.trim();
    if (latest) {
      return latest;
    }
  }
  return "";
}

export function App({ backend }: Props) {
  const state = useStrudelState(backend);
  const runtime = useStrudelRuntime();
  const workspace = useWorkspaceScenes();

  const [mode, setMode] = useState<SourceMode>("remote");
  const [target, setTarget] = useState("gsv");
  const [mapPath, setMapPath] = useState(DEFAULT_MAP_PATH);
  const [remoteSource, setRemoteSource] = useState(DEFAULT_REMOTE_SOURCE);
  const [packLabel, setPackLabel] = useState("Live pack");
  const [pattern, setPattern] = useState(DEFAULT_PATTERN);
  const [loadedMap, setLoadedMap] = useState<LoadedSampleMap | null>(null);
  const [stagedPack, setStagedPack] = useState<StagedSamplePack | null>(null);
  const [stageResult, setStageResult] = useState<StageSamplePackResult | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [stagingPack, setStagingPack] = useState(false);
  const [sourceErrorText, setSourceErrorText] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [coProducer, setCoProducer] = useState<CoProducerSession | null>(null);
  const [coPrompt, setCoPrompt] = useState("Give me a sharper B section that keeps the kick stable.");
  const [coBusy, setCoBusy] = useState(false);
  const [coErrorText, setCoErrorText] = useState("");

  const devices = state.state?.devices ?? [];
  const sourcePrelude = useMemo(() => {
    if (mode === "map") {
      return sourcePreludeFromMap(loadedMap, browserOrigin());
    }
    if (mode === "staged") {
      return sourcePreludeFromStagedPack(stagedPack, browserOrigin());
    }
    return sourcePreludeFromRemote(remoteSource);
  }, [loadedMap, mode, remoteSource, stagedPack]);
  const sourceWarning = sourceErrorText || sourcePrelude.warningText;
  const sessionCode = useMemo(() => buildSessionCode(pattern, sourcePrelude), [pattern, sourcePrelude]);
  const suggestedCode = useMemo(() => extractLatestCodeBlock(coProducer?.messages ?? []), [coProducer]);

  const loadMap = useCallback(async () => {
    setLoadingMap(true);
    setSourceErrorText("");
    try {
      const result = await backend.loadSampleMap({ target, path: mapPath });
      if (result.ok) {
        setLoadedMap(result);
        setMode("map");
      } else {
        setLoadedMap(null);
        setSourceErrorText(result.errorText);
      }
    } catch (error) {
      setLoadedMap(null);
      setSourceErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingMap(false);
    }
  }, [backend, mapPath, target]);

  const stagePack = useCallback(async () => {
    setStagingPack(true);
    setSourceErrorText("");
    setStageResult(null);
    try {
      const result = await backend.stageSamplePack({ target, mapPath, packLabel });
      setStageResult(result);
      if (result.ok) {
        setStagedPack(result);
        setLoadedMap({
          ok: true,
          target: "gsv",
          path: result.stagedMapPath,
          map: result.map,
          sampleCount: result.sampleCount,
          sampleNames: result.sampleNames,
        });
        setMapPath(result.stagedMapPath);
        setTarget("gsv");
        setMode("staged");
      } else {
        setSourceErrorText(result.errorText);
      }
    } catch (error) {
      setSourceErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setStagingPack(false);
    }
  }, [backend, mapPath, packLabel, target]);

  const copyCode = useCallback(() => {
    setCopyState("idle");
    void navigator.clipboard.writeText(sessionCode)
      .then(() => {
        setCopyState("copied");
        window.setTimeout(() => setCopyState("idle"), 1400);
      })
      .catch(() => {
        setCopyState("failed");
        window.setTimeout(() => setCopyState("idle"), 1800);
      });
  }, [sessionCode]);

  const play = useCallback(() => {
    void runtime.play(sessionCode);
  }, [runtime, sessionCode]);

  const startCoProducer = useCallback(async () => {
    setCoBusy(true);
    setCoErrorText("");
    try {
      const result = await backend.startCoProducer({
        pattern,
        sourceLabel: sourcePrelude.label,
        sampleNames: sourcePrelude.sampleNames,
      });
      if (!result.ok) {
        setCoErrorText(result.errorText);
        return;
      }
      setCoProducer({
        pid: result.pid,
        label: result.label,
        messages: result.messages,
      });
    } catch (error) {
      setCoErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setCoBusy(false);
    }
  }, [backend, pattern, sourcePrelude.label, sourcePrelude.sampleNames]);

  const refreshCoProducer = useCallback(async () => {
    if (!coProducer?.pid) {
      return;
    }
    setCoErrorText("");
    const result = await backend.readCoProducer({ pid: coProducer.pid });
    if (!result.ok) {
      setCoErrorText(result.errorText);
      return;
    }
    setCoProducer((current) => current && current.pid === result.pid
      ? {
          ...current,
          activeRunId: result.activeRunId,
          messages: result.messages,
        }
      : current);
  }, [backend, coProducer?.pid]);

  const sendCoProducer = useCallback(async () => {
    if (!coProducer?.pid) {
      return;
    }
    setCoBusy(true);
    setCoErrorText("");
    try {
      const result = await backend.sendCoProducer({
        pid: coProducer.pid,
        prompt: coPrompt,
        pattern,
        sourceLabel: sourcePrelude.label,
        sampleNames: sourcePrelude.sampleNames,
      });
      if (!result.ok) {
        setCoErrorText(result.errorText);
        return;
      }
      setCoProducer((current) => current
        ? { ...current, runId: result.runId, activeRunId: result.runId }
        : current);
      window.setTimeout(() => void refreshCoProducer(), 1200);
    } catch (error) {
      setCoErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setCoBusy(false);
    }
  }, [backend, coProducer?.pid, coPrompt, pattern, refreshCoProducer, sourcePrelude.label, sourcePrelude.sampleNames]);

  const applySuggestedCode = useCallback(() => {
    if (suggestedCode) {
      setPattern(suggestedCode);
    }
  }, [suggestedCode]);

  const captureScene = useCallback((slot: number) => {
    workspace.captureScene({
      slot,
      pattern,
      sourceMode: mode,
      sourceLabel: sourcePrelude.label,
      sourceTarget: mode === "remote" ? "gsv" : target,
      sourcePath: mode === "staged" ? stagedPack?.stagedMapPath ?? mapPath : mapPath,
      remoteSource,
      sampleNames: sourcePrelude.sampleNames,
    });
  }, [mapPath, mode, pattern, remoteSource, sourcePrelude.label, sourcePrelude.sampleNames, stagedPack, target, workspace]);

  const loadScene = useCallback((scene: WorkspaceScene) => {
    if (!scene.pattern.trim()) {
      return;
    }
    setPattern(scene.pattern);
    if (scene.sourceMode === "remote") {
      setRemoteSource(scene.remoteSource);
      setMode("remote");
      return;
    }
    setTarget(scene.sourceTarget || "gsv");
    setMapPath(scene.sourcePath);
    setMode(scene.sourceMode === "staged" ? "map" : scene.sourceMode);
    setLoadedMap(null);
    setStagedPack(null);
    if (scene.sourcePath) {
      void backend.loadSampleMap({ target: scene.sourceTarget || "gsv", path: scene.sourcePath })
        .then((result) => {
          if (result.ok) {
            setLoadedMap(result);
          } else {
            setSourceErrorText(result.errorText);
          }
        })
        .catch((error) => setSourceErrorText(error instanceof Error ? error.message : String(error)));
    }
  }, [backend]);

  useEffect(() => {
    if (!coProducer?.pid || !coProducer.activeRunId) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshCoProducer();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [coProducer?.activeRunId, coProducer?.pid, refreshCoProducer]);

  return (
    <main className="strudel-app">
      <header className="app-header">
        <div>
          <span className="app-kicker">GSV PACKAGE</span>
          <h1>Strudel Live</h1>
        </div>
        <div className="app-header__meta">
          <span>{state.loading ? "loading targets" : `${devices.length + 1} targets`}</span>
          {state.errorText || state.state?.deviceErrorText ? (
            <button type="button" onClick={() => void state.reload()}>Retry targets</button>
          ) : null}
        </div>
      </header>

      {state.errorText || state.state?.deviceErrorText ? (
        <p className="app-warning">{state.errorText || state.state?.deviceErrorText}</p>
      ) : null}

      <div className="app-grid">
        <SourcePanel
          devices={devices}
          loadedMap={loadedMap}
          loadingMap={loadingMap}
          mapPath={mapPath}
          mode={mode}
          packLabel={packLabel}
          remoteSource={remoteSource}
          sourceWarning={sourceWarning}
          stagedPack={stagedPack}
          stageResult={stageResult}
          stagingPack={stagingPack}
          target={target}
          onLoadMap={loadMap}
          onMapPathChange={setMapPath}
          onModeChange={setMode}
          onPackLabelChange={setPackLabel}
          onRemoteSourceChange={setRemoteSource}
          onStagePack={stagePack}
          onTargetChange={setTarget}
        />

        <section className="live-desk">
          <TransportBar
            runtime={runtime.runtime}
            sampleCount={sourcePrelude.sampleNames.length}
            sourceLabel={sourcePrelude.label}
            onCopy={copyCode}
            onPlay={play}
            onStop={runtime.stop}
          />
          <EditorPane
            copyState={copyState}
            pattern={pattern}
            runtimeError={runtime.runtime.errorText}
            sessionCode={sessionCode}
            onPatternChange={setPattern}
          />
          <SceneSlots
            scenes={workspace.scenes}
            onCapture={captureScene}
            onClear={workspace.clearScene}
            onLoad={loadScene}
          />
        </section>

        <aside className="right-rail">
          <CoProducerPanel
            busy={coBusy}
            errorText={coErrorText}
            prompt={coPrompt}
            session={coProducer}
            suggestedCode={suggestedCode}
            onApplySuggestedCode={applySuggestedCode}
            onPromptChange={setCoPrompt}
            onRefresh={() => void refreshCoProducer()}
            onSend={() => void sendCoProducer()}
            onStart={() => void startCoProducer()}
          />
          <InspectorPanel
            sampleNames={sourcePrelude.sampleNames}
            sessionCode={sessionCode}
            stageResult={stageResult}
          />
        </aside>
      </div>
    </main>
  );
}
