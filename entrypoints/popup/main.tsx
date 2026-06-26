import React from "react";
import { createRoot } from "react-dom/client";
import PopupApp from "./App";

async function getActiveTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error("No active tab");
  return tab.id;
}

getActiveTabId()
  .then((tabId) => {
    createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <PopupApp tabId={tabId} />
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    createRoot(document.getElementById("root")!).render(
      <main className="popup-shell" role="alert">
        {error instanceof Error ? error.message : "无法读取当前标签页。"}
      </main>,
    );
  });
