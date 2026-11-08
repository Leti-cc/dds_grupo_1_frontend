# dds_grupo_1_frontend

## Integrantes:
- Aguero Silva Daniel - 209.526-9
- Duran Agustina Denise - 222.281-4
- Elías Thiago - 222.286-3
- Letizia Joaquín - 222.458-6
- Sarba Máximo - 216.120-6
- Schoeffler Facundo Ezequiel - 222.696-0
- Tilve Franco Enrique - 222.741-1
- Tisman Facundo Martín - 214.184-0



# Frontend

Cliente liviano MVC, desacoplado del backend, construido con **Node + Express +
express-handlebars + express-session**. El servidor del front recibe cada
request, llama a las APIs REST, arma el modelo y renderiza la vista con
Handlebars: el navegador recibe HTML ya armado y **nunca llama directo a las
APIs**. El diseño usa los tokens del prototipo **Civic Solidary Modernism**:
azul primario, superficies claras, verde para estados positivos, violeta para
incentivos, Plus Jakarta Sans/Inter y layouts responsive.

Incluye las seis vistas diagramadas en la entrega 1:

- Portal público con indicadores y entregas recientes (`/`).
- Seguimiento público de una entrega (`/seguimiento`).
- Ingreso y primera iteración del servicio de autenticación (`/login`).
- Panel de donante con perfil, misiones, insignias y ranking (`/donante`).
- Panel de entidad con necesidades y entregas en curso (`/entidad`).
- Panel administrativo con donaciones, alta/importación de donantes y flota (`/administracion`).

No se incorporaron funcionalidades de la entrega 7.

### Estructura

| Carpeta / archivo | Contenido |
|---|---|
| `server.js` | Arranque de Express: motor de plantillas, estáticos, sesión, flash y rutas. |
| `routes/` | Un router por pantalla. Cada ruta consulta las APIs y hace `res.render(...)`. |
| `middleware/` | `auth.js` (`requireRole(...)` provisorio), `flash.js` (mensajes para toasts) y `locals.js` (datos del layout). |
| `src/services/` | Clientes HTTP de las APIs. Corren en el servidor y toman el token de `req.session`. |
| `src/helpers/handlebars.js` | Helpers de las vistas: `statusLabel`, `eq` y `selectedIf`. |
| `views/` | Plantillas `.hbs`; `views/layouts/main.hbs` es el layout común y `views/partials/` los parciales. |
| `public/` | Archivos estáticos: `css/styles.css` y `js/app.js` (solo interacción: toast, toggles, campos condicionales, ver contraseña, estado de carga y barra de progreso). |

Los formularios hacen `POST` al servidor del front. Si la operación sale bien,
se aplica Post/Redirect/Get con un mensaje flash que se muestra como toast. Si
hay un error de validación o la API rechaza la operación, se vuelve a
renderizar la misma vista con status 4xx, los valores cargados y el error junto
al formulario.

### Requisitos

- Node.js 18.11 o superior y npm (npm se instala junto con Node.js).
- El backend Java sólo es necesario para consultar o modificar datos reales. El
  frontend puede iniciarse sin los servicios; mostrará avisos de conexión.
- PowerShell, una terminal de VS Code o una terminal compatible.

Para comprobar que Node.js y npm estén disponibles:

```powershell
node --version
npm --version
```

### Cómo levantar el sitio en desarrollo

Desde una terminal, ubicarse en la carpeta raíz del proyecto (donde está
`package.json`) y ejecutar:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

`npm install` descarga las dependencias del proyecto; normalmente se ejecuta la
primera vez o después de modificar `package.json`/`package-lock.json`. El comando
`Copy-Item` crea la configuración local editable; si `.env` ya existe,
conservar el archivo y editar sus valores en lugar de volver a copiarlo.

`npm run dev` levanta el servidor con `node --watch`, que lo reinicia al guardar
cambios en el código. La terminal muestra la dirección local, por defecto
`http://localhost:3000`. Dejar esa terminal abierta mientras se usa el sitio y
detenerlo con `Ctrl+C`. Las plantillas `.hbs` y los archivos de `public/` se
leen en cada request, así que basta con recargar el navegador.

### Variables de entorno

Copiar `.env.example` a `.env` (lo carga `dotenv` al iniciar). `.env` es local a
la máquina y no debe subirse al repositorio. Si se cambia un valor, reiniciar
`npm run dev`. Todas las variables las lee **el servidor**: ninguna llega al
navegador.

