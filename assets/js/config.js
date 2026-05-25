/**
 * FileCourier — Global Configuration
 *
 * All tunable constants live here. Edit this file to:
 *   - Point to a self-hosted PeerJS signaling server (see /peerserver/README.md)
 *   - Adjust chunk size, buffer limits, or timeouts
 *   - Add/replace ICE (STUN/TURN) servers
 *
 * Loaded before i18n.js and app.js.
 */
(function (FC) {
  'use strict';

  /* ── SIGNALING SERVER ────────────────────────────────────────────────────
   * FC.PEER_HOST = '' (empty) → use the PeerJS public cloud (0.peerjs.com).
   *   Always running, no cold start, globally reachable. Recommended default.
   *
   * FC.PEER_HOST = 'your-app.onrender.com' → use a self-hosted PeerJS server.
   *   Better for guaranteed uptime / private deployments, but Render free tier
   *   spins down after 15 min of inactivity (cold start ≈ 30–60 s), which
   *   causes ALL connections — including same-WiFi — to hang until it wakes.
   *   Only use a custom host if it is always-on (paid tier or self-managed VPS).
   * ──────────────────────────────────────────────────────────────────────── */
  FC.PEER_HOST   = '';     // '' = PeerJS cloud; set to your Render URL to self-host
  FC.PEER_PORT   = 443;
  FC.PEER_PATH   = '/peerjs';
  FC.PEER_SECURE = true;
  FC.PEER_DEBUG  = 0;      // 0 = silent, 1 = errors, 2 = warnings, 3 = verbose

  /* ── ICE SERVERS (STUN + TURN) ──────────────────────────────────────────
   * Ordered from cheapest (no relay) → most reliable (TLS relay).
   *
   * Why so many TURN variants?
   *   - UDP/80  : fastest relay; blocked on some networks
   *   - TCP/80  : bypasses UDP-blocking ISPs
   *   - TCP/443 : looks like HTTPS; passes most firewalls
   *   - TLS/443 : TURN over TLS — indistinguishable from HTTPS traffic.
   *               This is the most reliable option for:
   *                 ✓ Mobile CGNAT (carrier-grade NAT)
   *                 ✓ Laptop behind mobile hotspot (double-NAT)
   *                 ✓ Corporate/university firewalls
   *
   * Providers:
   *   - OpenRelay (openrelay.metered.ca)  — free, globally distributed
   *   - FrsTURN  (freeturn.net)           — free secondary relay; fallback if
   *                                         openrelay is blocked by the carrier
   *
   * For better reliability on Bangladesh mobile (Teletalk/Grameenphone) or other
   * carriers that block these free servers, sign up at https://metered.ca/turn
   * (free tier: 50 GB/month) and replace the ICE entries below with the
   * credentials from your Metered dashboard.
   * ──────────────────────────────────────────────────────────────────────── */
  FC.ICE = [
    // STUN — discover public IP; free, no relay bandwidth used
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: ['stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302'] },

    // TURN UDP — relay; fast but may be blocked by strict NATs
    {
      urls:       'turn:openrelay.metered.ca:80',
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls:       'turn:openrelay.metered.ca:443',
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },

    // TURN TCP — relay over TCP; works where UDP is blocked
    {
      urls:       'turn:openrelay.metered.ca:80?transport=tcp',
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls:       'turn:openrelay.metered.ca:443?transport=tcp',
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },

    // TURNS (TURN over TLS) — indistinguishable from HTTPS.
    // Most reliable for mobile hotspot / double-NAT / strict firewall scenarios.
    {
      urls:       'turns:openrelay.metered.ca:443',
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },

  ];

  /* ── TRANSFER SETTINGS ──────────────────────────────────────────────────
   * CHUNK_SIZE    : WebRTC DataChannel sends data in chunks. 64 KB is optimal.
   * BUFFER_HIGH   : Pause reading when the send buffer exceeds this limit.
   *                 Prevents out-of-memory errors on the sender.
   * FALLBACK_MAX  : Maximum file size for the in-memory blob fallback writer.
   *                 Files larger than this require Chrome/Edge (StreamSaver).
   * ──────────────────────────────────────────────────────────────────────── */
  FC.CHUNK_SIZE   = 65536;          // 64 KB
  FC.BUFFER_HIGH  = 8 * 1024 * 1024; // 8 MB
  FC.FALLBACK_MAX = 512 * 1024 * 1024; // 512 MB

  /* ── ICE / CONNECTION TIMEOUTS ──────────────────────────────────────────
   * ICE_RELAY_HINT_MS : After this many ms of 'checking' ICE state, show the
   *                     "Use Relay Mode" suggestion to the user.
   * PEER_RECONNECT_MS : Delay before attempting to reconnect to the signaling
   *                     server after a 'disconnected' event.
   * CANCEL_FLUSH_MS   : How long to wait for a cancel message to send before
   *                     forcibly closing the data channel.
   * ──────────────────────────────────────────────────────────────────────── */
  FC.ICE_RELAY_HINT_MS   = 8000;
  FC.PEER_RECONNECT_MS   = 2000;
  FC.CANCEL_FLUSH_MS     = 400;
  FC.PEER_OPEN_TIMEOUT_MS = 15000; // Show error if signaling server doesn't respond

  /* ── STREAMSAVER ────────────────────────────────────────────────────────
   * MITM page URL for the service-worker download proxy.
   * Must be hosted over HTTPS. Netlify provides HTTPS automatically.
   * ──────────────────────────────────────────────────────────────────────── */
  FC.SS_MITM = 'https://jimmywarting.github.io/StreamSaver.js/mitm.html?version=2.0.0';

}(window.FC = window.FC || {}));
