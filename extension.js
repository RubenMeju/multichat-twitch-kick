const vscode = require("vscode");
const https = require("https");
const config = vscode.workspace.getConfiguration("twitch-mejudev");
const CLIENT_ID = config.get("clientId");
const CLIENT_SECRET = config.get("clientSecret");
const CHANNEL = config.get("channel");
const WS_URL = config.get("serverUrl");
const HIGHLIGHT_URL = config.get("highlightUrl");
function fetchViewers() {
  return new Promise((resolve) => {
    const tokenReq = https.request(
      {
        hostname: "id.twitch.tv",
        path: `/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
        method: "POST",
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const { access_token } = JSON.parse(body);
            const streamReq = https.request(
              {
                hostname: "api.twitch.tv",
                path: `/helix/streams?user_login=${CHANNEL}`,
                method: "GET",
                headers: {
                  "Client-ID": CLIENT_ID,
                  Authorization: `Bearer ${access_token}`,
                },
              },
              (streamRes) => {
                let streamBody = "";
                streamRes.on("data", (chunk) => (streamBody += chunk));
                streamRes.on("end", () => {
                  try {
                    const data = JSON.parse(streamBody);
                    console.log("data:", data);
                    resolve(data.data?.[0] || null);
                  } catch {
                    resolve(null);
                  }
                });
              },
            );
            streamReq.on("error", () => resolve(null));
            streamReq.end();
          } catch {
            resolve(null);
          }
        });
      },
    );
    tokenReq.on("error", () => resolve(null));
    tokenReq.end();
  });
}

function getWebviewContent() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #0e0e10;
      color: #efeff1;
      display: flex;
      flex-direction: column;
      height: 100vh;
      font-size: 12px;
    }
    #header {
      padding: 8px 12px;
      background: #1f1f23;
      border-bottom: 1px solid #3a3a3d;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #channel { font-weight: bold; color: #9146ff; font-size: 13px; }
    #viewers { color: #00ff88; font-size: 11px; }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .msg { line-height: 1.4; word-break: break-word; }
    .msg .user { font-weight: bold; margin-right: 4px; }
    .msg .text { color: #efeff1; opacity: 0.9; }
    #status {
      padding: 6px 12px;
      background: #1f1f23;
      border-top: 1px solid #3a3a3d;
      color: #adadb8;
      font-size: 10px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="header">
    <span id="channel">mejudev</span>
    <span id="viewers">⚫ ONLINE</span>
  </div>
  <div id="messages"></div>
  <div id="status">Conectando...</div>

  <script>
    const messages = document.getElementById('messages');
    const status = document.getElementById('status');
    const viewers = document.getElementById('viewers');
    const vscode = acquireVsCodeApi();

    function addMessage(user, text, color, platform) {
      const now = new Date();
      const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

      const isTwitch = platform === 'twitch';
      const platformColor = isTwitch ? '#9146ff' : '#53fc18';
      const platformLabel = isTwitch ? 'TWITCH' : 'KICK';
      const userColor = color || platformColor;

      const div = document.createElement('div');
      div.className = 'msg';
      div.style.cursor = 'pointer';
      div.style.padding = '5px 8px';
      div.style.borderRadius = '4px';
      div.style.marginBottom = '2px';
      div.style.transition = 'background 0.15s, border-left 0.15s';
      div.style.borderLeft = '2px solid transparent';

      div.onmouseenter = () => {
        if (!div.dataset.selected) div.style.background = '#1e1e24';
      };

      div.onmouseleave = () => {
        if (!div.dataset.selected) div.style.background = 'transparent';
      };

      div.innerHTML = \`
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;margin-bottom:2px">
          <span style="
            color:#444;
            font-size:9px;
            font-family:monospace;
            flex-shrink:0;
          ">\${time}</span>
          <span style="
            color:\${platformColor};
            font-size:7px;
            font-weight:700;
            background:\${platformColor}20;
            border:1px solid \${platformColor}40;
            padding:1px 4px;
            border-radius:3px;
            letter-spacing:0.08em;
            flex-shrink:0;
          ">\${platformLabel}</span>
          <span style="
            color:\${userColor};
            font-weight:700;
            font-size:11px;
            flex-shrink:0;
            text-shadow:0 0 8px \${userColor}66;
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            max-width:120px;
          ">\${user}</span>
        </div>
        <div style="
          color:#bbb;
          font-size:11px;
          word-break:break-word;
          line-height:1.4;
          padding-left:2px;
        ">\${text}</div>
      \`;

      div.onclick = () => {
        document.querySelectorAll('.msg').forEach(m => {
          delete m.dataset.selected;
          m.style.background = 'transparent';
          m.style.borderLeft = '2px solid transparent';
        });

        div.dataset.selected = 'true';
        div.style.background = \`\${platformColor}12\`;
        div.style.borderLeft = \`2px solid \${platformColor}\`;

        vscode.postMessage({ type: 'highlight-message', user, text, color ,platform});
      };

      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      while (messages.children.length > 100) {
        messages.removeChild(messages.firstChild);
      }
    }

    function connect() {
      const ws = new WebSocket('${WS_URL}');

      ws.onopen = () => {
        status.textContent = '🟢 Conectado';
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'chat-message') {
          console.log("platform:  ", data.platform);
            addMessage(data.user, data.text, data.color, data.platform);
          }
        } catch {}
      };

      ws.onclose = () => {
        status.textContent = '🔴 Desconectado — reconectando...';
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        status.textContent = '⚠️ Error de conexión';
      };
    }

    connect();

    // Recibir viewers desde la extensión
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'viewers') {
        viewers.textContent = msg.text;
      }
    });
  </script>
</body>
</html>`;
}

function sendHighlight(data) {
  const body = JSON.stringify(data);

  const base = WS_URL.replace("wss://", "https://").replace("ws://", "http://");

  const url = new URL(base + "/highlight");
  const req = https.request(
    {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (res) => {
      console.log("res status:", res.statusCode);
    },
  );
  req.on("error", () => {});
  req.write(body);
  req.end();
}

function activate(context) {
  if (!CLIENT_ID || !CLIENT_SECRET || !CHANNEL || !WS_URL) {
    vscode.window.showErrorMessage(
      'Twitch mejudev: Configura todas las opciones en Settings (Ctrl+,) → busca "twitch-mejudev"',
    );
    return;
  }
  // ── Barra de estado ──
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.text = "$(broadcast) Twitch: cargando...";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // ── Panel del chat ──
  const provider = {
    resolveWebviewView(webviewView) {
      webviewView.webview.options = { enableScripts: true };
      webviewView.webview.html = getWebviewContent();

      // Pasar viewers al webview cuando se actualicen
      context._webview = webviewView.webview;

      // ← NUEVO: recibir mensaje destacado y enviarlo al servidor
      webviewView.webview.onDidReceiveMessage((msg) => {
        console.log("msg:", msg);
        if (msg.type === "highlight-message") {
          sendHighlight(msg);
        }
      });
    },
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("twitch-mejudev.chat", provider),
  );

  // ── Polling viewers ──
  async function update() {
    const stream = await fetchViewers();
    console.log("stream data:", stream);

    let viewerText;
    if (stream) {
      const v = stream.viewer_count + 1;
      const emoji = v === 0 ? "👀" : v < 5 ? "🔥" : v < 20 ? "🚀" : "⭐";
      viewerText = `${emoji} ${v} viewers`;
      statusBar.text = `$(broadcast) ${viewerText}`;
      statusBar.tooltip = stream.title;
    } else {
      viewerText = "⚫ OFFLINE";
      statusBar.text = `$(broadcast) ${viewerText}`;
      statusBar.tooltip = `${CHANNEL} no está en directo`;
    }

    if (context._webview) {
      context._webview.postMessage({ type: "viewers", text: viewerText });
    }
  }

  update();
  const interval = setInterval(update, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

function deactivate() {}

module.exports = { activate, deactivate };
