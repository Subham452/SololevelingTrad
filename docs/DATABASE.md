# Database
Mongo Atlas db `sololevelingtrad` from `MONGODB_URI` only. Models: User (firebaseUid/email/username unique, no password), Session (TTL expiresAt), OTP (TTL), Subscription, Payment (webhookEventId unique sparse), Purchase (orderId unique SLT-YYYY-XXXXXX), ActivityLog, AuditLog, Notification, ChatSession, ChatMessage, Usage, LoginHistory — all timestamps + indexes.
