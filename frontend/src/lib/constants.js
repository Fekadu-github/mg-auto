export const ROLES = { SA: 'Service Advisor', WS: 'Workshop Supervisor', TECH: 'Technician', MGR: 'Manager', ADMIN: 'Administrator' };
export const STATUSES = ['Created', 'Dispatched', 'At workshop', 'Work done', 'Back with SA', 'Closed', 'Invoiced', 'Delivered'];
export const STATUS_NAME = {
  Created: 'Created', Dispatched: 'Dispatched to workshop', 'At workshop': 'Received by workshop', 'Work done': 'Workshop finished',
  'Back with SA': 'Received by SA', Closed: 'Closed', Invoiced: 'Invoiced', Delivered: 'Delivered'
};
export const SECTIONS = ['Regular Service', 'Mechanical Repairs', 'Body & Paints'];
// Short codes shown next to tasks: SV regular service (Type A/B/C), ME mechanical, BP body & paints
export const SECTION_CODE = { 'Regular Service': 'SV', 'Mechanical Repairs': 'ME', 'Body & Paints': 'BP' };
export const sectionOption = s => `${SECTION_CODE[s]} · ${s}`;
export const CLOCK_REASONS = ['Completed', 'Lunch', 'End of work day'];
export const NOTIFY_OPTIONS = [['both', 'SMS + Telegram'], ['sms', 'SMS only'], ['telegram', 'Telegram only'], ['none', 'Do not notify']];
export const POLL_MS = 15000;

// What each role may do on screen (the server enforces the same rules; this only decides which buttons to show)
export const isSA = me => ['SA', 'MGR', 'ADMIN'].includes(me?.role);
export const isWS = me => ['WS', 'MGR', 'ADMIN'].includes(me?.role);
export const isMgr = me => ['MGR', 'ADMIN'].includes(me?.role);       // costs, prices, Excel import/export, cancelling sales, inventory and custom reports
export const isTech = me => me?.role === 'TECH';
