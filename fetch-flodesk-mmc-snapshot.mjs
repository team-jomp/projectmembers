#!/usr/bin/env node
// Pulls current subscriber counts for the Mini Makers Club status segments
// straight from Flodesk's REST API and appends today's snapshot to
// mmc/data/history.json. Meant to be run daily by the GitHub Actions workflow
// in .github/workflows/daily-mmc-snapshot.yml, but you can also run it locally:
//
//   FLODESK_API_KEY=your_key node scripts/fetch-flodesk-mmc-snapshot.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const API_KEY = process.env.FLODESK_API_KEY;
if (!API_KEY) {
  console.error('Missing FLODESK_API_KEY environment variable.');
  process.exit(1);
}

// The workflow triggers at two possible UTC times to cover both sides of
// Daylight Saving. Only actually run the work on the trigger that's really
// 6am in New York right now — the other one just exits quietly.
// Manual runs (the "Run workflow" button) always run for real.
const forceRun = process.env.FORCE_RUN === 'true';
const currentEasternHour = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  hour12: false
}).format(new Date());

if (!forceRun && currentEasternHour !== '06') {
  console.log(`Skipping — it's ${currentEasternHour}:00 in New York, not 6am. The other scheduled trigger will handle it.`);
  process.exit(0);
}

// Segment IDs confirmed from the Flodesk account on 2026-08-03.
// To find a segment's ID: open it in Flodesk, the ID is the last part of the URL
// (before any "?backTo=..." query string).
//
// Note on "canceled": contacts sit in this segment for 24 hours after being
// added, then get auto-removed. Because that removal delay matches this
// script's 24-hour run cadence exactly, every contact is guaranteed to be
// caught by exactly one snapshot — so this count is effectively "how many
// cancelled in the last 24 hours," which is what we want for the daily figure.
const SEGMENTS = {
  active:         '6931a39f721dce3112a546b2', // [Mini Makers Club] Active
  canceled:       '6931b71ec877cc6c50690a1a', // [Mini Makers Club] Canceled
  failedPayments: '6931ba2994966c203ef720fc', // [Mini Makers Club] Failed Payments
};

const AUTH_HEADER = 'Basic ' + Buffer.from(`${API_KEY}:`).toString('base64');

async function getSegmentCount(segmentId) {
  if (!segmentId) return null;
  const res = await fetch(`https://api.flodesk.com/v1/segments/${segmentId}`, {
    headers: {
      'Authorization': AUTH_HEADER,
      'User-Agent': 'JOMP Mini Makers Club Dashboard (internal script)'
    }
  });
  if (!res.ok) {
    console.error(`Segment ${segmentId} lookup failed: ${res.status} ${await res.text()}`);
    return null;
  }
  const json = await res.json();
  return json.total_active_subscribers ?? null;
}

async function main() {
  const counts = {};
  for (const [key, id] of Object.entries(SEGMENTS)) {
    counts[key] = await getSegmentCount(id);
  }

  const today = new Date().toISOString().slice(0, 10); // UTC date, YYYY-MM-DD
  const entry = { date: today, ...counts };

  const dataDir = path.join(process.cwd(), 'mmc', 'data');
  const historyPath = path.join(dataDir, 'history.json');
  await mkdir(dataDir, { recursive: true });

  let history = [];
  try {
    history = JSON.parse(await readFile(historyPath, 'utf8'));
  } catch {
    history = [];
  }

  const idx = history.findIndex(h => h.date === today);
  if (idx >= 0) history[idx] = entry; else history.push(entry);
  history.sort((a, b) => a.date.localeCompare(b.date));

  await writeFile(historyPath, JSON.stringify(history, null, 2) + '\n');
  console.log('Saved snapshot for', today, entry);
}

main().catch(err => { console.error(err); process.exit(1); });
