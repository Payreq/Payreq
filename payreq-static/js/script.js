'use strict';

/* ============================================================
   Configuration
   ============================================================ */
const CONFIG = {
  THEME_KEY: 'payreq_theme',
  REQUESTS_KEY: 'payreq_requests',
  MAX_RECENT: 20,
  MAX_ENCODED_LENGTH: 1800, // keeps the resulting URL comfortably shareable/scannable
  REQUEST_VERSION: '1',
  REQUEST_TYPE: 'payreq-payment-request',
  MAX_AMOUNT: 10_000_000,
};

// Future documented providers can be added here. Only "payreq" is real;
// everything else is intentionally inert until a genuine, spec-verified
// integration (real credentials, real signing, a real server to hold the
// secret key) exists for it.
const PROVIDERS = {
  payreq: { id: 'payreq', name: 'PAYREQ Request', available: true },
  nepalpay: { id: 'nepalpay', name: 'NEPALPAY', available: false },
  fonepay: { id: 'fonepay', name: 'Fonepay', available: false },
  esewa: { id: 'esewa', name: 'eSewa', available: false },
  khalti: { id: 'khalti', name: 'Khalti', available: false },
  connectips: { id: 'connectips', name: 'connectIPS', available: false },
};

/* ============================================================
   State
   ============================================================ */
const state = {
  currentRequest: null, // { payload, encoded, webLink, payreqUri }
};

/* ============================================================
   DOM References
   ============================================================ */
const dom = {
  themeToggle: document.getElementById('theme-toggle'),
  navToggle: document.getElementById('nav-toggle'),
  mobileNav: document.getElementById('mobile-nav'),

  form: document.getElementById('payment-form'),
  formStatus: document.getElementById('form-status'),
  networkList: document.getElementById('network-list'),

  previewEmpty: document.getElementById('preview-empty'),
  previewResult: document.getElementById('preview-result'),
  previewAmount: document.getElementById('preview-amount'),
  previewReceiver: document.getElementById('preview-receiver'),
  previewIdentifier: document.getElementById('preview-identifier'),
  previewReference: document.getElementById('preview-reference'),
  previewReferenceRow: document.getElementById('preview-reference-row'),
  qrFrame: document.getElementById('qr-frame'),
  statusLine: document.getElementById('status-line'),
  previewStatus: document.getElementById('preview-status'),

  btnDownloadPng: document.getElementById('btn-download-png'),
  btnDownloadSvg: document.getElementById('btn-download-svg'),
  btnCopyRequest: document.getElementById('btn-copy-request'),
  btnCopyLink: document.getElementById('btn-copy-link'),
  btnShare: document.getElementById('btn-share'),
  btnCreateAnother: document.getElementById('btn-create-another'),

  recentEmpty: document.getElementById('recent-empty'),
  recentList: document.getElementById('recent-list'),
  btnClearHistory: document.getElementById('btn-clear-history'),

  requestViewer: document.getElementById('request-viewer'),
  requestViewerContent: document.getElementById('request-viewer-content'),

  footerYear: document.getElementById('footer-year'),
};

/* ============================================================
   Validation
   ============================================================ */
