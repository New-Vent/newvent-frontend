import * as Sentry from '@sentry/browser'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ||
      (import.meta.env.DEV ? 'local' : 'production'),
    sendDefaultPii: false,
    initialScope: {
      tags: {
        app: import.meta.env.BASE_URL.startsWith('/admin') ? 'admin' : 'user',
      },
    },
  })
}