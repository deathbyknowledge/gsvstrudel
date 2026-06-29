import { render } from "preact";
import { getBackend, setAppError, setAppReady } from "@humansandmachines/gsv/sdk";
import { App } from "./app";
import type { StrudelBackend } from "./types";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Strudel Live app root element not found.");
}

void getBackend<StrudelBackend>()
  .then((backend) => {
    render(<App backend={backend} />, root);
    setAppReady();
  })
  .catch((error) => {
    setAppError(error);
    root.innerHTML = `<pre style="padding:16px; color:#b42318; white-space:pre-wrap;">${String(error instanceof Error ? error.message : error)}</pre>`;
  });
