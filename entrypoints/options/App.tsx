import {
  DownloadSimple,
  FolderOpen,
  GlobeSimple,
  UploadSimple,
  UserCircle,
  WarningCircle,
  Wrench,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import type { AccountProfile, BackgroundRequest, ExportBundle, ImportPreview, OperationResult } from "../../src/domain/models";
import { SCHEMA_VERSION } from "../../src/domain/models";
import { previewImport } from "../../src/domain/import-export";
import { CookieTab, OverviewTab, WebStorageTab } from "./ProfileEditors";
import { sendBackground } from "../../src/ui/client";
import { toSafeErrorText } from "../../src/ui/errors";
import "./style.css";

type Send = (request: BackgroundRequest) => Promise<OperationResult<unknown>>;
type WorkspaceView = "accounts" | "tools";
type ActiveTab = "overview" | "cookies" | "storage";

const tabs: { id: ActiveTab; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "cookies", label: "Cookie" },
  { id: "storage", label: "Web Storage" },
];

export default function OptionsApp({ send: transport = sendBackground }: { send?: Send }) {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [activeView, setActiveView] = useState<WorkspaceView>("accounts");
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [hasDraft, setHasDraft] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);

  async function send(request: BackgroundRequest): Promise<OperationResult<unknown>> {
    try {
      const result = await transport(request);
      if (!result.ok) setError(toSafeErrorText(result.error));
      return result;
    } catch {
      const error = { code: "STORAGE_WRITE_FAILED" as const, message: "操作未完成，请重试。" };
      setError(error.message);
      return { ok: false, error };
    }
  }

  function leaveEditor(action: () => void) {
    if (hasDraft && !window.confirm("放弃当前未保存修改？")) return;
    setHasDraft(false);
    setEditorRevision(current => current + 1);
    action();
  }

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (hasDraft) { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasDraft]);

  async function load() {
    setError("");
    const [profileResult, originsResult] = await Promise.all([
      send({ type: "listAllProfiles" }) as Promise<OperationResult<AccountProfile[]>>,
      send({ type: "listGrantedSites" }) as Promise<OperationResult<string[]>>,
    ]);
    if (profileResult.ok) setProfiles(profileResult.data);
    else throw new Error(toSafeErrorText(profileResult.error));
    if (originsResult.ok) setOrigins(originsResult.data);
  }

  useEffect(() => {
    void load().catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return profiles;
    return profiles.filter((profile) => profile.registrableDomain.toLocaleLowerCase().includes(needle)
      || profile.name.toLocaleLowerCase().includes(needle));
  }, [profiles, query]);

  const selected = filtered.find((profile) => profile.id === selectedId) ?? filtered[0];

  return (
    <main className={`options-shell ${activeView === "tools" ? "tools-mode" : "accounts-mode"}`}>
      <AppRail activeView={activeView} onChange={view => leaveEditor(() => setActiveView(view))} />

      {activeView === "accounts" && (
        <AccountSidebar
          profiles={filtered}
          query={query}
          selectedId={selected?.id ?? ""}
          onQueryChange={value => leaveEditor(() => setQuery(value))}
          onSelect={id => leaveEditor(() => setSelectedId(id))}
        />
      )}

      <section className="detail-shell">
        {error && <div role="alert" className="notice danger">{error}</div>}
        {activeView === "tools" ? (
          <ToolsWorkspace profiles={profiles} origins={origins} send={send} onChanged={load} />
        ) : selected ? (
          <>
            <AccountSummary profile={selected} />
            <TabNav activeTab={activeTab} onChange={tab => leaveEditor(() => setActiveTab(tab))} />
            <section className="tab-surface">
              {activeTab === "overview" && (
                <TabPanel id="overview" label="概览">
                  <OverviewTab key={`${selected.id}-${editorRevision}`} profile={selected} send={send} onSaved={load} onDirtyChange={setHasDraft} />
                </TabPanel>
              )}
              {activeTab === "cookies" && (
                <TabPanel id="cookies" label="Cookie">
                  <CookieTab key={`${selected.id}-${editorRevision}`} profile={selected} send={send} onSaved={load} onDirtyChange={setHasDraft} />
                </TabPanel>
              )}
              {activeTab === "storage" && (
                <TabPanel id="storage" label="Web Storage">
                  <WebStorageTab key={`${selected.id}-${editorRevision}`} profile={selected} send={send} onSaved={load} onDirtyChange={setHasDraft} />
                </TabPanel>
              )}
            </section>
          </>
        ) : (
          <section className="empty-state">
            <strong>{profiles.length === 0 ? "暂无账号配置" : "无匹配账号"}</strong>
            <p>{profiles.length === 0 ? "可以从侧边栏保存当前网站状态，或在工具中导入已有配置。" : "调整搜索条件后再选择账号。"}</p>
            <button type="button" onClick={() => setActiveView("tools")}>打开工具与设置</button>
          </section>
        )}
      </section>
    </main>
  );
}

