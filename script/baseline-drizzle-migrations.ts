import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

type JournalEntry = {
  idx: number;
  when: number;
  tag: string;
  breakpoints: boolean;
  version?: string;
};

const { Client } = pg;

const getArgValue = (prefix: string) => {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
};

const resolveMigrationsDir = () => path.resolve(process.cwd(), "migrations");

type JournalFile = {
  version?: string;
  dialect?: string;
  entries: JournalEntry[];
};

const journalPathFor = (migrationsDir: string) => path.join(migrationsDir, "meta", "_journal.json");

const readJournal = (migrationsDir: string) => {
  const journalPath = journalPathFor(migrationsDir);
  if (!fs.existsSync(journalPath)) {
    throw new Error("Missing migrations meta/_journal.json");
  }
  const raw = fs.readFileSync(journalPath, "utf8");
  return JSON.parse(raw) as JournalFile;
};

const listMigrationTags = (migrationsDir: string) => {
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name.replace(/\.sql$/, ""))
    .filter((tag) => /^\d{4}_/.test(tag))
    .sort((a, b) => a.localeCompare(b));
};

const syncJournalEntries = (journal: JournalFile, tags: string[]) => {
  const existing = new Map(journal.entries.map((entry) => [entry.tag, entry]));
  let lastWhen = journal.entries.reduce((max, entry) => Math.max(max, entry.when), Date.now());
  const version = journal.version ?? "7";
  const syncedEntries = tags.map((tag, idx) => {
    const prior = existing.get(tag);
    if (prior?.when !== undefined) {
      lastWhen = Math.max(lastWhen, prior.when);
    } else {
      lastWhen += 1000;
    }
    return {
      idx,
      version,
      when: prior?.when ?? lastWhen,
      tag,
      breakpoints: prior?.breakpoints ?? false,
    } satisfies JournalEntry;
  });
  return { ...journal, version, entries: syncedEntries } satisfies JournalFile;
};

const writeJournal = (migrationsDir: string, journal: JournalFile) => {
  const journalPath = journalPathFor(migrationsDir);
  fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
};

const readMigrationSql = (migrationsDir: string, tag: string) => {
  const filePath = path.join(migrationsDir, `${tag}.sql`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing migration file: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
};

const computeHash = (sqlText: string) => crypto.createHash("sha256").update(sqlText).digest("hex");

const determineCutoffIndex = (entries: JournalEntry[], upToTag: string | null) => {
  if (entries.length === 0) return -1;
  if (upToTag) {
    const idx = entries.findIndex((entry) => entry.tag === upToTag);
    if (idx === -1) {
      throw new Error(`Unknown migration tag: ${upToTag}`);
    }
    return idx;
  }
  return entries.length > 1 ? entries.length - 2 : entries.length - 1;
};

const ensureMigrationTable = async (client: pg.Client) => {
  const schemaCheck = await client.query<{
    drizzle_table: string | null;
    public_table: string | null;
  }>(
    "select to_regclass('drizzle.__drizzle_migrations') as drizzle_table, to_regclass('public.__drizzle_migrations') as public_table",
  );

  const drizzleTable = schemaCheck.rows[0]?.drizzle_table;
  const publicTable = schemaCheck.rows[0]?.public_table;

  if (drizzleTable || publicTable) {
    return drizzleTable ? "drizzle" : "public";
  }

  await client.query("create schema if not exists drizzle");
  await client.query(`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);
  return "drizzle";
};

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const migrationsDir = resolveMigrationsDir();
  const journal = readJournal(migrationsDir);
  const tags = listMigrationTags(migrationsDir);
  const syncedJournal = syncJournalEntries(journal, tags);
  writeJournal(migrationsDir, syncedJournal);

  const entries = syncedJournal.entries;
  const upToTag = getArgValue("--up-to=");
  const cutoffIndex = determineCutoffIndex(entries, upToTag);

  if (cutoffIndex < 0) {
    console.log("No migrations found to baseline.");
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const schema = await ensureMigrationTable(client);
    const existingRows = await client.query<{ created_at: string | null }>(
      `select created_at from ${schema}.__drizzle_migrations`,
    );
    const existing = new Set(existingRows.rows.map((row) => row.created_at).filter(Boolean));

    const toInsert = entries.slice(0, cutoffIndex + 1);
    for (const entry of toInsert) {
      if (existing.has(String(entry.when))) {
        continue;
      }
      const sqlText = readMigrationSql(migrationsDir, entry.tag);
      const hash = computeHash(sqlText);
      await client.query(
        `insert into ${schema}.__drizzle_migrations ("hash", "created_at") values ($1, $2)`,
        [hash, entry.when],
      );
      console.log(`Baselined ${entry.tag}`);
    }

    console.log("Baseline complete. You can now run: npx drizzle-kit migrate");
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
