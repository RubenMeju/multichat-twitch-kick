# Twitch mejudev

> Multichat de Twitch y Kick integrado en VSCode para streamers de programación.

![VSCode](https://img.shields.io/badge/VSCode-^1.80.0-blue) ![Twitch](https://img.shields.io/badge/Twitch-integrado-9146ff) ![Kick](https://img.shields.io/badge/Kick-integrado-53fc18)

---

## ¿Qué hace esta extensión?

- **💬 Multichat en tiempo real** — Panel lateral con el chat de Twitch y Kick sin salir de VSCode
- **🟣 🟢 Identificación por plataforma** — Cada mensaje muestra de qué plataforma viene con su color característico
- **👁 Viewers en la barra de estado** — Número de espectadores actualizado cada 30 segundos
- **⭐ Destacar mensajes en OBS** — Click en cualquier mensaje del chat para mostrarlo en tu overlay de stream
- **🕐 Hora de cada mensaje** — Cada mensaje muestra la hora a la que fue enviado

---

## Requisitos previos

Antes de instalar necesitas tener:

1. **Una app de Twitch** — Créala en [dev.twitch.tv](https://dev.twitch.tv/console/apps)
2. **Un servidor WebSocket** compatible — Esta extensión está diseñada para funcionar con [twitch-overlay-server](https://github.com/RubenMeju) o cualquier servidor que emita eventos WebSocket del tipo `chat-message` y acepte POST en `/highlight`

---

## Instalación

1. Descarga el archivo `.vsix` desde las releases
2. En VSCode: `Ctrl+Shift+P` → **Extensions: Install from VSIX**
3. Selecciona el archivo `.vsix` descargado
4. Recarga VSCode cuando se te pida

---

## Configuración

Tras instalar, abre la configuración de VSCode (`Ctrl+,`) y busca **"twitch-mejudev"**. Debes rellenar estos cuatro campos:

| Campo          | Descripción                         | Ejemplo                     |
| -------------- | ----------------------------------- | --------------------------- |
| `clientId`     | Client ID de tu app de Twitch       | `abc123xyz`                 |
| `clientSecret` | Client Secret de tu app de Twitch   | `secret456`                 |
| `channel`      | Tu nombre de canal en Twitch y Kick | `mejudev`                   |
| `serverUrl`    | URL WebSocket de tu servidor        | `wss://tu-app.onrender.com` |

### ¿Cómo obtener el Client ID y Client Secret de Twitch?

1. Ve a [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps)
2. Click en **Register Your Application**
3. Rellena el nombre y la URL de callback
4. Copia el **Client ID** y genera un **Client Secret**

---

## Uso

### Panel del chat

Una vez configurada, el panel **💬 Twitch Chat** aparece en la barra lateral del explorador de VSCode. Muestra:

- Los mensajes de Twitch y Kick en tiempo real
- Badge de plataforma con color — `TWITCH` en morado `#9146ff`, `KICK` en verde `#53fc18`
- La hora de cada mensaje
- El número de viewers (si estás en directo)

### Destacar un mensaje en OBS

Haz **click en cualquier mensaje** del panel para:

1. Marcarlo con el color de su plataforma en el chat de VSCode
2. Enviarlo automáticamente al overlay de OBS

El mensaje destacado permanece visible en el overlay durante 8 segundos. Para cambiarlo simplemente haz click en otro mensaje.

### Barra de estado

En la parte inferior de VSCode verás:

```
📡 🔥 3 viewers       ← en directo con viewers
📡 ⚫ OFFLINE         ← sin stream activo
```

Los emojis cambian según el número de viewers:

- `👀` — 0 viewers
- `🔥` — menos de 5
- `🚀` — menos de 20
- `⭐` — 20 o más

---

## Servidor compatible

Esta extensión necesita un servidor que:

- Emita mensajes WebSocket de tipo `{ type: "chat-message", user, text, color, platform }`
- Acepte POST en `/highlight` con `{ user, text, color, platform }`

El campo `platform` debe ser `"twitch"` o `"kick"` para que la extensión muestre el badge correcto.

Puedes usar el servidor de referencia en [github.com/RubenMeju](https://github.com/RubenMeju) o construir el tuyo propio.

---

## Licencia

MIT
