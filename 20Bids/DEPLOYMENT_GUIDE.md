# Guía de Despliegue en la Nube (Render.com)

Esta guía explica cómo subir la plataforma **20Bids** (Frontend y Backend) a internet para que sea accesible desde cualquier lugar.

## 1. Preparación del Repositorio

Asegúrate de que este proyecto esté en tu repositorio de GitHub. Si no lo está, súbelo:

```bash
git init
git add .
git commit -m "Initial Deployment"
# (Crea un repo en github.com y sigue las instrucciones para pushear)
```

## 2. Crear una Base de Datos (PostgreSQL)
Para producción, usaremos PostgreSQL en lugar de SQLite (SQLite no persiste bien en la nube efímera).

1. Crea una cuenta en [Railway.app](https://railway.app) o [Render.com](https://render.com).
2. Crea un nuevo servicio **PostgreSQL**.
3. Copia la `DATABASE_URL` que te den (ej: `postgresql://user:pass@host:port/db`).

## 3. Configurar Backend en Render.com

1. Ve a **Dashboard -> New -> Web Service**.
2. Conecta tu repositorio de GitHub.
3. Configuración:
    - **Name:** `20bids-api`
    - **Root Directory:** `20Bids/server`
    - **Environment:** `Node`
    - **Build Command:** `npm install && npx prisma generate`
    - **Start Command:** `npm start` (o `node dist/index.js` si compilamos TS, usar `npm run dev` para pruebas rápidas, pero en prod mejor compilar).
    *Tip: Para empezar rápido usa `npx ts-node src/index.ts` como Start Command si no tienes build script de API configurado.*
4. **Variables de Entorno (Environment Variables):**
    - `DATABASE_URL`: Pegar la URL de Postgres del paso 2.
    - `UPLOAD_API_KEY`: Define una clave segura (ej: `mi_clave_secreta_123`).
    - `PORT`: `3001` (Render lo inyectará, pero déjalo por si acaso).

## 4. Configurar Frontend en Render.com

1. Ve a **Dashboard -> New -> Static Site**.
2. Conecta el mismo repositorio.
3. Configuración:
    - **Name:** `20bids-app`
    - **Root Directory:** `20Bids`
    - **Build Command:** `npm install && npm run build`
    - **Publish Directory:** `20Bids/dist`
4. **Redirecciones / Rewrites:**
    - Ve a "Redirects/Rewrites".
    - Agrega una regla: Source `/*` -> Destination `/index.html` (Status 200). Esto es necesario para que React Router funcione al recargar página.

## 5. Conectar Frontend con Backend

El frontend necesita saber la URL del backend.
1. En el proyecto del Frontend (Local), edita `src/api/client.ts`.
2. Cambia `const API_URL = 'http://localhost:3001/api';` por una variable de entorno.
   
   Crea archivo `.env.production` en `20Bids/`:
   ```
   VITE_API_URL=https://20bids-api.onrender.com/api
   ```
   
   Y actualiza `client.ts`:
   ```typescript
   const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
   ```

## 6. Carga diaria de picks desde R (RStudio en AWS)

Esta es **la** via por la que entran los picks en produccion. Si esto falla, ese
dia no hay producto.

**Endpoint:** `POST https://two0bids-api.onrender.com/api/external/ingest`

> Ojo al host: es `two0bids`, con "two" escrito en letra. Este documento decia
> `20bids-api.onrender.com` durante meses, que no existe.

**Headers obligatorios:**
- `Content-Type: application/json`
- `x-api-key: <UPLOAD_API_KEY>` — el mismo valor que la variable `UPLOAD_API_KEY`
  del panel de Render. Se llama asi en el codigo (`src/config/env.ts`), NO
  `INGEST_API_KEY`, aunque el README del server diga lo contrario.

**La clave se rotó el 2026-08-22.** Antes era `dev-api-key-change-in-production`,
el valor por defecto que esta escrito en este repositorio publico — es decir,
cualquiera podia inyectar picks en el historial. Si tu script sigue mandando esa
cadena, recibe **401 y no carga nada**.

**No la escribas en el .R.** Usa una variable de entorno, para que rotarla no
exija tocar codigo:

```r
# ~/.Renviron en la instancia de AWS (una linea, y reinicia la sesion de R)
#   BIDS_API_KEY=...
```

**Ejemplo R (`httr` + `jsonlite`):**
```r
library(httr)
library(jsonlite)

url <- "https://two0bids-api.onrender.com/api/external/ingest"
api_key <- Sys.getenv("BIDS_API_KEY")
if (!nzchar(api_key)) stop("Falta BIDS_API_KEY en ~/.Renviron")

# Datos a enviar (Data Frame)
df <- data.frame(
  symbol = c("AAPL", "MSFT"),
  date = c("2025-10-20", "2025-10-20"),
  high = c(150.5, 300.2),
  refPrice1020 = c(148.0, 295.0),
  type = c("Long", "Long")
)

# Convertir a JSON
json_body <- toJSON(df, auto_unbox = TRUE)

# Enviar POST
response <- POST(
  url,
  add_headers(
    "Content-Type" = "application/json",
    "x-api-key" = api_key
  ),
  body = json_body
)

# Fallar RUIDOSAMENTE. Un 401 silencioso significa un dia sin picks, y hoy nada
# avisa de eso: no hay monitorizacion de errores ni alerta si un dia no entra
# ninguna fila.
code <- status_code(response)
if (code == 401) {
  stop("401: la x-api-key esta caducada. Comprueba UPLOAD_API_KEY en Render y BIDS_API_KEY en ~/.Renviron")
} else if (code >= 400) {
  stop(sprintf("La ingesta fallo con HTTP %d: %s", code, content(response, "text", encoding = "UTF-8")))
}
print(content(response))
```

### Comprobar la clave sin cargar nada

El endpoint valida la cabecera **antes** de mirar el cuerpo, asi que un cuerpo
que no es un array es una prueba inofensiva: no escribe nada.

```bash
curl -s -X POST -w "\n%{http_code}\n" -H "Content-Type: application/json" \
  -H "x-api-key: TU_CLAVE" -d '{}' \
  "https://two0bids-api.onrender.com/api/external/ingest"
```

- **400** (`"Expected an array"`) → la clave es correcta. Es lo que quieres ver.
- **401** (`"Unauthorized"`) → la clave no coincide con `UPLOAD_API_KEY`.

### Qué campos acepta

`src/index.ts` (handler en `/api/external/ingest`) hace `upsert` por
`(symbol, date)`, asi que reenviar el mismo dia **actualiza**, no duplica.
Campos con valor por defecto si no los mandas: `thesis` → `'Algorithmic Entry'`,
`sentiment` → `'Neutral'`, `stopLoss` → `open * 0.95`, `priceTarget` →
`open * 1.10`, `rsi` → 50, `beta` → 1.

Nota: `rsi`, `beta` y `analystRating` estan **constantes en las 2053 filas** del
historial, o sea que nunca se han mandado de verdad. No se muestran en ninguna
pantalla, asi que no es urgente — pero no te fies de ellos para nada.
