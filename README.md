# Project Members — Flodesk Status Dashboard

Pulls live subscriber counts for Project Members status segments straight from
Flodesk's REST API on a daily schedule, and renders them as a dashboard
(daily / weekly / monthly / custom range).

No chat, no artifact, no Anthropic API in the loop — just a scheduled script
and a static page.

## How it works

1. `.github/workflows/daily-snapshot.yml` fires at 10:00 and 11:00 UTC every
   day (covering both sides of Daylight Saving) and can also be triggered
   manually from the **Actions** tab. The script itself checks the real time
   in New York and only does real work on the trigger that's genuinely 6am
   ET — so this always runs at 6am Eastern, automatically, with no manual
   DST adjustment. Manual "Run workflow" clicks always run for real.
2. It runs `scripts/fetch-flodesk-snapshot.mjs`, which calls
   `GET https://api.flodesk.com/v1/segments/{id}` for each of the six
   Project Members status segments and reads `total_active_subscribers`.
3. The result gets appended to `data/history.json` and committed back to the repo.
4. `index.html` reads `data/history.json` and renders the dashboard. Host it
   with GitHub Pages (or any static host) for a live, always-current view.

## Setup

1. **Create a Flodesk API key.** In Flodesk: Account → Integrations → API Key.
   API keys require a paid Flodesk plan.
2. **Create a new GitHub repo** and add these files (or push this folder as-is).
3. **Add the secret.** Repo Settings → Secrets and variables → Actions →
   New repository secret → name it `FLODESK_API_KEY`, paste the key.
4. **Fill in the missing segment ID.** Open the
   "`[Project Members] Failed Payment > Auto Cancel`" segment in Flodesk,
   copy its ID from the URL, and paste it into
   `scripts/fetch-flodesk-snapshot.mjs` where it says
   `failedPaymentAutoCancel: ''`.
5. **Run it once manually** — Actions tab → "Daily Project Members snapshot" →
   Run workflow — to confirm it works and to add a fresh entry to `data/history.json`.
6. **Enable GitHub Pages** — Settings → Pages → Deploy from branch → `main` / root.
   Your dashboard will be live at `https://<your-username>.github.io/<repo-name>/`.

## Important: this data is internal, and Pages is public by default

GitHub Pages sites are **publicly accessible by default**, even when the
repository itself is private — unless the organization is on **GitHub
Enterprise Cloud**, which supports private Pages sites. Project Members
subscriber counts are internal business data, so before enabling Pages,
decide whether that's acceptable. If not:

- Skip Pages, and just open `index.html` locally or via a teammate cloning
  the repo, or
- Host on a static provider with access control (e.g. Netlify or Vercel with
  password protection on a paid tier), or
- Check whether JOMP's GitHub plan includes Enterprise Cloud's private
  Pages feature.

## Adjusting the schedule

It's set to run at 6am ET automatically (see above). If you want a different
time, change both the `cron` lines in `.github/workflows/daily-snapshot.yml`
(pick the UTC times for your target hour in both EST and EDT) and the
`'06'` check inside `scripts/fetch-flodesk-snapshot.mjs`.

## Branding

`index.html` uses JOMP's Project Members colors (cream background, deep
teal text, dusty rose / teal / rust accents) and fonts (Young Serif for
headings, Bitter for body text, both loaded from Google Fonts). The logo
and flourish graphic live in `assets/pm-logo.png` and `assets/flourish.png`
— swap those files (keep the same filenames) to update the branding without
touching the code.

## Segment reference

| Key | Segment name | ID |
|---|---|---|
| `active` | [Project Members] ACTIVE Members | `651b761a0441f4c60766c171` |
| `paused` | [Project Members] Paused | `680c026b7bc3a7d2f7a4f8c6` |
| `cancelledTemp` | [Project Members] Cancelled - Temp Segment | `654a7361a6d7eee9a42d2866` |
| `cancelled` | Project Members Cancelled | `6671d4375a2c31dd0fcc46f9` |
| `failedPaymentNotice` | [Project Members] 1st Failed Payment Notification | `67c344b1ef0764cc419cd366` |
| `failedPaymentAutoCancel` | [Project Members] Failed Payment > Auto Cancel | *(needs ID)* |
