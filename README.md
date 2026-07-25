# Predicciones de la Velada VI

Aplicación móvil para registrar predicciones de los diez combates de La Velada
del Año VI, seguir la tabla de posiciones y votar por el Mejor Outfit.

## Cómo funciona

- Cada participante crea un perfil con un apodo.
- La clave privada de edición queda guardada únicamente en ese dispositivo.
- Las selecciones se pueden cambiar hasta el cierre del evento.
- El cierre automático está programado para el 25 de julio de 2026 a las
  12:45 p. m. de Colombia.
- Cada acierto vale un punto y el combate estelar vale dos.
- Las selecciones ajenas no se publican antes del cierre.
- Cada combate incluye una ficha desplegable con edad, altura, peso del pesaje
  y un resumen de la trayectoria de ambos participantes.
- El panel `/admin` permite cerrar o reabrir manualmente, ajustar la hora y
  cargar los resultados.
- El anfitrión vincula una foto a cada perfil desde el panel y abre la
  votación de Mejor Outfit cuando la galería está completa.
- Cada persona puede emitir un solo voto secreto y nunca puede elegirse a sí
  misma. Los resultados se revelan únicamente al cerrar la votación.

## Desarrollo

Requiere Node.js 22.13 o superior.

```bash
npm install
npm run dev
npm run build
npm test
```

Copia `.env.example` a `.env` y define `ADMIN_PIN` y `OUTFIT_VOTE_SECRET` para
usar el panel y la votación local. La app usa Cloudflare D1 para los datos y R2
para las fotos; el esquema está en `db/schema.ts` y las migraciones generadas
se guardan en `drizzle/`.

Los retratos promocionales de los participantes proceden de la
[web oficial de La Velada del Año VI](https://www.infolavelada.com/), que
también se usa para contrastar edades y alturas. Los pesos corresponden a la
[cobertura del pesaje del 24 de julio de LOS40](https://los40.com/2026/07/24/el-pesaje-de-la-velada-del-ano-vi-en-directo-cuanto-pesa-cada-uno-de-los-streamers-y-ultimas-polemicas/).

## Publicación directa en Cloudflare Workers

La configuración versionada está en `wrangler.jsonc.example`. El archivo real
`wrangler.jsonc` se genera localmente y queda ignorado por Git para evitar
subir por accidente identificadores de la cuenta.

1. Inicia sesión y crea los recursos:

   ```bash
   npx wrangler login
   npx wrangler d1 create predicciones-velada-vi
   npx wrangler r2 bucket create predicciones-velada-vi-outfit-photos
   ```

2. Copia el UUID real que devuelve D1 y genera la configuración:

   ```bash
   npm run cf:config -- --database-id <UUID_REAL_DE_D1>
   ```

   Si se usan otros nombres, añade `--database-name <nombre>` y
   `--bucket-name <nombre>`.

3. Aplica el esquema y comprueba el paquete sin publicarlo:

   ```bash
   npx wrangler d1 migrations apply predicciones-velada-vi --remote --config wrangler.jsonc
   npm run cf:check
   ```

4. Publica y carga los dos secretos; Wrangler pide cada valor sin guardarlo en
   el repositorio:

   ```bash
   npm run cf:deploy
   npx wrangler secret put ADMIN_PIN --config wrangler.jsonc
   npx wrangler secret put OUTFIT_VOTE_SECRET --config wrangler.jsonc
   ```

El Worker queda disponible en el dominio público `*.workers.dev`. Los archivos
estáticos y retratos se sirven mediante `ASSETS`, los datos mediante `DB` (D1)
y las fotos de outfits mediante `OUTFIT_PHOTOS` (R2).
