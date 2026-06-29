declare module "@strudel/web" {
  export type StrudelTranspileResult = {
    output: string;
    miniLocations?: unknown[];
    widgets?: unknown[];
  };

  export type StrudelRuntimeRepl = {
    state: {
      started?: boolean;
      pending?: boolean;
      schedulerError?: Error;
      evalError?: Error;
      error?: Error;
    };
    evaluate(code: string, autostart?: boolean, shouldHush?: boolean): Promise<unknown>;
    start(): void;
    stop(): void;
    pause(): void;
    toggle(): void;
    setCps(cps: number): void;
  };

  export function defaultPrebake(): Promise<void>;
  export function getAudioContext(): AudioContext;
  export function initAudioOnFirstClick(): void;
  export function miniAllStrings(): void;
  export function repl(options: {
    defaultOutput: (hap: unknown, deadline: number, hapDuration: number, cps?: number) => void | Promise<void>;
    getTime: () => number;
    transpiler: (code: string) => StrudelTranspileResult;
    onToggle?: (started: boolean) => void;
    onEvalError?: (error: Error) => void;
    onSchedulerError?: (error: Error) => void;
  }): StrudelRuntimeRepl;
  export function transpiler(code: string): StrudelTranspileResult;
  export function webaudioOutput(
    hap: unknown,
    deadline: number,
    hapDuration: number,
    cps?: number,
  ): void | Promise<void>;
}
