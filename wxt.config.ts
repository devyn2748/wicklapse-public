import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Wicklapse",
    description: "Turn a selected Axiom trade into a local animated trade replay.",
    permissions: ["storage", "downloads"],
    host_permissions: [
      "https://axiom.trade/*",
      "https://*.axiom.trade/*",
      "https://api3.axiom.trade/*",
      "https://api.mainnet-beta.solana.com/*",
      "https://*.helius-rpc.com/*",
      "https://api.coingecko.com/*",
      "https://api.geckoterminal.com/*"
    ],
    optional_host_permissions: ["https://*/*"],
    web_accessible_resources: [{
      resources: ["sounds/*.mp3"],
      matches: ["https://axiom.trade/*", "https://*.axiom.trade/*"]
    }],
    action: {
      default_title: "Open Wicklapse Studio"
    }
  }
});
