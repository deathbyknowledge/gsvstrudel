import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  defaultPrebake,
  getAudioContext,
  initAudioOnFirstClick,
  miniAllStrings,
  repl,
  transpiler,
  webaudioOutput,
} from "@strudel/web";
import type { StrudelRuntimeRepl } from "@strudel/web";
import { normalizeStrudelCode } from "../domain/strudel";
import type { RuntimeState } from "../types";

type RuntimeApi = {
  runtime: RuntimeState;
  play(code: string): Promise<void>;
  stop(): void;
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useStrudelRuntime(): RuntimeApi {
  const initRef = useRef<Promise<void> | null>(null);
  const replRef = useRef<StrudelRuntimeRepl | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState>({
    status: "idle",
    errorText: "",
    lastEvaluatedAt: null,
  });

  const ensureInitialized = useCallback(async () => {
    if (!initRef.current) {
      setRuntime((current) => ({ ...current, status: "initializing", errorText: "" }));
      initRef.current = new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error("Strudel did not finish initializing."));
        }, 20_000);
        try {
          initAudioOnFirstClick();
          miniAllStrings();
          replRef.current = repl({
            getTime: () => getAudioContext().currentTime,
            defaultOutput: webaudioOutput,
            transpiler: (code) => transpiler(normalizeStrudelCode(code)),
            onToggle: (started) => {
              setRuntime((current) => ({
                ...current,
                status: started ? "playing" : "stopped",
              }));
            },
            onEvalError: (error) => {
              setRuntime((current) => ({
                ...current,
                status: "error",
                errorText: errorText(error),
              }));
            },
            onSchedulerError: (error) => {
              setRuntime((current) => ({
                ...current,
                status: "error",
                errorText: errorText(error),
              }));
            },
          });
          void defaultPrebake()
            .then(() => {
              window.clearTimeout(timeout);
              resolve();
            })
            .catch((error) => {
              window.clearTimeout(timeout);
              replRef.current = null;
              reject(error);
            });
        } catch (error) {
          window.clearTimeout(timeout);
          replRef.current = null;
          reject(error);
        }
      });
    }
    try {
      await initRef.current;
    } catch (error) {
      initRef.current = null;
      replRef.current = null;
      throw error;
    }
  }, []);

  const play = useCallback(async (code: string) => {
    try {
      await ensureInitialized();
      const runner = replRef.current;
      if (!runner) {
        throw new Error("Strudel runtime did not initialize.");
      }
      setRuntime((current) => ({ ...current, status: "evaluating", errorText: "" }));
      const pattern = await runner.evaluate(code, true, true);
      if (runner.state.evalError || runner.state.schedulerError) {
        throw runner.state.evalError ?? runner.state.schedulerError;
      }
      if (!pattern) {
        throw new Error("Strudel did not return a playable pattern.");
      }
      setRuntime({
        status: "playing",
        errorText: "",
        lastEvaluatedAt: Date.now(),
      });
    } catch (error) {
      setRuntime((current) => ({
        ...current,
        status: "error",
        errorText: errorText(error),
      }));
    }
  }, [ensureInitialized]);

  const stop = useCallback(() => {
    if (!initRef.current) {
      setRuntime((current) => ({ ...current, status: "stopped", errorText: "" }));
      return;
    }
    try {
      replRef.current?.stop();
      setRuntime((current) => ({ ...current, status: "stopped", errorText: "" }));
    } catch (error) {
      setRuntime((current) => ({
        ...current,
        status: "error",
        errorText: errorText(error),
      }));
    }
  }, []);

  useEffect(() => () => {
    try {
      replRef.current?.stop();
    } catch {
      // Strudel may never have initialized; unmount cleanup should stay silent.
    }
  }, []);

  return { runtime, play, stop };
}
