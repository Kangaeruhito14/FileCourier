/**
 * FileCourier — Application Controller
 *
 * Handles the full P2P file transfer lifecycle:
 *   - Sender: multi-file queue → offer/confirm per file → chunked send → done
 *   - Receiver: connect → connection popup → accept/decline offer → three-tier writer
 *   - Cancel: bi-directional {type:'cancel'} message over data channel
 *   - ICE monitoring: relay hint after FC.ICE_RELAY_HINT_MS, force-relay retry
 *   - Auto-reconnect: receiver retries on unexpected connection drop / network change
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

  /* Sender — multi-file queue */
  var selectedFiles   = [];   // array of File objects, max 10
  var fileQueueIndex  = 0;    // index of file currently being offered/sent
  var sending         = false;
  var sendCancelled   = false;
  var sendGeneration  = 0;    // incremented on each beginSend to invalidate stale FileReaders
  var awaitingConfirm = false;
  var pendingOfferFile = null;

  /* Connection popup state */
  var bufferedOffer = null;   // file-offer received before receiver dismisses modal

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

  /* Auto-reconnect (receiver side) */
  var autoReconnectTimer    = null;
  var autoReconnectAttempts = 0;
  var MAX_RECONNECT         = 3;

  /* Current view re-renderer (called on language change) */
  var _renderView    = null;

  /* ── Boot ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    var targetId = new URLSearchParams(location.search).get('to');
    isSender = !targetId;

    if (isSender) {
      startSenderMode();
    } else {
      startReceiverMode(targetId);
    }

    /* Network-change: when device comes back online, kick a reconnect */
    window.addEventListener('online', function () {
      if (isSender) {
        if (peer && !peer.destroyed) {
          setTimeout(function () { if (peer && !peer.destroyed) { peer.reconnect(); } }, 500);
        }
      } else {
        var tid = new URLSearchParams(location.search).get('to');
        if (tid && (!conn || !conn.open) && !recvCancelled) {
          clearAutoReconnect();
          autoReconnectAttempts = 0;
          scheduleAutoReconnect(tid);
        }
      }
    });

    /* Network-type change (WiFi ↔ cellular) — also attempt reconnect */
    if (navigator.connection) {
      navigator.connection.addEventListener('change', function () {
        if (!isSender && !recvCancelled) {
          var tid = new URLSearchParams(location.search).get('to');
          if (tid && conn && !conn.open) {
            clearAutoReconnect();
            autoReconnectAttempts = 0;
            scheduleAutoReconnect(tid);
          }
        }
      });
    }
  });

  /* ── PeerJS factory ────────────────────────────────────────── */
  function buildPeerOptions() {
    var opts = {
      debug: FC.PEER_DEBUG,
      config: {
        /* Direct mode: STUN only — gathers in < 500 ms, no TURN wait.
           Relay mode:  TURN only — iceTransportPolicy:'relay' ignores
           STUN anyway, so no point including it. */
        iceServers:         useRelay ? FC.ICE_RELAY : FC.ICE,
        iceTransportPolicy: useRelay ? 'relay'       : 'all',
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
    myPeerId = null;

    peer = new Peer(buildPeerOptions());

    var openTimer = setTimeout(function () {
      if (!myPeerId) {
        setRoot(resultPanel(
          '&#9888;',
          t('sServerTimeout'),
          t('msgServerTimeout'),
          '<button class="btn btn-primary" onclick="location.reload()">' + t('btnRetry') + '</button>'
        ));
      }
    }, FC.PEER_OPEN_TIMEOUT_MS);

    peer.on('open', function (id) {
      clearTimeout(openTimer);
      myPeerId = id;
      if (typeof onOpen === 'function') { onOpen(id); }
    });

    peer.on('disconnected', function () {
      var thisPeer = peer;   /* capture ref — peer may be replaced by relay retry */
      setStatus(FC.t('sReconnecting'), 'warning');
      setTimeout(function () {
        if (thisPeer && !thisPeer.destroyed) { thisPeer.reconnect(); }
      }, FC.PEER_RECONNECT_MS);
    });

    peer.on('error', function (err) {
      clearTimeout(openTimer);
      var type = err.type || '';
      if (type === 'peer-unavailable') { clearIceTimer(); showNoConn(); return; }
      if (type === 'network' || type === 'server-error' || type === 'socket-error') {
        setStatus(FC.t('sNetErr', err.message || type), 'error');
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

      buildQueueHTML() +
      '<div id="relay-hint-wrap"></div>'
    );

    wireCopy(url);
    wireQueue();
  }

  function renderSenderWaiting(peerId) {
    _renderView = function () { renderSenderWaiting(peerId); };

    setRoot(
      statusBar('online', t('sConnReady')) +

      '<p class="notice mt-8" style="font-weight:700;color:var(--clr-brand);border-color:var(--clr-brand-l)">' +
        t('friendReadyQueue') +
      '</p>' +

      buildQueueHTML() +
      '<div id="relay-hint-wrap"></div>'
    );

    wireQueue();
  }

  /* ── Queue HTML builder ────────────────────────────────────── */

  function buildQueueHTML() {
    if (selectedFiles.length === 0) {
      return dropZone();
    }

    var canAdd = selectedFiles.length < 10;
    var html =
      '<div class="file-queue mt-16">' +
        '<div class="file-queue-header">' +
          '<span>' + t('queueFiles') + ' (' + selectedFiles.length + '/10)</span>' +
          (canAdd
            ? '<label class="btn btn-sm btn-secondary fq-add-label" for="file-input-add">' + t('addMore') + '</label>'
            : '<span class="fq-max-note">' + t('maxFiles') + '</span>') +
        '</div>' +
        '<div class="file-queue-list">';

    for (var i = 0; i < selectedFiles.length; i++) {
      var f = selectedFiles[i];
      html +=
        '<div class="file-queue-item">' +
          '<span class="fq-icon">' + fileEmoji(f.name) + '</span>' +
          '<span class="fq-name">' + esc(f.name) + '</span>' +
          '<span class="fq-size">' + fmt(f.size) + '</span>' +
          '<label class="btn-icon" for="file-input-replace-' + i + '" title="' + t('replaceFile') + '">&#8635;</label>' +
          '<button class="btn-icon btn-remove" data-idx="' + i + '" title="' + t('removeFile') + '">&#10005;</button>' +
        '</div>' +
        '<input type="file" id="file-input-replace-' + i + '" data-replace-idx="' + i + '" style="display:none">';
    }

    html += '</div>';

    if (canAdd) {
      html +=
        '<div id="drop-area-add" class="drop-zone-add mt-8">' +
          '<input type="file" id="file-input-add" multiple style="display:none">' +
          t('dropMoreTitle') +
        '</div>';
    }

    html += '</div>';
    return html;
  }

  /* ── Queue event wiring ────────────────────────────────────── */

  function wireQueue() {
    if (selectedFiles.length === 0) {
      wireEmptyDropZone();
      return;
    }

    /* Remove buttons */
    document.querySelectorAll('.btn-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx, 10);
        selectedFiles.splice(idx, 1);
        /* Keep fileQueueIndex in bounds */
        if (fileQueueIndex > selectedFiles.length) { fileQueueIndex = selectedFiles.length; }
        if (_renderView) { _renderView(); }
      });
    });

    /* Replace inputs */
    for (var i = 0; i < selectedFiles.length; i++) {
      (function (idx) {
        var inp = ge('file-input-replace-' + idx);
        if (!inp) { return; }
        inp.addEventListener('change', function () {
          if (inp.files[0]) {
            selectedFiles[idx] = inp.files[0];
            if (_renderView) { _renderView(); }
          }
        });
      })(i);
    }

    /* Add-more area + hidden input */
    var addArea = ge('drop-area-add');
    var addInp  = ge('file-input-add');

    if (addArea) {
      addArea.addEventListener('dragover', function (e) {
        e.preventDefault();
        addArea.classList.add('drag-over');
      });
      addArea.addEventListener('dragleave', function () {
        addArea.classList.remove('drag-over');
      });
      addArea.addEventListener('drop', function (e) {
        e.preventDefault();
        addArea.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
          addFilesToQueue(e.dataTransfer.files);
        }
      });
      addArea.addEventListener('click', function () {
        if (addInp) { addInp.click(); }
      });
    }

    if (addInp) {
      addInp.addEventListener('change', function () {
        if (addInp.files.length > 0) { addFilesToQueue(addInp.files); }
      });
    }
  }

  function wireEmptyDropZone() {
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
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        addFilesToQueue(e.dataTransfer.files);
      }
    });
    input.addEventListener('change', function () {
      if (input.files.length > 0) { addFilesToQueue(input.files); }
    });
  }

  function addFilesToQueue(fileList) {
    var prevCount = selectedFiles.length;
    var remaining = 10 - prevCount;
    for (var i = 0; i < fileList.length && i < remaining; i++) {
      selectedFiles.push(fileList[i]);
    }
    if (_renderView) { _renderView(); }

    /* If connected and idle (no active send / confirm), offer the first new file */
    if (conn && conn.open && !sending && !awaitingConfirm && fileQueueIndex === prevCount) {
      offerFile(selectedFiles[fileQueueIndex]);
    }
  }

  /* ── Sender connection hooks ───────────────────────────────── */

  function hookSenderConn(c) {
    c.on('open', function () {
      clearIceTimer();
      watchIce(c);
      showConnModal(function () {
        /* After sender clicks OK — either offer first file or show queue */
        if (fileQueueIndex < selectedFiles.length) {
          offerFile(selectedFiles[fileQueueIndex]);
        } else {
          renderSenderWaiting(myPeerId);
        }
      });
    });

    c.on('data', function (msg) {
      if (!msg) { return; }
      if (msg.type === 'cancel') {
        sendCancelled = true;
        clearIceTimer();
        showSenderCancelled(true);
        closeConn();
        return;
      }
      if (msg.type === 'file-accept') {
        awaitingConfirm = false;
        if (pendingOfferFile) {
          beginSend(pendingOfferFile);
          pendingOfferFile = null;
        }
        return;
      }
      if (msg.type === 'file-reject') {
        awaitingConfirm = false;
        pendingOfferFile = null;
        showFileDeclined();
        return;
      }
      /* Receiver confirms the file was fully written to disk — now safe to advance */
      if (msg.type === 'file-received') {
        advanceQueue();
        return;
      }
    });

    c.on('close', function () {
      clearIceTimer();
      if (sending && !sendCancelled) {
        sendCancelled = true;
        sending = false;          /* allow re-offer on next connection */
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
        sendCancelled = true;
        sending = false;
        showSendError(err.message || FC.t('sSendErr'));
      } else if (!sending) {
        conn = null;
      }
    });
  }

  /* ── File offering ─────────────────────────────────────────── */

  function offerFile(file) {
    if (!conn || !conn.open) { return; }
    awaitingConfirm  = true;
    pendingOfferFile = file;
    conn.send({ type: 'file-offer', name: file.name, size: file.size, fileType: file.type || '' });
    renderSenderAwaitingConfirm(file);
  }

  function renderSenderAwaitingConfirm(file) {
    _renderView = function () { renderSenderAwaitingConfirm(file); };

    var queueNote = selectedFiles.length > 1
      ? '<p class="fq-progress-note">' +
          t('queueFiles') + ': ' + (fileQueueIndex + 1) + ' / ' + selectedFiles.length +
        '</p>'
      : '';

    setRoot(
      statusBar('info', t('sConnReady')) +

      queueNote +

      '<div class="file-card">' +
        '<div class="file-icon">' + fileEmoji(file.name) + '</div>' +
        '<div class="file-info">' +
          '<div class="file-name">' + esc(file.name) + '</div>' +
          '<div class="file-size">' + fmt(file.size) +
            (file.type ? ' &middot; ' + esc(file.type) : '') +
          '</div>' +
        '</div>' +
        '<span class="file-badge uploading">' + t('labelUploading') + '</span>' +
      '</div>' +

      '<div class="waiting-confirm mt-16">' +
        '<div class="waiting-icon">&#9203;</div>' +
        '<div class="waiting-title">' + t('titleWaitConfirm') + '</div>' +
        '<p class="waiting-msg">' + t('msgWaitConfirm') + '</p>' +
      '</div>' +

      '<div id="relay-hint-wrap"></div>'
    );
  }

  function showFileDeclined() {
    _renderView = showFileDeclined;
    var hasMore = (fileQueueIndex + 1) < selectedFiles.length;

    var actions = hasMore
      ? '<button class="btn btn-primary" id="btn-next-file">' + t('btnNextFile') + '</button>' +
        ' <button class="btn btn-secondary" id="btn-cancel-all" style="margin-top:8px">' + t('btnCancelAll') + '</button>'
      : '<button class="btn btn-secondary" id="btn-again">' + t('btnSendAgain') + '</button>';

    setRoot(resultPanel('&#10060;', t('titleDeclined'), t('msgDeclined'), actions));

    if (hasMore) {
      on('btn-next-file', 'click', function () {
        fileQueueIndex++;
        offerFile(selectedFiles[fileQueueIndex]);
      });
      on('btn-cancel-all', 'click', function () {
        resetSender();
        conn = null;
        startSenderMode();
      });
    } else {
      on('btn-again', 'click', function () {
        resetSender();
        conn = null;
        startSenderMode();
      });
    }
  }

  /* ── Send progress ─────────────────────────────────────────── */

  function renderSendProgress(file, sent) {
    _renderView = function () { renderSendProgress(file, sent); };
    var pct = pctOf(sent, file.size);

    var queueNote = selectedFiles.length > 1
      ? '<p class="fq-progress-note">' +
          t('sendingFile') + ' ' + (fileQueueIndex + 1) + ' / ' + selectedFiles.length +
        '</p>'
      : '';

    setRoot(
      statusBar('info', t('labelSending')) +

      queueNote +

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

  function advanceQueue() {
    fileQueueIndex++;

    if (fileQueueIndex < selectedFiles.length) {
      /* More files in queue — offer the next one */
      offerFile(selectedFiles[fileQueueIndex]);
      return;
    }

    /* All files sent — signal receiver and show done */
    var count = selectedFiles.length;
    if (conn && conn.open) {
      try { conn.send({ type: 'all-done', count: count }); } catch (e) {}
      setTimeout(closeConn, FC.CANCEL_FLUSH_MS);
    }

    _renderView = advanceQueue;  /* prevent re-entry on lang change */
    var title = count > 1 ? t('titleAllDone') : t('titleDone');
    var msg   = count > 1 ? t('msgAllDone', count) : t('msgDone');

    setRoot(resultPanel(
      '&#9989;', title, msg,
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

  /* ── Chunked send with backpressure ────────────────────────── */

  function beginSend(file) {
    if (!conn || !conn.open) { showSendError(FC.t('sRecvDc')); return; }
    sending        = true;
    sendCancelled  = false;
    sendGeneration++;          /* invalidate any lingering FileReader callbacks */
    clearIceTimer();

    conn.send({ type: 'meta', name: file.name, size: file.size });
    renderSendProgress(file, 0);
    readChunk(file, 0, sendGeneration);
  }

  function readChunk(file, offset, gen) {
    if (sendCancelled || gen !== sendGeneration) { return; }

    var slice  = file.slice(offset, offset + FC.CHUNK_SIZE);
    var reader = new FileReader();

    reader.onerror = function () {
      if (gen !== sendGeneration) { return; }
      showSendError(reader.error ? reader.error.message : FC.t('sSendErr'));
    };

    reader.onload = function (e) {
      if (sendCancelled || gen !== sendGeneration) { return; }
      var chunk = e.target.result;
      var dc    = conn && conn.dataChannel;

      if (dc && dc.bufferedAmount > FC.BUFFER_HIGH) {
        var threshold = Math.floor(FC.BUFFER_HIGH / 2);
        dc.bufferedAmountLowThreshold = threshold;
        var drainFired = false;
        var drain = function () {
          if (drainFired) { return; }
          drainFired = true;
          dc.removeEventListener('bufferedamountlow', drain);
          if (sendCancelled || gen !== sendGeneration) { return; }
          dispatchChunk(file, chunk, offset, gen);
        };
        dc.addEventListener('bufferedamountlow', drain);
        /* Safety: if buffer already dropped below threshold before the event
           could fire (rapid drain between check and addEventListener), proceed. */
        if (dc.bufferedAmount <= threshold) { drain(); }
        return;
      }
      dispatchChunk(file, chunk, offset, gen);
    };

    reader.readAsArrayBuffer(slice);
  }

  function dispatchChunk(file, chunk, offset, gen) {
    if (sendCancelled || gen !== sendGeneration) { return; }
    try {
      conn.send(chunk);
    } catch (e) {
      showSendError(e.message || FC.t('sSendErr'));
      return;
    }

    var next = offset + chunk.byteLength;
    updateSendProgress(file, next);

    if (next < file.size) {
      readChunk(file, next, gen);
    } else {
      /* All chunks dispatched to the DataChannel buffer.
         Send 'done' so receiver knows to finalise the file.
         Do NOT call advanceQueue() here — wait for the receiver's
         'file-received' ACK which confirms the file was fully written.
         This prevents closing the connection while data is still in-flight. */
      try { conn.send({ type: 'done' }); } catch (e) {}
      sending = false;
    }
  }

  function cancelSend() {
    sendCancelled = true;
    sending       = false;
    sendGeneration++;   /* invalidate any in-flight FileReaders */
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
     CONNECTION MODAL (both sides)
  ══════════════════════════════════════════════════════════════ */

  function showConnModal(callback) {
    /* Remove any stale modal */
    var existing = document.getElementById('conn-modal-overlay');
    if (existing && existing.parentNode) { existing.parentNode.removeChild(existing); }

    var overlay = document.createElement('div');
    overlay.id        = 'conn-modal-overlay';
    overlay.className = 'conn-modal-overlay';
    overlay.innerHTML =
      '<div class="conn-modal" role="dialog" aria-modal="true">' +
        '<div class="conn-modal-icon">&#128279;</div>' +
        '<div class="conn-modal-title">' + t('connPopupTitle') + '</div>' +
        '<div class="conn-modal-msg">' + t('connPopupMsg') + '</div>' +
        '<button class="btn btn-primary" id="btn-conn-ok">' + t('btnOk') + '</button>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('btn-conn-ok').addEventListener('click', function () {
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      if (typeof callback === 'function') { callback(); }
    });
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
      hookReceiverConn(c, senderId);
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

  function renderRecvWaiting() {
    _renderView = renderRecvWaiting;
    setRoot(
      statusBar('online', t('sConnReady')) +
      '<div class="result-panel" style="padding:24px 0">' +
        '<div class="result-icon" style="font-size:2rem">&#128226;</div>' +
        '<div class="result-title">' + t('waitingForFile') + '</div>' +
        '<p class="notice mt-8" style="text-align:center">' + t('keepOpen') + '</p>' +
      '</div>'
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

  function showRecvFileSaved(name) {
    /* Shown between files — connection stays open, waiting for next offer */
    _renderView = function () { showRecvFileSaved(name); };
    setRoot(
      statusBar('online', t('sConnReady')) +
      '<div class="file-saved-notice mt-16">' +
        '<div class="file-saved-icon">&#10003;</div>' +
        '<div class="file-saved-name">' + esc(name) + '</div>' +
        '<div class="file-saved-msg">' + t('msgFileSaved') + '</div>' +
      '</div>' +
      '<p class="notice mt-12" style="text-align:center">' + t('waitingNextFile') + '</p>'
    );
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

  function showFileOfferUI(meta) {
    _renderView = function () { showFileOfferUI(meta); };
    setRoot(
      statusBar('online', t('sConnReady')) +

      '<div class="file-offer-panel mt-16">' +
        '<div class="file-offer-title">' + t('fileOfferTitle') + '</div>' +

        '<div class="file-card" style="margin-top:0">' +
          '<div class="file-icon">' + fileEmoji(meta.name) + '</div>' +
          '<div class="file-info">' +
            '<div class="file-name">' + esc(meta.name) + '</div>' +
            '<div class="file-size">' + fmt(meta.size) +
              (meta.fileType ? ' &middot; ' + esc(meta.fileType) : '') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<p class="file-offer-prompt">' + t('fileOfferPrompt') + '</p>' +

        '<div class="file-offer-actions">' +
          '<button class="btn btn-primary" id="btn-accept">' + t('btnAccept') + '</button>' +
          '<button class="btn btn-danger btn-sm" id="btn-decline">' + t('btnDecline') + '</button>' +
        '</div>' +
      '</div>'
    );

    on('btn-accept', 'click', function () {
      if (conn && conn.open) {
        conn.send({ type: 'file-accept' });
        renderRecvConnecting();
        /* Writer opens when 'meta' message arrives from sender */
      }
    });

    on('btn-decline', 'click', function () {
      if (conn && conn.open) { conn.send({ type: 'file-reject' }); }
      _renderView = function () {
        setRoot(
          statusBar('warning', t('sConnReady')) +
          '<div class="result-panel" style="padding:16px 0">' +
            '<div class="result-icon" style="font-size:1.5rem">&#128683;</div>' +
            '<div class="result-title">' + t('titleDeclined') + '</div>' +
            '<p class="notice mt-8" style="text-align:center">' + t('msgReceiverDeclined') + '</p>' +
          '</div>'
        );
      };
      _renderView();
    });
  }

  function showRecvAllDone(count) {
    _renderView = function () { showRecvAllDone(count); };
    var title = count > 1 ? t('titleAllDone') : t('titleDlDone');
    var msg   = count > 1 ? t('msgAllDone', count) : (expectedName + '\n' + t('msgDlDone'));
    setRoot(resultPanel('&#9989;', title, msg, ''));
  }

  /* ── Receiver connection hooks ─────────────────────────────── */

  function hookReceiverConn(c, senderId) {
    c.on('open', function () {
      clearIceTimer();
      clearAutoReconnect();
      autoReconnectAttempts = 0;
      watchIce(c);
      showConnModal(function () {
        /* After receiver clicks OK — show buffered offer or waiting state */
        if (bufferedOffer) {
          var offer = bufferedOffer;
          bufferedOffer = null;
          showFileOfferUI(offer);
        } else {
          renderRecvWaiting();
        }
      });
    });

    c.on('data', function (data) {
      handleData(data);
    });

    c.on('close', function () {
      clearIceTimer();
      /* Remove any open modal on unexpected close */
      var modal = document.getElementById('conn-modal-overlay');
      if (modal && modal.parentNode) { modal.parentNode.removeChild(modal); }

      if (recvCancelled) { return; }
      /* Clean close after all-done was received */
      if (receivedBytes === expectedBytes && expectedBytes > 0 && !doneQueued) { return; }
      /* Interrupted mid-transfer */
      if (receivedBytes > 0 && receivedBytes < expectedBytes) {
        setStatus(FC.t('sInterrupted'), 'error');
        return;
      }
      /* Connection dropped while idle (no transfer started) — try auto-reconnect */
      if (senderId && receivedBytes === 0) {
        scheduleAutoReconnect(senderId);
      }
    });

    c.on('error', function (err) {
      clearIceTimer();
      setStatus(FC.t('sConnErr', err.message || ''), 'error');
    });
  }

  /* ── Auto-reconnect ────────────────────────────────────────── */

  function scheduleAutoReconnect(senderId) {
    if (autoReconnectAttempts >= MAX_RECONNECT) {
      showNoConn();
      return;
    }
    autoReconnectAttempts++;

    setStatus(FC.t('sAutoReconnect'), 'warning');

    var wrap = ge('relay-hint-wrap');
    if (wrap) {
      wrap.innerHTML =
        '<div class="relay-hint visible">' +
          '<div class="relay-hint-title">' + t('autoReconnectTitle') + '</div>' +
          '<div class="relay-hint-desc">' +
            t('sAutoReconnect') + ' (' + autoReconnectAttempts + '/' + MAX_RECONNECT + ')' +
          '</div>' +
        '</div>';
    }

    autoReconnectTimer = setTimeout(function () {
      if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
      conn = null;
      startReceiverMode(senderId);
    }, 3000);
  }

  function clearAutoReconnect() {
    if (autoReconnectTimer) { clearTimeout(autoReconnectTimer); autoReconnectTimer = null; }
  }

  /* ── Data handling ─────────────────────────────────────────── */

  function handleData(data) {
    if (recvCancelled) { return; }

    /* Control messages arrive as plain objects */
    if (data && typeof data === 'object' && !(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) {
      switch (data.type) {
        case 'file-offer':
          /* Buffer if connection modal is still showing */
          if (document.getElementById('conn-modal-overlay')) {
            bufferedOffer = data;
          } else {
            showFileOfferUI(data);
          }
          return;
        case 'meta':
          onMeta(data);
          return;
        case 'done':
          if (!writerReady) { doneQueued = true; return; }
          finishRecv();
          return;
        case 'all-done':
          showRecvAllDone(data.count || 1);
          closeConn();
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
            /* User dismissed the save dialog — notify sender so it doesn't
               wait forever for the file-received ACK that will never arrive. */
            recvCancelled = true;
            if (conn && conn.open) {
              try { conn.send({ type: 'cancel', by: 'receiver' }); } catch (e) {}
              setTimeout(closeConn, FC.CANCEL_FLUSH_MS);
            } else {
              closeConn();
            }
            showRecvCancelled();
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
        p.then(function () {
          ackFileReceived();
          showRecvFileSaved(expectedName);
        });
      } else {
        ackFileReceived();
        showRecvFileSaved(expectedName);
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
      ackFileReceived();
      showRecvFileSaved(expectedName);
    }
    /* Do NOT close connection — wait for next file-offer or all-done */
  }

  /* Tell the sender the file was fully written — triggers advanceQueue on sender */
  function ackFileReceived() {
    if (conn && conn.open) {
      try { conn.send({ type: 'file-received' }); } catch (e) {}
    }
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

    if (isSender) {
      /* Sender must NOT get a relay button — clicking it would destroy the peer and
         generate a new peer ID, invalidating every share link already sent out.
         Show an advisory instead: ask the receiver to click relay on their screen. */
      wrap.innerHTML =
        '<div class="relay-hint visible">' +
          '<div class="relay-hint-title">' + t('relayHintTitle') + '</div>' +
          '<div class="relay-hint-desc">' + esc(t('relayHintDescSender')) + '</div>' +
        '</div>';
      return;
    }

    /* Receiver: offer the relay button */
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
    /* retryRelay() is only reachable from the RECEIVER side — sender gets an
       advisory notice with no button, so this function is never called when
       isSender is true.  Destroying the sender's peer would generate a new peer
       ID and break every share link that was already sent out. */
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

    /* Reconnect to the same sender peer ID with iceTransportPolicy:'relay' */
    var targetId = new URLSearchParams(location.search).get('to');
    if (targetId) { startReceiverMode(targetId); }
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
    selectedFiles    = [];
    fileQueueIndex   = 0;
    sending          = false;
    sendCancelled    = false;
    sendGeneration++;            /* invalidate any in-flight FileReaders */
    awaitingConfirm  = false;
    pendingOfferFile = null;
    relayShown       = false;
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
        '<input type="file" id="file-input" multiple>' +
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
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
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
