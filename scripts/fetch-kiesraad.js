#!/usr/bin/env node
/**
 * fetch-kiesraad.js
 * Haalt ontbrekende verkiezingsdata op van data.overheid.nl (Kiesraad)
 * voor gemeente Baarn (gemeente_id: 308) en voegt toe aan totaal_stemuitslagen.csv
 *
 * Gebruik: node scripts/fetch-kiesraad.js
 */

'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'totaal_stemuitslagen.csv');
const STEMBUREAU_PATH = path.join(ROOT, 'stembureau.json');
const BAARN_ID = '308';

// Kiesraad CSV ZIP-URLs (semicolon-delimited long format)
// Formaat: GemeenteCode;GemeenteNaam;Postcode;StembureauNaam;StembureauCode;PartijNaam;AantalStemmen
const ELECTIONS = [
  {
    key: '2010_tk',
    url: 'https://data.overheid.nl/sites/default/files/dataset/fbf2c39e-b3c8-40c1-b52a-ba5c6b26cf1a/resources/Verkiezingsuitslagen%20Tweede%20Kamer%202010%20%28CSV%20formaat%29.zip',
    csvFile: 'TK2010_Stemmen_Per_Lijst_Per_Stembureau.csv',
    hasPostcode: false,
  },
  {
    key: '2012_tk',
    url: 'https://data.overheid.nl/sites/default/files/dataset/31362154-3866-407d-97fd-96c9dc2639bc/resources/Verkiezingsuitslagen%20Tweede%20Kamer%202012%20%28CSV%20formaat%29.zip',
    csvFile: 'TK2012_Stemmen_Per_Lijst_Per_Stembureau.csv',
    hasPostcode: true,
  },
  {
    key: '2021_tk',
    url: 'https://data.overheid.nl/sites/default/files/dataset/39e9bad4-4667-453f-ba6a-4733a956f6f8/resources/Verkiezingsuitslagen%20Tweede%20Kamer%202021%20%28CSV%20formaat%29.zip',
    csvFile: 'TK2021_Stemmen_Per_Lijst_Per_Stembureau.csv',
    hasPostcode: true,
  },
  {
    key: '2023_ps',
    url: 'https://data.overheid.nl/sites/default/files/dataset/be8b7869-4a12-4446-abab-5cd0a436dc4f/resources/Verkiezingsuitslagen%20Provinciale%20Staten%202023%20%28CSV%20formaat%29.zip',
    csvFile: 'PS2023_Stemmen_Per_Lijst_Per_Stembureau.csv',
    hasPostcode: true,
  },
  {
    key: '2025_tk',
    url: 'https://data.overheid.nl/sites/default/files/dataset/a16f3352-c9ce-4831-a314-f989d442a258/resources/Verkiezingsuitslag%20Tweede%20Kamer%202025%20%28CSV%20Formaat%29.zip',
    csvFile: 'TK2025_Stemmen_Per_Lijst_Per_Stembureau.csv',
    hasPostcode: true,
  },
];

// Stembureaus die nooit echte stembureaus zijn (reservelijsten etc.)
const EXCLUDED_BUREAUS = ['RESERVELIJST', 'reservelijst'];