const NAME_PATTERN = /^[a-zA-Z0-9 .,'&-]+$/;
const REFERENCE_PATTERN = /^[a-zA-Z0-9 .,'#&/-]*$/;
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

function validateReceiverName(value) {
  const v = value.trim();
  if (v.length < 2) return 'Please enter a receiver name.';
  if (v.length > 70) return 'Receiver name is too long.';
  if (!NAME_PATTERN.test(v)) return 'Receiver name contains unsupported characters.';
  return null;
}

function validateIdentifier(value) {
  const v = value.trim();
  if (v.length < 2) return 'Please enter a payment identifier.';
  if (v.length > 60) return 'Payment identifier is too long.';
  return null;
}

function validateAmount(value) {
  const v = value.trim();
  if (!v) return 'Please enter a valid amount.';
  if (!AMOUNT_PATTERN.test(v)) return 'Please enter a valid amount (up to 2 decimal places).';
  const num = Number(v);
  if (!Number.isFinite(num) || num <= 0) return 'Please enter a valid amount.';
  if (num > CONFIG.MAX_AMOUNT) return 'Amount exceeds the supported maximum.';
  return null;
}

function validateReference(value) {
  const v = value.trim();
  if (v.length > 80) return 'Reference is too long.';
  if (!REFERENCE_PATTERN.test(v)) return 'Reference contains unsupported characters.';
  return null;
}

/* ============================================================
   PAYREQ Request Encoder
   ============================================================ */
function base64UrlEncode(str) {
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  utf8Bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildRequestPayload({ receiverName, identifier, amount, currency, reference }) {
  const payload = {
    version: CONFIG.REQUEST_VERSION,
    type: CONFIG.REQUEST_TYPE,
    receiver: receiverName.trim(),
    identifier: identifier.trim(),
    amount: Number(amount),
    currency,
  };
  const trimmedReference = (reference || '').trim();
  if (trimmedReference) payload.reference = trimmedReference;
  return payload;
}

function currentBaseUrl() {
  // Uses window.location.origin + pathname so the link is correct whether
  // this is hosted at the domain root or under a GitHub Pages project path
  // (e.g. https://<user>.github.io/payreq/). Never hard-coded.
  const path = window.location.pathname.replace(/index\.html?$/i, '');
  return `${window.location.origin}${path}`;
}

function encodeRequest(payload) {
  const json = JSON.stringify(payload);
  const encoded = base64UrlEncode(json);
  return {
    payload,
    encoded,
    webLink: `${currentBaseUrl()}?request=${encoded}`,
    payreqUri: `payreq://request?data=${encoded}`,
  };
}

/* ============================================================
   PAYREQ Request Decoder
   ============================================================ */
function decodeRequest(encoded) {
  let json;
  try {
    json = base64UrlDecode(encoded);
  } catch {
    return { ok: false, reason: 'The supplied QR or link does not contain a valid PAYREQ request.' };
  }

  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'The supplied QR or link does not contain a valid PAYREQ request.' };
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'The supplied QR or link does not contain a valid PAYREQ request.' };
  }
  if (data.type !== CONFIG.REQUEST_TYPE) {
    return { ok: false, reason: 'This request is not a recognized PAYREQ payment request.' };
  }
  if (data.version !== CONFIG.REQUEST_VERSION) {
    return { ok: false, reason: 'This request uses an unsupported PAYREQ request version.' };
  }
  if (typeof data.receiver !== 'string' || validateReceiverName(data.receiver)) {
    return { ok: false, reason: 'The request is missing a valid receiver.' };
  }
  if (typeof data.identifier !== 'string' || validateIdentifier(data.identifier)) {
    return { ok: false, reason: 'The request is missing a valid payment identifier.' };
  }
  if (typeof data.amount !== 'number' || !Number.isFinite(data.amount) || data.amount <= 0 || data.amount > CONFIG.MAX_AMOUNT) {
    return { ok: false, reason: 'The request does not contain a valid amount.' };
  }
  if (typeof data.currency !== 'string' || data.currency.length > 8) {
    return { ok: false, reason: 'The request does not contain a valid currency.' };
  }
  if (data.reference !== undefined && (typeof data.reference !== 'string' || validateReference(data.reference))) {
    return { ok: false, reason: 'The request reference is invalid.' };
  }

  return { ok: true, payload: data };
}

/* ============================================================
   QR Generator
   ============================================================ */
async function renderQr(container, text) {
  container.innerHTML = '';
  if (typeof QRCode === 'undefined') {
    const fallback = document.createElement('p');
    fallback.className = 'field-error';
    fallback.textContent = 'The QR library could not be loaded. Use "Copy payment link" instead.';
    container.appendChild(fallback);
    return null;
  }

  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, text, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
  container.appendChild(canvas);
  return canvas;
}

