# Predicciones de la Velada VI

Aplicación móvil para registrar predicciones de los diez combates de La Velada
del Año VI y seguir la tabla de posiciones.

## Cómo funciona

- Cada participante crea un perfil con un apodo.
- La clave privada de edición queda guardada únicamente en ese dispositivo.
- Las selecciones se pueden cambiar hasta el cierre del evento.
- El cierre automático está programado para el 25 de julio de 2026 a las
  12:45 p. m. de Colombia.
- Cada acierto vale un punto y el combate estelar vale dos.
- Las selecciones ajenas no se publican antes del cierre.
- El panel `/admin` permite cerrar o reabrir manualmente, ajustar la hora y
  cargar los resultados.

## Desarrollo

Requiere Node.js 22.13 o superior.

```bash
npm install
npm run dev
npm run build
npm test
```

Copia `.env.example` a `.env` y define `ADMIN_PIN` para usar el panel local.
La app usa Cloudflare D1; el esquema está en `db/schema.ts` y las migraciones
generadas se guardan en `drizzle/`.
