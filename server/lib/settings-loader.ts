import { db } from "../db.js";
import { timetableSettings } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

export async function loadTimetableSettings() {
  const [settings] = await db.select().from(timetableSettings).where(eq(timetableSettings.schoolId, 1)).limit(1);
  if (settings) {
    return settings;
  }
  
  return {
    id: 0,
    schoolId: 1,
    startTime: "08:00",
    endTime: "15:00",
    workingDays: [1, 2, 3, 4, 5, 6],
    periodDuration: 45,
    breakAfterPeriod: [4],
    breakDuration: 15,
    totalPeriods: 8,
    updatedAt: new Date(),
  };
}

export function computePeriodTimeline(settings: { startTime: string; periodDuration: number; breakAfterPeriod: number[]; breakDuration: number; totalPeriods: number }) {
  const [startH, startM] = settings.startTime.split(':').map(Number);
  let currentMinutes = startH * 60 + startM;
  const breakSet = new Set(settings.breakAfterPeriod);
  
  const timeline = [];
  
  const formatTime = (totalMins: number) => {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const dispH = h % 12 || 12;
    const dispM = m.toString().padStart(2, '0');
    return `${dispH}:${dispM} ${ampm}`;
  };

  for (let p = 1; p <= settings.totalPeriods; p++) {
    const periodStart = currentMinutes;
    currentMinutes += settings.periodDuration;
    const periodEnd = currentMinutes;
    
    timeline.push({
      periodNumber: p,
      startTime: formatTime(periodStart),
      endTime: formatTime(periodEnd),
      isBreak: false,
    });
    
    if (breakSet.has(p)) {
      const breakStart = currentMinutes;
      currentMinutes += settings.breakDuration;
      const breakEnd = currentMinutes;
      timeline.push({
        periodNumber: null,
        startTime: formatTime(breakStart),
        endTime: formatTime(breakEnd),
        isBreak: true,
      });
    }
  }
  return timeline;
}
