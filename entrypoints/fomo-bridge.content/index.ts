import { installFomoFetchBridge } from "../../src/fomo-bridge";

export default defineContentScript({
  matches: ["https://fomo.family/*"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    installFomoFetchBridge();
  },
});
