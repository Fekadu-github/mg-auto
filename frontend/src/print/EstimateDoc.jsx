import EstimationSheet from './EstimationSheet.jsx';
import { GARAGE } from './InvoiceDoc.jsx';

const area = c => [c.city, c.sub, c.woreda, c.house].filter(Boolean).join(', ');

/** What the sheet shows, as plain props: used by the printed sheet and by the PDF download, so the two always match. */
export const estimateProps = ({ est, customer: c = {}, vehicle: v = {}, pro, insurer, garage = {}, vat = 0.15, walkIn = false }) => ({
  no: est.id, date: est.created, draft: est.status === 'Draft', walkIn,
  customer: { ...c, address: c.address || area(c) }, vehicle: v, insurer, policyNo: pro?.policy_no, claimNo: pro?.claim_no, dueDate: pro?.due_date,
  note: est.note, labours: est.labours, parts: est.parts, disc: est.disc, vat, terms: pro?.terms, garage: { ...GARAGE, ...garage },
  preparedBy: est.by_name || pro?.estimator, label: 'Estimation'
});

/** A body & paint estimate on A4 (draft or finalized), in the same "Service Price Estimation" layout as the proforma.
 *  est: { id, status, note, created, by_name, labours, parts }. pro / insurer: the proforma it was made from and its insurance company, if any. */
export default function EstimateDoc(props) {
  return <EstimationSheet {...estimateProps(props)} />;
}
