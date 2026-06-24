type Props = {
  pattern: string;
  sessionCode: string;
  onPatternChange(pattern: string): void;
  onCopyCode(): void;
};

export function EditorPane({ pattern, sessionCode, onPatternChange, onCopyCode }: Props) {
  return (
    <section className="editor-pane" aria-label="Session seed">
      <div className="editor-pane__bar">
        <h2>Seed code</h2>
        <button type="button" onClick={onCopyCode}>Copy</button>
      </div>
      <textarea
        className="pattern-editor"
        value={pattern}
        spellcheck={false}
        onInput={(event) => onPatternChange(event.currentTarget.value)}
      />
      <details className="session-code">
        <summary>Generated launch code</summary>
        <pre>{sessionCode}</pre>
      </details>
    </section>
  );
}