async function qrToSvgString(text) {
  return QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadBlob(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  URL.revokeObjectURL(url);
}

/* ============================================================
   Local Storage
   ============================================================ */
function loadRecentRequests() {
  try {
    const raw = localStorage.getItem(CONFIG.REQUESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    // Corrupted storage — recover silently rather than crashing the app.
    localStorage.removeItem(CONFIG.REQUESTS_KEY);
    return [];
  }
}

function saveRecentRequests(list) {
  try {
    localStorage.setItem(CONFIG.REQUESTS_KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — fail silently;
    // history is a convenience feature, not core functionality.
  }
}

function addRecentRequest(entry) {
  const list = loadRecentRequests();
  list.unshift(entry);
  saveRecentRequests(list.slice(0, CONFIG.MAX_RECENT));
  renderRecentRequests();
}

function deleteRecentRequest(id) {
  const list = loadRecentRequests().filter((item) => item.id !== id);
  saveRecentRequests(list);
  renderRecentRequests();
}

function clearRecentRequests() {
  saveRecentRequests([]);
  renderRecentRequests();
}

function formatAmount(amount, currency) {
  const num = Number(amount);
  const formatted = num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${formatted}`;
}

function renderRecentRequests() {
  const list = loadRecentRequests();

  if (list.length === 0) {
    dom.recentEmpty.hidden = false;
    dom.recentList.hidden = true;
    dom.recentList.innerHTML = '';
    return;
  }

  dom.recentEmpty.hidden = true;
  dom.recentList.hidden = false;
  dom.recentList.innerHTML = '';

  for (const item of list) {
    const li = document.createElement('li');
    li.className = 'recent-item';

    const main = document.createElement('div');
    main.className = 'recent-main';

    const name = document.createElement('p');
    name.className = 'recent-name';
    name.textContent = item.receiver; // textContent only — never innerHTML for stored/user data

    const meta = document.createElement('p');
    meta.className = 'recent-meta';
    meta.textContent = `${formatAmount(item.amount, item.currency)}${item.reference ? ' · ' + item.reference : ''} · Created`;

    main.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'recent-actions';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'btn btn-ghost';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => openRecentRequest(item));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-text';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteRecentRequest(item.id));

    actions.append(openBtn, deleteBtn);
    li.append(main, actions);
    dom.recentList.appendChild(li);
  }
}

function openRecentRequest(item) {
  const encoded = item.encoded;
  const decoded = decodeRequest(encoded);
  if (!decoded.ok) return;
  const built = {
    payload: decoded.payload,
    encoded,
    webLink: `${currentBaseUrl()}?request=${encoded}`,
    payreqUri: `payreq://request?data=${encoded}`,
  };
  state.currentRequest = built;
  renderPreview(built);
  document.getElementById('create').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   Theme Management
   ============================================================ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  dom.themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
}

function initTheme() {
  const stored = localStorage.getItem(CONFIG.THEME_KEY);
  if (stored === 'dark' || stored === 'light') {
    applyTheme(stored);
    return;
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(CONFIG.THEME_KEY, next); } catch { /* ignore */ }
}

/* ============================================================
   Share
   ============================================================ */
async function shareRequest(request) {
  const shareData = {
    title: 'PAYREQ payment request',
    text: `Payment request: ${formatAmount(request.payload.amount, request.payload.currency)} to ${request.payload.receiver}`,
    url: request.webLink,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch {
      // User cancelled the share sheet — not an error worth surfacing.
    }
    return;
  }

  await copyToClipboard(request.webLink);
  setStatus(dom.previewStatus, "Your browser does not support native sharing. The payment link has been copied instead.", 'success');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ============================================================
   Download
   ============================================================ */
async function downloadQrPng() {
  const canvas = dom.qrFrame.querySelector('canvas');
  if (!canvas) return;
  downloadDataUrl(canvas.toDataURL('image/png'), 'payreq-request.png');
}

async function downloadQrSvg() {
  if (!state.currentRequest) return;
  try {
    const svg = await qrToSvgString(state.currentRequest.webLink);
    downloadBlob(svg, 'image/svg+xml', 'payreq-request.svg');
  } catch {
    setStatus(dom.previewStatus, 'The QR could not be prepared as an SVG on this browser.', 'error');
  }
}

/* ============================================================
   Payment Form
   ============================================================ */
function renderNetworkOptions() {
  dom.networkList.innerHTML = '';
  Object.values(PROVIDERS).forEach((provider) => {
    const row = document.createElement('div');
    row.className = `network-option${provider.available ? ' available' : ''}`;

    const name = document.createElement('span');
    name.textContent = provider.name;

    const badge = document.createElement('span');
    badge.className = `network-badge${provider.available ? ' available' : ''}`;
    badge.textContent = provider.available ? 'Available' : 'Not configured';

    row.append(name, badge);
    dom.networkList.appendChild(row);
  });
}

function clearFieldErrors() {
  ['receiverName', 'identifier', 'amount', 'reference'].forEach((name) => {
    const el = document.getElementById(`error-${name}`);
    if (el) el.textContent = '';
    const input = dom.form.elements[name];
    if (input) input.removeAttribute('aria-invalid');
  });
}

function showFieldError(name, message) {
  const el = document.getElementById(`error-${name}`);
  if (el) el.textContent = message;
  const input = dom.form.elements[name];
  if (input) input.setAttribute('aria-invalid', 'true');
}

function setStatus(el, message, kind) {
  el.textContent = message;
  el.classList.remove('error', 'success');
  if (kind) el.classList.add(kind);
}

function handleFormSubmit(event) {
  event.preventDefault();
  clearFieldErrors();
  setStatus(dom.formStatus, '', null);

  const data = new FormData(dom.form);
  const receiverName = String(data.get('receiverName') || '');
  const identifier = String(data.get('identifier') || '');
  const amount = String(data.get('amount') || '');
  const currency = String(data.get('currency') || 'NPR');
  const reference = String(data.get('reference') || '');

  const errors = {
    receiverName: validateReceiverName(receiverName),
    identifier: validateIdentifier(identifier),
    amount: validateAmount(amount),
    reference: validateReference(reference),
  };

  let hasError = false;
  for (const [field, message] of Object.entries(errors)) {
    if (message) {
      showFieldError(field, message);
      hasError = true;
    }
  }
  if (hasError) return;

  const payload = buildRequestPayload({ receiverName, identifier, amount, currency, reference });
  const built = encodeRequest(payload);

  if (built.encoded.length > CONFIG.MAX_ENCODED_LENGTH) {
    setStatus(dom.formStatus, 'The payment request is too large. Try shortening the reference.', 'error');
    return;
  }

  state.currentRequest = built;
  renderPreview(built);

  addRecentRequest({
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    receiver: payload.receiver,
    identifier: payload.identifier,
    amount: payload.amount,
    currency: payload.currency,
    reference: payload.reference || '',
    createdAt: new Date().toISOString(),
    encoded: built.encoded,
  });

  setStatus(dom.formStatus, 'Payment request created.', 'success');
}

/* ============================================================
   Request Viewer (preview panel on the right)
   ============================================================ */
async function renderPreview(request) {
  dom.previewEmpty.hidden = true;
  dom.previewResult.hidden = false;

  const { payload } = request;
  dom.previewAmount.textContent = formatAmount(payload.amount, payload.currency);
  dom.previewReceiver.textContent = payload.receiver;
  dom.previewIdentifier.textContent = payload.identifier;

  if (payload.reference) {
    dom.previewReferenceRow.hidden = false;
    dom.previewReference.textContent = payload.reference;
  } else {
    dom.previewReferenceRow.hidden = true;
  }

  dom.statusLine.textContent = 'Request created · Awaiting payer';
  setStatus(dom.previewStatus, '', null);

  await renderQr(dom.qrFrame, request.webLink);
}

function resetWorkspace() {
  dom.form.reset();
  clearFieldErrors();
  setStatus(dom.formStatus, '', null);
  dom.previewResult.hidden = true;
  dom.previewEmpty.hidden = false;
  state.currentRequest = null;
  document.getElementById('receiver-name').focus();
}

/* ============================================================
   UI State — incoming ?request= viewer
   ============================================================ */
function renderIncomingRequest(encoded) {
  const result = decodeRequest(encoded);
  dom.requestViewer.hidden = false;

  if (!result.ok) {
    dom.requestViewerContent.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'panel';

    const title = document.createElement('p');
    title.className = 'request-error-title';
    title.textContent = 'Invalid payment request';

    const body = document.createElement('p');
    body.className = 'request-error-body';
    body.textContent = result.reason;

    const back = document.createElement('a');
    back.href = '#top';
    back.className = 'btn btn-outline';
    back.textContent = 'Back to PAYREQ';

    wrap.append(title, body, back);
    dom.requestViewerContent.appendChild(wrap);
    return;
  }

  const { payload } = result;
  dom.requestViewerContent.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'panel';

  const title = document.createElement('p');
  title.className = 'request-viewer-title';
  title.textContent = 'Payment request received';

  const amount = document.createElement('p');
  amount.className = 'preview-amount';
  amount.textContent = formatAmount(payload.amount, payload.currency);

  const dl = document.createElement('dl');
  dl.className = 'preview-details';

  const rows = [
    ['Pay to', payload.receiver],
    ['Payment identifier', payload.identifier],
  ];
  if (payload.reference) rows.push(['Reference', payload.reference]);

  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value; // textContent only — never render decoded values via innerHTML
    row.append(dt, dd);
    dl.appendChild(row);
  });

  const note = document.createElement('p');
  note.className = 'status-note';
  note.textContent = 'Payment status cannot be verified by this standalone application.';

  const qrContainer = document.createElement('div');
  qrContainer.className = 'qr-frame';
  qrContainer.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'action-row';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-ghost';
  copyBtn.textContent = 'Copy payment details';
  copyBtn.addEventListener('click', async () => {
    const text = `${payload.receiver}\n${formatAmount(payload.amount, payload.currency)}\n${payload.identifier}${payload.reference ? '\n' + payload.reference : ''}`;
    const copied = await copyToClipboard(text);
    copyBtn.textContent = copied ? 'Copied' : 'Copy failed';
    setTimeout(() => { copyBtn.textContent = 'Copy payment details'; }, 1800);
  });

  const showQrBtn = document.createElement('button');
  showQrBtn.type = 'button';
  showQrBtn.className = 'btn btn-ghost';
  showQrBtn.textContent = 'Show QR';
  showQrBtn.addEventListener('click', async () => {
    qrContainer.hidden = false;
    await renderQr(qrContainer, window.location.href);
  });

  const createOwnBtn = document.createElement('a');
  createOwnBtn.href = '#create';
  createOwnBtn.className = 'btn btn-outline';
  createOwnBtn.textContent = 'Create your own request';

  actions.append(copyBtn, showQrBtn, createOwnBtn);
  wrap.append(title, amount, dl, note, qrContainer, actions);
  dom.requestViewerContent.appendChild(wrap);
}

function checkIncomingRequest() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('request');
  if (encoded) renderIncomingRequest(encoded);
}