function AppRail({ activeView, onChange }: { activeView: WorkspaceView; onChange: (view: WorkspaceView) => void }) {
  return (
    <aside className="app-rail">
      <div className="rail-brand">
        <img className="brand-mark" src="/icons/switchaccounts.svg" alt="" />
        <strong>SwitchAccounts</strong>
        <span>本地账号快照工作台</span>
      </div>

      <nav className="rail-nav" aria-label="工作区">
        <button
          type="button"
          className={`rail-nav-item ${activeView === "accounts" ? "selected" : ""}`}
          aria-pressed={activeView === "accounts"}
          onClick={() => onChange("accounts")}
        >
          <UserCircle aria-hidden="true" weight="regular" />
          <span>账号</span>
        </button>
        <button
          type="button"
          className={`rail-nav-item ${activeView === "tools" ? "selected" : ""}`}
          aria-pressed={activeView === "tools"}
          onClick={() => onChange("tools")}
        >
          <Wrench aria-hidden="true" weight="regular" />
          <span>工具</span>
        </button>
      </nav>
    </aside>
  );
}

function AccountSidebar({ profiles, query, selectedId, onQueryChange, onSelect }: {
  profiles: AccountProfile[];
  query: string;
  selectedId: string;
  onQueryChange: (query: string) => void;
  onSelect: (profileId: string) => void;
}) {
  return (
    <aside className="account-sidebar">
      <h1 className="account-library-title">账号快照</h1>

      <label className="search-box">
        管理页搜索
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="网站或账号名称" />
      </label>

      <div className="profile-list" aria-label="账号列表">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className={`profile-nav-card ${profile.id === selectedId ? "selected" : ""}`}
            onClick={() => onSelect(profile.id)}
          >
            <span className="profile-domain">{profile.registrableDomain}</span>
            <strong>{profile.name}</strong>
            <small>{profile.cookies.length} Cookies · {Object.keys(profile.webStorageByOrigin).length} Origins</small>
          </button>
        ))}
        {profiles.length === 0 && <p className="muted">没有匹配的账号。</p>}
      </div>
    </aside>
  );
}

