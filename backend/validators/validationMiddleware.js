export const validate = (schema, source = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[source]);
  if (!r.success) return res.status(422).json({ success: false, message: 'Validation failed', errors: r.error.flatten() });
  req[source] = r.data; next();
};
