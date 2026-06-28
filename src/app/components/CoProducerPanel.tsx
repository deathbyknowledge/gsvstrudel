import type { CoProducerSession } from "../types";
import { Button, PanelTitle, StatusPill } from "./ui/Controls";

type Props = {
  session: CoProducerSession | null;
  prompt: string;
  busy: boolean;
  errorText: string;
  suggestedCode: string;
  onPromptChange(prompt: string): void;
  onStart(): void;
  onSend(): void;
  onRefresh(): void;
  onApplySuggestedCode(): void;
};

export function CoProducerPanel({
  busy,
  errorText,
  onApplySuggestedCode,
  onPromptChange,
  onRefresh,
  onSend,
  onStart,
  prompt,
  session,
  suggestedCode,
}: Props) {
  const running = Boolean(session?.pid);
  return (
    <section className="coproducer-panel">
      <PanelTitle meta={<StatusPill tone={running ? "good" : "neutral"}>{running ? "linked" : "idle"}</StatusPill>}>
        Co-producer
      </PanelTitle>

      <div className="coproducer-panel__actions">
        <Button disabled={busy || running} kind="primary" onClick={onStart}>
          Start profile
        </Button>
        <Button disabled={busy || !running} onClick={onRefresh}>
          Refresh
        </Button>
        <Button disabled={!suggestedCode} onClick={onApplySuggestedCode}>
          Apply block
        </Button>
      </div>

      <textarea
        className="coproducer-prompt"
        onInput={(event) => onPromptChange(event.currentTarget.value)}
        placeholder="Ask for a counter-rhythm, breakdown, transition, or harmonic move."
        value={prompt}
      />
      <Button disabled={busy || !running || !prompt.trim()} kind="primary" onClick={onSend}>
        Send context
      </Button>

      {errorText ? <p className="inline-error">{errorText}</p> : null}

      <div className="coproducer-transcript">
        {session?.messages.length ? session.messages.map((message) => (
          <article className={`message message--${message.role}`} key={message.id}>
            <span>{message.role}</span>
            <p>{message.text}</p>
          </article>
        )) : (
          <p className="muted">
            Start the package profile and send the current pattern when you want a collaborator.
          </p>
        )}
      </div>
    </section>
  );
}
