import { definePackage } from "@humansandmachines/gsv/sdk/manifest";

export default definePackage({
  meta: {
    displayName: "Strudel Live",
    description: "Live-coded browser music with target-aware Strudel sample maps.",
    window: {
      width: 1280,
      height: 820,
      minWidth: 920,
      minHeight: 620,
    },
    capabilities: {
      kernel: ["sys.device.list", "fs.read", "proc.spawn", "proc.send", "proc.history", "proc.kill"],
      outbound: ["https://strudel.cc", "https://raw.githubusercontent.com"],
    },
  },
  browser: {
    entry: "./src/app/main.tsx",
    assets: [
      "./src/styles.css",
      "./src/styles/base.css",
      "./src/styles/layout.css",
      "./src/styles/source-panel.css",
      "./src/styles/assistant.css",
      "./src/styles/editor.css",
      "./src/styles/responsive.css",
    ],
  },
  backend: {
    entry: "./src/backend.ts",
  },
});
