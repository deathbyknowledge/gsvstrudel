import { PanelTitle } from "./ui/Controls";

type Props = {
  pattern: string;
  sessionCode: string;
  runtimeError: string;
  copyState: "idle" | "copied" | "failed";
  onPatternChange(pattern: string): void;
};

export function EditorPane({ copyState, onPatternChange, pattern, runtimeError, sessionCode }: Props) {
  return (
    <section className="editor-pane">
      <PanelTitle meta={copyState === "idle" ? `${sessionCode.length} chars` : copyState}>
        Pattern
      </PanelTitle>
      <textarea
        aria-label="Strudel pattern"
        className="pattern-editor"
        onInput={(event) => onPatternChange(event.currentTarget.value)}
        spellcheck={false}
        value={pattern}
      />
      {runtimeError ? <p className="inline-error">{runtimeError}</p> : null}
    </section>
  );
}
