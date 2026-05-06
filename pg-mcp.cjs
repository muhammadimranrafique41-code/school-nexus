#!/usr/bin/env node
const { Client } = require('pg');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Load DATABASE_URL from .env if not already set
if (!process.env.DATABASE_URL) {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (key === 'DATABASE_URL') {
            process.env.DATABASE_URL = val;
            break;
          }
        }
      }
    }
  }
}

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  process.stderr.write('DATABASE_URL not set\n');
  process.exit(1);
}

async function query(sql) {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const res = await client.query(sql);
    return res;
  } finally {
    await client.end();
  }
}

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n';
  process.stdout.write(msg);
}

function sendError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n';
  process.stdout.write(msg);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  while (true) {
    const idx = buffer.indexOf('\n');
    if (idx === -1) break;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let req;
    try { req = JSON.parse(line); } catch { continue; }
    if (req.method === 'initialize') {
      sendResponse(req.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'pg-mcp', version: '1.0.0' }
      });
    } else if (req.method === 'tools/list') {
      sendResponse(req.id, {
        tools: [{
          name: 'query',
          description: 'Run a SQL query',
          inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] }
        }]
      });
    } else if (req.method === 'tools/call') {
      const sql = req.params?.arguments?.sql || '';
      try {
        const res = await query(sql);
        sendResponse(req.id, { content: [{ type: 'text', text: JSON.stringify(res.rows) }] });
      } catch (e) {
        sendError(req.id, -32000, e.message);
      }
    } else if (req.method === 'notifications/initialized') {
      // no-op
    }
  }
});
process.stdin.on('end', () => process.exit(0));
