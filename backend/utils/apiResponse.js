export const ok = (res, message = 'OK', data = null, status = 200) => res.status(status).json({ success: true, message, data });
export const fail = (res, message = 'Error', status = 500, code = undefined, errors = undefined) => res.status(status).json({ success: false, message, code, errors });
