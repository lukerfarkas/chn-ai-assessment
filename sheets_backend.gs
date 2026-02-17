/**
 * Google Apps Script — CHN AI Assessment Backend (v2)
 *
 * Setup:
 * 1. Open Google Sheets → Extensions → Apps Script
 * 2. Paste this entire file into Code.gs (replace any default code)
 * 3. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the deployed URL and paste it into survey.html as the SHEETS_WEBHOOK_URL value
 *
 * NOTE: If you already have a "Submissions" tab from the old version, either
 * rename/delete it or clear its contents — the script will re-create headers
 * on the next POST if the tab doesn't exist.
 *
 * The POST payload from survey.html is:
 *   { headers: [...], values: [...], hash: "..." }
 * where headers/values are parallel arrays with ~108+ columns.
 */

const SHEET_NAME = 'Submissions';

/**
 * Handle POST — receives { headers, values, hash } and appends a new row.
 * On first POST the script uses the incoming headers to create the header row.
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet(data.headers || []);

    // Deduplicate by hash (last column)
    if (data.hash) {
      const existing = sheet.getDataRange().getValues();
      const headerRow = existing[0];
      const hashCol = headerRow.indexOf('Hash');
      if (hashCol >= 0) {
        for (let i = 1; i < existing.length; i++) {
          if (existing[i][hashCol] === data.hash) {
            return ContentService.createTextOutput(JSON.stringify({ status: 'duplicate' }))
              .setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
    }

    // Build the row — if payload has 'values' array, use it directly; otherwise fall back to field extraction
    let row;
    if (Array.isArray(data.values)) {
      row = data.values;
      // Append hash at end if the headers include Hash and it isn't already in values
      const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (headerRow[headerRow.length - 1] === 'Hash' && row.length === headerRow.length - 1) {
        row.push(data.hash || '');
      }
    } else {
      // Legacy format (field-by-field) — minimal fallback
      row = [
        data.timestamp || new Date().toISOString(),
        data.role || '',
        data.func || '',
        data.aiUsage || '',
        data.involvement || '',
        data.businessUnit || '',
        data.dominantArchetype || '',
        data.secondaryArchetype || '',
        data.hash || ''
      ];
    }

    sheet.appendRow(row);

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET — returns all submissions as JSON array.
 * Each row is an object keyed by camelCase versions of the sheet headers,
 * matching what the admin dashboard JS expects.
 * Usage: fetch(URL + '?action=getAll')
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getAll';

    if (action === 'getAll') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_NAME);

      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify([]))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const data = sheet.getDataRange().getValues();

      if (data.length <= 1) {
        return ContentService.createTextOutput(JSON.stringify([]))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const headers = data[0];
      const rows = [];

      // Map sheet header names → JS property names used by renderAdmin / exportCSV
      const keyMap = {
        'Timestamp': 'timestamp',
        'Role': 'role',
        'Function': 'func',
        'AI Usage Frequency': 'aiUsage',
        'AI Involvement': 'involvement',
        'Business Unit': 'businessUnit',
        'Dominant Archetype': 'dominantArchetype',
        'Secondary Archetype': 'secondaryArchetype',
        'P1 Athlete': 'p1Score',
        'P2 Builder': 'p2Score',
        'P3 Steward': 'p3Score',
        'P4 Integrator': 'p4Score',
        'P5 Optimizer': 'p5Score',
        'P6 Visionary': 'p6Score',
        'P7 Skeptic': 'p7Score',
        'Overall Fluency Level': 'fluencyLevel',
        'Overall Fluency Score': 'fluencyScore',
        'F1 Use & Value Score': 'f1Score',
        'F1 Level': 'f1Level',
        'F2 Enablement Score': 'f2Score',
        'F2 Level': 'f2Level',
        'F3 Risk & Trust Score': 'f3Score',
        'F3 Level': 'f3Level',
        'F4 Platform & Data Score': 'f4Score',
        'F4 Level': 'f4Level',
        'QC Passed': 'qcPassed',
        'Vis Gap F1 %': 'visF1',
        'Vis Gap F2 %': 'visF2',
        'Vis Gap F3 %': 'visF3',
        'Vis Gap F4 %': 'visF4',
        'Hash': 'hash'
      };

      for (let i = 1; i < data.length; i++) {
        const obj = {};
        headers.forEach(function(h, idx) {
          // Use mapped key or fall back to header as-is (covers PST-001, CAP-001, etc.)
          const key = keyMap[h] || h;
          let val = data[i][idx];
          // Convert boolean-like strings
          if (val === 'TRUE' || val === 'Yes') val = true;
          if (val === 'FALSE' || val === 'No') val = false;
          // Convert numeric strings
          if (typeof val === 'string' && val !== '' && !isNaN(val)) val = Number(val);
          obj[key] = val;
        });
        rows.push(obj);
      }

      return ContentService.createTextOutput(JSON.stringify(rows))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Gets (or creates) the Submissions sheet.
 * If creating new, uses the headers sent from the POST payload so the
 * sheet always matches whatever the JS is sending.
 */
function getOrCreateSheet(incomingHeaders) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Use incoming headers if provided, otherwise a sensible default set
    const hdrs = (incomingHeaders && incomingHeaders.length > 0)
      ? incomingHeaders.concat(['Hash'])
      : ['Timestamp', 'Role', 'Function', 'AI Usage Frequency', 'AI Involvement', 'Business Unit',
         'Dominant Archetype', 'Secondary Archetype',
         'P1 Athlete', 'P2 Builder', 'P3 Steward', 'P4 Integrator', 'P5 Optimizer', 'P6 Visionary', 'P7 Skeptic',
         'Overall Fluency Level', 'Overall Fluency Score',
         'F1 Use & Value Score', 'F1 Level', 'F2 Enablement Score', 'F2 Level', 'F3 Risk & Trust Score', 'F3 Level', 'F4 Platform & Data Score', 'F4 Level',
         'QC Passed', 'Vis Gap F1 %', 'Vis Gap F2 %', 'Vis Gap F3 %', 'Vis Gap F4 %',
         'Hash'];
    sheet.appendRow(hdrs);
    sheet.getRange(1, 1, 1, hdrs.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}
