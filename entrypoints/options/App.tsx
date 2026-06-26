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

export default function OptionsApp({ send = sendBackground }: { send?: Send }) {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];

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
      || profile.name.toLocaleLowerCase().includes(needle)
      || profile.note.toLocaleLowerCase().includes(needle));
  }, [profiles, query]);

  return (
    <main className="options-shell">
      <aside className="sidebar">
        <span className="eyebrow">Local credentials</span>
        <h1>SwitchAccounts</h1>
        <p>账号快照只保存在本机。导出文件是明文，请像保管密码一样保管它。</p>
      </aside>

      <section className="workspace">
        {error && <div role="alert" className="warning">{error}</div>}
        <div className="toolbar">
          <label>
            管理页搜索
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="网站、账号名称或备注" />
          </label>
        </div>

        <section className="grid">
          <Panel title="账号配置">
            {filtered.map((profile) => (
              <article key={profile.id} className={`row-card ${selected?.id === profile.id ? "selected" : ""}`}>
                <div>
                  <strong>{profile.registrableDomain}</strong>
                  <span>{profile.name} · {profile.note || "无备注"}</span>
                </div>
                <small>{profile.cookies.length} Cookies · {Object.keys(profile.webStorageByOrigin).length} Origins</small>
                <button type="button" onClick={() => setSelectedId(profile.id)}>编辑</button>
              </article>
            ))}
            {selected && <ProfileForm profile={selected} send={send} onSaved={load} />}
          </Panel>

          <Panel title="Cookie 编辑器">
            {selected ? <CookieEditor profile={selected} send={send} onSaved={load} /> : <p>请选择账号。</p>}
          </Panel>

          <Panel title="Web Storage 编辑器">
            {selected ? <WebStorageEditor profile={selected} send={send} onSaved={load} /> : <p>请选择账号。</p>}
          </Panel>

          <Panel title="导入 / 导出">
            <p className="warning">导出文件包含可直接使用的登录凭证。请勿上传、分享或保存在不可信位置。</p>
            <ImportControl profiles={profiles} send={send} onImported={load} />
            <button type="button" onClick={() => void exportAll(send, profiles)}>导出全部配置</button>
          </Panel>

          <Panel title="设置">
            <p>数据格式版本：{SCHEMA_VERSION}</p>
            <p>已授权网站：</p>
            <ul>
              {origins.map((origin) => (
                <li key={origin}>
                  {origin}
                  <button type="button" onClick={() => void removeGrantedSite(origin, send, load)}>撤销</button>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      </section>
    </main>
  );
}

function ProfileForm({ profile, send, onSaved }: { profile: AccountProfile; send: Send; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(profile.name);
  const [note, setNote] = useState(profile.note);

  useEffect(() => {
    setName(profile.name);
    setNote(profile.note);
  }, [profile.id, profile.name, profile.note]);

  async function save() {
    await send({
      type: "updateProfile",
      profile: { ...profile, name: name.trim(), normalizedName: normalizeProfileName(name), note, updatedAt: new Date().toISOString() },
    });
    await onSaved();
  }

  async function remove() {
    if (!window.confirm(`删除 ${profile.name}？不会修改当前网站。`)) return;
    await send({ type: "deleteProfile", profileId: profile.id });
    await onSaved();
  }

  return (
    <div className="editor-block">
      <label>账号名称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>备注<input value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <div className="button-row">
        <button type="button" onClick={() => void save()}>保存账号信息</button>
        <button type="button" className="danger" onClick={() => void remove()}>删除账号</button>
      </div>
    </div>
  );
}

function CookieEditor({ profile, send, onSaved }: { profile: AccountProfile; send: Send; onSaved: () => Promise<void> }) {
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
    </div>
  );
}

function WebStorageEditor({ profile, send, onSaved }: { profile: AccountProfile; send: Send; onSaved: () => Promise<void> }) {
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

  return (
    <div className="editor-block">
      {Object.entries(profile.webStorageByOrigin).map(([origin, snapshot]) => (
        <section key={origin} className="storage-origin">
          <h3>{origin}</h3>
          {(["localStorage", "sessionStorage"] as const).map((kind) => (
            <div key={kind}>
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
    <div className="storage-row">
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="panel-body">{children}</div>
    </section>
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
