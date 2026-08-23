# Migraciones anteriores al baseline del 2026-08-23

Estas nueve migraciones **ya no se aplican**. Se conservan por historial.

Entre diciembre de 2025 y agosto de 2026 el esquema se fue moviendo con
`prisma db push`, que aplica cambios sin escribir migración. El resultado
medido el 2026-08-23: de las 12 tablas del esquema, **estas nueve migraciones
solo creaban cuatro** (`User`, `Recommendation`, `Tag`, `Watchlist`).

Faltaban `BroadcastLog`, `Company`, `Note`, `PasswordResetToken`, `PushToken`,
`Reveal`, `TradeLog` y `TradingConfig` — es decir, todo pagos, auth, push y
trading.

Consecuencia: un `prisma migrate deploy` contra una base vacía producía un
esquema incompatible con el código, y nada avisaba. No había recuperación de
desastre posible aunque el directorio de migraciones diera esa impresión.

`../migrations/0_baseline` sustituye a las nueve: es el esquema completo tal
como estaba en producción ese día, generado por introspección.
