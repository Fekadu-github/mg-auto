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
export const isAdmin = me => me?.role === 'ADMIN';                   // unlimited: every screen and every action
export const isSA = me => ['SA', 'MGR', 'ADMIN'].includes(me?.role);
export const isWS = me => ['WS', 'MGR', 'ADMIN'].includes(me?.role);
export const isMgr = me => ['MGR', 'ADMIN'].includes(me?.role);       // costs, prices, Excel import/export, cancelling sales, inventory and custom reports
export const isTech = me => me?.role === 'TECH';

// Terms printed at the bottom of every estimation / proforma sheet. Edit the wording here; the bank accounts come from GARAGE_BANK on the server.
export const DEFAULT_TERMS = [
  'Validity: the estimation is valid only for 7 days from the date of issue.',
  'If the repair requires additional parts and/or labour, we will inform you of the amount and the works for your kind authorization.',
  'Price of parts is subject to change without notice.',
  'We will not charge for parts that are not replaced even though they are indicated in the above list of parts.',
  'Mode of payment: cash, cheque, CPO or bank transfer.',
  'Advance payment (if any) is agreed with the garage before the work starts.'
];
