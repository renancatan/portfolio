# Renan Catan — Portfolio

A responsive, static portfolio focused on data engineering, AI systems, analytics,
and product data integrations.

## Local preview

```bash
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000`.

The site has no build step and remains compatible with GitHub Pages.
The deployed assistant accepts browser requests only from the published portfolio origin.

`profile.html` is the recruiter-facing career profile. Its canonical public facts live
in `assets/data/profile.json`, with a compact crawler guide in `llms.txt`. Update the
JSON first when changing career facts so the page copy, tests, and AI context can stay aligned.

## Portfolio assistant

The chat UI calls a small Cloudflare Worker, which keeps the Gemini API key out of
the browser and Git history. The Worker restricts browser origins, validates input,
rate-limits requests, and asks Gemini to answer only from the imported canonical profile JSON.
The profile is bundled at deploy time, so changes to `assets/data/profile.json` require
redeploying the Worker as well as publishing GitHub Pages.

```bash
cd worker
npm ci
npm test
npx wrangler dev
```

Set or rotate the encrypted production secret interactively, then deploy:

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

Do not put the key in `wrangler.jsonc`, `.dev.vars`, HTML, or client-side JavaScript.
