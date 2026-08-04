#!/usr/bin/env node
// Pulls current subscriber counts for the Project Day (LCF 2026) launch
// segments straight from Flodesk's REST API and appends today's snapshot to
// projectday/data/history.json. Meant to be run daily by the GitHub Actions
// workflow in .github/workflows/daily-projectday-snapshot.yml, but you can
// also run it locally:
//
//   FLODESK_API_KEY=your_key node scripts/fetch-flodesk-projectday-snapshot.mjs

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

// Segment IDs confirmed from the Flodesk account on 2026-08-04.
// To find a segment's ID: open it in Flodesk, the ID is the last part of the URL
// (before any "?backTo=..." query string).
//
// These are all cumulative counts (people generally stay in these segments
// once added, they aren't a 24hr rolling window like MMC's canceled/failed
// segments) — so each day's number is a running total, not a daily delta.
const SEGMENTS = {
  ticketsPurchased: '6a5a98bd56549b25915344c4', // [Project Day] x LCF 2026
  upsellActivated:  '6a66687f721eb6509052f1a7', // [Project Day] x LCF 2026 - Upsell Activated
  trialActivated:   '6a71e41622a5030f6cd581f5', // [Project Day] x LCF 2026 - Trial Activated
  newSubscription:  '6a71e433c717cdca79ceaa0e', // [Project Day] x LCF 2026 - New PM Subscription
};

const AUTH_HEADER = 'Basic ' + Buffer.from(`${API_KEY}:`).toString('base64');

async function getSegmentCount(segmentId) {
  if (!segmentId) return null;
  const res = await fetch(`https://api.flodesk.com/v1/segments/${segmentId}`, {
    headers: {
      'Authorization': AUTH_HEADER,
      'User-Agent': 'JOMP Project Day Dashboard (internal script)'
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

  const dataDir = path.join(process.cwd(), 'projectday', 'data');
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
