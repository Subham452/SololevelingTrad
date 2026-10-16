# Security
helmet, cors CLIENT_URL+credentials, 10kb JSON (webhook raw exempt), mongo-sanitize, cookies HttpOnly SameSite=strict secure-in-prod, rate limits (auth/otp/payment/admin/general), central error handler sanitized in production, no secrets in code, secrets never returned (passwords/OTP/tokens/hashes redacted), Firebase UID from verified token, server-side prices, idempotent webhooks.
