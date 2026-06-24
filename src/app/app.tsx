import { useCallback, useMemo, useState } from "preact/hooks";
import { AiPanel } from "./components/AiPanel";
import { EditorPane } from "./components/EditorPane";
import { PreviewFrame } from "./components/PreviewFrame";
import { SourcePanel } from "./components/SourcePanel";
import {
  DEFAULT_PATTERN,
  DEFAULT_SOURCE_URL,
  buildSessionCode,
  buildStrudelUrl,
  sourcePreludeFromMap,
  sourcePreludeFromUrl,
} from "./domain/strudel";
import { useStrudelState } from "./hooks/useStrudelState";
import type { GeneratePatternIntent, GeneratePatternResult, LoadedSampleMap, SourceMode, StrudelBackend } from "./types";

type Props = {
  backend: StrudelBackend;
};

function browserOrigin(): string {
  return window.location.origin;
}

function sampleNamesFromMap(map: LoadedSampleMap | null): string[] {
  if (!map) {
    return [];
  }
  return Object.keys(map.map)
    .filter((key) => key !== "_base" && !key.startsWith("_"))
    .slice(0, 48);
}

export function App({ backend }: Props) {
  const state = useStrudelState(backend);
  const [mode, setMode] = useState<SourceMode>("url");
  const [target, setTarget] = useState("gsv");
  const [mapPath, setMapPath] = useState("/public/strudel/strudel.json");
  const [sourceUrl, setSourceUrl] = useState(DEFAULT_SOURCE_URL);
  const [pattern, setPattern] = useState(DEFAULT_PATTERN);
  const [loadedMap, setLoadedMap] = useState<LoadedSampleMap | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [sourceErrorText, setSourceErrorText] = useState("");
  const [frameCode, setFrameCode] = useState(() => (
    buildSessionCode(DEFAULT_PATTERN, sourcePreludeFromUrl(DEFAULT_SOURCE_URL, browserOrigin()))
  ));
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [aiIntent, setAiIntent] = useState<GeneratePatternIntent>("variation");
  const [aiPrompt, setAiPrompt] = useState("Make it tighter and more hypnotic, with a small bass movement.");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<GeneratePatternResult | null>(null);

  const devices = state.state?.devices ?? [];
  const sourcePrelude = useMemo(() => (
    mode === "target-map"
      ? sourcePreludeFromMap(loadedMap, browserOrigin())
      : sourcePreludeFromUrl(sourceUrl, browserOrigin())
  ), [loadedMap, mode, sourceUrl]);
  const sourceWarning = sourceErrorText || sourcePrelude.warningText;
  const sessionCode = useMemo(() => buildSessionCode(pattern, sourcePrelude), [pattern, sourcePrelude]);
  const frameUrl = useMemo(() => buildStrudelUrl(frameCode), [frameCode]);
  const sampleNames = useMemo(() => (
    mode === "target-map" ? sampleNamesFromMap(loadedMap) : []
  ), [loadedMap, mode]);

  const loadMap = useCallback(async () => {
    setLoadingMap(true);
    setSourceErrorText("");
    try {
      const result = await backend.loadSampleMap({ target, path: mapPath });
      if (result.ok) {
        setLoadedMap(result);
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

  const launch = useCallback(() => {
    setFrameCode(sessionCode);
  }, [sessionCode]);

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

  const applyStateDefaults = useCallback(() => {
    if (!state.state) {
      return;
    }
    setTarget(state.state.defaultTarget);
    setMapPath(state.state.defaultMapPath);
  }, [state.state]);

  const generatePattern = useCallback(async () => {
    setAiGenerating(true);
    setAiResult(null);
    try {
      const result = await backend.generatePattern({
        intent: aiIntent,
        prompt: aiPrompt,
        currentPattern: pattern,
        sourceLabel: sourcePrelude.label,
        sampleNames,
      });
      setAiResult(result);
    } catch (error) {
      setAiResult({ ok: false, errorText: error instanceof Error ? error.message : String(error) });
    } finally {
      setAiGenerating(false);
    }
  }, [aiIntent, aiPrompt, backend, pattern, sampleNames, sourcePrelude.label]);

  const applyAiSuggestion = useCallback(() => {
    if (aiResult?.ok !== true) {
      return;
    }
    setPattern(aiResult.code);
  }, [aiResult]);

  return (
    <main className="strudel-app">
      <SourcePanel
        devices={devices}
        mode={mode}
        target={target}
        mapPath={mapPath}
        sourceUrl={sourceUrl}
        loadingMap={loadingMap}
        loadedMap={loadedMap}
        sourceWarning={sourceWarning}
        sourceLabel={sourcePrelude.label}
        onModeChange={setMode}
        onTargetChange={setTarget}
        onMapPathChange={setMapPath}
        onSourceUrlChange={setSourceUrl}
        onLoadMap={loadMap}
        onLaunch={launch}
      />
      <div className="workspace">
        <div className="workspace__topbar">
          <span>{state.loading ? "loading targets" : `${devices.length + 1} targets`}</span>
          {state.errorText || state.state?.deviceErrorText ? (
            <button type="button" onClick={() => void state.reload()}>Retry targets</button>
          ) : (
            <button type="button" onClick={applyStateDefaults}>Reset source</button>
          )}
          <span className={`copy-state copy-state--${copyState}`}>
            {copyState === "copied" ? "copied" : copyState === "failed" ? "copy failed" : ""}
          </span>
        </div>
        {state.errorText || state.state?.deviceErrorText ? (
          <p className="app-warning">{state.errorText || state.state?.deviceErrorText}</p>
        ) : null}
        <div className="workspace__body">
          <div className="composition-column">
            <AiPanel
              intent={aiIntent}
              prompt={aiPrompt}
              generating={aiGenerating}
              result={aiResult}
              onIntentChange={setAiIntent}
              onPromptChange={setAiPrompt}
              onGenerate={generatePattern}
              onApply={applyAiSuggestion}
            />
            <EditorPane
              pattern={pattern}
              sessionCode={sessionCode}
              onPatternChange={setPattern}
              onCopyCode={copyCode}
            />
          </div>
          <PreviewFrame url={frameUrl} />
        </div>
      </div>
    </main>
  );
}
