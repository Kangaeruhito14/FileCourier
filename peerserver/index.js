/**
 * FileCourier — PeerJS Signaling Server
 *
 * Deploy this to Render.com (free tier) for a dedicated, reliable signaling
 * server. The free PeerJS cloud (0.peerjs.com) can be unreliable from
 * mobile SIM networks in South/South-East Asia — your own server avoids that.
 *
 * ── Deployment steps ──────────────────────────────────────────────────────
 *  1. Push this directory (peerserver/) to a GitHub repository.
 *  2. On Render.com: New → Web Service → connect your repo.
 *     - Build Command:  npm install
 *     - Start Command:  npm start
 *     - Environment:    Node
 *     - Plan:           Free
 *  3. After deploy, Render gives you a URL like:
 *       https://my-peerserver.onrender.com
 *  4. In FileCourier's config.js, set:
 *       FC.PEER_HOST = 'my-peerserver.onrender.com';
 *     Leave FC.PEER_PORT = 443 and FC.PEER_PATH = '/peerjs' (the defaults).
 *
 * ── Local testing ──────────────────────────────────────────────────────────
 *   node index.js
 *   # Server listens on http://localhost:9000/peerjs
 *
 * ── Environment variables ─────────────────────────────────────────────────
 *   PORT  — TCP port to listen on (Render sets this automatically; default 9000)
 * ──────────────────────────────────────────────────────────────────────────
 */
'use strict';

var { PeerServer } = require('peer');

var PORT = parseInt(process.env.PORT, 10) || 9000;

var server = PeerServer({
  port: PORT,
  path: '/peerjs',

  /*
   * Stale peer cleanup — remove peers that have not sent a heartbeat for
   * more than 5 minutes. Prevents memory growth on the free Render instance.
   * alive_timeout is still supported in peer v1.x.
   */
  alive_timeout: 300000,   // 5 min
});

server.on('connection', function (client) {
  console.log('[peer] connected:', client.getId());
});

server.on('disconnect', function (client) {
  console.log('[peer] disconnected:', client.getId());
});

console.log('FileCourier PeerServer running on port ' + PORT + ' (path: /peerjs)');
