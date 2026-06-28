import type {
  LoadedSampleMap,
  SourceMode,
  StagedSamplePack,
  StageSamplePackResult,
  StrudelDevice,
} from "../types";
import { Button, Field, PanelTitle, StatusPill } from "./ui/Controls";

type Props = {
  devices: StrudelDevice[];
  mode: SourceMode;
  target: string;
  mapPath: string;
  remoteSource: string;
  packLabel: string;
  loadingMap: boolean;
  stagingPack: boolean;
  loadedMap: LoadedSampleMap | null;
  stagedPack: StagedSamplePack | null;
  stageResult: StageSamplePackResult | null;
  sourceWarning: string;
  onModeChange(mode: SourceMode): void;
  onTargetChange(target: string): void;
  onMapPathChange(path: string): void;
  onRemoteSourceChange(source: string): void;
  onPackLabelChange(label: string): void;
  onLoadMap(): void;
  onStagePack(): void;
};

export function SourcePanel({
  devices,
  loadedMap,
  loadingMap,
  mapPath,
  mode,
  onLoadMap,
  onMapPathChange,
  onModeChange,
  onPackLabelChange,
  onRemoteSourceChange,
  onStagePack,
  onTargetChange,
  packLabel,
  remoteSource,
  sourceWarning,
  stagedPack,
  stageResult,
  stagingPack,
  target,
}: Props) {
  const onlineDevices = devices.filter((device) => device.online);
  return (
    <aside className="source-panel">
      <PanelTitle meta={`${onlineDevices.length}/${devices.length} online`}>Sources</PanelTitle>

      <div className="mode-switch" role="group" aria-label="Sample source">
        <button
          className={mode === "remote" ? "is-active" : ""}
          onClick={() => onModeChange("remote")}
          type="button"
        >
          Remote
        </button>
        <button
          className={mode === "map" ? "is-active" : ""}
          onClick={() => onModeChange("map")}
          type="button"
        >
          Map
        </button>
        <button
          className={mode === "staged" ? "is-active" : ""}
          onClick={() => onModeChange("staged")}
          type="button"
        >
          Staged
        </button>
      </div>

      <section className="source-panel__section">
        <Field label="Remote source" hint="HTTP(S), github:, or shabda:">
          <input
            className="gsv-input"
            onInput={(event) => onRemoteSourceChange(event.currentTarget.value)}
            value={remoteSource}
          />
        </Field>
        <Button kind={mode === "remote" ? "primary" : "secondary"} onClick={() => onModeChange("remote")}>
          Use remote
        </Button>
      </section>

      <section className="source-panel__section">
        <Field label="Target">
          <select
            className="gsv-select"
            onChange={(event) => onTargetChange(event.currentTarget.value)}
            value={target}
          >
            <option value="gsv">gsv</option>
            {devices.map((device) => (
              <option disabled={!device.online} key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="strudel.json">
          <input
            className="gsv-input"
            onInput={(event) => onMapPathChange(event.currentTarget.value)}
            value={mapPath}
          />
        </Field>
        <div className="button-row">
          <Button disabled={loadingMap} onClick={onLoadMap}>
            {loadingMap ? "Loading" : "Load map"}
          </Button>
          <Button disabled={stagingPack} kind="primary" onClick={onStagePack}>
            {stagingPack ? "Staging" : "Stage pack"}
          </Button>
        </div>
      </section>

      <section className="source-panel__section">
        <Field label="Pack label">
          <input
            className="gsv-input"
            onInput={(event) => onPackLabelChange(event.currentTarget.value)}
            value={packLabel}
          />
        </Field>
        {loadedMap ? (
          <div className="source-summary">
            <StatusPill tone="good">{loadedMap.sampleCount} samples</StatusPill>
            <span>{loadedMap.target}:{loadedMap.path}</span>
          </div>
        ) : null}
        {stagedPack ? (
          <div className="source-summary">
            <StatusPill tone="good">{stagedPack.copiedFiles.length} copied</StatusPill>
            <span>{stagedPack.stagedMapPath}</span>
          </div>
        ) : null}
        {stageResult?.ok === false ? (
          <p className="inline-error">{stageResult.errorText}</p>
        ) : null}
        {sourceWarning ? <p className="inline-warning">{sourceWarning}</p> : null}
      </section>

      <section className="source-panel__section source-panel__devices">
        <div className="mini-heading">Connected targets</div>
        {devices.length === 0 ? (
          <p className="muted">Only the GSV filesystem is available.</p>
        ) : devices.map((device) => (
          <button
            className={`device-row ${target === device.deviceId ? "is-selected" : ""}`}
            disabled={!device.online}
            key={device.deviceId}
            onClick={() => onTargetChange(device.deviceId)}
            type="button"
          >
            <span>{device.label}</span>
            <StatusPill tone={device.online ? "good" : "bad"}>{device.online ? "online" : "offline"}</StatusPill>
          </button>
        ))}
      </section>
    </aside>
  );
}
