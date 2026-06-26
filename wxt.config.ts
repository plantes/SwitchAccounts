import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "SwitchAccounts",
    description: "Save and switch local website login states.",
    permissions: ["cookies", "storage", "scripting", "activeTab"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    incognito: "not_allowed",
    options_ui: { page: "options.html", open_in_tab: true },
  },
});
