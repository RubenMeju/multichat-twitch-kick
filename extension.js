const vscode = require("vscode");
const https = require("https");

function getConfig() {
  const config = vscode.workspace.getConfiguration("stream-chat-vscode");
  return {
    CLIENT_ID: config.get("clientId"),
    CLIENT_SECRET: config.get("clientSecret"),
    CHANNEL: config.get("channel"),
    WS_URL: config.get("serverUrl"),
    HIGHLIGHT_URL: config.get("highlightUrl"),
  };
}

function getMissingFields(cfg) {
  const required = {
    clientId: cfg.CLIENT_ID,
    clientSecret: cfg.CLIENT_SECRET,
    channel: cfg.CHANNEL,
    serverUrl: cfg.WS_URL,
  };
  return Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
}

function fetchViewers(cfg) {
  return new Promise((resolve, reject) => {
    const tokenReq = https.request(
      {
        hostname: "id.twitch.tv",
        path: `/oauth2/token?client_id=${cfg.CLIENT_ID}&client_secret=${cfg.CLIENT_SECRET}&grant_type=client_credentials`,
        method: "POST",
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            if (
              parsed.status === 400 ||
              parsed.status === 401 ||
              parsed.error
            ) {
              return reject(
                new Error(
                  `Twitch auth error: ${parsed.message || parsed.error}`,
                ),
              );
            }
            const { access_token } = parsed;
            if (!access_token) {
              return reject(
                new Error(
                  "No se recibió access_token de Twitch. Revisa clientId y clientSecret.",
                ),
              );
            }
            const streamReq = https.request(
              {
                hostname: "api.twitch.tv",
                path: `/helix/streams?user_login=${cfg.CHANNEL}`,
                method: "GET",
                headers: {
                  "Client-ID": cfg.CLIENT_ID,
                  Authorization: `Bearer ${access_token}`,
                },
              },
              (streamRes) => {
                let streamBody = "";
                streamRes.on("data", (chunk) => (streamBody += chunk));
                streamRes.on("end", () => {
                  try {
                    const data = JSON.parse(streamBody);
                    resolve(data.data?.[0] || null);
                  } catch {
                    reject(
                      new Error("Respuesta inválida de la API de Twitch."),
                    );
                  }
                });
              },
            );
            streamReq.on("error", (e) =>
              reject(
                new Error(`Error de red al consultar stream: ${e.message}`),
              ),
            );
            streamReq.end();
          } catch {
            reject(new Error("Respuesta inválida al obtener token de Twitch."));
          }
        });
      },
    );
    tokenReq.on("error", (e) =>
      reject(new Error(`Error de red al autenticar con Twitch: ${e.message}`)),
    );
    tokenReq.end();
  });
}

