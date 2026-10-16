export class AppError extends Error { constructor(message, statusCode = 500, code = undefined, errors = undefined) { super(message); this.statusCode = statusCode; this.code = code; this.errors = errors; } }
export default AppError;
