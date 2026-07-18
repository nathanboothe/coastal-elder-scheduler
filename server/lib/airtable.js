// lib/airtable.js
// Thin wrapper around the Airtable REST API using native fetch (Node 18+).
// Per the framework's auth philosophy: hand-roll simple HTTP calls rather
// than pull in a heavy SDK whose assumptions may not fit this service.
//
// This is the ONLY module that should ever hold the Airtable API key.
// Nothing outside server/ ever talks to Airtable directly — that's the
// whole point of the "single chokepoint" pattern.

const config = require('../config');

const BASE_URL = `https://api.airtable.com/v0/${config.airtable.baseId}`;

async function airtableFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.airtable.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable API error ${res.status} on ${path}: ${body}`);
  }

  return res.json();
}

/**
 * List records from a table, optionally filtered by an Airtable formula.
 * Handles pagination transparently and returns the full record array.
 */
async function listRecords(tableName, { filterByFormula, fields } = {}) {
  const records = [];
  let offset;

  do {
    const params = new URLSearchParams();
    if (filterByFormula) params.set('filterByFormula', filterByFormula);
    if (fields) fields.forEach((f) => params.append('fields[]', f));
    if (offset) params.set('offset', offset);

    const data = await airtableFetch(`${encodeURIComponent(tableName)}?${params.toString()}`);
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

async function createRecord(tableName, fields) {
  const data = await airtableFetch(encodeURIComponent(tableName), {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
  return data;
}

async function deleteRecords(tableName, recordIds) {
  const params = new URLSearchParams();
  recordIds.forEach((id) => params.append('records[]', id));
  return airtableFetch(`${encodeURIComponent(tableName)}?${params.toString()}`, {
    method: 'DELETE',
  });
}

/**
 * Creates multiple records in one or more requests (Airtable caps writes at
 * 10 records per request for create, unlike the 50-record cap on delete).
 */
async function createRecords(tableName, recordsFields) {
  const created = [];
  for (let i = 0; i < recordsFields.length; i += 10) {
    const batch = recordsFields.slice(i, i + 10);
    const data = await airtableFetch(encodeURIComponent(tableName), {
      method: 'POST',
      body: JSON.stringify({ records: batch.map((fields) => ({ fields })) }),
    });
    created.push(...data.records);
  }
  return created;
}

/**
 * Updates multiple existing records (by id) in one or more requests.
 * Each entry in `updates` is { id, fields }. Uses PATCH semantics — fields
 * not included are left untouched.
 */
async function updateRecords(tableName, updates) {
  const updated = [];
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    const data = await airtableFetch(encodeURIComponent(tableName), {
      method: 'PATCH',
      body: JSON.stringify({ records: batch }),
    });
    updated.push(...data.records);
  }
  return updated;
}

module.exports = { listRecords, createRecord, createRecords, updateRecords, deleteRecords };