/* ============================================================
   Event Handlers
   ============================================================ */
function bindEvents() {
  dom.themeToggle.addEventListener('click', toggleTheme);

  dom.navToggle.addEventListener('click', () => {
    const isOpen = !dom.mobileNav.hidden;
    dom.mobileNav.hidden = isOpen;
    dom.navToggle.setAttribute('aria-expanded', String(!isOpen));
  });
  dom.mobileNav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    dom.mobileNav.hidden = true;
    dom.navToggle.setAttribute('aria-expanded', 'false');
  }));

  dom.form.addEventListener('submit', handleFormSubmit);

  dom.btnDownloadPng.addEventListener('click', downloadQrPng);
  dom.btnDownloadSvg.addEventListener('click', downloadQrSvg);

  dom.btnCopyRequest.addEventListener('click', async () => {
    if (!state.currentRequest) return;
    const copied = await copyToClipboard(state.currentRequest.payreqUri);
    setStatus(dom.previewStatus, copied ? 'PAYREQ request copied.' : 'Copy failed — select and copy manually.', copied ? 'success' : 'error');
  });

  dom.btnCopyLink.addEventListener('click', async () => {
    if (!state.currentRequest) return;
    const copied = await copyToClipboard(state.currentRequest.webLink);
    setStatus(dom.previewStatus, copied ? 'Payment link copied.' : 'Copy failed — select and copy manually.', copied ? 'success' : 'error');
  });

  dom.btnShare.addEventListener('click', () => {
    if (!state.currentRequest) return;
    shareRequest(state.currentRequest);
  });

  dom.btnCreateAnother.addEventListener('click', resetWorkspace);

  dom.btnClearHistory.addEventListener('click', () => {
    if (loadRecentRequests().length === 0) return;
    clearRecentRequests();
  });
}

/* ============================================================
   Initialization
   ============================================================ */
function init() {
  initTheme();
  renderNetworkOptions();
  renderRecentRequests();
  bindEvents();
  checkIncomingRequest();
  dom.footerYear.textContent = String(new Date().getFullYear());
}

document.addEventListener('DOMContentLoaded', init);