// El HTML NO contiene ninguna URL hardcodeada.
// La URL del WS se recibe via postMessage { type: 'init', wsUrl, missing }
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
      flex-shrink: 0;
    }
    #channel { font-weight: bold; color: #9146ff; font-size: 13px; }
    #viewers { color: #00ff88; font-size: 11px; }

    .banner {
      display: none;
      padding: 10px 12px;
      font-size: 11px;
      line-height: 1.5;
      flex-shrink: 0;
    }
    .banner.visible { display: block; }

    #banner-missing {
      background: #2a1a1a;
      border-bottom: 2px solid #ff4444;
      color: #ff8888;
    }
    #banner-missing strong { color: #ff4444; display: block; margin-bottom: 4px; font-size: 12px; }
    #banner-missing ul { padding-left: 16px; margin: 4px 0 8px; }
    #banner-missing li { font-family: monospace; font-size: 10px; color: #ffaaaa; margin-bottom: 2px; }

    #banner-ws {
      background: #1e1a10;
      border-bottom: 2px solid #ffaa00;
      color: #ffcc55;
    }
    #banner-ws strong { color: #ffaa00; }

    #banner-twitch {
      background: #1a1a2a;
      border-bottom: 2px solid #9146ff;
      color: #bb99ff;
      font-size: 10px;
    }

    button.action-btn {
      margin-top: 6px;
      background: #9146ff;
      border: none;
      color: white;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      display: inline-block;
    }
    button.action-btn:hover { background: #7a35e0; }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .sys-msg {
      padding: 3px 8px;
      font-size: 10px;
      font-style: italic;
      text-align: center;
      opacity: 0.6;
    }
    #status {
      padding: 6px 12px;
      background: #1f1f23;
      border-top: 1px solid #3a3a3d;
      color: #adadb8;
      font-size: 10px;
      text-align: center;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div id="header">
    <span id="channel">mejudev</span>
    <span id="viewers">⚫ OFFLINE</span>
  </div>

  <div id="banner-missing" class="banner">
    <strong>⚠️ Configuración incompleta</strong>
    Faltan los siguientes campos:
    <ul id="missing-list"></ul>
    <button class="action-btn" onclick="openSettings()">Abrir Configuración</button>
  </div>

  <div id="banner-ws" class="banner">
    <strong>⚡ WebSocket: </strong><span id="ws-error-text">—</span>
  </div>

  <div id="banner-twitch" class="banner">
    ⚠️ Twitch API: <span id="twitch-error-text">—</span>
  </div>

  <div id="messages"></div>
  <div id="status">Esperando configuración...</div>

  <script>
    const messagesEl       = document.getElementById('messages');
    const statusEl         = document.getElementById('status');
    const viewersEl        = document.getElementById('viewers');
    const bannerMissing    = document.getElementById('banner-missing');
    const missingListEl    = document.getElementById('missing-list');
    const bannerWs         = document.getElementById('banner-ws');
    const wsErrorTextEl    = document.getElementById('ws-error-text');
    const bannerTwitch     = document.getElementById('banner-twitch');
    const twitchErrorTextEl = document.getElementById('twitch-error-text');

    const vscode = acquireVsCodeApi();

    let ws = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;

    function openSettings() {
      vscode.postMessage({ type: 'open-settings' });
    }

    function setStatus(text) { statusEl.textContent = text; }

    function showBannerWs(msg) {
      wsErrorTextEl.textContent = msg;
      bannerWs.classList.add('visible');
    }
    function hideBannerWs() { bannerWs.classList.remove('visible'); }

    function addSysMsg(text, color) {
      const div = document.createElement('div');
      div.className = 'sys-msg';
      div.style.color = color || '#666';
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addMessage(user, text, color, platform) {
      const now = new Date();
      const time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
      const isTwitch = platform === 'twitch';
      const platformColor = isTwitch ? '#9146ff' : '#53fc18';
      const platformLabel = isTwitch ? 'TWITCH' : 'KICK';
      const userColor = color || platformColor;

      const div = document.createElement('div');
      div.style.cssText = 'cursor:pointer;padding:5px 8px;border-radius:4px;margin-bottom:2px;transition:background 0.15s,border-left 0.15s;border-left:2px solid transparent;';
      div.onmouseenter = () => { if (!div.dataset.selected) div.style.background = '#1e1e24'; };
      div.onmouseleave = () => { if (!div.dataset.selected) div.style.background = 'transparent'; };
      div.innerHTML =
        '<div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;margin-bottom:2px">' +
          '<span style="color:#444;font-size:9px;font-family:monospace;flex-shrink:0;">' + time + '</span>' +
          '<span style="color:' + platformColor + ';font-size:7px;font-weight:700;background:' + platformColor + '20;border:1px solid ' + platformColor + '40;padding:1px 4px;border-radius:3px;letter-spacing:0.08em;flex-shrink:0;">' + platformLabel + '</span>' +
          '<span style="color:' + userColor + ';font-weight:700;font-size:11px;flex-shrink:0;text-shadow:0 0 8px ' + userColor + '66;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;">' + user + '</span>' +
        '</div>' +
        '<div style="color:#bbb;font-size:11px;word-break:break-word;line-height:1.4;padding-left:2px;">' + text + '</div>';

      div.onclick = () => {
        document.querySelectorAll('[data-selected]').forEach(m => {
          delete m.dataset.selected;
          m.style.background = 'transparent';
          m.style.borderLeft = '2px solid transparent';
        });
        div.dataset.selected = 'true';
        div.style.background = platformColor + '12';
        div.style.borderLeft = '2px solid ' + platformColor;
        vscode.postMessage({ type: 'highlight-message', user, text, color, platform });
      };

      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      while (messagesEl.children.length > 100) messagesEl.removeChild(messagesEl.firstChild);
    }

    function connect(wsUrl) {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) { try { ws.close(); } catch {} ws = null; }

      setStatus('🔄 Conectando a ' + wsUrl + '...');

      let timedOut = false;
      const connectTimeout = setTimeout(() => {
        timedOut = true;
        try { ws.close(); } catch {}
        reconnectAttempts++;
        const delay = Math.min(3000 * reconnectAttempts, 30000);
        showBannerWs('Timeout — ¿está el servidor corriendo en ' + wsUrl + '?');
        setStatus('🔴 Timeout — reintentando en ' + (delay / 1000) + 's...');
        reconnectTimer = setTimeout(() => connect(wsUrl), delay);
      }, 8000);

      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        clearTimeout(connectTimeout);
        showBannerWs('URL inválida: "' + wsUrl + '" — ' + e.message);
        setStatus('❌ URL de WebSocket inválida');
        return;
      }

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        if (timedOut) return;
        hideBannerWs();
        reconnectAttempts = 0;
        setStatus('🟢 Conectado');
        addSysMsg('✓ Chat conectado', '#00ff88');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'chat-message') {
            addMessage(data.user, data.text, data.color, data.platform);
          }
        } catch {}
      };

      ws.onclose = (e) => {
        clearTimeout(connectTimeout);
        if (timedOut) return;
        reconnectAttempts++;
        const delay = Math.min(3000 * reconnectAttempts, 30000);
        const reason = e.reason ? ' (' + e.reason + ')' : ' (código ' + e.code + ')';
        showBannerWs('Conexión cerrada' + reason);
        setStatus('🔴 Desconectado — reintentando en ' + (delay / 1000) + 's...');
        reconnectTimer = setTimeout(() => connect(wsUrl), delay);
      };

      ws.onerror = () => {
        // onerror siempre va seguido de onclose; onclose gestiona el reintento
        showBannerWs('No se puede conectar a ' + wsUrl + ' — ¿está el servidor corriendo?');
        setStatus('⚠️ Error de conexión');
      };
    }

    // ── Recibir mensajes desde la extensión ──
    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'init') {
        if (msg.missing && msg.missing.length > 0) {
          bannerMissing.classList.add('visible');
          missingListEl.innerHTML = '';
          msg.missing.forEach(function(field) {
            const li = document.createElement('li');
            li.textContent = 'stream-chat-vscode.' + field;
            missingListEl.appendChild(li);
          });
          setStatus('❌ Configuración incompleta — abre Settings');
          return;
        }
        if (msg.wsUrl) {
          connect(msg.wsUrl);
        } else {
          setStatus('❌ serverUrl vacío');
        }
      }

      if (msg.type === 'viewers') {
        viewersEl.textContent = msg.text;
      }

      if (msg.type === 'twitch-error') {
        twitchErrorTextEl.textContent = msg.text;
        bannerTwitch.classList.add('visible');
      }
    });
  </script>
