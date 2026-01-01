# Owner Portal (Static)

Minimal static owner console for PlayTime USA.

## Local preview
Open `index.html` directly or serve with a simple static server:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Render static site settings
- Build Command: *(leave empty)*
- Publish Directory: `.`
- Environment: none required (edit `config.js` to set API base URL)

## Config
Edit `config.js` and set:

```js
window.OWNER_PORTAL_CONFIG = {
  apiBase: "https://playtimeusa-backend-v2.onrender.com",
};
```

## Login
Uses the same owner credentials as `/api/v1/staff/login`.

## Features
- Owner login
- Brand JSON editor (GET/POST `/api/v1/owner/brand`)
- Tenant list + create tenant
- Issue credits + allocate voucher pool

## Notes
- Amounts are entered in FUN and converted to cents before sending.
