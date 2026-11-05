# dds_grupo_1_frontend

## Frontend — alcance de la entrega 6

Cliente web independiente del backend, construido con HTML, CSS, JavaScript,
Vite y Handlebars. Las vistas se renderizan desde templates y consumen las APIs
REST existentes. El diseño usa los tokens del prototipo **Civic Solidary
Modernism**: azul primario, superficies claras, verde para estados positivos,
violeta para incentivos, Plus Jakarta Sans/Inter y layouts responsive.

Incluye las seis vistas del prototipo:

- Portal público con indicadores y entregas recientes.
- Seguimiento público de una entrega.
- Ingreso y primera iteración del servicio de autenticación.
- Panel de donante con perfil, misiones, insignias y ranking.
- Panel de entidad con necesidades y entregas en curso.
- Panel administrativo con donaciones, alta/importación de donantes y flota.

El cliente HTTP está separado de las vistas; `js/app.js` coordina rutas,
controladores y eventos; `templates/*.hbs` renderiza datos de las APIs.
No se incorporaron funcionalidades de la entrega 7.

### Cómo levantar el sitio

Requisitos: Node.js 20 o superior y los servicios Java disponibles si se quiere
ver información real.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Abrí la URL que informa Vite, normalmente `http://localhost:5173`. No abras
`index.html` con `file://`: la aplicación usa módulos y templates compilados por
Vite. Para comprobar el bundle de producción:

```powershell
npm run build
npm run preview
```

### URLs de los servicios Java

Los valores iniciales de `.env.example` corresponden a la guía de endpoints:

| Variable | Servicio | Puerto local |
|---|---|---:|
| `VITE_API_DONACIONES` | Donaciones | 8080 |
| `VITE_API_NOTIFICACIONES` | Notificaciones | 8081 |
| `VITE_API_INCENTIVOS` | Incentivos | 8082 |
| `VITE_API_LOGISTICA` | Logística | 8083 |
| `VITE_API_AUTH` | Autenticación (aún sin endpoints) | 8084 |

Actualizá `.env.local` si los servicios usan otras URLs y reiniciá Vite después
de modificar variables. El cliente HTTP admite JSON y texto plano, `204 No
Content`, formularios `multipart/form-data` y reporta errores de red/HTTP en la
vista. Los endpoints de negocio se consumen con las rutas documentadas en
`DonaTrack_Endpoints_Frontend.pdf`.

### Autenticación: primera iteración y pendiente del backend

La guía de endpoints indica que `servicio-autenticacion` está vacío y que las
APIs actuales no requieren token. Por eso el frontend deja listo el servicio
cliente, pero **el ingreso real y el SSO no funcionarán hasta que el backend
publique y configure sus rutas**. No se simula un inicio exitoso.

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

El frontend envía el token como `Authorization: Bearer ...`. Sin marcar
“Recordar”, lo conserva en `sessionStorage`; con la opción marcada, en
`localStorage`. Para producción, acuerden con el backend la expiración y
renovación del token, el cierre de sesión y el contrato OAuth/OIDC; es preferible
una cookie `HttpOnly`, `Secure`, `SameSite` antes que guardar tokens persistentes
en JavaScript.

Configurá `VITE_AUTH_GOOGLE_URL`, `VITE_AUTH_MICROSOFT_URL` y
`VITE_AUTH_INSTITUCIONAL_URL` con las URL de autorización provistas por el
servicio antes de habilitar Google, Microsoft o SAML. El retorno SSO esperado es
`/#/auth/callback?code=...&state=...`; el cliente propone canjearlo contra
`POST /api/auth/oauth/callback`, que devuelve el mismo objeto de sesión que el
login. Los secretos de OAuth no deben ponerse en el frontend.

La guía de backend tampoco expone `entidadId` en las entregas de logística. Por
eso, el panel de entidad muestra explícitamente que falta esa relación en lugar
de atribuir entregas de otras organizaciones. Para completar esa sección, el
backend debe agregar la entidad a la respuesta o exponer una consulta de
entregas por entidad.

### Próximos pasos

1. Acordar con el equipo Java el endpoint de login, formato de respuesta, roles,
   expiración del token y rutas de callback SSO. Hoy esos endpoints no están en
   la guía.
2. Iniciar los servicios Java, configurar sus URLs y CORS para el origen
   `http://localhost:5173` (incluyendo `Authorization` para autenticación).
3. Probar los seis recorridos con respuestas reales; verificar especialmente
   los IDs de usuario/entidad, estados de logística y enums de los formularios.
4. Probar registro de donaciones, altas/importación CSV y creación de
   necesidades con datos de desarrollo; revisar los mensajes de error del
   backend.
5. Antes de desplegar, configurar OAuth del lado servidor, almacenamiento de
   sesión seguro y URLs por ambiente; correr `npm run build`.

El frontend no implementa ni reemplaza los servicios Java, no incorpora
persistencia de negocio y no incluye observabilidad, rate limiting, GraphQL ni
gRPC (alcance de la entrega 7).

Los perfiles y las acciones se controlan en el cliente sólo para la navegación
y la experiencia de uso; no son una medida de seguridad. El backend debe validar
el token y los permisos de cada operación antes de aceptar cambios.

## Integrantes:
- Aguero Silva Daniel - 209.526-9
- Duran Agustina Denise - 222.281-4
- Elías Thiago - 222.286-3
- Letizia Joaquín - 222.458-6
- Sarba Máximo - 216.120-6
- Schoeffler Facundo Ezequiel - 222.696-0
- Tilve Franco Enrique - 222.741-1
- Tisman Facundo Martín - 214.184-0