function AccountSummary({ profile }: { profile: AccountProfile }) {
  return (
    <header className="account-summary">
      <div className="summary-copy">
        <span className="field-label">当前账号</span>
        <h2>{profile.name}</h2>
        <p>{profile.registrableDomain} · 创建于 {formatProfileTime(profile.createdAt)}</p>
      </div>
      <div className="summary-metrics" aria-label="账号快照统计">
        <Metric value={profile.cookies.length} label="Cookies" />
        <Metric value={Object.keys(profile.webStorageByOrigin).length} label="Origins" />
      </div>
    </header>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TabNav({ activeTab, onChange }: { activeTab: ActiveTab; onChange: (tab: ActiveTab) => void }) {
  return (
    <div className="tab-list" role="tablist" aria-label="账号详情">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`panel-${tab.id}`}
          className={`tab-button ${activeTab === tab.id ? "selected" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function TabPanel({ id, label, children }: { id: ActiveTab; label: string; children: ReactNode }) {
  return (
    <section id={`panel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} aria-label={label} className="tab-panel">
      {children}
    </section>
  );
}

function ToolsWorkspace({ profiles, origins, send, onChanged }: {
  profiles: AccountProfile[];
  origins: string[];
  send: Send;
  onChanged: () => Promise<void>;
}) {
  return (
    <div className="tools-workspace">
      <header className="tools-header">
        <div className="tools-breadcrumb"><span>SwitchAccounts</span><span aria-hidden="true">/</span><span>全局</span></div>
        <h1>工具与设置</h1>
        <p>统一管理本地账号配置与网站授权</p>
      </header>
      <ToolsTab profiles={profiles} origins={origins} send={send} onChanged={onChanged} />
    </div>
  );
}

function ToolsTab({ profiles, origins, send, onChanged }: {
  profiles: AccountProfile[];
  origins: string[];
  send: Send;
  onChanged: () => Promise<void>;
}) {
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>(() => profiles.map((profile) => profile.id));
  const [selectionTouched, setSelectionTouched] = useState(false);
  const selectedProfileIdSet = useMemo(() => new Set(selectedProfileIds), [selectedProfileIds]);
  const allProfilesSelected = profiles.length > 0 && selectedProfileIds.length === profiles.length;

  useEffect(() => {
    setSelectedProfileIds((current) => {
      if (!selectionTouched) return profiles.map((profile) => profile.id);
      const availableIds = new Set(profiles.map((profile) => profile.id));
      return current.filter((profileId) => availableIds.has(profileId));
    });
  }, [profiles, selectionTouched]);

  function toggleAllProfiles() {
    setSelectionTouched(true);
    setSelectedProfileIds(allProfilesSelected ? [] : profiles.map((profile) => profile.id));
  }

  function toggleProfile(profileId: string) {
    setSelectionTouched(true);
    setSelectedProfileIds((current) => current.includes(profileId)
      ? current.filter((currentId) => currentId !== profileId)
      : [...current, profileId]);
  }

  return (
    <div className="tools-grid">
      <section className="tool-section import-export-section">
        <div className="section-heading">
          <h2>账号配置</h2>
          <span aria-hidden="true" />
        </div>
        <p className="section-lead">导入已有配置，或选择账号创建一份本地备份。</p>
        <div className="credential-warning">
          <WarningCircle aria-hidden="true" weight="fill" />
          <div>
            <strong>配置文件包含登录凭证</strong>
            <p>仅在可信设备上导入、保存和使用，请勿上传或分享给他人。</p>
          </div>
        </div>
        <div className="config-action import-action">
          <div className="config-action-heading">
            <span className="config-action-icon"><UploadSimple aria-hidden="true" weight="regular" /></span>
            <div>
              <h3>导入账号配置</h3>
              <p>选择由 SwitchAccounts 导出的 JSON 文件；写入前会预览新增账号、覆盖账号和涉及站点。</p>
            </div>
          </div>
          <ImportControl profiles={profiles} send={send} onImported={onChanged} />
        </div>

        <div className="config-action export-block">
          <div className="config-action-heading">
            <span className="config-action-icon"><DownloadSimple aria-hidden="true" weight="regular" /></span>
            <div>
              <h3>导出账号备份</h3>
              <p>选择需要备份的账号，将其 Cookies 与 Web Storage 打包为一个 JSON 文件。</p>
            </div>
          </div>
          <fieldset className="export-profile-selector">
            <legend className="visually-hidden">选择要导出的账号</legend>
            <div className="export-selector-toolbar">
              <label className="export-select-all">
                <input
                  type="checkbox"
                  checked={allProfilesSelected}
                  disabled={profiles.length === 0}
                  onChange={toggleAllProfiles}
                />
                <span>全选账号</span>
              </label>
              <span className="export-selected-count">已选择 <strong>{selectedProfileIds.length}</strong> / {profiles.length}</span>
            </div>
            <div className="export-profile-list" role="group" aria-label="可导出的账号">
              {profiles.map((profile) => {
                const selected = selectedProfileIdSet.has(profile.id);
                return (
                  <label key={profile.id} className={`export-profile-option ${selected ? "selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleProfile(profile.id)}
                      aria-label={`选择导出账号 ${profile.name}`}
                    />
                    <span>
                      <strong>{profile.name}</strong>
                      <small>{profile.registrableDomain}</small>
                    </span>
                  </label>
                );
              })}
              {profiles.length === 0 && <p className="export-empty">暂无可导出的账号</p>}
            </div>
          </fieldset>
          <div className="export-action-row">
            <p><strong>{selectedProfileIds.length}</strong><span>个账号将被导出</span></p>
            <button
              type="button"
              className="export-button"
              disabled={selectedProfileIds.length === 0}
              onClick={() => void exportSelected(send, selectedProfileIds)}
            >
              <DownloadSimple aria-hidden="true" weight="bold" />
              导出已选账号
            </button>
          </div>
        </div>
      </section>

      <section className="tool-section granted-sites-section">
        <div className="section-heading">
          <h2>授权站点</h2>
          <span aria-hidden="true" />
        </div>
        <p className="schema-version">数据格式版本：v{SCHEMA_VERSION}</p>
        {origins.length > 0 && (
          <div className="origin-table-head" aria-hidden="true">
            <span>网站域名（Origin）</span>
            <span>操作</span>
          </div>
        )}
        <ul className="origin-list">
          {origins.map((origin) => (
            <li key={origin}>
              <span className="origin-value"><GlobeSimple aria-hidden="true" weight="regular" />{origin}</span>
              <button type="button" className="origin-revoke" onClick={() => void removeGrantedSite(origin, send, onChanged)}>撤销</button>
            </li>
          ))}
        </ul>
        {origins.length === 0 && <p className="muted origin-empty">暂无已授权网站。</p>}
      </section>
    </div>
  );
}

function ImportControl({ profiles, send, onImported }: { profiles: AccountProfile[]; send: Send; onImported: () => Promise<void> }) {
  const [summary, setSummary] = useState("");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setPreview(null);
    setSummary("");
    try {
      const text = await readFileText(file);
      const bundle = JSON.parse(text) as unknown;
      const preview = previewImport({ schemaVersion: SCHEMA_VERSION, profiles }, bundle);
      setSummary(`新增 ${preview.added} 个，覆盖 ${preview.overwritten} 个。涉及站点：${preview.sites.join(", ") || "无"}`);
      setPreview(preview);
    } catch {
      setSummary("导入文件无效，未写入任何配置。");
    } finally { setBusy(false); }
  }

  async function confirmImport() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      // Recheck against the current repository so a stale preview cannot silently overwrite new accounts.
      const current = await send({ type: "listAllProfiles" }) as OperationResult<AccountProfile[]>;
      if (!current.ok) { setSummary(toSafeErrorText(current.error)); return; }
      const fresh = previewImport({ schemaVersion: SCHEMA_VERSION, profiles: current.data }, preview.bundle);
      if (fresh.added !== preview.added || fresh.overwritten !== preview.overwritten) {
        setPreview(fresh);
        setSummary(`账号库已变化：新增 ${fresh.added} 个，覆盖 ${fresh.overwritten} 个。请核对后再次确认。`);
        return;
      }
      const result = await send({ type: "importProfiles", bundle: preview.bundle });
      if (!result.ok) {
        setSummary(toSafeErrorText(result.error));
        return;
      }
      setSummary("导入成功。");
      setPreview(null);
      await onImported();
    } catch {
      setSummary("导入未完成，请重试。");
    } finally { setBusy(false); }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void importFile(event.dataTransfer.files[0]);
  }

  return (
    <div className="import-control">
      <div
        className={`file-drop-zone ${dragging ? "dragging" : ""}`}
        aria-label="导入 JSON 文件拖放区"
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <UploadSimple className="drop-icon" aria-hidden="true" weight="regular" />
        <p><strong>拖放配置文件到这里</strong><span>或从电脑中选择一个 .json 文件</span></p>
        <label className="file-picker-button">
          <FolderOpen aria-hidden="true" weight="regular" />
          选择配置文件
          <input disabled={busy} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void importFile(file); }} />
        </label>
      </div>
      {summary && <p className="import-summary" role="status">{summary}</p>}
      {preview && <div className="button-row">
        <button disabled={busy} type="button" onClick={() => void confirmImport()}>确认导入</button>
        <button disabled={busy} type="button" className="secondary" onClick={() => { setPreview(null); setSummary(""); }}>取消导入</button>
      </div>}
    </div>
  );
}

async function exportSelected(send: Send, profileIds: string[]) {
  if (profileIds.length === 0) return;
  if (!window.confirm(`将导出 ${profileIds.length} 个账号。文件包含可直接使用的登录凭证，请勿上传、分享或保存在不可信位置。`)) return;
  const result = await send({ type: "exportProfiles", scope: { type: "profiles", profileIds } }) as OperationResult<ExportBundle>;
  if (!result.ok) return;
  const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = formatExportFileName(new Date(result.data.exportedAt));
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatExportFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
  return `switchaccounts-backup-${timestamp}.json`;
}

async function removeGrantedSite(origin: string, send: Send, onRemoved: () => Promise<void>) {
  const result = await send({ type: "removeGrantedSite", origins: [origin] });
  if (result.ok) await onRemoved();
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function formatProfileTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
