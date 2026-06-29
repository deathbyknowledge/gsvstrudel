import { definePackage } from "@humansandmachines/gsv/sdk";

export default definePackage({
  meta: {
    displayName: "Strudel Live",
    description: "A GSV-native Strudel workstation with device sample staging and a visible co-producer.",
    window: {
      width: 1280,
      height: 820,
      minWidth: 920,
      minHeight: 620,
    },
    capabilities: {
      kernel: ["sys.device.list", "fs.read", "fs.write", "fs.copy", "proc.spawn", "proc.send", "proc.history"],
    },
  },
  browser: {
    entry: "./src/app/main.tsx",
    assets: [
      "./src/styles.css",
      "./src/styles/base.css",
      "./src/styles/layout.css",
      "./src/styles/controls.css",
      "./src/styles/sources.css",
      "./src/styles/transport.css",
      "./src/styles/editor.css",
      "./src/styles/coproducer.css",
      "./src/styles/inspector.css",
      "./src/styles/responsive.css",
    ],
  },
  backend: {
    entry: "./src/backend.ts",
  },
});
