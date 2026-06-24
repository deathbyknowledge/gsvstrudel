import type { LoadedSampleMap, SourceMode, StrudelDevice } from "../types";

type Props = {
  devices: StrudelDevice[];
  mode: SourceMode;
  target: string;
  mapPath: string;
  sourceUrl: string;
  loadingMap: boolean;
  loadedMap: LoadedSampleMap | null;
  sourceWarning: string;
  sourceLabel: string;
  onModeChange(mode: SourceMode): void;
  onTargetChange(target: string): void;
  onMapPathChange(path: string): void;
  onSourceUrlChange(url: string): void;
  onLoadMap(): void;
  onLaunch(): void;
};

export function SourcePanel({
  devices,
  mode,
  target,
  mapPath,
  sourceUrl,
  loadingMap,
  loadedMap,
  sourceWarning,
  sourceLabel,
  onModeChange,
  onTargetChange,
  onMapPathChange,
  onSourceUrlChange,
  onLoadMap,
  onLaunch,
}: Props) {
  const sourceReady = sourceWarning.trim().length === 0;

  return (
    <aside className="source-panel" aria-label="Sound sources">
      <div className="source-panel__header">
        <h1>Strudel Live</h1>
        <span className={sourceReady ? "source-status is-ready" : "source-status is-warning"}>
          {sourceReady ? "ready" : "check source"}
        </span>
      </div>

      <div className="segmented-control" role="tablist" aria-label="Source mode">
        <button
          type="button"
          className={mode === "target-map" ? "is-active" : ""}
          onClick={() => onModeChange("target-map")}
        >
          Target map
        </button>
        <button
          type="button"
          className={mode === "url" ? "is-active" : ""}
          onClick={() => onModeChange("url")}
        >
          URL
        </button>
      </div>

      {mode === "target-map" ? (
        <div className="source-form">
          <label>
            <span>Target</span>
            <select value={target} onChange={(event) => onTargetChange(event.currentTarget.value)}>
              <option value="gsv">Kernel (gsv)</option>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId} disabled={!device.online}>
                  {device.label === device.deviceId ? device.deviceId : `${device.label} · ${device.deviceId}`}
                  {device.online ? "" : " · offline"}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>strudel.json</span>
            <input
              value={mapPath}
              spellcheck={false}
              onInput={(event) => onMapPathChange(event.currentTarget.value)}
            />
          </label>

          <button type="button" className="primary-action" onClick={onLoadMap} disabled={loadingMap}>
            {loadingMap ? "Loading" : "Load map"}
          </button>

          <dl className="source-facts">
            <div>
              <dt>Loaded</dt>
              <dd>{loadedMap ? `${loadedMap.sampleCount} sounds` : "none"}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd title={sourceLabel}>{sourceLabel}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="source-form">
          <label>
            <span>Sample source</span>
            <input
              value={sourceUrl}
              spellcheck={false}
              onInput={(event) => onSourceUrlChange(event.currentTarget.value)}
            />
          </label>
          <dl className="source-facts">
            <div>
              <dt>Source</dt>
              <dd title={sourceLabel}>{sourceLabel}</dd>
            </div>
          </dl>
        </div>
      )}

      {sourceWarning ? <p className="source-warning">{sourceWarning}</p> : null}

      <button type="button" className="launch-action" onClick={onLaunch}>
        Launch session
      </button>
    </aside>
  );
}
