#!/usr/bin/env node
// Pulls current subscriber counts for the Project Members status segments
// straight from Flodesk's REST API and appends today's snapshot to
// data/history.json. Meant to be run daily by the GitHub Actions workflow
// in .github/workflows/daily-snapshot.yml, but you can also run it locally:
//
//   FLODESK_API_KEY=your_key node scripts/fetch-flodesk-snapshot.mjs

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
// To find a segment's ID: open it in Flodesk, the ID is the last part of the URL.
const SEGMENTS = {
  active:                  '651b761a0441f4c60766c171', // [Project Members] ACTIVE Members
  paused:                  '680c026b7bc3a7d2f7a4f8c6', // [Project Members] Paused
  cancelledTemp:           '654a7361a6d7eee9a42d2866', // [Project Members] Cancelled - Temp Segment
  cancelled:               '6671d4375a2c31dd0fcc46f9', // Project Members Cancelled
  failedPaymentNotice:     '67c344b1ef0764cc419cd366', // [Project Members] 1st Failed Payment Notification
  failedPaymentAutoCancel: '', // TODO: paste in the "[Project Members] Failed Payment > Auto Cancel" segment id
};

const AUTH_HEADER = 'Basic ' + Buffer.from(`${API_KEY}:`).toString('base64');

async function getSegmentCount(segmentId) {
  if (!segmentId) return null;
  const res = await fetch(`https://api.flodesk.com/v1/segments/${segmentId}`, {
    headers: {
      'Authorization': AUTH_HEADER,
      'User-Agent': 'JOMP Project Members Dashboard (internal script)'
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

  const dataDir = path.join(process.cwd(), 'data');
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
