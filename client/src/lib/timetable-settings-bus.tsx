import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useTimetableSettings } from "@/hooks/use-settings";

export const TimetableSettingsContext = createContext<any>(null);

export function TimetableSettingsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useTimetableSettings();
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (data) {
      setSettings(data);
    } else if (isError && !settings) {
      // Fallback to sensible defaults instead of blocking the app
      console.warn("TimetableSettingsProvider: Fetch failed, using fallback defaults");
      setSettings({
        startTime: "08:00",
        endTime: "15:00",
        workingDays: [1, 2, 3, 4, 5, 6],
        periodDuration: 45,
        breakAfterPeriod: [4],
        breakDuration: 15,
        totalPeriods: 8,
      });
    }
  }, [data, isError, settings]);

  useEffect(() => {
    const handleUpdate = (e: CustomEvent) => {
      setSettings(e.detail);
    };
    window.addEventListener('timetable-settings-updated', handleUpdate as EventListener);
    return () => window.removeEventListener('timetable-settings-updated', handleUpdate as EventListener);
  }, []);

  const value = React.useMemo(() => ({
    settings,
    isLoading,
    isError
  }), [settings, isLoading, isError]);

  return (
    <TimetableSettingsContext.Provider value={value}>
      {children}
    </TimetableSettingsContext.Provider>
  );
}

export function useLiveSettings() {
  const context = useContext(TimetableSettingsContext);
  if (!context) return null;
  return context.settings;
}

export function useLiveSettingsFull() {
  const context = useContext(TimetableSettingsContext);
  return context || { settings: null, isLoading: true, isError: false };
}

export function computePeriodTimeline(
  settings: { 
    startTime: string; 
    periodDuration: number; 
    breakAfterPeriod: number[]; 
    breakDuration: number; 
    totalPeriods: number 
  },
  requestedPeriods?: number[]
) {
  const [startH, startM] = settings.startTime.split(':').map(Number);
  let currentMinutes = startH * 60 + startM;
  const breakSet = new Set(settings.breakAfterPeriod);
  
  const timeline = [];
  const maxP = Math.max(settings.totalPeriods || 0, ...(requestedPeriods || []));
  
  const formatTime = (totalMins: number) => {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const dispH = h % 12 || 12;
    const dispM = m.toString().padStart(2, '0');
    return `${dispH}:${dispM} ${ampm}`;
  };

  for (let p = 1; p <= maxP; p++) {
    const periodStart = currentMinutes;
    currentMinutes += settings.periodDuration;
    const periodEnd = currentMinutes;
    
    timeline.push({
      periodNumber: p,
      startTime: formatTime(periodStart),
      endTime: formatTime(periodEnd),
      isBreak: false,
    });
    
    // Add break if it follows this period AND we aren't at the very end of our loop
    // OR if it's within the configured totalPeriods (to respect the school day structure)
    if (breakSet.has(p) && (p < settings.totalPeriods || requestedPeriods?.includes(p + 1))) {
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
