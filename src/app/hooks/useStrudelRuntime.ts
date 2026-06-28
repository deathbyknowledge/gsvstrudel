import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { evaluate, hush, initStrudel } from "@strudel/web";
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
  const initRef = useRef<Promise<unknown> | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState>({
    status: "idle",
    errorText: "",
    lastEvaluatedAt: null,
  });

  const ensureInitialized = useCallback(async () => {
    if (!initRef.current) {
      setRuntime((current) => ({ ...current, status: "initializing", errorText: "" }));
      initRef.current = initStrudel({
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
    }
    await initRef.current;
  }, []);

  const play = useCallback(async (code: string) => {
    try {
      await ensureInitialized();
      setRuntime((current) => ({ ...current, status: "evaluating", errorText: "" }));
      await evaluate(code, true);
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
      hush();
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
      hush();
    } catch {
      // Strudel may never have initialized; unmount cleanup should stay silent.
    }
  }, []);

  return { runtime, play, stop };
}
