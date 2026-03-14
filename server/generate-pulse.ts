import cron from "node-cron";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { classTeachers, dailyTeachingPulse } from "../shared/schema.js";

const PERIOD_TIMES: { start: string; end: string }[] = [
  { start: "08:00", end: "08:45" },
  { start: "08:50", end: "09:35" },
  { start: "09:40", end: "10:25" },
  { start: "10:40", end: "11:25" },
  { start: "11:30", end: "12:15" },
  { start: "12:45", end: "13:30" },
  { start: "13:35", end: "14:20" },
  { start: "14:25", end: "15:10" },
];

export function scheduleDailyTeachingPulseCron() {
  // Runs every day at 00:01 server time
  cron.schedule("1 0 * * *", async () => {
    const today = new Date().toISOString().split("T")[0];

    try {
      const assignments = await db
        .select()
        .from(classTeachers)
        .where(eq(classTeachers.isActive, true));

      if (!assignments.length) {
        console.log(`[daily-pulse] No active class-teacher assignments found for ${today}`);
        return;
      }

      const rows = assignments
        .flatMap((ct) =>
          ct.subjects.map((subject, idx) => {
            const periodIndex = Math.min(idx, PERIOD_TIMES.length - 1);
            const times = PERIOD_TIMES[periodIndex];

            return {
              teacherId: ct.teacherId,
              classId: ct.classId,
              subject,
              period: idx + 1,
              startTime: times.start,
              endTime: times.end,
              room: null,
              date: today,
              status: "scheduled" as const,
            };
          }),
        );

      if (!rows.length) {
        console.log(`[daily-pulse] No periods generated for ${today}`);
        return;
      }

      // Idempotency: clear any existing pulse rows for today before inserting
      await db.delete(dailyTeachingPulse).where(eq(dailyTeachingPulse.date, today as unknown as Date));
      await db.insert(dailyTeachingPulse).values(rows);

      console.log(`[daily-pulse] Pulse generated for ${today}: ${rows.length} periods`);
    } catch (err) {
      console.error("[daily-pulse] Failed to generate daily teaching pulse", err);
    }
  });
}

