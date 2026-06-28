import { summarizeSamples } from "../domain/strudel";
import type { StageSamplePackResult } from "../types";
import { PanelTitle, StatusPill } from "./ui/Controls";

type Props = {
  sampleNames: string[];
  stageResult: StageSamplePackResult | null;
  sessionCode: string;
};

export function InspectorPanel({ sampleNames, sessionCode, stageResult }: Props) {
  return (
    <section className="inspector-panel">
      <PanelTitle meta={`${sampleNames.length} names`}>Inspector</PanelTitle>
      <div className="inspector-panel__group">
        <div className="mini-heading">Samples</div>
        <p>{summarizeSamples(sampleNames)}</p>
      </div>
      {stageResult?.ok === true ? (
        <div className="inspector-panel__group">
          <div className="mini-heading">Staged pack</div>
          <div className="metric-row">
            <StatusPill tone="good">{stageResult.copiedFiles.length} copied</StatusPill>
            <StatusPill tone={stageResult.skippedFiles.length ? "warn" : "neutral"}>
              {stageResult.skippedFiles.length} skipped
            </StatusPill>
          </div>
          <code>{stageResult.stagedMapPath}</code>
        </div>
      ) : null}
      {stageResult?.ok === false ? (
        <div className="inspector-panel__group">
          <div className="mini-heading">Import failed</div>
          <p className="inline-error">{stageResult.errorText}</p>
        </div>
      ) : null}
      <details className="session-code">
        <summary>Session code</summary>
        <pre>{sessionCode}</pre>
      </details>
    </section>
  );
}
