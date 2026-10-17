// An error that carries the HTTP status to answer with.
export const fail = (code, msg) => { throw Object.assign(new Error(msg), { code }); };
