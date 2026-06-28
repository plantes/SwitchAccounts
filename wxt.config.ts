import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "SwitchAccounts",
    description: "Save and switch local website login states.",
    permissions: ["cookies", "storage", "scripting", "activeTab"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    incognito: "not_allowed",
    icons: {
      16: "icons/16.png",
      32: "icons/32.png",
      48: "icons/48.png",
      128: "icons/128.png",
    },
    action: {
      default_icon: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png",
        128: "icons/128.png",
      },
    },
    options_ui: { page: "options.html", open_in_tab: true },
  },
});
