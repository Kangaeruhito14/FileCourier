/**
 * FileCourier — Application Controller
 *
 * Handles the full P2P file transfer lifecycle:
 *   - Sender: drop-zone file selection → chunked send with backpressure → done
 *   - Receiver: connect to sender → three-tier writer → save to disk → done
 *   - Cancel: bi-directional {type:'cancel'} message over data channel
 *   - ICE monitoring: relay hint after FC.ICE_RELAY_HINT_MS, force-relay retry
 *   - Reconnect: peer.reconnect() on signaling-server 'disconnected' event
 *   - Bilingual: every dynamic string goes through FC.t(); FC.onLangChange re-renders
 *
 * Requires (in load order): PeerJS CDN, StreamSaver CDN, config.js, i18n.js
 * Namespace: window.FC (extended, not replaced)
 */
(function (FC) {
  'use strict';

  /* ── Connection state ──────────────────────────────────────── */
  var peer         = null;
  var conn         = null;
  var myPeerId     = null;
  var isSender     = false;

  /* Sender */
  var selectedFile  = null;
  var sending       = false;
  var sendCancelled = false;

  /* Receiver */
  var writerReady    = false;
  var writer         = null;   // StreamSaver writer | FSAA WritableStream | null (fallback)
  var fallbackChunks = [];
  var receivedBytes  = 0;
  var expectedBytes  = 0;
  var expectedName   = '';
  var pendingChunks  = [];     // buffered before writer opens
  var doneQueued     = false;  // 'done' arrived before writer opened
  var recvCancelled  = false;

  /* ICE / relay */
  var useRelay       = false;
  var iceHintTimer   = null;
  var relayShown     = false;

  /* Current view re-renderer (called on language change) */
  var _renderView    = null;

  /* ── Boot ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    wireLanguageToggle();

    var targetId = new URLSearchParams(location.search).get('to');
    isSender = !targetId;

    if (isSender) {
      startSenderMode();
    } else {
      startReceiverMode(targetId);
    }
  });

  FC.onLangChange = function () {
    if (typeof _renderView === 'function') { _renderView(); }
  };

  /* ── Language toggle ───────────────────────────────────────── */
  function wireLanguageToggle() {
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lang = btn.dataset.lang;
        FC.setLang(lang);
        document.querySelectorAll('.lang-btn').forEach(function (b) {
          b.classList.toggle('active', b.dataset.lang === lang);
        });
      });
    });
  }

  /* ── PeerJS factory ────────────────────────────────────────── */
  function buildPeerOptions() {
    var opts = {
      debug: FC.PEER_DEBUG,
      config: {
        iceServers: FC.ICE,
        iceTransportPolicy: useRelay ? 'relay' : 'all',
      },
    };
    if (FC.PEER_HOST) {
      opts.host   = FC.PEER_HOST;
      opts.port   = FC.PEER_PORT;
      opts.path   = FC.PEER_PATH;
      opts.secure = FC.PEER_SECURE;
    }
    return opts;
  }

  function createPeer(onOpen) {
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }

    peer = new Peer(buildPeerOptions());

    peer.on('open', function (id) {
      myPeerId = id;
      if (typeof onOpen === 'function') { onOpen(id); }
    });

    peer.on('disconnected', function () {
      setStatus(FC.t('sReconnecting'), 'warning');
      setTimeout(function () {
        if (peer && !peer.destroyed) { peer.reconnect(); }
      }, FC.PEER_RECONNECT_MS);
    });

    peer.on('error', function (err) {
      var type = err.type || '';
      if (type === 'peer-unavailable') { clearIceTimer(); showNoConn(); return; }
      if (type === 'network' || type === 'server-error' || type === 'socket-error') {
        setStatus(FC.t('sNetErr', err.message || type), 'error');
        /* Render free tier cold start: server returns 503, auto-retry after 3 s */
        setTimeout(function () {
          if (peer && !peer.destroyed) { peer.reconnect(); }
        }, 3000);
        return;
      }
      setStatus(FC.t('sConnErr', type), 'error');
    });

    return peer;
  }

  /* ══════════════════════════════════════════════════════════════
     SENDER MODE
  ══════════════════════════════════════════════════════════════ */

  function startSenderMode() {
    _renderView = renderSenderIdle;
    renderSenderIdle();

    createPeer(function (id) {
      myPeerId = id;
      renderSenderStep1(id);
    });

    peer.on('connection', function (c) {
      /* Only block if a transfer is actually in progress (conn.open = true).
         If the previous ICE attempt left a zombie (open=false), replace it. */
      if (conn && conn.open) { c.close(); return; }
      if (conn) { try { conn.close(); } catch (e) {} }
      conn = c;
      startIceTimer();  // start countdown before open fires
      hookSenderConn(c);
    });
  }

  /* ── Sender views ──────────────────────────────────────────── */

  function renderSenderIdle() {
    _renderView = renderSenderIdle;
    setRoot(
      '<div class="status-bar neutral">' +
        dot() + '<span>' + t('sInit') + '</span>' +
      '</div>' +
      '<p class="notice">' + t('step1Label') + '</p>'
    );
  }

  function renderSenderStep1(peerId) {
    _renderView = function () { renderSenderStep1(peerId); };
    var url = shareUrl(peerId);

    setRoot(
      statusBar('online', t('sOnline')) +

      '<span class="share-label">' + t('shareLabel') + '</span>' +
      '<div class="link-share">' +
        '<div class="link-box" id="link-box">' + esc(url) + '</div>' +
        '<button class="btn btn-primary btn-sm" id="btn-copy">' + t('btnCopy') + '</button>' +
      '</div>' +

      '<p class="notice mt-12">' + t('noticeKeep') + '</p>' +
      '<p class="notice mt-8" style="font-weight:600;color:var(--clr-text);border-color:var(--clr-border)">' +
        t('step1Label') +
      '</p>' +

      dropZone() +
      '<div id="relay-hint-wrap"></div>'
    );

    wireCopy(url);
    wireDropZone();
  }

  function renderSenderWaiting(peerId) {
    _renderView = function () { renderSenderWaiting(peerId); };

    setRoot(
      statusBar('online', t('sConnReady')) +

      '<p class="notice mt-8" style="font-weight:700;color:var(--clr-brand);border-color:var(--clr-brand-l)">' +
        t('friendReady') +
      '</p>' +

      dropZone() +
      '<div id="relay-hint-wrap"></div>'
    );

    wireDropZone();
  }

  function renderSendProgress(file, sent) {
    _renderView = function () { renderSendProgress(file, sent); };
    var pct = pctOf(sent, file.size);

    setRoot(
      statusBar('info', t('labelSending')) +

      '<div class="file-card">' +
        '<div class="file-icon">' + fileEmoji(file.name) + '</div>' +
        '<div class="file-info">' +
          '<div class="file-name">' + esc(file.name) + '</div>' +
          '<div class="file-size">' + fmt(file.size) + '</div>' +
        '</div>' +
        '<span class="file-badge uploading">' + t('labelUploading') + '</span>' +
      '</div>' +

      progressBar(pct, fmt(sent) + ' / ' + fmt(file.size), pct + '%') +

      '<p class="notice mt-12">' + t('noticeSending') + '</p>' +
      '<div class="mt-16">' +
        '<button class="btn btn-danger btn-sm" id="btn-cancel-send">' + t('btnCancel') + '</button>' +
      '</div>'
    );

    on('btn-cancel-send', 'click', cancelSend);
  }

  function updateSendProgress(file, sent) {
    var p    = pctOf(sent, file.size);
    var fill = ge('prog-fill');
    var lbl  = ge('prog-lbl');
    var plab = ge('prog-pct');
    if (fill) { fill.style.width = p + '%'; }
    if (lbl)  { lbl.textContent  = fmt(sent) + ' / ' + fmt(file.size); }
    if (plab) { plab.textContent = p + '%'; }
  }

  function showSendDone() {
    _renderView = showSendDone;
    setRoot(resultPanel('&#9989;', t('titleDone'), t('msgDone'),
      '<button class="btn btn-secondary" id="btn-again">' + t('btnSendAgain') + '</button>'
    ));
    on('btn-again', 'click', function () {
      resetSender();
      conn = null;
      startSenderMode();
    });
  }

  function showSendError(msg) {
    _renderView = function () { showSendError(msg); };
    setRoot(resultPanel('&#10060;', t('titleFail'), msg || t('msgFail'),
      '<button class="btn btn-primary" onclick="location.reload()">' + t('btnRetry') + '</button>'
    ));
  }

  function showSenderCancelled(byReceiver) {
    _renderView = function () { showSenderCancelled(byReceiver); };
    setRoot(resultPanel('&#9200;', t('titleCxl'),
      byReceiver ? t('msgCxlRecv') : t('msgCxlSender'),
      '<button class="btn btn-secondary" id="btn-again">' + t('btnSendAgain') + '</button>'
    ));
    on('btn-again', 'click', function () {
      resetSender();
      conn = null;
      startSenderMode();
    });
  }

  /* ── Sender connection hooks ───────────────────────────────── */

  function hookSenderConn(c) {
    c.on('open', function () {
      clearIceTimer();   // ICE succeeded — cancel the relay hint countdown
      watchIce(c);
      if (selectedFile) {
        beginSend(selectedFile);
      } else {
        renderSenderWaiting(myPeerId);
      }
    });

    c.on('data', function (msg) {
      if (msg && msg.type === 'cancel') {
        sendCancelled = true;
        clearIceTimer();
        showSenderCancelled(true);
        closeConn();
      }
    });

    c.on('close', function () {
      clearIceTimer();
      if (sending && !sendCancelled) {
        sendCancelled = true;
        showSendError(FC.t('sRecvDc'));
      } else if (!sending) {
        /* ICE failed / receiver closed before transfer — reset so sender
           can accept the next connection attempt without a page refresh. */
        conn = null;
        if (myPeerId) { renderSenderStep1(myPeerId); }
      }
    });

    c.on('error', function (err) {
      clearIceTimer();
      if (sending && !sendCancelled) {
        showSendError(err.message || FC.t('sSendErr'));
      } else if (!sending) {
        conn = null;
      }
    });
  }

  /* ── Drop zone wiring ──────────────────────────────────────── */

  function wireDropZone() {
    var zone  = ge('drop-area');
    var input = ge('file-input');
    if (!zone || !input) { return; }

    zone.addEventListener('dragover', function (e) {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', function () {
      zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('drag-over');
      var f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) { onFile(f); }
    });
    input.addEventListener('change', function () {
      if (input.files[0]) { onFile(input.files[0]); }
    });
  }

  function onFile(file) {
    selectedFile = file;
    if (!conn || !conn.open) {
      var zone = ge('drop-area');
      if (zone) {
        zone.innerHTML =
          '<div class="drop-icon">' + fileEmoji(file.name) + '</div>' +
          '<div class="drop-title">' + esc(file.name) + '</div>' +
          '<div class="drop-sub">' + fmt(file.size) + ' — ' + t('readySend') + '</div>';
      }
      return;
    }
    beginSend(file);
  }

  /* ── Chunked send with backpressure ────────────────────────── */

  function beginSend(file) {
    if (!conn || !conn.open) { showSendError(FC.t('sRecvDc')); return; }
    sending       = true;
    sendCancelled = false;
    clearIceTimer();

    conn.send({ type: 'meta', name: file.name, size: file.size });
    renderSendProgress(file, 0);
    readChunk(file, 0);
  }

  function readChunk(file, offset) {
    if (sendCancelled) { return; }

    var slice  = file.slice(offset, offset + FC.CHUNK_SIZE);
    var reader = new FileReader();

    reader.onerror = function () {
      showSendError(reader.error ? reader.error.message : FC.t('sSendErr'));
    };

    reader.onload = function (e) {
      if (sendCancelled) { return; }
      var chunk = e.target.result;
      var dc    = conn && conn.dataChannel;

      if (dc && dc.bufferedAmount > FC.BUFFER_HIGH) {
        dc.bufferedAmountLowThreshold = Math.floor(FC.BUFFER_HIGH / 2);
        dc.addEventListener('bufferedamountlow', function drain() {
          dc.removeEventListener('bufferedamountlow', drain);
          dispatchChunk(file, chunk, offset);
        });
        return;
      }
      dispatchChunk(file, chunk, offset);
    };

    reader.readAsArrayBuffer(slice);
  }

  function dispatchChunk(file, chunk, offset) {
    if (sendCancelled) { return; }
    try {
      conn.send(chunk);
    } catch (e) {
      showSendError(e.message || FC.t('sSendErr'));
      return;
    }

    var next = offset + chunk.byteLength;
    updateSendProgress(file, next);

    if (next < file.size) {
      readChunk(file, next);
    } else {
      conn.send({ type: 'done' });
      sending = false;
      showSendDone();
    }
  }

  function cancelSend() {
    sendCancelled = true;
    sending       = false;
    clearIceTimer();
    if (conn && conn.open) {
      try { conn.send({ type: 'cancel', by: 'sender' }); } catch (e) {}
      setTimeout(closeConn, FC.CANCEL_FLUSH_MS);
    } else {
      closeConn();
    }
    showSenderCancelled(false);
  }

  /* ══════════════════════════════════════════════════════════════
     RECEIVER MODE
  ══════════════════════════════════════════════════════════════ */

  function startReceiverMode(senderId) {
    renderRecvConnecting();

    createPeer(function () {
      var c = peer.connect(senderId, { reliable: true, serialization: 'binary' });
      conn = c;
      startIceTimer();  // start countdown before open fires
      hookReceiverConn(c);
    });
  }

  /* ── Receiver views ────────────────────────────────────────── */

  function renderRecvConnecting() {
    _renderView = renderRecvConnecting;
    setRoot(
      statusBar('warning', t('sConnecting')) +
      '<div class="result-panel" style="padding:24px 0">' +
        '<div class="result-icon" style="font-size:2.2rem">&#128275;</div>' +
        '<div class="result-title">' + t('connecting') + '</div>' +
        '<p class="notice mt-8" style="text-align:center">' + t('keepOpen') + '</p>' +
      '</div>' +
      '<div id="relay-hint-wrap"></div>'
    );
  }

  function renderRecvIncoming(name, size) {
    _renderView = function () { renderRecvIncoming(name, size); };
    var pct = pctOf(receivedBytes, size);

    setRoot(
      statusBar('info', t('sReceiving')) +

      '<p style="font-weight:700;font-size:.88rem;margin-bottom:10px">' + t('incomingFile') + '</p>' +

      '<div class="file-card">' +
        '<div class="file-icon">' + fileEmoji(name) + '</div>' +
        '<div class="file-info">' +
          '<div class="file-name">' + esc(name) + '</div>' +
          '<div class="file-size">' + fmt(size) + '</div>' +
        '</div>' +
        '<span class="file-badge downloading">' + t('labelDl') + '</span>' +
      '</div>' +

      progressBar(pct, fmt(0) + ' / ' + fmt(size), '0%') +

      '<p class="notice mt-12">' + t('noticeRecv') + '</p>' +
      '<div class="mt-16">' +
        '<button class="btn btn-danger btn-sm" id="btn-cancel-recv">' + t('btnCancel') + '</button>' +
      '</div>'
    );

    on('btn-cancel-recv', 'click', cancelRecv);
  }

  function updateRecvProgress(recvd, total) {
    var p    = pctOf(recvd, total);
    var fill = ge('prog-fill');
    var lbl  = ge('prog-lbl');
    var plab = ge('prog-pct');
    if (fill) { fill.style.width = p + '%'; }
    if (lbl)  { lbl.textContent  = fmt(recvd) + ' / ' + fmt(total); }
    if (plab) { plab.textContent = p + '%'; }
  }

  function showRecvDone(name) {
    _renderView = function () { showRecvDone(name); };
    setRoot(resultPanel('&#9989;', t('titleDlDone'),
      esc(name) + '\n' + t('msgDlDone'), ''
    ));
  }

  function showNoConn() {
    _renderView = showNoConn;
    setRoot(resultPanel('&#10060;', t('titleNoConn'), t('msgNoConn'), ''));
  }

  function showBadBrowser(size) {
    _renderView = function () { showBadBrowser(size); };
    setRoot(resultPanel('&#9888;', t('titleBadBrowser'), t('msgBadBrowser', fmt(size)), ''));
  }

  function showRecvCancelled() {
    _renderView = showRecvCancelled;
    setRoot(resultPanel('&#9200;', t('titleRecvCxl'), t('msgRecvCxl'), ''));
  }

  function showSenderCancelledOnReceiver() {
    _renderView = showSenderCancelledOnReceiver;
    setRoot(resultPanel('&#9200;', t('titleCxl'), t('msgCxlSender'), ''));
  }

  /* ── Receiver connection hooks ─────────────────────────────── */

  function hookReceiverConn(c) {
    c.on('open', function () {
      clearIceTimer();   // ICE succeeded — cancel the relay hint countdown
      watchIce(c);
    });

    c.on('data', function (data) {
      handleData(data);
    });

    c.on('close', function () {
      clearIceTimer();
      if (!recvCancelled && receivedBytes > 0 && receivedBytes < expectedBytes) {
        setStatus(FC.t('sInterrupted'), 'error');
      }
    });

    c.on('error', function (err) {
      clearIceTimer();
      setStatus(FC.t('sConnErr', err.message || ''), 'error');
    });
  }

  function handleData(data) {
    if (recvCancelled) { return; }

    /* Control messages arrive as plain objects */
    if (data && typeof data === 'object' && !(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) {
      switch (data.type) {
        case 'meta':
          onMeta(data);
          return;
        case 'done':
          if (!writerReady) { doneQueued = true; return; }
          finishRecv();
          return;
        case 'cancel':
          recvCancelled = true;
          clearIceTimer();
          abortWriter();
          showSenderCancelledOnReceiver();
          closeConn();
          return;
      }
      return;
    }

    /* Binary chunk */
    if (!writerReady) { pendingChunks.push(data); return; }
    writeChunk(data);
  }

  function onMeta(meta) {
    expectedName   = meta.name;
    expectedBytes  = meta.size;
    receivedBytes  = 0;
    pendingChunks  = [];
    doneQueued     = false;
    writerReady    = false;
    fallbackChunks = [];
    writer         = null;
    recvCancelled  = false;

    clearIceTimer();
    renderRecvIncoming(meta.name, meta.size);
    openWriter(meta.name, meta.size);
  }

  /* ── Three-tier writer ─────────────────────────────────────── */

  function openWriter(name, size) {
    /* Tier 1: StreamSaver — streams to disk, no RAM limit */
    if (typeof streamSaver !== 'undefined') {
      try {
        streamSaver.mitm = FC.SS_MITM;
        var fs = streamSaver.createWriteStream(name, { size: size });
        writer = fs.getWriter();
        writerReady = true;
        drainPending();
        return;
      } catch (e) { /* fall through */ }
    }

    /* Tier 2: File System Access API */
    if (typeof window.showSaveFilePicker === 'function') {
      window.showSaveFilePicker({ suggestedName: name })
        .then(function (handle) { return handle.createWritable(); })
        .then(function (w) {
          writer = w;
          writerReady = true;
          drainPending();
        })
        .catch(function (err) {
          if (err.name === 'AbortError') {
            recvCancelled = true;
            setStatus(FC.t('sSaveCxl'), 'error');
            return;
          }
          useFallback(size);
        });
      return;
    }

    /* Tier 3: In-memory Blob — capped at FC.FALLBACK_MAX */
    useFallback(size);
  }

  function useFallback(size) {
    if (size > FC.FALLBACK_MAX) {
      showBadBrowser(size);
      closeConn();
      return;
    }
    writer = null;
    writerReady = true;
    drainPending();
  }

  function drainPending() {
    var q = pendingChunks.slice();
    pendingChunks = [];
    for (var i = 0; i < q.length; i++) { writeChunk(q[i]); }
    if (doneQueued) { finishRecv(); }
  }

  function writeChunk(chunk) {
    if (recvCancelled) { return; }
    receivedBytes += chunk.byteLength || chunk.length || 0;
    updateRecvProgress(receivedBytes, expectedBytes);

    if (writer) {
      try {
        var u8 = (chunk instanceof Uint8Array) ? chunk : new Uint8Array(chunk);
        writer.write(u8);
      } catch (e) {
        setStatus(FC.t('sWriteErr'), 'error');
      }
    } else {
      fallbackChunks.push((chunk instanceof Uint8Array) ? chunk : new Uint8Array(chunk));
    }
  }

  function finishRecv() {
    clearIceTimer();
    if (writer) {
      /* StreamSaver and FSAA both expose close() */
      var p = writer.close();
      if (p && typeof p.then === 'function') {
        p.then(function () { showRecvDone(expectedName); });
      } else {
        showRecvDone(expectedName);
      }
      writer = null;
    } else {
      /* Fallback blob download */
      var blob = new Blob(fallbackChunks);
      fallbackChunks = [];
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = expectedName;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        if (a.parentNode) { a.parentNode.removeChild(a); }
      }, 12000);
      showRecvDone(expectedName);
    }
    closeConn();
  }

  function cancelRecv() {
    recvCancelled = true;
    clearIceTimer();
    abortWriter();
    fallbackChunks = [];
    if (conn && conn.open) {
      try { conn.send({ type: 'cancel', by: 'receiver' }); } catch (e) {}
      setTimeout(closeConn, FC.CANCEL_FLUSH_MS);
    } else {
      closeConn();
    }
    showRecvCancelled();
  }

  function abortWriter() {
    if (writer) { try { writer.abort(); } catch (e) {} writer = null; }
  }

  /* ══════════════════════════════════════════════════════════════
     ICE MONITORING & RELAY
  ══════════════════════════════════════════════════════════════ */

  function watchIce(c) {
    var pc = c && c.peerConnection;
    if (!pc) { return; }
    pc.addEventListener('iceconnectionstatechange', function () {
      var s = pc.iceConnectionState;
      if (s === 'failed') { clearIceTimer(); showRelayHint(); }
      if (s === 'connected' || s === 'completed') { clearIceTimer(); hideRelayHint(); }
    });
  }

  function startIceTimer() {
    clearIceTimer();
    iceHintTimer = setTimeout(function () {
      if (!relayShown) { showRelayHint(); }
    }, FC.ICE_RELAY_HINT_MS);
  }

  function clearIceTimer() {
    if (iceHintTimer) { clearTimeout(iceHintTimer); iceHintTimer = null; }
  }

  function showRelayHint() {
    relayShown = true;
    var wrap = ge('relay-hint-wrap');
    if (!wrap) { return; }
    wrap.innerHTML =
      '<div class="relay-hint visible">' +
        '<div class="relay-hint-title">' + t('relayHintTitle') + '</div>' +
        '<div class="relay-hint-desc">' + esc(t('relayHintDesc')) + '</div>' +
        '<button class="btn btn-sm" id="btn-relay" ' +
          'style="background:var(--clr-warning);color:#fff;border:none">' +
          t('relayHintBtn') +
        '</button>' +
      '</div>';
    on('btn-relay', 'click', retryRelay);
  }

  function hideRelayHint() {
    var wrap = ge('relay-hint-wrap');
    if (wrap) { wrap.innerHTML = ''; }
  }

  function retryRelay() {
    useRelay   = true;
    relayShown = false;
    clearIceTimer();

    var wrap = ge('relay-hint-wrap');
    if (wrap) {
      wrap.innerHTML =
        '<div class="relay-active-badge">&#9679;&nbsp;' + t('relayActive') + '</div>';
    }

    closeConn();
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }

    var targetId = new URLSearchParams(location.search).get('to');
    if (targetId) {
      startReceiverMode(targetId);
    } else {
      startSenderMode();
    }
  }

  /* ══════════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════════ */

  /* DOM */
  function ge(id) { return document.getElementById(id); }

  function setRoot(html) {
    var el = ge('app-root');
    if (el) { el.innerHTML = html; }
  }

  function on(id, ev, fn) {
    var el = ge(id);
    if (el) { el.addEventListener(ev, fn); }
  }

  function setStatus(text, type) {
    var bar = document.querySelector('.status-bar');
    if (!bar) { return; }
    bar.className = 'status-bar ' + (type || 'neutral');
    var span = bar.querySelector('span:last-child');
    if (span) { span.textContent = text; }
  }

  function closeConn() {
    if (conn) { try { conn.close(); } catch (e) {} conn = null; }
  }

  function resetSender() {
    selectedFile  = null;
    sending       = false;
    sendCancelled = false;
    relayShown    = false;
    clearIceTimer();
  }

  /* HTML builders */
  function t(key, val) { return FC.t(key, val); }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dot() { return '<span class="status-dot"></span>'; }

  function statusBar(type, label) {
    return '<div class="status-bar ' + type + '">' + dot() + '<span>' + label + '</span></div>';
  }

  function dropZone() {
    return (
      '<div id="drop-area" class="drop-zone mt-16">' +
        '<input type="file" id="file-input">' +
        '<div class="drop-icon">&#128228;</div>' +
        '<div class="drop-title">' + t('dropTitle') + '</div>' +
        '<div class="drop-sub">' + t('dropOr') + ' <span class="browse">' + t('dropBrowse') + '</span></div>' +
      '</div>'
    );
  }

  function progressBar(pct, leftLabel, rightLabel) {
    return (
      '<div class="progress-wrap">' +
        '<div class="progress-track">' +
          '<div class="progress-fill" id="prog-fill" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<div class="progress-labels">' +
          '<span id="prog-lbl">' + leftLabel + '</span>' +
          '<span id="prog-pct">' + rightLabel + '</span>' +
        '</div>' +
      '</div>'
    );
  }

  function resultPanel(icon, title, msg, actions) {
    return (
      '<div class="result-panel">' +
        '<div class="result-icon">' + icon + '</div>' +
        '<div class="result-title">' + title + '</div>' +
        '<div class="result-msg">' + esc(msg) + '</div>' +
        (actions || '') +
      '</div>'
    );
  }

  /* Copy button */
  function wireCopy(url) {
    var btn = ge('btn-copy');
    if (!btn) { return; }
    btn.addEventListener('click', function () {
      var copy = function () {
        btn.textContent = t('btnCopied');
        setTimeout(function () { btn.textContent = t('btnCopy'); }, 2200);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(copy).catch(function () { legacyCopy(url); copy(); });
      } else {
        legacyCopy(url); copy();
      }
    });
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* Misc */
  function shareUrl(peerId) {
    return location.origin + '/app.html?to=' + encodeURIComponent(peerId);
  }

  function pctOf(part, total) {
    return total > 0 ? Math.min(100, Math.round(part / total * 100)) : 0;
  }

  function fmt(bytes) {
    if (!bytes) { return '0 B'; }
    var u = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
  }

  function fileEmoji(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    var m = {
      pdf:'&#128196;',
      zip:'&#128230;', rar:'&#128230;', '7z':'&#128230;', gz:'&#128230;', tar:'&#128230;',
      mp4:'&#127916;', mkv:'&#127916;', mov:'&#127916;', avi:'&#127916;', webm:'&#127916;',
      mp3:'&#127925;', wav:'&#127925;', flac:'&#127925;', ogg:'&#127925;', m4a:'&#127925;',
      jpg:'&#128247;', jpeg:'&#128247;', png:'&#128247;', gif:'&#128247;', webp:'&#128247;', bmp:'&#128247;',
      doc:'&#128196;', docx:'&#128196;', xls:'&#128202;', xlsx:'&#128202;', ppt:'&#128202;', pptx:'&#128202;',
      txt:'&#128196;', md:'&#128196;',
      js:'&#128190;',  ts:'&#128190;',  py:'&#128190;',  java:'&#128190;', cpp:'&#128190;',
      html:'&#127760;', css:'&#127760;',
    };
    return m[ext] || '&#128196;';
  }

}(window.FC = window.FC || {}));
