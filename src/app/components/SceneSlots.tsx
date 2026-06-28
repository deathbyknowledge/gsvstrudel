import { formatTimestamp } from "../domain/strudel";
import type { WorkspaceScene } from "../types";
import { Button, IconButton, PanelTitle } from "./ui/Controls";

type Props = {
  scenes: WorkspaceScene[];
  onCapture(slot: number): void;
  onLoad(scene: WorkspaceScene): void;
  onClear(slot: number): void;
};

export function SceneSlots({ onCapture, onClear, onLoad, scenes }: Props) {
  return (
    <section className="scene-slots">
      <PanelTitle meta="local workspace">Scenes</PanelTitle>
      <div className="scene-grid">
        {scenes.map((scene) => {
          const isEmpty = scene.capturedAt === 0 || scene.pattern.trim().length === 0;
          return (
            <article className={`scene-card ${isEmpty ? "is-empty" : ""}`} key={scene.slot}>
              <div>
                <strong>{scene.title}</strong>
                <span>{formatTimestamp(scene.capturedAt)}</span>
              </div>
              <p>{isEmpty ? "Empty slot" : scene.sourceLabel || "Pattern only"}</p>
              <div className="scene-card__actions">
                <Button onClick={() => onCapture(scene.slot)}>Capture</Button>
                <Button disabled={isEmpty} kind="primary" onClick={() => onLoad(scene)}>Load</Button>
                <IconButton disabled={isEmpty} onClick={() => onClear(scene.slot)}>x</IconButton>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
