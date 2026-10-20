import EstimationSheet from './EstimationSheet.jsx';

const area = c => [c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ');

/** The first-hand (insurance or private) proforma on A4, in the "Service Price Estimation" layout.
 *  pro: { id, pdate, estimator, estimator_role, policy_no, claim_no, due_date, note, terms, status, labours, parts }
 *  customer: a registered customer, or { name, phone } of a walk-in (walkIn = true). insurer: { name, phone, address } or undefined (the customer pays). */
export default function ProformaDoc({ pro, customer: c = {}, vehicle: v = {}, insurer, garage = {}, vat = 0.15, roleName = r => r, walkIn = false }) {
  return (
    <EstimationSheet
      no={pro.id} date={pro.pdate} draft={pro.status === 'Draft'} walkIn={walkIn}
      customer={{ ...c, address: c.address || area(c) }} vehicle={v} insurer={insurer} policyNo={pro.policy_no} claimNo={pro.claim_no} dueDate={pro.due_date}
      note={pro.note} labours={pro.labours} parts={pro.parts} vat={vat} terms={pro.terms} garage={garage}
      preparedBy={pro.estimator} preparedRole={pro.estimator_role ? roleName(pro.estimator_role) : ''}
    />
  );
}
