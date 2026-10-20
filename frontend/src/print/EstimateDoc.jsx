import EstimationSheet from './EstimationSheet.jsx';

const area = c => [c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ');

/** A body & paint estimate on A4 (draft or finalized), in the same "Service Price Estimation" layout as the proforma.
 *  est: { id, status, note, created, by_name, labours, parts }. pro / insurer: the proforma it was made from and its insurance company, if any. */
export default function EstimateDoc({ est, customer: c = {}, vehicle: v = {}, pro, insurer, garage = {}, vat = 0.15, walkIn = false }) {
  return (
    <EstimationSheet
      no={est.id} date={est.created} draft={est.status === 'Draft'} walkIn={walkIn}
      customer={{ ...c, address: c.address || area(c) }} vehicle={v} insurer={insurer} policyNo={pro?.policy_no} claimNo={pro?.claim_no} dueDate={pro?.due_date}
      note={est.note} labours={est.labours} parts={est.parts} vat={vat} terms={pro?.terms} garage={garage}
      preparedBy={est.by_name || pro?.estimator} label="Estimation"
    />
  );
}
