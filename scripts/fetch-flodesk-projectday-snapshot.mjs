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

// The workflow fires hourly across a wide UTC window so it covers 6am-10pm ET
// in both Daylight Saving states without needing manual updates twice a year.
// Only actually run the fetch when the current Eastern hour is one of the
// 9 target snapshot times below AND today falls inside the launch window —
// every other hourly trigger exits quietly.
// Manual runs (the "Run workflow" button) always run for real, regardless of
// date or hour, so you can test any time.
const forceRun = process.env.FORCE_RUN === 'true';

// Launch window: Aug 19, 2026 12:00am ET through Sep 19, 2026 11:59pm ET.
// After this window, scheduled runs will skip automatically — no need to
// remember to disable the workflow.
const LAUNCH_START_DATE = '2026-08-19';
const LAUNCH_END_DATE = '2026-09-19';

const TARGET_HOURS = ['06', '08', '10', '12', '14', '16', '18', '20', '22'];

const nowEastern = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hour12: false
}).formatToParts(new Date());
const partsByType = Object.fromEntries(nowEastern.map(p => [p.type, p.value]));
const currentEasternDate = `${partsByType.year}-${partsByType.month}-${partsByType.day}`;
const currentEasternHour = partsByType.hour;

if (!forceRun && (currentEasternDate < LAUNCH_START_DATE || currentEasternDate > LAUNCH_END_DATE)) {
  console.log(`Skipping — ${currentEasternDate} is outside the launch window (${LAUNCH_START_DATE} to ${LAUNCH_END_DATE}).`);
  process.exit(0);
}

if (!forceRun && !TARGET_HOURS.includes(currentEasternHour)) {
  console.log(`Skipping — it's ${currentEasternHour}:00 in New York, not one of the target snapshot hours (${TARGET_HOURS.join(', ')}).`);
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