</body>
</html>`;
}

function sendHighlight(cfg, data) {
  if (!cfg.HIGHLIGHT_URL) return;
  const body = JSON.stringify(data);
  const url = new URL("/highlight", cfg.HIGHLIGHT_URL);
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
      if (res.statusCode >= 400) {
        console.error(
          `[stream-chat-vscode] highlight error: HTTP ${res.statusCode}`,
        );
      }
    },
  );
  req.on("error", (e) =>
    console.error("[stream-chat-vscode] highlight request failed:", e.message),
  );
  req.write(body);
  req.end();
}

function activate(context) {
  const cfg = getConfig();
  const missing = getMissingFields(cfg);

  // ── Barra de estado ──
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.text = "$(broadcast) Twitch";
  statusBar.show();
  context.subscriptions.push(statusBar);

  if (missing.length > 0) {
    statusBar.text = `$(broadcast) Twitch: ⚠️ Config incompleta`;
    statusBar.tooltip = `Faltan: ${missing.map((f) => "stream-chat-vscode." + f).join(", ")}`;
    statusBar.command = "workbench.action.openSettings";
    vscode.window
      .showWarningMessage(
        `Twitch mejudev: Faltan credenciales (${missing.join(", ")}). Busca "stream-chat-vscode" en Settings.`,
        "Abrir Settings",
      )
      .then((sel) => {
        if (sel === "Abrir Settings") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "stream-chat-vscode",
          );
        }
      });
  }

  // ── Panel del chat ──
  const provider = {
    resolveWebviewView(webviewView) {
      webviewView.webview.options = { enableScripts: true };
      webviewView.webview.html = getWebviewContent();
      context._webview = webviewView.webview;

      // Enviar configuración al webview una vez que el script haya cargado.
      // El webview escucha 'message' desde el principio, pero por seguridad
      // esperamos un tick para que el DOM esté listo.
      setTimeout(() => {
        webviewView.webview.postMessage({
          type: "init",
          missing,
          wsUrl: cfg.WS_URL || null,
        });
      }, 300);

      webviewView.webview.onDidReceiveMessage((msg) => {
        if (msg.type === "highlight-message") {
          sendHighlight(cfg, msg);
        }
        if (msg.type === "open-settings") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "stream-chat-vscode",
          );
        }
      });
    },
  };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "stream-chat-vscode.chat",
      provider,
    ),
  );

  // Sin credenciales no hacemos polling
  if (missing.length > 0) return;

  // ── Polling viewers ──
  async function update() {
    try {
      const stream = await fetchViewers(cfg);
      let viewerText;
      if (stream) {
        const v = stream.viewer_count + 1;
        const emoji = v === 0 ? "👀" : v < 5 ? "🔥" : v < 20 ? "🚀" : "⭐";
        viewerText = `${emoji} ${v} viewers`;
        statusBar.text = `$(broadcast) ${viewerText}`;
        statusBar.tooltip = stream.title;
      } else {
        viewerText = "⚫ OFFLINE";
        statusBar.text = `$(broadcast) ${cfg.CHANNEL} OFFLINE`;
        statusBar.tooltip = `${cfg.CHANNEL} no está en directo`;
      }
      if (context._webview) {
        context._webview.postMessage({ type: "viewers", text: viewerText });
      }
    } catch (err) {
      console.error("[stream-chat-vscode] fetchViewers error:", err.message);
      statusBar.text = `$(broadcast) Twitch: ⚠️ API error`;
      statusBar.tooltip = err.message;
      if (context._webview) {
        context._webview.postMessage({
          type: "twitch-error",
          text: err.message,
        });
      }
    }
  }

  update();
  const interval = setInterval(update, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

function deactivate() {}

module.exports = { activate, deactivate };
