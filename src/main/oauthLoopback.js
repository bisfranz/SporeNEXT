const http = require("http");
const { URL } = require("url");

function startOauthLoopbackServer({
  port = 54321,
  timeoutMs = 2 * 60 * 1000,
} = {}) {
  let resolveWait;
  let rejectWait;
  const waitPromise = new Promise((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout = null;

    const server = http.createServer((req, res) => {
      try {
        const absolute = new URL(req.url || "/", "http://127.0.0.1");

        if (absolute.pathname === "/auth/callback") {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title> </title>
  </head>
  <body style="background:transparent;margin:0;">
    <script>
      (function(){
        try {
          fetch('/token', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: String(window.location.href || '')
          }).catch(function(){});
        } catch (e) {}

        function hardClose(){
          try { window.close(); } catch (e) {}
          try { window.open('', '_self'); window.close(); } catch (e) {}
          try { window.location.replace('about:blank'); } catch (e) {}
          try { document.body && (document.body.innerHTML = ''); } catch (e) {}
        }

        // Attempt to close quickly. If blocked, at least navigate away so the user
        // doesn't get stuck on the callback URL.
        setTimeout(hardClose, 0);
        setTimeout(hardClose, 100);
        setTimeout(function(){
          try { window.history.back(); } catch(e) {}
          hardClose();
        }, 250);
      })();
    </script>
  </body>
</html>`);
          return;
        }

        if (absolute.pathname === "/token" && req.method === "POST") {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("ok");

            const payload = { ok: true, url: String(body || "") };
            try {
              resolveWait(payload);
            } catch {}
          });
          return;
        }

        res.writeHead(404);
        res.end("not found");
      } catch {
        try {
          res.writeHead(500);
          res.end("error");
        } catch {}
      }
    });

    function cleanup() {
      try {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
      } catch {}
      try {
        server.close();
      } catch {}
    }

    server.on("error", (e) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(e);
      }
      try {
        rejectWait(e);
      } catch {}
    });

    server.listen(port, "127.0.0.1", () => {
      settled = true;

      timeout = setTimeout(() => {
        const err = new Error("OAUTH_TIMEOUT");
        try {
          rejectWait(err);
        } catch {}
        cleanup();
      }, timeoutMs);

      resolve({
        port,
        close: cleanup,
        wait: () => waitPromise,
      });
    });
  });
}

module.exports = { startOauthLoopbackServer };
