
import { db } from "./server/db.js";
import { timetableSettings, timetableDays } from "./shared/schema.js";
import { eq } from "drizzle-orm";
import { loadTimetableSettings } from "./server/lib/settings-loader.js";

async function runAudit() {
  console.log("--- TIMETABLE AUDIT ---");
  
  // 1. Check constants
  console.log("timetableDays constant:", JSON.stringify(timetableDays));
  
  // 2. Check Database Settings
  const settings = await loadTimetableSettings();
  console.log("Loaded Timetable Settings:", JSON.stringify(settings, null, 2));
  
  const allSettings = await db.select().from(timetableSettings);
  console.log("All settings records in DB:", JSON.stringify(allSettings, null, 2));

  process.exit(0);
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
