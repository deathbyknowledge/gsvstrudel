import type { GeneratePatternIntent, GeneratePatternResult } from "../types";

type Props = {
  intent: GeneratePatternIntent;
  prompt: string;
  generating: boolean;
  result: GeneratePatternResult | null;
  onIntentChange(intent: GeneratePatternIntent): void;
  onPromptChange(prompt: string): void;
  onGenerate(): void;
  onApply(): void;
};

export function AiPanel({
  intent,
  prompt,
  generating,
  result,
  onIntentChange,
  onPromptChange,
  onGenerate,
  onApply,
}: Props) {
  const hasSuggestion = result?.ok === true && result.code.trim().length > 0;

  return (
    <section className="ai-panel" aria-label="AI co-producer">
      <div className="ai-panel__bar">
        <h2>AI co-producer</h2>
        <select value={intent} onChange={(event) => onIntentChange(event.currentTarget.value as GeneratePatternIntent)}>
          <option value="variation">Variation</option>
          <option value="new">New pattern</option>
          <option value="add-layer">Add layer</option>
          <option value="simplify">Simplify</option>
        </select>
      </div>
      <textarea
        className="ai-prompt"
        value={prompt}
        spellcheck={true}
        placeholder="Describe the musical move..."
        onInput={(event) => onPromptChange(event.currentTarget.value)}
      />
      <div className="ai-panel__actions">
        <button type="button" className="primary-action" onClick={onGenerate} disabled={generating || prompt.trim().length === 0}>
          {generating ? "Generating" : "Generate"}
        </button>
        <button type="button" onClick={onApply} disabled={!hasSuggestion}>
          Apply
        </button>
      </div>
      {result ? (
        result.ok ? (
          <div className="ai-result">
            <strong>{result.title || "Suggestion"}</strong>
            <p>{result.notes}</p>
          </div>
        ) : (
          <p className="ai-error">{result.errorText}</p>
        )
      ) : null}
    </section>
  );
}
