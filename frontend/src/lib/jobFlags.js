// What makes a job card need attention, and the columns of the workshop board.
export const DONE = ['Closed', 'Invoiced', 'Delivered'];
export const BOARD_COLUMNS = ['Created', 'Dispatched', 'At workshop', 'Work done', 'Back with SA', 'Closed', 'Invoiced'];
export const isOverdue = (j, today) => !!j.due_date && String(j.due_date).slice(0, 10) < today && !DONE.includes(j.status);
export const isDueToday = (j, today) => !!j.due_date && String(j.due_date).slice(0, 10) === today && !DONE.includes(j.status);
export const isUrgent = j => /urgent|high|asap|rush/i.test(j.priority || '');
// overdue first, then urgent, then the earliest due date, then the oldest card
const rank = (j, today) => (isOverdue(j, today) ? 0 : isUrgent(j) ? 1 : 2);
export function boardColumns(jobs, today) {
  return BOARD_COLUMNS.map(status => ({
    status,
    jobs: jobs.filter(j => j.status === status).sort((a, b) => rank(a, today) - rank(b, today)
      || String(a.due_date || '9999').slice(0, 10).localeCompare(String(b.due_date || '9999').slice(0, 10)) || String(a.created || '').localeCompare(String(b.created || '')))
  }));
}
