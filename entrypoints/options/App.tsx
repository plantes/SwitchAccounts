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
import type { AccountProfile, BackgroundRequest, CookieSnapshot, ExportBundle, OperationResult, WebStorageSnapshot } from "../../src/domain/models";
import { SCHEMA_VERSION } from "../../src/domain/models";
import { previewImport } from "../../src/domain/import-export";
import { normalizeProfileName, searchProfiles } from "../../src/domain/profiles";
import { sendBackground } from "../../src/ui/client";
import { toSafeErrorText } from "../../src/ui/errors";
import "./style.css";

type Send = (request: BackgroundRequest) => Promise<OperationResult<unknown>>;
type StorageKind = "localStorage" | "sessionStorage";
type WorkspaceView = "accounts" | "tools";
type ActiveTab = "overview" | "cookies" | "storage";

const tabs: { id: ActiveTab; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "cookies", label: "Cookie" },
  { id: "storage", label: "Web Storage" },
];

export default function OptionsApp({ send = sendBackground }: { send?: Send }) {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [activeView, setActiveView] = useState<WorkspaceView>("accounts");
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  async function load() {
    const [profileResult, originsResult] = await Promise.all([
      send({ type: "listAllProfiles" }) as Promise<OperationResult<AccountProfile[]>>,
      send({ type: "listGrantedSites" }) as Promise<OperationResult<string[]>>,
    ]);
    if (profileResult.ok) setProfiles(profileResult.data);
    else setError(toSafeErrorText(profileResult.error));
    if (originsResult.ok) setOrigins(originsResult.data);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const byName = searchProfiles(profiles, query);
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return byName;
    return byName.filter((profile) => profile.registrableDomain.toLocaleLowerCase().includes(needle)
      || profile.name.toLocaleLowerCase().includes(needle));
  }, [profiles, query]);

  const selected = filtered.find((profile) => profile.id === selectedId) ?? filtered[0];

  return (
    <main className={`options-shell ${activeView === "tools" ? "tools-mode" : "accounts-mode"}`}>
      <AppRail activeView={activeView} onChange={setActiveView} />

      {activeView === "accounts" && (
        <AccountSidebar
          profiles={filtered}
          query={query}
          selectedId={selected?.id ?? ""}
          onQueryChange={setQuery}
          onSelect={setSelectedId}
        />
      )}

      <section className="detail-shell">
        {error && <div role="alert" className="notice danger">{error}</div>}
        {activeView === "tools" ? (
          <ToolsWorkspace profiles={profiles} origins={origins} send={send} onChanged={load} />
        ) : selected ? (
          <>
            <AccountSummary profile={selected} />
            <TabNav activeTab={activeTab} onChange={setActiveTab} />
            <section className="tab-surface">
              {activeTab === "overview" && (
                <TabPanel id="overview" label="概览">
                  <OverviewTab profile={selected} send={send} onSaved={load} />
                </TabPanel>
              )}
              {activeTab === "cookies" && (
                <TabPanel id="cookies" label="Cookie">
                  <CookieTab profile={selected} send={send} onSaved={load} />
                </TabPanel>
              )}
              {activeTab === "storage" && (
                <TabPanel id="storage" label="Web Storage">
                  <WebStorageTab profile={selected} send={send} onSaved={load} />
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

function OverviewTab({ profile, send, onSaved }: { profile: AccountProfile; send: Send; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(profile.name);

  useEffect(() => {
    setName(profile.name);
  }, [profile.id, profile.name]);

  async function save() {
    await send({
      type: "updateProfile",
      profile: { ...profile, name: name.trim(), normalizedName: normalizeProfileName(name), updatedAt: new Date().toISOString() },
    });
    await onSaved();
  }

  async function remove() {
    if (!window.confirm(`删除 ${profile.name}？不会修改当前网站。`)) return;
    await send({ type: "deleteProfile", profileId: profile.id });
    await onSaved();
  }

  return (
    <div className="overview-grid">
      <label className="wide-field">账号名称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="stat-card">
        <strong>{profile.cookies.length}</strong>
        <span>Cookies</span>
      </div>
      <div className="stat-card">
        <strong>{Object.keys(profile.webStorageByOrigin).length}</strong>
        <span>Origins</span>
      </div>
      <div className="button-row overview-actions">
        <button type="button" onClick={() => void save()}>保存账号信息</button>
        <button type="button" className="danger" onClick={() => void remove()}>删除账号</button>
      </div>
    </div>
  );
}

function CookieTab({ profile, send, onSaved }: { profile: AccountProfile; send: Send; onSaved: () => Promise<void> }) {
  const [filter, setFilter] = useState("");
  const visibleCookies = profile.cookies.filter((cookie) => {
    const haystack = `${cookie.name} ${cookie.domain} ${cookie.path}`.toLocaleLowerCase();
    return haystack.includes(filter.trim().toLocaleLowerCase());
  });

  async function updateCookie(index: number, patch: Partial<CookieSnapshot>) {
    const cookies = profile.cookies.slice();
    const current = cookies[index];
    if (!current) return;
    const next: CookieSnapshot = { ...current, ...patch };
    if (next.session) delete next.expirationDate;
    if (!next.name.trim()) return window.alert("Cookie 名称不能为空。");
    if (!next.path.startsWith("/")) return window.alert("Cookie path 必须以 / 开始。");
    if (next.sameSite === "no_restriction" && !next.secure) return window.alert("SameSite=None 必须启用 Secure。");
    if (!next.session && (next.expirationDate === undefined || !Number.isFinite(next.expirationDate) || next.expirationDate <= 0)) {
      return window.alert("Persistent Cookie 必须设置有效的 Expiration。");
    }
    cookies[index] = next;
    await send({ type: "updateProfile", profile: { ...profile, cookies, updatedAt: new Date().toISOString() } });
    await onSaved();
  }

  async function deleteCookie(index: number) {
    const cookies = profile.cookies.filter((_, currentIndex) => currentIndex !== index);
    await send({ type: "updateProfile", profile: { ...profile, cookies, updatedAt: new Date().toISOString() } });
    await onSaved();
  }

  return (
    <div className="editor-block">
      <label>Cookie 搜索<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="名称、域名或路径" /></label>
      {visibleCookies.map((cookie) => {
        const index = profile.cookies.indexOf(cookie);
        return (
          <article key={`${cookie.name}-${cookie.domain}-${cookie.path}-${index}`} className="cookie-row">
            <div className="record-head">
              <strong>{cookie.name}</strong>
              <small><span>{cookie.domain}</span><span>{cookie.path}</span></small>
            </div>
            <label>名称<input value={cookie.name} onChange={(event) => void updateCookie(index, { name: event.target.value })} /></label>
            <label>
              值
              <textarea value={formatJsonValue(cookie.value)} onChange={(event) => void updateCookie(index, { value: event.target.value })} />
            </label>
            <label>域名<input value={cookie.domain} onChange={(event) => void updateCookie(index, { domain: event.target.value })} /></label>
            <label>路径<input value={cookie.path} onChange={(event) => void updateCookie(index, { path: event.target.value })} /></label>
            <label><input type="checkbox" checked={cookie.secure} onChange={(event) => void updateCookie(index, { secure: event.target.checked })} /> Secure</label>
            <label><input type="checkbox" checked={cookie.httpOnly} onChange={(event) => void updateCookie(index, { httpOnly: event.target.checked })} /> HttpOnly</label>
            <label>
              SameSite
              <select value={cookie.sameSite} onChange={(event) => void updateCookie(index, { sameSite: event.target.value as CookieSnapshot["sameSite"] })}>
                <option value="lax">Lax</option>
                <option value="strict">Strict</option>
                <option value="no_restriction">None</option>
                <option value="unspecified">Unspecified</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={cookie.session}
                onChange={(event) => void updateCookie(index, event.target.checked
                  ? { session: true }
                  : { session: false, expirationDate: cookie.expirationDate ?? Math.floor(Date.now() / 1000) + 31_536_000 })}
              /> Session cookie
            </label>
            <label>
              Expiration
              <input
                type="number"
                min="1"
                disabled={cookie.session}
                value={cookie.expirationDate ?? ""}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  if (!value) return window.alert("Persistent Cookie 必须设置有效的 Expiration。");
                  void updateCookie(index, { expirationDate: Number(value) });
                }}
              />
            </label>
            <small className="record-meta">hostOnly: {String(cookie.hostOnly)} · storeId: {cookie.storeId}{cookie.partitionKey ? " · partitioned" : ""}</small>
            <button type="button" className="danger" onClick={() => void deleteCookie(index)}>删除 Cookie</button>
          </article>
        );
      })}
      {visibleCookies.length === 0 && <p className="muted">没有匹配的 Cookie。</p>}
    </div>
  );
}

function WebStorageTab({ profile, send, onSaved }: { profile: AccountProfile; send: Send; onSaved: () => Promise<void> }) {
  async function updateStorage(origin: string, kind: StorageKind, key: string, value: string) {
    const snapshot = profile.webStorageByOrigin[origin];
    if (!snapshot) return;
    const nextSnapshot: WebStorageSnapshot = {
      ...snapshot,
      [kind]: { ...snapshot[kind], [key]: value },
    };
    await send({
      type: "updateProfile",
      profile: {
        ...profile,
        webStorageByOrigin: { ...profile.webStorageByOrigin, [origin]: nextSnapshot },
        updatedAt: new Date().toISOString(),
      },
    });
    await onSaved();
  }

  async function deleteStorage(origin: string, kind: StorageKind, key: string) {
    const snapshot = profile.webStorageByOrigin[origin];
    if (!snapshot) return;
    const nextValues = { ...snapshot[kind] };
    delete nextValues[key];
    const nextSnapshot: WebStorageSnapshot = { ...snapshot, [kind]: nextValues };
    await send({
      type: "updateProfile",
      profile: {
        ...profile,
        webStorageByOrigin: { ...profile.webStorageByOrigin, [origin]: nextSnapshot },
        updatedAt: new Date().toISOString(),
      },
    });
    await onSaved();
  }

  const entries = Object.entries(profile.webStorageByOrigin);

  return (
    <div className="editor-block">
      {entries.map(([origin, snapshot]) => (
        <section key={origin} className="storage-origin">
          <h3>{origin}</h3>
          {(["localStorage", "sessionStorage"] as const).map((kind) => (
            <div key={kind} className="storage-kind">
              <strong>{kind}</strong>
              {Object.entries(snapshot[kind]).map(([key, value]) => (
                <div key={`${kind}-${key}`} className="storage-row">
                  <span>{key}</span>
                  <textarea value={formatJsonValue(value)} onChange={(event) => void updateStorage(origin, kind, key, event.target.value)} />
                  <button type="button" className="danger" onClick={() => void deleteStorage(origin, kind, key)}>删除</button>
                </div>
              ))}
              <StorageAddForm kind={kind} onAdd={(key, value) => updateStorage(origin, kind, key, value)} />
            </div>
          ))}
        </section>
      ))}
      {entries.length === 0 && <p className="muted">这个账号没有保存 Web Storage。</p>}
    </div>
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

function StorageAddForm({ kind, onAdd }: { kind: StorageKind; onAdd: (key: string, value: string) => Promise<void> }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  async function add() {
    const cleanKey = key.trim();
    if (!cleanKey) return window.alert("Storage key 不能为空。");
    await onAdd(cleanKey, value);
    setKey("");
    setValue("");
  }

  return (
    <div className="storage-row add-row">
      <input aria-label={`${kind} key`} placeholder={kind === "localStorage" ? "storage key" : "session storage key"} value={key} onChange={(event) => setKey(event.target.value)} />
      <textarea aria-label={`${kind} value`} placeholder={kind === "localStorage" ? "storage value" : "session storage value"} value={formatJsonValue(value)} onChange={(event) => setValue(event.target.value)} />
      <button type="button" onClick={() => void add()}>添加 {kind}</button>
    </div>
  );
}

function ImportControl({ profiles, send, onImported }: { profiles: AccountProfile[]; send: Send; onImported: () => Promise<void> }) {
  const [summary, setSummary] = useState("");
  const [dragging, setDragging] = useState(false);

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await readFileText(file);
      const bundle = JSON.parse(text) as unknown;
      const preview = previewImport({ schemaVersion: SCHEMA_VERSION, profiles }, bundle);
      setSummary(`新增 ${preview.added} 个，覆盖 ${preview.overwritten} 个。涉及站点：${preview.sites.join(", ") || "无"}`);
      if (!window.confirm("确认导入？冲突配置将由导入内容覆盖。")) return;
      const result = await send({ type: "importProfiles", bundle: preview.bundle });
      if (!result.ok) {
        setSummary(toSafeErrorText(result.error));
        return;
      }
      setSummary("导入成功。");
      await onImported();
    } catch {
      setSummary("导入文件无效，未写入任何配置。");
    }
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
          <input className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
        </label>
      </div>
      {summary && <p className="import-summary" role="status">{summary}</p>}
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

function formatJsonValue(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function formatProfileTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
