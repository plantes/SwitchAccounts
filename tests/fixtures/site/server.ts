import http from "node:http";

export interface TestSite {
  port: number;
  url: (path: string, host?: "example.test" | "sub.example.test") => string;
  close: () => Promise<void>;
}

export async function startTestSite(): Promise<TestSite> {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://example.test");
    const account = url.searchParams.get("account") ?? "";

    if (url.pathname === "/set") {
      response.setHeader("Set-Cookie", [
        `domain_account=${account}; Domain=.example.test; Path=/; SameSite=Lax`,
        `host_account=${account}; Path=/; SameSite=Lax`,
        `session_account=${account}; Path=/; SameSite=Lax`,
        `persistent_account=${account}; Max-Age=3600; Path=/; SameSite=Lax`,
        `http_only_account=${account}; HttpOnly; Path=/; SameSite=Lax`,
      ]);
      response.writeHead(200, { "content-type": "text/html;charset=utf-8" });
      response.end(renderPage(`
        <h1>Account ${escapeHtml(account)}</h1>
        <script>
          localStorage.setItem("account", ${JSON.stringify(account)});
          sessionStorage.setItem("account", ${JSON.stringify(account)});
          document.body.dataset.local = localStorage.getItem("account") || "";
          document.body.dataset.session = sessionStorage.getItem("account") || "";
        </script>
      `, request.headers.cookie ?? ""));
      return;
    }

    response.writeHead(200, { "content-type": "text/html;charset=utf-8" });
    response.end(renderPage(`
      <h1>State</h1>
      <script>
        document.body.dataset.local = localStorage.getItem("account") || "";
        document.body.dataset.session = sessionStorage.getItem("account") || "";
      </script>
    `, request.headers.cookie ?? ""));
  });

  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test site did not start on a TCP port");

  return {
    port: address.port,
    url: (path, host = "example.test") => `http://${host}:${address.port}${path}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function renderPage(body: string, cookies: string): string {
  return `<!doctype html>
    <html>
      <head><title>SwitchAccounts fixture</title></head>
      <body data-local="" data-session="">
        <pre id="server-cookies">${escapeHtml(cookies)}</pre>
        ${body}
      </body>
    </html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]!));
}
