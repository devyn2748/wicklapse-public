import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Wicklapse",
    description: "Turn selected Axiom and Fomo trades into local animated trade replays.",
    permissions: ["storage", "scripting"],
    host_permissions: [
      "https://axiom.trade/*",
      "https://*.axiom.trade/*",
      "https://api3.axiom.trade/*",
      "https://fomo.family/*",
      "https://prod-api.fomo.family/*",
      "https://api.mainnet-beta.solana.com/*",
      "https://*.helius-rpc.com/*",
      "https://api.coingecko.com/*",
      "https://api.geckoterminal.com/*"
    ],
    optional_host_permissions: ["https://*/*"],
    icons: {
      16: "icon.png",
      32: "icon.png",
      48: "icon.png",
      128: "icon.png"
    },
    web_accessible_resources: [{
      resources: ["icon.png", "sounds/*.mp3"],
      matches: ["https://axiom.trade/*", "https://*.axiom.trade/*", "https://fomo.family/*"]
    }],
    action: {
      default_title: "Open Wicklapse",
      default_icon: {
        16: "icon.png",
        32: "icon.png"
      }
    }
  }
});
