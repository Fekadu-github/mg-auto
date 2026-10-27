import EstimationSheet from './EstimationSheet.jsx';
import { GARAGE } from './InvoiceDoc.jsx';

const area = c => [c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ');

/** What the sheet shows, as plain props: used by the printed sheet and by the PDF download, so the two always match. */
export const proformaProps = ({ pro, customer: c = {}, vehicle: v = {}, insurer, garage = {}, vat = 0.15, roleName = r => r, walkIn = false }) => ({
  no: pro.id, date: pro.pdate, draft: pro.status === 'Draft', walkIn,
  customer: { ...c, address: c.address || area(c) }, vehicle: v, insurer, policyNo: pro.policy_no, claimNo: pro.claim_no, dueDate: pro.due_date,
  note: pro.note, labours: pro.labours, parts: pro.parts, disc: pro.disc, vat, terms: pro.terms, garage: { ...GARAGE, ...garage },
  preparedBy: pro.estimator, preparedRole: pro.estimator_role ? roleName(pro.estimator_role) : ''
});

/** The first-hand (insurance or private) proforma on A4, in the "Service Price Estimation" layout.
 *  pro: { id, pdate, estimator, estimator_role, policy_no, claim_no, due_date, note, terms, status, labours, parts }
 *  customer: a registered customer, or { name, phone } of a walk-in (walkIn = true). insurer: { name, phone, address } or undefined (the customer pays). */
export default function ProformaDoc(props) {
  return <EstimationSheet {...proformaProps(props)} />;
}
