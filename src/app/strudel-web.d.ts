declare module "@strudel/web" {
  export type StrudelRepl = {
    state?: {
      started?: boolean;
      pending?: boolean;
      error?: Error;
    };
    start(): void;
    stop(): void;
    pause(): void;
    toggle(): void;
    evaluate(code: string, autoplay?: boolean): Promise<unknown>;
  };

  export function initStrudel(options?: {
    prebake?: () => void | Promise<void>;
    miniAllStrings?: boolean;
    sharedWorker?: boolean;
    onToggle?: (started: boolean) => void;
    onEvalError?: (error: Error) => void;
    onSchedulerError?: (error: Error) => void;
  }): Promise<StrudelRepl>;

  export function evaluate(code: string, autoplay?: boolean): Promise<unknown>;
  export function hush(): void;
}
