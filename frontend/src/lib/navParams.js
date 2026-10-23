// A one-shot note from one screen to the next: the dashboard tile "Parts to reorder" opens the Parts list already filtered.
// The next screen reads it when it opens (readNavParams('inv')) and then clears it (clearNavParams()), so it never sticks.
// Reading does not clear it, so a screen that renders twice still sees it.
let box = { page: '', params: null };
export const setNavParams = (page, params) => { box = { page, params: params || null }; };
export const readNavParams = page => (box.page === page ? box.params : null);
export const clearNavParams = () => { box = { page: '', params: null }; };
