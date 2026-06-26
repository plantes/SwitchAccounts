import { useEffect, useMemo, useState } from "react";
import type { AccountProfile, BackgroundRequest, OperationResult } from "../../src/domain/models";
import { searchProfiles } from "../../src/domain/profiles";
import { sendBackground } from "../../src/ui/client";
import { toSafeErrorText } from "../../src/ui/errors";
import "./style.css";

type Send = (request: BackgroundRequest) => Promise<OperationResult<unknown>>;

export default function OptionsApp({ send = sendBackground }: { send?: Send }) {
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

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
              <article key={profile.id} className="row-card">
                <div>
                  <strong>{profile.registrableDomain}</strong>
                  <span>{profile.name} · {profile.note || "无备注"}</span>
                </div>
                <small>{profile.cookies.length} Cookies · {Object.keys(profile.webStorageByOrigin).length} Origins</small>
              </article>
            ))}
          </Panel>

          <Panel title="Cookie 编辑器">
            {filtered.flatMap((profile) => profile.cookies.map((cookie) => (
              <article key={`${profile.id}-${cookie.name}-${cookie.domain}-${cookie.path}`} className="cookie-row">
                <strong>{cookie.name}</strong>
                <span>{cookie.domain}</span>
                <span>{cookie.path}</span>
                <small>{cookie.secure ? "Secure" : "Insecure"} · {cookie.httpOnly ? "HttpOnly" : "Script-readable"}</small>
              </article>
            )))}
          </Panel>

          <Panel title="导入 / 导出">
            <p className="warning">导出文件包含可直接使用的登录凭证。请勿上传、分享或保存在不可信位置。</p>
            <button type="button" onClick={() => void exportAll(send, profiles)}>导出全部配置</button>
          </Panel>

          <Panel title="设置">
            <p>数据格式版本：1</p>
            <p>已授权网站：</p>
            <ul>
              {origins.map((origin) => <li key={origin}>{origin}</li>)}
            </ul>
          </Panel>
        </section>
      </section>
    </main>
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
