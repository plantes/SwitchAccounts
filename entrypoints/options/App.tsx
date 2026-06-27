import { useEffect, useMemo, useState } from "react";
import type { AccountProfile, BackgroundRequest, CookieSnapshot, OperationResult, WebStorageSnapshot } from "../../src/domain/models";
import { SCHEMA_VERSION } from "../../src/domain/models";
import { previewImport } from "../../src/domain/import-export";
import { normalizeProfileName, searchProfiles } from "../../src/domain/profiles";
import { sendBackground } from "../../src/ui/client";
import { toSafeErrorText } from "../../src/ui/errors";
import "./style.css";

type Send = (request: BackgroundRequest) => Promise<OperationResult<unknown>>;
type StorageKind = "localStorage" | "sessionStorage";
type ActiveTab = "overview" | "cookies" | "storage" | "tools";

const tabs: { id: ActiveTab; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "cookies", label: "Cookie" },
  { id: "storage", label: "Web Storage" },
  { id: "tools", label: "工具" },
];

export default function OptionsApp({ send = sendBackground }: { send?: Send }) {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
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
    <main className="options-shell">
      <AccountSidebar
        profiles={filtered}
        query={query}
        selectedId={selected?.id ?? ""}
        onQueryChange={setQuery}
        onSelect={setSelectedId}
        onTools={() => setActiveTab("tools")}
      />

      <section className="detail-shell">
        {error && <div role="alert" className="warning">{error}</div>}
        {selected ? (
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
              {activeTab === "tools" && (
                <TabPanel id="tools" label="工具">
                  <ToolsTab profiles={profiles} origins={origins} send={send} onChanged={load} />
                </TabPanel>
              )}
            </section>
          </>
        ) : activeTab === "tools" ? (
          <>
            <header className="account-summary">
              <div>
                <span className="eyebrow">工具</span>
                <h2>导入 / 导出与设置</h2>
                <p>没有账号时也可以先导入已有配置，或查看当前授权站点。</p>
              </div>
            </header>
            <TabNav activeTab={activeTab} onChange={setActiveTab} />
            <section className="tab-surface">
              <TabPanel id="tools" label="工具">
                <ToolsTab profiles={profiles} origins={origins} send={send} onChanged={load} />
              </TabPanel>
            </section>
          </>
        ) : (
          <section className="empty-state">
            <h2>{profiles.length === 0 ? "暂无账号配置" : "无匹配账号"}</h2>
            <p>{profiles.length === 0 ? "可以从弹窗保存当前网站状态，或在工具中导入已有配置。" : "调整搜索条件后再选择账号。"}</p>
            <button type="button" onClick={() => setActiveTab("tools")}>打开工具</button>
          </section>
        )}
      </section>
    </main>
  );
}

function AccountSidebar({ profiles, query, selectedId, onQueryChange, onSelect, onTools }: {
  profiles: AccountProfile[];
  query: string;
  selectedId: string;
  onQueryChange: (query: string) => void;
  onSelect: (profileId: string) => void;
  onTools: () => void;
}) {
  return (
    <aside className="account-sidebar">
      <div className="brand-block">
        <span className="eyebrow">Local credentials</span>
        <h1>SwitchAccounts</h1>
        <p>账号快照只保存在本机。导出文件是明文，请像保管密码一样保管它。</p>
      </div>

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

      <button type="button" className="secondary sidebar-tool" onClick={onTools}>导入 / 导出与设置</button>
    </aside>
  );
}

function AccountSummary({ profile }: { profile: AccountProfile }) {
  return (
    <header className="account-summary">
      <div>
        <span className="eyebrow">当前账号</span>
        <h2>{profile.name}</h2>
        <p>{profile.registrableDomain} · {profile.cookies.length} Cookies · {Object.keys(profile.webStorageByOrigin).length} Origins</p>
      </div>
    </header>
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

function TabPanel({ id, label, children }: { id: ActiveTab; label: string; children: React.ReactNode }) {
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
      <label>账号名称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
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
            <strong>{cookie.name}</strong>
            <span>{cookie.domain}</span>
            <span>{cookie.path}</span>
            <label>名称<input value={cookie.name} onChange={(event) => void updateCookie(index, { name: event.target.value })} /></label>
            <label>值<input type="password" value={cookie.value} onChange={(event) => void updateCookie(index, { value: event.target.value })} /></label>
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
            <small>hostOnly: {String(cookie.hostOnly)} · storeId: {cookie.storeId}{cookie.partitionKey ? " · partitioned" : ""}</small>
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
                  <input value={value} onChange={(event) => void updateStorage(origin, kind, key, event.target.value)} />
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

function ToolsTab({ profiles, origins, send, onChanged }: {
  profiles: AccountProfile[];
  origins: string[];
  send: Send;
  onChanged: () => Promise<void>;
}) {
  return (
    <div className="tools-grid">
      <section className="tool-section">
        <h3>导入 / 导出</h3>
        <p className="warning">导出文件包含可直接使用的登录凭证。请勿上传、分享或保存在不可信位置。</p>
        <ImportControl profiles={profiles} send={send} onImported={onChanged} />
        <button type="button" onClick={() => void exportAll(send, profiles)}>导出全部配置</button>
      </section>

      <section className="tool-section">
        <h3>设置</h3>
        <p>数据格式版本：{SCHEMA_VERSION}</p>
        <p>已授权网站：</p>
        <ul>
          {origins.map((origin) => (
            <li key={origin}>
              {origin}
              <button type="button" onClick={() => void removeGrantedSite(origin, send, onChanged)}>撤销</button>
            </li>
          ))}
        </ul>
        {origins.length === 0 && <p className="muted">暂无已授权网站。</p>}
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
      <input aria-label={`${kind} value`} placeholder={kind === "localStorage" ? "storage value" : "session storage value"} value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="button" onClick={() => void add()}>添加 {kind}</button>
    </div>
  );
}

function ImportControl({ profiles, send, onImported }: { profiles: AccountProfile[]; send: Send; onImported: () => Promise<void> }) {
  const [summary, setSummary] = useState("");

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

  return (
    <div className="editor-block">
      <label>导入 JSON 文件<input type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></label>
      {summary && <p>{summary}</p>}
    </div>
  );
}

async function exportAll(send: Send, profiles: AccountProfile[]) {
  if (!window.confirm("导出文件包含可直接使用的登录凭证。请勿上传、分享或保存在不可信位置。")) return;
  const result = await send({ type: "exportProfiles", scope: { type: "all" } });
  if (!result.ok) return;
  const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `switchaccounts-${profiles.length}-profiles.json`;
  anchor.click();
  URL.revokeObjectURL(url);
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
