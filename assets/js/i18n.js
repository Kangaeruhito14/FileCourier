/**
 * FileCourier — Internationalisation (i18n)
 *
 * Supported locales: 'en' (English), 'bn' (Bengali / বাংলা)
 *
 * Usage:
 *   FC.t('key')           — translate with no interpolation
 *   FC.t('key', 'value')  — replace single {v} placeholder
 *   FC.setLang('bn')      — switch active locale
 *
 * Adding a new locale:
 *   1. Add a matching key block under the locale code below.
 *   2. Call FC.setLang() with the new code.
 */
(function (FC) {
  'use strict';

  var _lang = 'en';

  /** All translation strings keyed by locale → key. */
  var _T = {

    /* ── ENGLISH ──────────────────────────────────────────────────────── */
    en: {
      /* Page meta */
      siteTitle:    'FileCourier — Private P2P File Transfer',
      tagline:      'Direct P2P File Transfer',
      footerNote:   'File travels directly — zero server storage · keep tab open during transfer',

      /* Landing page */
      heroHeading:  'Transfer files directly,\nprivately, for free.',
      heroSub:      'No cloud. No storage. No size limits.\nYour file goes straight from your device to your friend\'s.',
      heroCta:      'Start a Transfer',
      howTitle:     'How it works',
      step1Title:   'Open the app',
      step1Desc:    'Open FileCourier on the device that has the file.',
      step2Title:   'Share the link',
      step2Desc:    'Select your file, then copy the generated link and send it to your friend.',
      step3Title:   'File transfers',
      step3Desc:    'Your friend opens the link. The file streams directly from your device — no server involved.',
      whyTitle:     'Why FileCourier?',
      feat1:        'Zero server storage',
      feat2:        'Works on any network',
      feat3:        'No file size limit',
      feat4:        'End-to-end encrypted',
      feat5:        'Free forever',
      feat6:        'No account needed',
      faqTitle:     'Frequently Asked Questions',
      faq1q:        'Does my file get stored anywhere?',
      faq1a:        'No. The file is never uploaded to any server. It travels directly between two browsers using WebRTC technology.',
      faq2q:        'Does it work across different networks?',
      faq2a:        'Yes — for home WiFi-to-WiFi and regular broadband connections worldwide, it works directly in about 90% of cases (no relay needed). For mobile data behind carrier NAT or strict firewalls, the app automatically falls back to a relay server. On a small number of restrictive mobile carriers, relay servers may also be unreachable — switching the mobile device to WiFi fixes this.',
      faq3q:        'Is there a file size limit?',
      faq3a:        'No limit for Chrome and Edge users (files stream directly to disk). Other browsers support up to 512 MB.',
      faq4q:        'Do both people need to be online at the same time?',
      faq4a:        'Yes. The sender\'s tab must stay open until the transfer is complete.',
      faq5q:        'What do I do if the connection keeps failing?',
      faq5a:        'After 8 seconds, a "Connect via Relay" button appears on the receiver\'s screen — click it. This reroutes through a relay server and works for most strict or mobile networks. The sender\'s link stays valid; no need to refresh. If relay also fails, your mobile carrier is likely blocking relay servers — connecting the mobile to WiFi instead of mobile data will resolve it.',
      footerLinks:  'How it works · FAQ',

      /* Status bar */
      sInit:        'Initializing...',
      sOnline:      'Online — waiting for receiver',
      sConnReady:   'Receiver connected!',
      sConnecting:  'Connecting to sender...',
      sReceiving:   'Connected — receiving...',
      sNetErr:      'Network error: {v}',
      sConnErr:     'Connection error: {v}',
      sRecvDc:      'Receiver disconnected',
      sInterrupted: 'Transfer interrupted',
      sCantReach:   'Cannot reach sender: {v}',
      sConnFail:    'Connection failed: {v}',
      sRecvFile:    'Receiving {v}',
      sDone:        'Done',
      sSendErr:     'Send error',
      sWriteErr:    'Write error',
      sProtoErr:    'Protocol error',
      sBadBrowser:  'Incompatible browser',
      sSaveCxl:     'Save cancelled — refresh to retry',
      sReconnecting:  'Reconnecting to server...',
      sCancelled:     'Transfer cancelled',
      sServerTimeout: 'Signaling Server Unavailable',
      msgServerTimeout: 'Could not connect to the signaling server within 15 seconds. Check your internet connection and refresh the page to try again.',

      /* Sender UI */
      step1Label:   'Step 1 — Select a file, then share the link',
      step2Label:   'Step 2 — Select the file you want to send',
      shareLabel:   'Share this link with your friend',
      dropTitle:    'Drop your file here',
      dropOr:       'or',
      dropBrowse:   'click to browse',
      noticeKeep:   'Keep this tab open. Your friend must open the link while this tab is active.',
      noticeSending:'Do not close this tab until the transfer is complete.',
      btnCopy:      'Copy Link',
      btnCopied:    'Copied!',
      btnCancel:    'Cancel Transfer',
      btnRetry:     'Retry Connection',
      btnRelay:     'Use Relay Mode',
      friendReady:  'Friend is connected! Now select the file to start sending.',
      labelUploading: 'UPLOADING',
      labelSending:   'Sending File',
      readySend:    'ready to send',
      titleDone:    'Transfer Complete',
      msgDone:      'Your friend received the file.\nYou can now close this tab.',
      titleFail:    'Send Failed',
      msgFail:      'Refresh the page and try again.',
      titleCxl:     'Transfer Cancelled',
      msgCxlSender: 'You cancelled the transfer.\nYou can select a new file to send.',
      msgCxlRecv:   'The receiver cancelled the download.',
      btnSendAgain: 'Send Another File',

      /* Receiver UI */
      connecting:   'Establishing secure connection...',
      keepOpen:     'Keep this tab open',
      incomingFile: 'Incoming File',
      labelDl:      'DOWNLOADING',
      noticeRecv:   'Do not close this tab. The file is streaming directly from the sender\'s device.',
      titleDlDone:  'Download Complete',
      msgDlDone:    'saved to your Downloads folder.\nYou can now close this tab.',
      titleNoConn:  'Cannot Connect',
      msgNoConn:    'The sender may be offline or the link has expired.\nAsk them to refresh and share a new link.',
      titleBadBrowser: 'Browser Not Supported',
      msgBadBrowser:'This file is {v} — too large for your browser to handle in memory.\n\nPlease open this link in Chrome or Edge to receive large files.',
      titleRecvCxl: 'Download Cancelled',
      msgRecvCxl:   'You cancelled the download.\nThe partially received file has been discarded.',

      /* Relay prompt (shown after ICE fails) */
      relayHintTitle:     'Connection is taking longer than expected',
      relayHintDesc:      'You may be behind a strict network or mobile hotspot.\nClick below to use a relay server — the connection will work but may be slightly slower.',
      relayHintDescSender:'Connection is slow to establish. If your friend\'s screen also shows this message, ask them to click "Connect via Relay" on their side.',
      relayHintBtn:       'Connect via Relay',
      relayActive:        'Relay mode active',

      /* Connection popup */
      connPopupTitle:     'Connection Established!',
      connPopupMsg:       'Secure P2P connection is ready.',
      btnOk:              'OK',

      /* File offer (receiver) */
      fileOfferTitle:     'Incoming File Request',
      fileOfferPrompt:    'Do you want to receive this file?',
      btnAccept:          'Accept',
      btnDecline:         'Decline',

      /* Sender awaiting confirmation */
      titleWaitConfirm:   'Waiting for Confirmation',
      msgWaitConfirm:     'The receiver is reviewing the file details.',

      /* File declined */
      titleDeclined:      'File Declined',
      msgDeclined:        'The receiver declined the file.',
      msgReceiverDeclined:'You declined this file. Waiting for the next offer.',

      /* Multi-file queue */
      queueFiles:         'Files',
      addMore:            '+ Add Files',
      maxFiles:           '10 files max',
      dropMoreTitle:      'Drop more files or click to browse',
      filesInQueue:       'files queued',
      sendingFile:        'Sending file',
      btnNextFile:        'Send Next File',
      btnCancelAll:       'Cancel All',
      replaceFile:        'Replace',
      removeFile:         'Remove',
      friendReadyQueue:   'Friend is connected! Add files below to start sending.',

      /* All done */
      titleAllDone:       'All Files Transferred',
      msgAllDone:         'All {v} files were received successfully.\nYou can now close this tab.',

      /* Receiver between files */
      msgFileSaved:       'saved to your Downloads folder',
      waitingNextFile:    'Waiting for next file from sender...',
      waitingForFile:     'Waiting for file...',

      /* Auto-reconnect */
      sAutoReconnect:     'Connection lost — reconnecting...',
      autoReconnectTitle: 'Auto-Reconnecting',
    },

    /* ── BENGALI / বাংলা ──────────────────────────────────────────────── */
    bn: {
      /* Page meta */
      siteTitle:    'ফাইলকুরিয়ার — প্রাইভেট P2P ফাইল ট্রান্সফার',
      tagline:      'সরাসরি P2P ফাইল ট্রান্সফার',
      footerNote:   'ফাইল সরাসরি যায় — কোনো সার্ভারে সংরক্ষণ নেই · ট্রান্সফারের সময় ট্যাব খোলা রাখুন',

      /* Landing page */
      heroHeading:  'ফাইল পাঠান সরাসরি,\nনিরাপদে, সম্পূর্ণ বিনামূল্যে।',
      heroSub:      'কোনো ক্লাউড নেই। কোনো স্টোরেজ নেই। কোনো সাইজ লিমিট নেই।\nআপনার ফাইল সরাসরি আপনার ডিভাইস থেকে বন্ধুর ডিভাইসে যায়।',
      heroCta:      'ট্রান্সফার শুরু করুন',
      howTitle:     'কীভাবে কাজ করে',
      step1Title:   'অ্যাপ খুলুন',
      step1Desc:    'যে ডিভাইসে ফাইল আছে সেখানে FileCourier খুলুন।',
      step2Title:   'লিংক শেয়ার করুন',
      step2Desc:    'ফাইল বেছে নিন, তারপর লিংক কপি করে বন্ধুকে পাঠান।',
      step3Title:   'ফাইল ট্রান্সফার হয়',
      step3Desc:    'বন্ধু লিংক খুললেই ফাইল সরাসরি আপনার ডিভাইস থেকে চলে যায় — কোনো সার্ভার মাঝে নেই।',
      whyTitle:     'কেন FileCourier?',
      feat1:        'সার্ভারে কিছু সংরক্ষণ হয় না',
      feat2:        'যেকোনো নেটওয়ার্কে কাজ করে',
      feat3:        'ফাইল সাইজের কোনো লিমিট নেই',
      feat4:        'এন্ড-টু-এন্ড এনক্রিপ্টেড',
      feat5:        'সম্পূর্ণ বিনামূল্যে',
      feat6:        'কোনো অ্যাকাউন্ট লাগবে না',
      faqTitle:     'সচরাচর জিজ্ঞাসা',
      faq1q:        'আমার ফাইল কি কোথাও সংরক্ষণ হয়?',
      faq1a:        'না। ফাইল কোনো সার্ভারে আপলোড হয় না। WebRTC প্রযুক্তি ব্যবহার করে সরাসরি দুটি ব্রাউজারের মধ্যে যায়।',
      faq2q:        'ভিন্ন নেটওয়ার্কে কি কাজ করে?',
      faq2a:        'হ্যাঁ — বিশ্বব্যাপী হোম ওয়াইফাই-টু-ওয়াইফাই এবং সাধারণ ব্রডব্যান্ড কানেকশনে প্রায় ৯০% ক্ষেত্রে সরাসরি কানেকশন হয় (কোনো রিলে লাগে না)। মোবাইল ডেটা বা কঠিন ফায়ারওয়ালে অ্যাপ স্বয়ংক্রিয়ভাবে রিলে সার্ভার ব্যবহার করে। কিছু সীমাবদ্ধ মোবাইল ক্যারিয়ারে রিলেও কাজ না করলে — মোবাইলটি ওয়াইফাইতে সংযুক্ত করলেই সমাধান হয়।',
      faq3q:        'ফাইল সাইজের কোনো সীমা আছে?',
      faq3a:        'Chrome ও Edge ব্যবহারকারীদের জন্য কোনো সীমা নেই (ফাইল সরাসরি ডিস্কে স্ট্রিম হয়)। অন্য ব্রাউজারে সর্বোচ্চ ৫১২ MB সাপোর্ট করে।',
      faq4q:        'দুজনকে কি একই সময়ে অনলাইনে থাকতে হবে?',
      faq4a:        'হ্যাঁ। ট্রান্সফার শেষ না হওয়া পর্যন্ত সেন্ডারের ট্যাব খোলা রাখতে হবে।',
      faq5q:        'কানেকশন বারবার ব্যর্থ হলে কী করব?',
      faq5a:        '৮ সেকেন্ড পর রিসিভারের স্ক্রিনে "রিলে দিয়ে কানেক্ট করুন" বোতাম আসবে — সেটি ক্লিক করুন। এটি রিলে সার্ভারের মাধ্যমে পুনরায় কানেক্ট করে এবং বেশিরভাগ কঠিন বা মোবাইল নেটওয়ার্কে কাজ করে। সেন্ডারের লিংক বৈধ থাকে; রিফ্রেশের দরকার নেই। রিলেও কাজ না করলে, আপনার মোবাইল ক্যারিয়ার রিলে সার্ভার ব্লক করছে — মোবাইলটি ওয়াইফাইতে সংযুক্ত করুন।',
      footerLinks:  'কীভাবে কাজ করে · সচরাচর জিজ্ঞাসা',

      /* Status bar */
      sInit:        'শুরু হচ্ছে...',
      sOnline:      'অনলাইন — রিসিভারের জন্য অপেক্ষা',
      sConnReady:   'রিসিভার কানেক্ট হয়েছে!',
      sConnecting:  'সেন্ডারের সাথে কানেক্ট হচ্ছে...',
      sReceiving:   'কানেক্টেড — ফাইল আসছে...',
      sNetErr:      'নেটওয়ার্ক ত্রুটি: {v}',
      sConnErr:     'কানেকশন ত্রুটি: {v}',
      sRecvDc:      'রিসিভার ডিসকানেক্ট হয়েছে',
      sInterrupted: 'ট্রান্সফার বাধাগ্রস্ত হয়েছে',
      sCantReach:   'সেন্ডারের কাছে পৌঁছানো যাচ্ছে না: {v}',
      sConnFail:    'কানেকশন ব্যর্থ: {v}',
      sRecvFile:    '{v} রিসিভ হচ্ছে',
      sDone:        'সম্পন্ন',
      sSendErr:     'পাঠাতে ত্রুটি',
      sWriteErr:    'সেভ করতে ত্রুটি',
      sProtoErr:    'প্রোটোকল ত্রুটি',
      sBadBrowser:  'ব্রাউজার সাপোর্টেড নয়',
      sSaveCxl:     'সেভ বাতিল — পুনরায় চেষ্টা করতে রিফ্রেশ করুন',
      sReconnecting:  'সার্ভারে পুনরায় কানেক্ট হচ্ছে...',
      sCancelled:     'ট্রান্সফার বাতিল',
      sServerTimeout: 'সিগনালিং সার্ভার পাওয়া যাচ্ছে না',
      msgServerTimeout: '১৫ সেকেন্ডের মধ্যে সিগনালিং সার্ভারে কানেক্ট করা যায়নি। ইন্টারনেট কানেকশন পরীক্ষা করুন এবং পেজ রিফ্রেশ করে পুনরায় চেষ্টা করুন।',

      /* Sender UI */
      step1Label:   'ধাপ ১ — ফাইল বেছে নিন, তারপর লিংক শেয়ার করুন',
      step2Label:   'ধাপ ২ — যে ফাইলটি পাঠাতে চান তা বেছে নিন',
      shareLabel:   'আপনার বন্ধুকে এই লিংক পাঠান',
      dropTitle:    'ফাইল এখানে ড্রপ করুন',
      dropOr:       'অথবা',
      dropBrowse:   'ক্লিক করে বেছে নিন',
      noticeKeep:   'এই ট্যাব খোলা রাখুন। আপনার বন্ধুকে এই ট্যাব সক্রিয় থাকাকালীন লিংক খুলতে হবে।',
      noticeSending:'ট্রান্সফার সম্পন্ন না হওয়া পর্যন্ত এই ট্যাব বন্ধ করবেন না।',
      btnCopy:      'লিংক কপি',
      btnCopied:    'কপি হয়েছে!',
      btnCancel:    'ট্রান্সফার বাতিল',
      btnRetry:     'পুনরায় চেষ্টা',
      btnRelay:     'রিলে মোড ব্যবহার করুন',
      friendReady:  'বন্ধু কানেক্ট হয়েছে! পাঠানো শুরু করতে ফাইল বেছে নিন।',
      labelUploading: 'আপলোড হচ্ছে',
      labelSending:   'ফাইল পাঠানো হচ্ছে',
      readySend:    'পাঠানোর জন্য প্রস্তুত',
      titleDone:    'ট্রান্সফার সম্পন্ন',
      msgDone:      'আপনার বন্ধু ফাইলটি পেয়েছে।\nএখন এই ট্যাব বন্ধ করতে পারেন।',
      titleFail:    'পাঠাতে ব্যর্থ',
      msgFail:      'পেজ রিফ্রেশ করে আবার চেষ্টা করুন।',
      titleCxl:     'ট্রান্সফার বাতিল',
      msgCxlSender: 'আপনি ট্রান্সফার বাতিল করেছেন।\nনতুন ফাইল বেছে পুনরায় পাঠাতে পারেন।',
      msgCxlRecv:   'রিসিভার ডাউনলোড বাতিল করেছেন।',
      btnSendAgain: 'আরেকটি ফাইল পাঠান',

      /* Receiver UI */
      connecting:   'নিরাপদ কানেকশন তৈরি হচ্ছে...',
      keepOpen:     'এই ট্যাব খোলা রাখুন',
      incomingFile: 'আসছে ফাইল',
      labelDl:      'ডাউনলোড হচ্ছে',
      noticeRecv:   'এই ট্যাব বন্ধ করবেন না। ফাইল সরাসরি সেন্ডারের ডিভাইস থেকে আসছে।',
      titleDlDone:  'ডাউনলোড সম্পন্ন',
      msgDlDone:    'ডাউনলোডস ফোল্ডারে সেভ হয়েছে।\nএখন এই ট্যাব বন্ধ করতে পারেন।',
      titleNoConn:  'কানেক্ট করা যাচ্ছে না',
      msgNoConn:    'সেন্ডার অফলাইন হতে পারে বা লিংক মেয়াদ উত্তীর্ণ হয়েছে।\nতাদের রিফ্রেশ করে নতুন লিংক শেয়ার করতে বলুন।',
      titleBadBrowser: 'ব্রাউজার সাপোর্টেড নয়',
      msgBadBrowser:'এই ফাইলটি {v} — আপনার ব্রাউজার মেমোরিতে এটি সামলাতে পারবে না।\n\nবড় ফাইল পেতে Chrome বা Edge-এ এই লিংক খুলুন।',
      titleRecvCxl: 'ডাউনলোড বাতিল',
      msgRecvCxl:   'আপনি ডাউনলোড বাতিল করেছেন।\nআংশিক ফাইলটি বাদ দেওয়া হয়েছে।',

      /* Relay prompt */
      relayHintTitle:     'কানেকশন হতে অনেক সময় লাগছে',
      relayHintDesc:      'আপনি হয়তো কঠিন নেটওয়ার্ক বা মোবাইল হটস্পটে আছেন।\nরিলে সার্ভার ব্যবহার করলে কানেকশন হবে, তবে সামান্য ধীর হতে পারে।',
      relayHintDescSender:'কানেকশন স্থাপন হতে দেরি হচ্ছে। আপনার বন্ধুর স্ক্রিনেও যদি এই বার্তা দেখায়, তাদের তাদের পর্দায় "রিলে দিয়ে কানেক্ট করুন" বোতামে ক্লিক করতে বলুন।',
      relayHintBtn:       'রিলে দিয়ে কানেক্ট করুন',
      relayActive:        'রিলে মোড সক্রিয়',

      /* Connection popup */
      connPopupTitle:     'কানেকশন সম্পন্ন!',
      connPopupMsg:       'নিরাপদ P2P কানেকশন প্রস্তুত।',
      btnOk:              'ঠিক আছে',

      /* File offer (receiver) */
      fileOfferTitle:     'ফাইল পাঠানোর অনুরোধ',
      fileOfferPrompt:    'আপনি কি এই ফাইলটি নিতে চান?',
      btnAccept:          'গ্রহণ করুন',
      btnDecline:         'প্রত্যাখ্যান করুন',

      /* Sender awaiting confirmation */
      titleWaitConfirm:   'নিশ্চিতের অপেক্ষায়',
      msgWaitConfirm:     'রিসিভার ফাইলের বিবরণ দেখছেন।',

      /* File declined */
      titleDeclined:      'ফাইল প্রত্যাখ্যাত',
      msgDeclined:        'রিসিভার ফাইলটি নিতে অস্বীকার করেছেন।',
      msgReceiverDeclined:'আপনি এই ফাইলটি প্রত্যাখ্যান করেছেন। পরবর্তী অফারের অপেক্ষায়।',

      /* Multi-file queue */
      queueFiles:         'ফাইল',
      addMore:            '+ আরো যোগ করুন',
      maxFiles:           'সর্বোচ্চ ১০টি ফাইল',
      dropMoreTitle:      'আরো ফাইল ড্রপ করুন বা ক্লিক করুন',
      filesInQueue:       'টি ফাইল প্রস্তুত',
      sendingFile:        'পাঠানো হচ্ছে ফাইল',
      btnNextFile:        'পরের ফাইল পাঠান',
      btnCancelAll:       'সব বাতিল',
      replaceFile:        'পরিবর্তন করুন',
      removeFile:         'সরিয়ে দিন',
      friendReadyQueue:   'বন্ধু কানেক্ট হয়েছে! নিচে ফাইল যোগ করুন।',

      /* All done */
      titleAllDone:       'সকল ফাইল ট্রান্সফার সম্পন্ন',
      msgAllDone:         'সকল {v}টি ফাইল সফলভাবে পাঠানো হয়েছে।\nএখন এই ট্যাব বন্ধ করতে পারেন।',

      /* Receiver between files */
      msgFileSaved:       'ডাউনলোডস ফোল্ডারে সেভ হয়েছে',
      waitingNextFile:    'সেন্ডারের পরবর্তী ফাইলের জন্য অপেক্ষা...',
      waitingForFile:     'ফাইলের জন্য অপেক্ষা...',

      /* Auto-reconnect */
      sAutoReconnect:     'কানেকশন হারিয়েছে — পুনরায় কানেক্ট হচ্ছে...',
      autoReconnectTitle: 'স্বয়ংক্রিয় পুনরায় কানেকশন',
    },
  };

  /**
   * Translate a key in the active locale.
   * @param {string} key   - Translation key
   * @param {string} [val] - Optional value to replace {v} placeholder
   * @returns {string}
   */
  FC.t = function (key, val) {
    var str = (_T[_lang] || _T.en)[key] || _T.en[key] || key;
    if (val !== undefined) { str = str.replace('{v}', val); }
    return str;
  };

  /** Return the active locale code ('en' | 'bn'). */
  FC.getLang = function () { return _lang; };

  /**
   * Switch the active locale and update all data-i18n elements in the DOM.
   * @param {string} locale - 'en' | 'bn'
   */
  FC.setLang = function (locale) {
    if (!_T[locale]) { return; }
    _lang = locale;
    document.documentElement.lang = locale;

    // Update every element that carries a data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      el.textContent = FC.t(key);
    });

    // Update page title
    document.title = FC.t('siteTitle');

    // Notify app.js so it can re-render dynamic UI
    if (typeof FC.onLangChange === 'function') { FC.onLangChange(locale); }
  };

}(window.FC = window.FC || {}));
