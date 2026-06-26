import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "SwitchAccounts",
    description: "保存并切换网站的本地登录状态。",
    permissions: ["cookies", "storage", "scripting", "activeTab"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    incognito: "not_allowed",
  },
});