| Variable | Para qué se usa | Valor inicial |
|---|---|---|
| `PORT` | Puerto del servidor del front. | `3000` |
| `SESSION_SECRET` | Secreto para firmar la cookie de sesión. Si falta, se usa uno temporal y las sesiones se pierden al reiniciar. | — |
| `AUTH_DEV_BYPASS` | `true` saltea el control de `requireRole(...)`. Solo para desarrollo. | `false` |
| `DONACIONES_API_URL` | URL base de categorías, donantes, entidades, necesidades y donaciones. | `http://localhost:8080` |
| `NOTIFICACIONES_API_URL` | URL base del historial de notificaciones mostrado en administración. | `http://localhost:8081` |
| `INCENTIVOS_API_URL` | URL base del perfil, las misiones, las insignias y el ranking de donantes. | `http://localhost:8082` |
| `LOGISTICA_API_URL` | URL base de camiones y entregas; incluye el seguimiento público. | `http://localhost:8083` |
| `AUTH_API_URL` | URL base reservada para el servicio de autenticación y su futuro endpoint de login/callback. | `http://localhost:8084` |
| `AUTH_GOOGLE_URL` | URL de autorización provista por el backend para iniciar el flujo OAuth/OIDC con Google. Vacía hasta que se configure. | Vacío |
| `AUTH_MICROSOFT_URL` | URL de autorización provista por el backend para iniciar el flujo OAuth/OIDC con Microsoft. Vacía hasta que se configure. | Vacío |
| `AUTH_INSTITUCIONAL_URL` | URL de autorización provista por el backend para iniciar el flujo SSO institucional. Vacía hasta que se configure. | Vacío |

Los valores de ejemplo asumen que los servicios Java corren localmente en esos
puertos. Si el backend está en otra dirección, reemplazar la URL correspondiente
en `.env`.

### Conectar con el backend Java

1. Iniciar los servicios Java requeridos desde su propio proyecto y confirmar sus puertos. El frontend no inicia ni compila el backend.
2. Ajustar en `.env` las URLs base indicadas arriba. Por ejemplo, las APIs documentadas usan `8080` para donaciones, `8081` para notificaciones, `8082` para incentivos y `8083` para logística.
3. Reiniciar `npm run dev` y probar las vistas con datos reales.

Como las llamadas salen del servidor del front y no del navegador, **no hace
falta configurar CORS** en los servicios. El cliente HTTP común admite JSON y
texto plano, `204 No Content` y cargas `multipart/form-data` como la importación
CSV de donantes. Corta cada llamada a los 5 segundos, muestra errores de red y
HTTP en pantalla y deja el detalle en la consola del servidor.

### Producción

```powershell
npm start
```

Levanta el mismo servidor sin `--watch`. Ya no hay paso de compilación. Para un
despliegue real, definir `SESSION_SECRET` y reemplazar el store de sesión en
memoria (el que trae `express-session` por defecto) por uno persistente.

### Autenticación: primera iteración y pendiente del backend

El frontend deja listo el servicio cliente, pero **el ingreso real y el SSO no funcionarán hasta que el backend publique y configure sus rutas**. No se simula un inicio exitoso.

Contrato inicial propuesto para alinear con el backend:

```http
POST /api/auth/login
Content-Type: application/json

{ "identifier": "persona@organizacion.org", "password": "..." }
```

```json
{
  "accessToken": "...",
  "user": {
    "username": "persona",
    "role": "DONANTE",
    "entidadId": 1
  }
}
```

El servidor del front guarda el token en la sesión del servidor
(`req.session.accessToken`) y lo envía a las APIs como
`Authorization: Bearer ...`. El navegador solo recibe la cookie de sesión
(`HttpOnly`, `SameSite=Lax`) y nunca ve el token. Sin marcar "Recordar", la
cookie dura hasta cerrar el navegador; con la opción marcada, 30 días. El
retorno del SSO llega a `/auth/callback?code=...&state=...`. Para producción,
acuerden con el backend la expiración y renovación del token y el contrato
OAuth/OIDC.

Las rutas protegidas por rol usan `requireRole(...)` de `middleware/auth.js`.
Es provisorio hasta que el servicio de autenticación defina sus roles;
`AUTH_DEV_BYPASS=true` lo desactiva en desarrollo.

`entidadId` de parte de logística todavia no esta expuesto. Por eso, el panel de entidad muestra explícitamente que falta esa relación en lugar de atribuir entregas de otras organizaciones. Para completar esa sección, el backend debe agregar la entidad a la respuesta o exponer una consulta de entregas por entidad.
