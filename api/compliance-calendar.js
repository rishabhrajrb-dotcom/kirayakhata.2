import { vercelHandler } from '../lib/http.js';
// POST /api/compliance-calendar - validated task calculation. No AI, no personal-data logging.
import { calendarSchema, zodErrors } from '../shared/schemas.js';
import { buildTasks, toICS } from '../shared/calendar.js';
import { todayIST } from '../shared/dates.js';
import { RULESET_VERSION } from '../shared/compliance-config.js';

export async function handleCalendar({ body, query }) {
  const parsed = calendarSchema.safeParse(body);
  if (!parsed.success) return { status: 400, json: { error: 'VALIDATION', issues: zodErrors(parsed.error) } };
  const { from, to, completions, ...profile } = parsed.data;
  const tasks = buildTasks(profile, { from, to }, { today: todayIST(), completions: completions || {} });
  if (query.get('format') === 'ics') return { status: 200, text: toICS(tasks), type: 'text/calendar; charset=utf-8', filename: 'kirayakhata-deadlines.ics' };
  return { status: 200, json: { tasks, rulesetVersion: RULESET_VERSION, today: todayIST() } };
}

export default vercelHandler(handleCalendar, { methods: ['POST'] });
