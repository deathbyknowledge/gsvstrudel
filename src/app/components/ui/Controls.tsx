import type { ComponentChildren } from "preact";

type ButtonProps = {
  children: ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
};

type FieldProps = {
  label: string;
  children: ComponentChildren;
  hint?: string;
};

type StatusPillProps = {
  tone?: "neutral" | "good" | "warn" | "bad";
  children: ComponentChildren;
};

export function Button({ children, disabled, kind = "secondary", onClick, type = "button" }: ButtonProps) {
  return (
    <button
      className={`gsv-button gsv-button--${kind}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function IconButton({ children, disabled, kind = "secondary", onClick, type = "button" }: ButtonProps) {
  return (
    <button
      className={`gsv-icon-button gsv-button--${kind}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function Field({ children, hint, label }: FieldProps) {
  return (
    <label className="gsv-field">
      <span className="gsv-field__label">{label}</span>
      {children}
      {hint ? <span className="gsv-field__hint">{hint}</span> : null}
    </label>
  );
}

export function StatusPill({ children, tone = "neutral" }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

export function PanelTitle({ children, meta }: { children: ComponentChildren; meta?: ComponentChildren }) {
  return (
    <div className="panel-title">
      <h2>{children}</h2>
      {meta ? <span>{meta}</span> : null}
    </div>
  );
}
