import { useEffect, useRef, useState } from "react";
import type { AccountProfile, BackgroundRequest, CookieSnapshot, OperationResult, WebStorageSnapshot } from "../../src/domain/models";
import { CookieSnapshotSchema } from "../../src/domain/schemas";
import { toSafeErrorText } from "../../src/ui/errors";

type Send = (request: BackgroundRequest) => Promise<OperationResult<unknown>>;
type StorageKind = "localStorage" | "sessionStorage";
export interface EditorProps {
  profile: AccountProfile;
  send: Send;
  onSaved: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

export async function requestData<T>(send: Send, request: BackgroundRequest): Promise<T> {
  const result = await send(request);
  if (!result.ok) throw new Error(toSafeErrorText(result.error));
  return result.data as T;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

function useEditor({ profile, send, onSaved, onDirtyChange }: EditorProps) {
  const [draft, setDraft] = useState(profile);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!dirty) setDraft(profile); }, [profile, dirty]);
  function change(update: (current: AccountProfile) => AccountProfile) {
    setDraft(update);
    setDirty(true);
    onDirtyChange(true);
  }
  async function save(renameOnly = false) {
    setBusy(true);
    setError("");
    try {
      await requestData(send, renameOnly
        ? { type: "renameProfile", profileId: profile.id, name: draft.name.trim() }
        : { type: "updateProfile", profile: draft });
      await onSaved();
      setDirty(false);
      onDirtyChange(false);
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  async function reload() {
    if (dirty && !window.confirm("放弃当前未保存修改，并重新载入账号？")) return;
    setBusy(true);
    setError("");
    try { await onSaved(); setDirty(false); onDirtyChange(false); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return { draft, change, dirty, busy, error, setError, setBusy, save, reload };
}

function EditorStatus({ editor, saveLabel, renameOnly = false }: { editor: ReturnType<typeof useEditor>; saveLabel: string; renameOnly?: boolean }) {
  return <div className="editor-status">
    {editor.error && <div role="alert" className="notice danger">{editor.error}</div>}
    <p role="status">{editor.dirty ? "有未保存修改" : "修改后请保存"}</p>
    <div className="button-row">
      <button disabled={editor.busy || !editor.dirty} type="button" onClick={() => void editor.save(renameOnly)}>{saveLabel}</button>
      <button disabled={editor.busy} type="button" className="secondary" onClick={() => void editor.reload()}>重新载入</button>
    </div>
  </div>;
}

export function OverviewTab(props: EditorProps) {
  const editor = useEditor(props);
  async function remove() {
    if (!window.confirm(`删除 ${props.profile.name}？不会修改当前网站。`)) return;
    editor.setBusy(true); editor.setError("");
    try {
      await requestData(props.send, { type: "deleteProfile", profileId: props.profile.id });
      props.onDirtyChange(false);
      await props.onSaved();
    } catch (error) { editor.setError(errorText(error)); }
    finally { editor.setBusy(false); }
  }
  return <div className="overview-grid">
    <label className="wide-field">账号名称<input disabled={editor.busy} value={editor.draft.name} onChange={(event) => editor.change(current => ({ ...current, name: event.target.value }))} /></label>
    <div className="stat-card"><strong>{props.profile.cookies.length}</strong><span>Cookies</span></div>
    <div className="stat-card"><strong>{Object.keys(props.profile.webStorageByOrigin).length}</strong><span>Origins</span></div>
    <EditorStatus editor={editor} saveLabel="保存账号信息" renameOnly />
    <button disabled={editor.busy} type="button" className="danger" onClick={() => void remove()}>删除账号</button>
  </div>;
}

export function CookieTab(props: EditorProps) {
  const editor = useEditor(props);
  const [filter, setFilter] = useState("");
  // Indices remain stable while editing fields; deleting explicitly removes the corresponding row.
  function update(index: number, patch: Partial<CookieSnapshot>) {
    editor.change(current => ({ ...current, cookies: current.cookies.map((cookie, i) => {
      if (i !== index) return cookie;
      const next = { ...cookie, ...patch };
      if (next.session) delete next.expirationDate;
      return next;
    }) }));
  }
  async function save() {
    for (const cookie of editor.draft.cookies) {
      if (!CookieSnapshotSchema.safeParse(cookie).success) {
        editor.setError("Cookie 字段非法：请检查路径、SameSite/Secure 和过期时间。");
        return;
      }
    }
    await editor.save();
  }
  return <div className="editor-block">
    <EditorStatus editor={{ ...editor, save }} saveLabel="保存 Cookie 修改" />
    <label>Cookie 搜索<input value={filter} onChange={event => setFilter(event.target.value)} placeholder="名称、域名或路径" /></label>
    <fieldset disabled={editor.busy} className="editor-fields">
      {editor.draft.cookies.map((cookie, index) => {
        const visible = `${cookie.name} ${cookie.domain} ${cookie.path}`.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());
        return <article key={index} className="cookie-row" hidden={!visible}>
          <div className="record-head"><strong>{cookie.name || "（无名称 Cookie）"}</strong><small><span>{cookie.domain}</span><span>{cookie.path}</span></small></div>
          <label>名称<input value={cookie.name} onChange={event => update(index, { name: event.target.value })} /></label>
          <label>值<EditableValue label="值" value={cookie.value} onChange={value => update(index, { value })} /></label>
          <label>域名<input value={cookie.domain} onChange={event => update(index, { domain: event.target.value })} /></label>
          <label>路径<input value={cookie.path} onChange={event => update(index, { path: event.target.value })} /></label>
          <label><input type="checkbox" checked={cookie.secure} onChange={event => update(index, { secure: event.target.checked })} /> Secure</label>
          <label><input type="checkbox" checked={cookie.httpOnly} onChange={event => update(index, { httpOnly: event.target.checked })} /> HttpOnly</label>
          <label>SameSite<select value={cookie.sameSite} onChange={event => update(index, { sameSite: event.target.value as CookieSnapshot["sameSite"] })}>
            <option value="lax">Lax</option><option value="strict">Strict</option><option value="no_restriction">None</option><option value="unspecified">Unspecified</option>
          </select></label>
          <label><input type="checkbox" checked={cookie.session} onChange={event => update(index, event.target.checked ? { session: true } : { session: false, expirationDate: Math.floor(Date.now() / 1000) + 31_536_000 })} /> Session cookie</label>
          <label>Expiration<input type="number" min="1" disabled={cookie.session} value={cookie.expirationDate || ""} onChange={event => update(index, { expirationDate: Number(event.target.value) })} /></label>
          <small className="record-meta">hostOnly: {String(cookie.hostOnly)} · storeId: {cookie.storeId}{cookie.partitionKey ? " · partitioned" : ""}</small>
          <button type="button" className="danger" onClick={() => editor.change(current => ({ ...current, cookies: current.cookies.filter((_, i) => i !== index) }))}>删除 Cookie</button>
        </article>;
      })}
    </fieldset>
  </div>;
}

export function WebStorageTab(props: EditorProps) {
  const editor = useEditor(props);
  function update(origin: string, kind: StorageKind, key: string, value?: string) {
    editor.change(current => {
      const snapshot = current.webStorageByOrigin[origin]!;
      const values = { ...snapshot[kind] };
      if (value === undefined) delete values[key];
      else Object.defineProperty(values, key, { value, enumerable: true, configurable: true, writable: true });
      const next: WebStorageSnapshot = { ...snapshot, [kind]: values };
      return { ...current, webStorageByOrigin: { ...current.webStorageByOrigin, [origin]: next } };
    });
  }
  return <div className="editor-block">
    <EditorStatus editor={editor} saveLabel="保存 Web Storage 修改" />
    <fieldset disabled={editor.busy} className="editor-fields">
      {Object.entries(editor.draft.webStorageByOrigin).map(([origin, snapshot]) => <section key={origin} className="storage-origin">
        <h3>{origin}</h3>
        {(["localStorage", "sessionStorage"] as const).map(kind => <div key={kind} className="storage-kind">
          <strong>{kind}</strong>
          {Object.entries(snapshot[kind]).map(([key, value]) => <div key={key} className="storage-row">
            <span>{key}</span><EditableValue label={`${kind} ${key}`} value={value} onChange={value => update(origin, kind, key, value)} />
            <button type="button" className="danger" onClick={() => update(origin, kind, key)}>删除</button>
          </div>)}
          <StorageAddForm kind={kind} onAdd={(key, value) => update(origin, kind, key, value)} />
        </div>)}
      </section>)}
    </fieldset>
  </div>;
}

function EditableValue({ value, onChange, label }: { value: string; onChange: (value: string) => void; label?: string }) {
  const [text, setText] = useState(() => formatJsonValue(value));
  const previous = useRef(value);
  useEffect(() => {
    if (value !== previous.current) { previous.current = value; setText(formatJsonValue(value)); }
  }, [value]);
  return <textarea aria-label={label} value={text} onChange={event => {
    const next = event.target.value;
    previous.current = next;
    setText(next);
    onChange(next);
  }} />;
}

// Whitespace-only formatting preserves large numeric IDs and escapes exactly.
function formatJsonValue(value: string): string {
  try { JSON.parse(value); } catch { return value; }
  if (!/^[\s]*[\[{]/.test(value)) return value;
  let result = "", depth = 0, quoted = false, escaped = false;
  const newline = () => "\n" + "  ".repeat(depth);
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (/\s/.test(char)) continue;
    if (char === '"') { quoted = true; result += char; }
    else if (char === "{" || char === "[") {
      result += char; depth++;
      if (!/^[\s]*[\]}]/.test(value.slice(index + 1))) result += newline();
    } else if (char === "}" || char === "]") {
      depth--;
      if (!/[\[{]$/.test(result)) result += newline();
      result += char;
    } else if (char === ",") result += char + newline();
    else if (char === ":") result += ": ";
    else result += char;
  }
  return result;
}

function StorageAddForm({ kind, onAdd }: { kind: StorageKind; onAdd: (key: string, value: string) => void }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  return <div className="storage-row add-row">
    <input aria-label={`${kind} key`} placeholder={kind === "localStorage" ? "storage key" : "session storage key"} value={key} onChange={event => setKey(event.target.value)} />
    <textarea aria-label={`${kind} value`} placeholder={kind === "localStorage" ? "storage value" : "session storage value"} value={value} onChange={event => setValue(event.target.value)} />
    <button type="button" onClick={() => {
      if (!key.trim()) return window.alert("Storage key 不能为空。");
      onAdd(key.trim(), value); setKey(""); setValue("");
    }}>添加 {kind}</button>
  </div>;
}
