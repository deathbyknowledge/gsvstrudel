import type { RuntimeState } from "../types";
import { Button, StatusPill } from "./ui/Controls";

type Props = {
  runtime: RuntimeState;
  sourceLabel: string;
  sampleCount: number;
  onPlay(): void;
  onStop(): void;
  onCopy(): void;
};

function runtimeTone(status: RuntimeState["status"]): "neutral" | "good" | "warn" | "bad" {
  if (status === "playing") {
    return "good";
  }
  if (status === "error") {
    return "bad";
  }
  if (status === "initializing" || status === "evaluating") {
    return "warn";
  }
  return "neutral";
}

export function TransportBar({ onCopy, onPlay, onStop, runtime, sampleCount, sourceLabel }: Props) {
  return (
    <div className="transport-bar">
      <div className="transport-bar__status">
        <StatusPill tone={runtimeTone(runtime.status)}>{runtime.status}</StatusPill>
        <span className="transport-bar__source">{sourceLabel}</span>
        <span>{sampleCount} samples</span>
      </div>
      <div className="transport-bar__actions">
        <Button disabled={runtime.status === "initializing" || runtime.status === "evaluating"} kind="primary" onClick={onPlay}>
          Play
        </Button>
        <Button onClick={onStop}>Stop</Button>
        <Button onClick={onCopy}>Copy code</Button>
      </div>
    </div>
  );
}
