// ─── Cron: scheduled evolution runs ────────────────────────────────────────────
// Run evolution iterations on a schedule (e.g., overnight). Uses the system's
// crontab or a simple JSON-based schedule file for portability.

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface CronSchedule {
  /** Cron expression (e.g., "0 1 * * *" for 1am daily). */
  expression: string;
  /** Workspace domain to evolve. */
  domain: string;
  /** Number of iterations per run. */
  iterations: number;
  /** Model to use (optional). */
  model?: string;
  /** Provider to use (optional). */
  provider?: string;
  enabled: boolean;
  lastRun?: number;
  lastResult?: string;
}

const CRON_SCHEDULE_FILE = ".wikiskill/cron.json";

/** Load cron schedule for a project. */
export async function loadCronSchedule(projectDir: string): Promise<CronSchedule[]> {
  try {
    const filePath = path.join(projectDir, CRON_SCHEDULE_FILE);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as CronSchedule[];
  } catch {
    return [];
  }
}

/** Save cron schedule for a project. */
export async function saveCronSchedule(
  projectDir: string,
  schedules: CronSchedule[],
): Promise<void> {
  const filePath = path.join(projectDir, CRON_SCHEDULE_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(schedules, null, 2), "utf-8");
}

/** Add a new cron schedule. */
export async function addCronSchedule(
  projectDir: string,
  schedule: Omit<CronSchedule, "enabled" | "lastRun" | "lastResult">,
): Promise<CronSchedule[]> {
  const schedules = await loadCronSchedule(projectDir);
  const newSchedule: CronSchedule = { ...schedule, enabled: true };
  schedules.push(newSchedule);
  await saveCronSchedule(projectDir, schedules);
  return schedules;
}

/** Remove a cron schedule by index. */
export async function removeCronSchedule(
  projectDir: string,
  index: number,
): Promise<CronSchedule[]> {
  const schedules = await loadCronSchedule(projectDir);
  schedules.splice(index, 1);
  await saveCronSchedule(projectDir, schedules);
  return schedules;
}

/** Toggle a schedule's enabled state. */
export async function toggleCronSchedule(
  projectDir: string,
  index: number,
): Promise<CronSchedule[]> {
  const schedules = await loadCronSchedule(projectDir);
  if (schedules[index]) {
    schedules[index].enabled = !schedules[index].enabled;
    await saveCronSchedule(projectDir, schedules);
  }
  return schedules;
}

/** Check if a cron expression should fire now. */
export function shouldFireNow(expression: string, lastRun?: number): boolean {
  // Simple cron parser for common patterns
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const now = new Date();

  // Check if we already ran this minute
  if (lastRun && now.getTime() - lastRun < 60000) return false;

  if (minute !== "*" && Number(minute) !== now.getMinutes()) return false;
  if (hour !== "*" && Number(hour) !== now.getHours()) return false;
  if (dayOfMonth !== "*" && Number(dayOfMonth) !== now.getDate()) return false;
  if (month !== "*" && Number(month) !== now.getMonth() + 1) return false;
  if (dayOfWeek !== "*" && Number(dayOfWeek) !== now.getDay()) return false;

  return true;
}

/** Get the next fire time for a cron expression. */
export function getNextFireTime(expression: string): Date {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1);
  now.setSeconds(0);
  now.setMilliseconds(0);

  // Simple: find next matching time within the next 7 days
  for (let i = 0; i < 10080; i++) {
    // 7 days in minutes
    if (shouldFireNow(expression, undefined)) {
      return new Date(now);
    }
    now.setMinutes(now.getMinutes() + 1);
  }
  return now;
}

/** Format schedule for display. */
export function formatSchedule(schedule: CronSchedule, index: number): string {
  const status = schedule.enabled ? "🟢" : "🔴";
  const lastRun = schedule.lastRun ? new Date(schedule.lastRun).toLocaleString() : "never";
  return `${status} [${index}] ${schedule.expression} → ${schedule.domain} (${schedule.iterations} iters) | last: ${lastRun}`;
}
