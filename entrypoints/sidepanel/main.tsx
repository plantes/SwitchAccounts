import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import SidePanelApp from "./App";

async function getActiveTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error("无法读取当前标签页。");
  return tab.id;
}

interface ActiveTabState {
  tabId: number;
  revision: number;
}

function SidePanelRoot() {
  const [activeTab, setActiveTab] = useState<ActiveTabState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;

    async function refreshActiveTab() {
      try {
        const tabId = await getActiveTabId();
        if (disposed) return;
        setError("");
        setActiveTab((current) => ({
          tabId,
          revision: current ? current.revision + 1 : 0,
        }));
      } catch (unknownError) {
        if (disposed) return;
        setActiveTab(null);
        setError(unknownError instanceof Error ? unknownError.message : "无法读取当前标签页。");
      }
    }

    function handleActivated() {
      void refreshActiveTab();
    }

    const handleUpdated: Parameters<typeof browser.tabs.onUpdated.addListener>[0] = (_tabId, changeInfo, tab) => {
      if (tab.active && (changeInfo.url !== undefined || changeInfo.status === "complete")) {
        void refreshActiveTab();
      }
    };

    void refreshActiveTab();
    browser.tabs.onActivated.addListener(handleActivated);
    browser.tabs.onUpdated.addListener(handleUpdated);

    return () => {
      disposed = true;
      browser.tabs.onActivated.removeListener(handleActivated);
      browser.tabs.onUpdated.removeListener(handleUpdated);
    };
  }, []);

  if (error) {
    return <main className="sidepanel-shell loading" role="alert">{error}</main>;
  }
  if (!activeTab) {
    return <main className="sidepanel-shell loading">加载当前标签页…</main>;
  }
  return <SidePanelApp key={`${activeTab.tabId}-${activeTab.revision}`} tabId={activeTab.tabId} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SidePanelRoot />
  </React.StrictMode>,
);
