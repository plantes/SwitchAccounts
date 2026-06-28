import { useEffect, useMemo, useState } from "react";
import type {
  AccountProfile,
  BackgroundRequest,
  CurrentSiteData,
  OperationResult,
} from "../../src/domain/models";
import { searchProfiles } from "../../src/domain/profiles";
import { sendBackground } from "../../src/ui/client";
import { toSafeErrorText } from "../../src/ui/errors";
import "./style.css";

type Send = (request: BackgroundRequest) => Promise<OperationResult<unknown>>;
type RequestPermission = (origins: string[]) => Promise<boolean>;

export default function PopupApp({ tabId, send = sendBackground, requestPermission = requestChromePermission }: {
  tabId: number;
  send?: Send;
  requestPermission?: RequestPermission;
}) {
  const [site, setSite] = useState<CurrentSiteData | null>(null);
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const siteResult = await send({ type: "getCurrentSite", tabId }) as OperationResult<CurrentSiteData>;
    if (!siteResult.ok) {
      setError(toSafeErrorText(siteResult.error));
      return;
    }
    setSite(siteResult.data);
    const listResult = await send({
      type: "listProfiles",
      registrableDomain: siteResult.data.scope.registrableDomain,
    }) as OperationResult<AccountProfile[]>;
    if (listResult.ok) setProfiles(listResult.data);
    else setError(toSafeErrorText(listResult.error));
  }

  useEffect(() => {
    void load();
  }, [tabId]);

  const visibleProfiles = useMemo(() => searchProfiles(profiles, query), [profiles, query]);

  async function run(request: BackgroundRequest, reload = true): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      if (needsSitePermission(request) && site && !site.authorized) {
        const granted = await requestPermission(site.scope.permissionOrigins);
        if (!granted) {
          setError("未获得当前网站权限，无法读取 Cookie 或 Web Storage。");
          return false;
        }
        setSite({ ...site, authorized: true });
      }
      const result = await send(request);
      if (!result.ok) {
        setError(toSafeErrorText(result.error));
        return false;
      }
      if (reload) await load();
      return true;
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "操作失败，请重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createProfile(event: React.FormEvent) {
    event.preventDefault();
    const saved = await run({ type: "createProfile", tabId, name });
    if (saved) {
      setName("");
    }
  }

  if (!site && !error) {
    return <main className="popup-shell loading">加载当前站点…</main>;
  }

  return (
    <main className="popup-shell">
      <header className="brand-bar">
        <img className="brand-mark" src="/icons/switchaccounts.svg" alt="" />
        <div className="brand-lockup">
          <h1 className="brand-name">SwitchAccounts</h1>
          <div className="brand-note">本地账号快照工作台</div>
        </div>
      </header>

      {error && <div role="alert" className="notice danger">{error}</div>}

      {site && (
        <>
          <section className="site-action" aria-label="当前站点与登出">
            <div className="site-copy">
              <span className="field-label">当前站点</span>
              <h2 className="site-host">{site.scope.hostname}</h2>
              <p>注册域 {site.scope.registrableDomain} · Cookie 覆盖全部子域</p>
            </div>
            <button type="button" disabled={busy} className="danger" onClick={() => {
              if (window.confirm("将清除当前网站 Cookie 与 Web Storage，但不会删除已保存账号。")) {
                void run({ type: "resetSite", tabId });
              }
            }}>登出</button>
          </section>

          <section className="panel">
            <h2>保存当前登录状态</h2>
            <form onSubmit={(event) => void createProfile(event)} className="command">
              <label>
                账号名称
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <button disabled={busy || !name.trim()} type="submit">保存</button>
            </form>
          </section>

          <section className="panel">
            <h2>账号快照</h2>
            <label>
              搜索账号
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称" />
            </label>

            {profiles.length === 0 ? (
              <div className="empty">
                <strong>暂无账号快照</strong>
                <p>保存当前登录状态，之后可一键切换。</p>
              </div>
            ) : (
              <div className="profile-list">
                {visibleProfiles.map((profile) => (
                  <article key={profile.id} className="profile-card">
                    <div className="profile-head">
                      <strong>{profile.name}</strong>
                      <span className="profile-time">{formatProfileTime(profile.createdAt)}</span>
                    </div>
                    <div className="actions">
                      <button disabled={busy} aria-label={`切换 ${profile.name}`} onClick={() => {
                        if (window.confirm(`切换到 ${profile.name}？当前网站状态会先被清空。`)) {
                          void run({ type: "switchProfile", tabId, profileId: profile.id }, false);
                        }
                      }}>切换</button>
                      <button disabled={busy} className="secondary" aria-label={`覆盖 ${profile.name}`} onClick={() => {
                        if (window.confirm(`用当前网站状态覆盖 ${profile.name}？`)) {
                          void run({ type: "overwriteProfile", tabId, profileId: profile.id });
                        }
                      }}>覆盖</button>
                      <button disabled={busy} className="danger" aria-label={`删除 ${profile.name}`} onClick={() => {
                        if (window.confirm(`删除 ${profile.name}？不会清理当前网站。`)) {
                          void run({ type: "deleteProfile", profileId: profile.id });
                        }
                      }}>删除</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

async function requestChromePermission(origins: string[]): Promise<boolean> {
  return browser.permissions.request({ origins });
}

function needsSitePermission(request: BackgroundRequest): boolean {
  return request.type === "createProfile"
    || request.type === "overwriteProfile"
    || request.type === "switchProfile"
    || request.type === "resetSite";
}

function formatProfileTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