// ─── Postcode lookup via stembureaunaam ───────────────────────────────────────
// TK2010 heeft geen postcodes in de data; we zoeken op (genormaliseerde) naam
function buildNameToPostcodeMap() {
  const stembureauData = JSON.parse(fs.readFileSync(STEMBUREAU_PATH, 'utf8'));
  const map = new Map();
  for (const entry of stembureauData) {
    const normalized = normalizeName(entry.stembureau);
    map.set(normalized, entry.postcode.replace(/\s/g, ''));
  }
  // Ook de buurtnamen die al in de CSV staan als fallback
  const csvLines = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n');
  for (let i = 1; i < csvLines.length; i++) {
    const cols = parseCsvLine(csvLines[i]);
    if (cols[5]) {  // bureau_zip kolom
      const name = normalizeName(cols[4]); // bureau_label
      if (!map.has(name)) map.set(name, cols[5].replace(/\s/g, ''));
    }
  }
  return map;
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/["""'']/g, '')
    .replace(/stembureau\s*/gi, '')
    .replace(/\(postcode:.*?\)/gi, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Download helpers ─────────────────────────────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode} voor ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', (err) => { try { fs.unlinkSync(dest); } catch {} reject(err); });
  });
}

function unzipFile(zipPath, csvName, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  execSync(`unzip -o "${zipPath}" "${csvName}" -d "${outDir}"`, { stdio: 'pipe' });
  return path.join(outDir, csvName);
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCsvLine(line, sep = ',') {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      result.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

// Converteert latin1 buffer naar utf8 string
function latin1ToUtf8(buf) {
  return buf.toString('binary')
    .split('')
    .map(c => c.charCodeAt(0) <= 127 ? c : Buffer.from([c.charCodeAt(0)]).toString('latin1'))
    .join('');
}

// ─── Kiesraad long-format → wide format ──────────────────────────────────────
// Input CSV kolommen: GemeenteCode;GemeenteNaam;Postcode;StembureauNaam;StembureauCode;PartijNaam;AantalStemmen
// Output: groupeer per stembureau, wijd formaat

function parseLongCsv(csvPath, electionKey, hasPostcode, nameToPostcode) {
  const raw = fs.readFileSync(csvPath);
  // Kiesraad CSVs zijn UTF-8 (c3 a8 = è, etc.)
  const text = raw.toString('utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0], ';');
  // Verwacht: GemeenteCode;GemeenteNaam;Postcode;StembureauNaam;StembureauCode;PartijNaam;AantalStemmen
  // Maar check op kolomnamen voor zekerheid
  const iGemCode  = header.findIndex(h => /gemeente.*code|gemcode|regio.*code/i.test(h));
  const iGemNaam  = header.findIndex(h => /gemeente.*naam|regio.*naam/i.test(h));
  const iPostcode = header.findIndex(h => /postcode|zip/i.test(h));
  const iBureauNm = header.findIndex(h => /bureau.*naam|stembureau.*naam|bureaulabel/i.test(h));
  const iBureauId = header.findIndex(h => /bureau.*code|bureaucode|bureau_id/i.test(h));
  const iPartij   = header.findIndex(h => /partij.*naam|lijstnaam|kandidaat.*naam/i.test(h));
  const iStemmen  = header.findIndex(h => /aantal.*stemmen|stemmen|votes|aantal/i.test(h));

  console.log(`  Header (${header.length} kolommen): ${header.slice(0, 7).join(' | ')}`);
  console.log(`  Kolom-indices: gemCode=${iGemCode} gemNaam=${iGemNaam} pc=${iPostcode} bureauNm=${iBureauNm} bureauId=${iBureauId} partij=${iPartij} stemmen=${iStemmen}`);

  const bureaus = new Map(); // bureauCode → { naam, postcode, parties }

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], ';');
    const gemCode = (cols[iGemCode] || '').replace(/^0+/, '').trim();
    const gemNaam = (cols[iGemNaam] || '').trim().toLowerCase();
    if (gemCode !== BAARN_ID && gemNaam !== 'baarn') continue;

    const bureauNaam = (cols[iBureauNm] || '').trim();
    // Sla reservelijsten en niet-echte stembureaus over
    if (EXCLUDED_BUREAUS.some(ex => bureauNaam.includes(ex))) continue;
    const bureauId   = (cols[iBureauId] || `SB${i}`).trim();
    let   postcode   = (cols[iPostcode] || '').replace(/\s/g, '').trim();
    const partijNaam = (cols[iPartij]   || '').trim();
    const stemmen    = parseInt(cols[iStemmen]) || 0;

    // Fallback: zoek postcode op naam als het ontbreekt
    if (!postcode && !hasPostcode) {
      postcode = nameToPostcode.get(normalizeName(bureauNaam)) || '';
    }

    const key = `${bureauId}|${bureauNaam}`;
    if (!bureaus.has(key)) {
      bureaus.set(key, {
        electionKey,
        bureauId: bureauId.startsWith('0308::') ? bureauId : `0308::${bureauId}`,
        bureauNaam,
        postcode,
        parties: {},
      });
    }
    const bureau = bureaus.get(key);
    if (!postcode && bureau.postcode) {} // al ingesteld
    else if (postcode) bureau.postcode = postcode;

    if (partijNaam && stemmen > 0) {
      bureau.parties[partijNaam] = (bureau.parties[partijNaam] || 0) + stemmen;
    }
  }

  return Array.from(bureaus.values());
}

// ─── CSV samenvoegen ───────────────────────────────────────────────────────────

function mergeToCsv(allNewRows) {
  if (allNewRows.length === 0) {
    console.log('Geen nieuwe rijen om toe te voegen.');
    return;
  }

  const existing = fs.readFileSync(CSV_PATH, 'utf8');
  const existingLines = existing.trim().split('\n');
  const existingHeader = parseCsvLine(existingLines[0]);

  // Welke election keys bestaan al?
  const existingKeys = new Set(existingLines.slice(1).map(l => parseCsvLine(l)[0]));

  // Filter al bestaande rijen
  const newRows = allNewRows.filter(r => !existingKeys.has(r.electionKey));
  if (newRows.length === 0) {
    console.log('Alle data is al aanwezig in de CSV.');
    return;
  }

  // Alle nieuwe partijnamen (die nog niet in de header staan)
  const existingParties = new Set(existingHeader.slice(10));
  const allNewParties = [];
  for (const row of newRows) {
    for (const p of Object.keys(row.parties)) {
      if (!existingParties.has(p)) allNewParties.push(p);
    }
  }
  const uniqueNewParties = [...new Set(allNewParties)];
  const finalHeader = [...existingHeader, ...uniqueNewParties];

  // Herschrijf bestaande rijen met extra lege kolommen
  const updatedLines = [finalHeader.join(',')];
  for (let i = 1; i < existingLines.length; i++) {
    const cols = parseCsvLine(existingLines[i]);
    while (cols.length < finalHeader.length) cols.push('0');
    updatedLines.push(cols.map(escapeCsv).join(','));
  }

  // Voeg nieuwe rijen toe, gesorteerd
  newRows.sort((a, b) => a.electionKey.localeCompare(b.electionKey));
  for (const row of newRows) {
    const cols = new Array(finalHeader.length).fill('0');
    cols[0] = row.electionKey;
    cols[1] = 'Baarn';
    cols[2] = '308';
    cols[3] = row.bureauId;
    cols[4] = row.bureauNaam;
    cols[5] = row.postcode;
    const totalVotes = Object.values(row.parties).reduce((a, b) => a + b, 0);
    cols[6] = String(totalVotes);
    cols[7] = String(totalVotes);
    cols[8] = '0';
    cols[9] = '0';
    for (const [partij, stemmen] of Object.entries(row.parties)) {
      const idx = finalHeader.indexOf(partij);
      if (idx !== -1) cols[idx] = String(stemmen);
    }
    updatedLines.push(cols.map(escapeCsv).join(','));
  }

  fs.writeFileSync(CSV_PATH, updatedLines.join('\n') + '\n', 'utf8');
  console.log(`\n✓ ${newRows.length} nieuwe rijen toegevoegd aan totaal_stemuitslagen.csv`);

  // Overzicht per verkiezing
  const counts = {};
  for (const r of newRows) {
    counts[r.electionKey] = (counts[r.electionKey] || 0) + 1;
  }
  for (const [key, count] of Object.entries(counts)) {
    console.log(`  ${key}: ${count} stembureaus`);
  }
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─── Hoofdfunctie ──────────────────────────────────────────────────────────────

async function main() {
  const nameToPostcode = buildNameToPostcodeMap();
  console.log(`Postcodekaart geladen: ${nameToPostcode.size} stembureaus\n`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiesraad-'));
  const allNewRows = [];

  for (const election of ELECTIONS) {
    console.log(`→ ${election.key}: downloaden...`);
    const zipPath = path.join(tmpDir, `${election.key}.zip`);
    const outDir  = path.join(tmpDir, election.key);

    try {
      await download(election.url, zipPath);
      const csvPath = unzipFile(zipPath, election.csvFile, outDir);
      const rows = parseLongCsv(csvPath, election.key, election.hasPostcode, nameToPostcode);
      console.log(`  → ${rows.length} stembureaus voor Baarn`);
      allNewRows.push(...rows);
    } catch (err) {
      console.warn(`  ⚠ Overgeslagen: ${err.message}`);
    }
    console.log();
  }

  mergeToCsv(allNewRows);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('\nKlaar!');
}

main().catch(err => { console.error(err); process.exit(1); });
