import { useCallback, useEffect, useState } from "preact/hooks";
import type { StrudelBackend, StrudelState } from "../types";

export type StrudelStateResource = {
  state: StrudelState | null;
  loading: boolean;
  errorText: string;
  reload(): Promise<void>;
};

export function useStrudelState(backend: StrudelBackend): StrudelStateResource {
  const [state, setState] = useState<StrudelState | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setErrorText("");
    try {
      const next = await backend.loadState({});
      setState(next);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorText("");
    void backend.loadState({})
      .then((next) => {
        if (!cancelled) {
          setState(next);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  return { state, loading, errorText, reload };
}
