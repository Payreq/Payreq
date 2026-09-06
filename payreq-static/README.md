# PAYREQ — Independent QR Payment Initiator

A fully static (HTML/CSS/vanilla JS, no build step, no backend) payment
**request** creator. It builds a structured, versioned request, turns it
into a shareable link and QR code, and can decode that same link back into
a request on any device — nothing more.

## What this honestly is — and isn't

- The QR/link encodes a **PAYREQ request** (`type: "payreq-payment-request"`),
  not a NepalQR, Fonepay, eSewa, Khalti, or connectIPS payload. None of
  those integrations exist in this build — the "Payment network" list in
  the form shows them as **Not configured** rather than hiding the fact
  that only "PAYREQ Request" actually works.
- There is no way for a static site to verify a real bank transaction, so
  the app never shows "Payment successful" or "Paid." The only states are
  **Request created** and **Awaiting payer**, plus an explicit note:
  *"Payment status cannot be verified by this standalone application."*
- No deep link like `bankapp://pay?...` is fabricated anywhere.
- Nothing is sent to a server. Requests are built in the browser; recent
  history lives only in this browser's `localStorage`.

If you want an implementation that actually talks to a real payment
network (e.g. Fonepay's Dynamic QR API) with server-side credential
isolation and provider-confirmed status, that's a fundamentally different,
backend-having project. It cannot be collapsed into a static site like
this one, because a real integration requires a secret signing key that
must never reach the browser — that key has to live behind a server.

## Files

```
payreq/
├── index.html
├── css/style.css
├── js/script.js
└── logo/qr-code-fintech-startup-icon-with-black-outline-style-vector.jpg
```

All asset references are relative (`css/style.css`, not `/css/style.css`),
and the shareable link is built from `window.location.origin` +
`window.location.pathname` at runtime — so this works unmodified whether
it's hosted at a domain root or under a GitHub Pages project path like
`https://<user>.github.io/payreq/`.

## Deploying to GitHub Pages

1. Push this folder's contents to a repository.
2. Repo Settings → Pages → set the source to the branch/folder containing
   `index.html`.
3. Visit the URL GitHub shows you.

### About `https://payreq.github.io`

That exact bare URL only happens automatically if your GitHub account/org
is literally named `payreq` and the repo is named `payreq.github.io`.
Otherwise your project will publish at
`https://<your-account>.github.io/<repo-name>/` — which this app already
handles correctly since it never hard-codes the domain.

## Local preview

No build step is needed — just serve the folder statically, e.g.:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Opening `index.html` directly via `file://` also mostly works, except the
Web Share API and clipboard fallback behave more reliably over `http(s)://`.

## Third-party dependency

`index.html` loads the QR-rendering library from a CDN
(`https://cdn.jsdelivr.net/npm/qrcode@1.5.3/...`) — the only external
dependency in the project. If you'd rather not depend on a CDN at runtime,
download that single file and reference it locally instead; no code
changes are needed beyond the `<script src>` path.
