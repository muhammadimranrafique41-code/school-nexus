
import { loadTimetableSettings } from "../server/lib/settings-loader";
import { api } from "../shared/routes";
import { db } from "../server/db";
import { timetableSettings } from "../shared/schema";
import { eq } from "drizzle-orm";

async function verify() {
  console.log("--- Timetable Settings Verification ---");
  
  try {
    // 1. Check if settings exist in DB
    const [settings] = await db.select().from(timetableSettings).where(eq(timetableSettings.schoolId, 1)).limit(1);
    
    if (settings) {
      console.log("✅ Settings found in database:", JSON.stringify(settings, null, 2));
    } else {
      console.log("ℹ️ No settings in DB, using defaults.");
    }

    // 2. Test the loader (which fallback to defaults)
    const result = await loadTimetableSettings();
    console.log("✅ Loader returned settings:", JSON.stringify(result, null, 2));

    // 3. Verify types
    if (typeof result.startTime !== 'string' || !result.startTime.includes(':')) {
      throw new Error("Invalid startTime format!");
    }
    
    if (!Array.isArray(result.workingDays)) {
      throw new Error("workingDays should be an array!");
    }

    console.log("\n✅ ALL CHECKS PASSED SUCCESSFULLY");
    process.exit(0);
  } catch (error) {
    console.error("❌ VERIFICATION FAILED:", error);
    process.exit(1);
  }
}

verify();
