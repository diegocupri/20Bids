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

## 6. Uso desde scripts externos (Python/Bots)

Para enviar datos a tu nueva API en la nube:

**Endpoint:** `POST https://20bids-api.onrender.com/api/external/ingest`
**Headers:**
- `Content-Type: application/json`
- `x-api-key: mi_clave_secreta_123`

**Ejemplo Python:**
**Ejemplo R (usando `httr` y `jsonlite`):**
```r
library(httr)
library(jsonlite)

# URL de tu API (cambiar localhost por la URL de Render cuando despliegues)
url <- "https://20bids-api.onrender.com/api/external/ingest"
api_key <- "dev-api-key-change-in-production"

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

print(content(response))
```
