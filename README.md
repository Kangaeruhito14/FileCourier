# FileCourier

**Private, server-free P2P file transfer in the browser.**

No uploads. No cloud storage. No file size limits. Files stream directly from sender to receiver over an encrypted WebRTC channel — the server only exchanges a small handshake so the two browsers can find each other, then steps aside.

**Live:** [filecourier.netlify.app](https://filecourier.netlify.app)

---

## What is FileCourier?

FileCourier lets two people transfer a file of any size directly between their browsers without uploading it anywhere. You select the file, share a link, your friend opens it, and the bytes flow straight from your device to theirs. No account, no cloud, no size cap.

---

## Features

- **Zero server storage** — file data never leaves the two browsers
- **No size limit** — Chrome/Edge stream directly to disk; other browsers support up to 512 MB
- **End-to-end encrypted** — WebRTC enforces DTLS-SRTP on every data channel
- **No account needed** — share one link, start transferring
- **Transfer controls** — both sender and receiver can cancel at any time
- **Cross-network** — works through NAT, hotspots, and most firewalls via automatic TURN relay fallback
- **Bilingual UI** — English + Bengali (বাংলা), switchable at any time
- **Mobile-friendly** — responsive layout, works on phones and tablets

---

## How it works

### User flow

1. Sender opens the app — a unique share link is generated instantly
2. Sender copies the link and sends it to the receiver (WhatsApp, SMS, email — anything)
3. Receiver opens the link in their browser
4. A direct WebRTC DataChannel is established between the two browsers
5. The file streams in 64 KB chunks from sender to receiver
6. Receiver's browser saves chunks directly to disk as they arrive — no waiting for the full file

### Architecture

```
Sender browser                         Receiver browser
      │                                       │
      │  ① Register peer ID                   │
      ├──────────────────────────────────────►│  filecourier.onrender.com
      │         PeerJS signaling server       │  (Node.js, PeerJS v1)
      │                                       │
      │  ② ICE candidate exchange             │
      │◄─────────────────────────────────────►│  (metadata only, ~200 bytes total)
      │                                       │
      │  ③ WebRTC DataChannel (P2P or relay)  │
      │◄═════════════════════════════════════►│
      │                                       │
      │  ④ File chunks (64 KB × N)            │
      ├──────────────────────────────────────►│
```

The signaling server is only used to exchange peer IDs and ICE candidates (step ② above). After the WebRTC channel opens, the signaling server is no longer involved.

### ICE — how browsers cross NAT boundaries

WebRTC uses ICE (Interactive Connectivity Establishment) to find the best path between two peers behind NAT routers:

| Phase | Method | Description |
|-------|--------|-------------|
| 1 | **STUN** | Each browser contacts a STUN server to discover its public IP. Both sides exchange these addresses and attempt a direct hole-punch. Succeeds for ~85–90% of home broadband connections. |
| 2 | **TURN relay** | If direct fails (symmetric NAT, CGNAT, strict firewall), both browsers connect to a TURN relay server. All data flows through the relay, encrypted. Slower than direct, but works through almost any network restriction. |

### File writing — three-tier approach

FileCourier tries each tier in order, falling through to the next if unsupported:

| Tier | API | Browsers | Size limit |
|------|-----|----------|-----------|
| 1 | StreamSaver.js | Chrome, Edge | Unlimited — streams to disk |
| 2 | File System Access API | Chrome, Edge | Unlimited — streams to disk |
| 3 | In-memory Blob | All browsers | 512 MB — held in RAM then saved |

---

## Network compatibility

### Where it works reliably

| Connection type | Typical success | How |
|----------------|----------------|-----|
| Home WiFi ↔ Home WiFi (different ISPs, anywhere in the world) | ~90% | Direct P2P via STUN — no relay needed |
| Broadband ↔ Broadband (India, US, EU, UK, Australia, etc.) | ~90% | Direct P2P via STUN — no relay needed |
| Mobile data (major global carriers) ↔ WiFi | ~70–80% | TURN relay handles CGNAT automatically |
| Same-network transfers (same WiFi or LAN) | ~99% | Direct P2P, shortest possible path |

### Where it may partially fail

| Scenario | Reason | What happens |
|----------|--------|-------------|
| Symmetric NAT (some ISPs/routers) | Direct hole-punch impossible | TURN relay takes over — transfer still works |
| Corporate / university network | Strict outbound firewall | TURN relay usually gets through on port 443 |
| Mobile data behind CGNAT | Can't accept inbound connections | TURN relay handles it; see below for exceptions |

### Known limitation — some restrictive mobile carriers

A small number of mobile carriers apply IP-level filtering that blocks the free TURN relay servers used by FileCourier. When this happens:

- Direct P2P fails (CGNAT blocks it)
- Relay also fails (carrier blocks the relay server IP ranges)

**Workaround:** Connect the mobile device to WiFi instead of mobile data. The connection will establish immediately.

This behaviour has been observed on certain South/South-East Asian carriers. It is **not** a fundamental limitation of the technology — it is carrier-specific. Major global carriers (Jio, Airtel, Vodafone, T-Mobile, AT&T, Comcast, BT, Telstra, etc.) do not exhibit this.

### The relay flow — step by step

If a direct connection does not open within 8 seconds:

1. A yellow **"Connect via Relay"** button appears on the **receiver's** screen
2. Receiver clicks it — the app reconnects through TURN relay servers
3. The sender's link stays valid — no need to refresh or generate a new link
4. The sender's screen shows an advisory to wait; no action needed from sender

---

## Browser compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| P2P transfer | ✅ | ✅ | ✅ | ✅ |
| StreamSaver (unlimited size, stream to disk) | ✅ | ✅ | ❌ | ❌ |
| File System Access API | ✅ | ✅ | ❌ | ❌ |
| In-memory fallback (≤ 512 MB) | ✅ | ✅ | ✅ | ✅ |

**Recommendation:** Use Chrome or Edge when sending or receiving files larger than 512 MB.

---

## Project structure

```
FileCourier/
├── index.html              # Landing page — features, FAQ, how-it-works
├── app.html                # Transfer app shell — loads all scripts
├── netlify.toml            # Security headers + /app → /app.html rewrite
├── assets/
│   ├── css/
│   │   └── style.css       # Full design system (CSS custom properties, all components)
│   └── js/
│       ├── config.js       # All tunable constants: TURN servers, timeouts, chunk sizes
│       ├── i18n.js         # Bilingual strings — EN + BN; FC.t(), FC.setLang()
│       └── app.js          # P2P transfer controller (~960 lines)
└── peerserver/
    ├── index.js            # PeerJS signaling server (deploy to Render.com)
    └── package.json
```

### Key design decisions

**`window.FC` namespace** — all three JS files extend `window.FC = window.FC || {}`. No bundler, no build step — pure browser JavaScript.

**Deferred load order** — `app.html` loads scripts with `defer` in this order: PeerJS CDN → StreamSaver CDN → `config.js` → `i18n.js` → `app.js`. `DOMContentLoaded` fires after all deferred scripts have executed, guaranteeing all `FC.*` constants exist before `app.js` runs.

**Backpressure** — before sending each 64 KB chunk, `app.js` checks `dc.bufferedAmount`. If it exceeds `FC.BUFFER_HIGH` (8 MB), sending pauses until the `bufferedamountlow` event fires. This prevents out-of-memory errors on the sender for very large files.

**ICE timer placement** — the relay hint timer starts when a connection *attempt* is made (not when the connection opens). This is critical: if ICE fails, the `open` event never fires, so the timer must be started before it.

**Zombie connection guard** — when a second connection attempt arrives at the sender, the app checks `conn.open` (not just `conn`). A failed ICE attempt leaves a zombie `conn` object with `open === false`. Checking `conn.open` allows the sender to accept a fresh retry from the receiver without a page refresh.

---

## Deployment

### Frontend — Netlify (recommended, free)

1. Fork this repository to your GitHub account
2. On [Netlify](https://app.netlify.com): **Add new site → Import an existing project → GitHub**
3. Select the repo — no build command needed, publish directory is `.` (root)
4. Deploy — Netlify provides HTTPS automatically
5. Every `git push` to `main` triggers a redeployment

### Signaling server — Render.com (free tier)

The `peerserver/` directory is a minimal Node.js PeerJS signaling server. It only brokers peer discovery — it never sees file data.

1. On [Render.com](https://render.com): **New → Web Service**
2. Connect your GitHub repo; set **Root Directory** to `peerserver`
3. Build command: `npm install`
4. Start command: `npm start`
5. Plan: **Free**
6. After deploy, Render gives you a URL like `https://your-app.onrender.com`
7. In `assets/js/config.js`, set: `FC.PEER_HOST = 'your-app.onrender.com';`
8. Commit and push — Netlify redeploys automatically

> **Render free tier note:** The server spins down after 15 minutes of inactivity. The first connection after a cold start may take 20–30 seconds while Render wakes it up. The app detects this (503 error) and retries automatically — the user sees "Reconnecting to server..." briefly, then continues normally.

---

## Configuration

All constants live in `assets/js/config.js` and are documented inline:

```js
/* ── Signaling server ──────────────────────────────────────── */
FC.PEER_HOST   = 'filecourier.onrender.com';  // Set to your Render URL
FC.PEER_PORT   = 443;
FC.PEER_PATH   = '/peerjs';
FC.PEER_SECURE = true;
FC.PEER_DEBUG  = 0;  // 0 = silent | 1 = errors | 2 = warnings | 3 = verbose

/* ── Transfer ──────────────────────────────────────────────── */
FC.CHUNK_SIZE   = 65536;              // 64 KB per DataChannel send
FC.BUFFER_HIGH  = 8 * 1024 * 1024;   // Pause sending above 8 MB buffered
FC.FALLBACK_MAX = 512 * 1024 * 1024; // In-memory Blob cap (non-Chrome browsers)

/* ── Timeouts ──────────────────────────────────────────────── */
FC.ICE_RELAY_HINT_MS = 8000;  // Show relay hint after 8 s of failed ICE
FC.PEER_RECONNECT_MS = 2000;  // Delay before signaling-server reconnect
FC.CANCEL_FLUSH_MS   = 400;   // Wait before force-closing after cancel
```

### TURN servers

The default TURN configuration in `config.js` uses two free public relay providers:

| Provider | Servers | Notes |
|----------|---------|-------|
| `openrelay.metered.ca` | UDP/80, UDP/443, TCP/80, TCP/443, TLS/443 | Globally distributed |
| `freeturn.net` | UDP/3478, TLS/5349 | Secondary fallback |

These are sufficient for the vast majority of users. If you need guaranteed relay for networks where these providers are blocked (see [Known limitation](#known-limitation--some-restrictive-mobile-carriers)):

**Option A — Metered.ca free tier (50 GB relay/month)**

1. Sign up at [metered.ca](https://metered.ca/turn) — free account
2. Create a project → copy your ICE credentials from the dashboard
3. Replace `FC.ICE` in `config.js` with your credentials

> **Security note:** Static TURN credentials in client-side JavaScript are readable by anyone who opens DevTools. For a public production app with many users, generate short-lived credentials server-side (e.g. a Netlify Function that calls the Metered.ca REST API) so the real API key is never shipped to the browser. Each user gets a 1-hour credential that expires after their session.

---

## Languages

All UI strings are in `assets/js/i18n.js`. Current locales: `en` (English), `bn` (Bengali / বাংলা).

API:

```js
FC.t('key')           // translate key in active locale
FC.t('key', 'value')  // replace single {v} placeholder
FC.setLang('bn')      // switch locale and update all data-i18n elements
FC.getLang()          // returns active locale code
FC.onLangChange       // assign a function — called after every locale switch
```

To add a new locale, add a matching key block under a new locale code in `_T` and add a language button in `app.html` / `index.html`.

---

## Privacy

| | Detail |
|---|---|
| **File data** | Never leaves the two browsers — pure P2P |
| **Signaling metadata** | Peer IDs and ICE candidates only; never stored, discarded after connection |
| **Relay traffic** | Passes through TURN server encrypted (DTLS) only if direct P2P fails |
| **Analytics** | None |
| **Cookies** | None |
| **Accounts** | None required |

---

## License

MIT — free to use, modify, and self-host.
