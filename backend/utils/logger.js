const ts = () => new Date().toISOString();
export const logger = { info: (...a) => console.log(ts(), '[INFO]', ...a), error: (...a) => console.error(ts(), '[ERROR]', ...a), warn: (...a) => console.warn(ts(), '[WARN]', ...a) };
