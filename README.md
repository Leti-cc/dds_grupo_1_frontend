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

Cliente web independiente del backend, construido con HTML, CSS, JavaScript,
Vite y Handlebars. Las vistas se renderizan desde templates y consumen las APIs
REST existentes. El diseño usa los tokens del prototipo **Civic Solidary
Modernism**: azul primario, superficies claras, verde para estados positivos,
violeta para incentivos, Plus Jakarta Sans/Inter y layouts responsive.

Incluye las seis vistas diagramadas en la entrega 1:

- Portal público con indicadores y entregas recientes.
- Seguimiento público de una entrega.
- Ingreso y primera iteración del servicio de autenticación.
- Panel de donante con perfil, misiones, insignias y ranking.
- Panel de entidad con necesidades y entregas en curso.
- Panel administrativo con donaciones, alta/importación de donantes y flota.

El cliente HTTP está separado de las vistas; `js/app.js` coordina rutas,
controladores y eventos; `templates/*.hbs` renderiza datos de las APIs.
No se incorporaron funcionalidades de la entrega 7.

### Requisitos

- Node.js 20 o superior y npm (npm se instala junto con Node.js).
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
`package.json`) y ejecutá:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

`npm install` descarga las dependencias del proyecto; normalmente se ejecuta la
primera vez o después de modificar `package.json`/`package-lock.json`. El comando
`Copy-Item` crea la configuración local editable; si `.env.local` ya existe,
conservar el archivo y editar sus valores en lugar de volver a copiarlo.

Vite muestra en la terminal la dirección local, normalmente
`http://localhost:5173`. Abrir en el navegador y dejar esa terminal abierta
mientras se usa el sitio. Para detener el servidor, inputar `Ctrl+C` en la terminal.

Vite es el servidor de desarrollo y compilador del frontend: sirve HTML, módulos
JavaScript y plantillas Handlebars, y recarga la aplicación cuando se guardan
cambios. Por eso, **no abrir `index.html` con `file://`**.

### Variables de entorno

Copiar `.env.example` a `.env.local`. Vite carga las variables `VITE_*` al
iniciar el servidor. `.env.local` es local a la máquina y no debe subirse al
repositorio. Si se cambia una URL, detener y reiniciar `npm run dev`.

| Variable | Para qué se usa | Valor inicial |
|---|---|---|
| `VITE_API_DONACIONES` | URL base de categorías, donantes, entidades, necesidades y donaciones. | `http://localhost:8080` |
| `VITE_API_NOTIFICACIONES` | URL base del historial de notificaciones mostrado en administración. | `http://localhost:8081` |
| `VITE_API_INCENTIVOS` | URL base del perfil, las misiones, las insignias y el ranking de donantes. | `http://localhost:8082` |
| `VITE_API_LOGISTICA` | URL base de camiones y entregas; incluye el seguimiento público. | `http://localhost:8083` |
| `VITE_API_AUTH` | URL base reservada para el servicio de autenticación y su futuro endpoint de login/callback. | `http://localhost:8084` |
| `VITE_AUTH_GOOGLE_URL` | URL de autorización provista por el backend para iniciar el flujo OAuth/OIDC con Google. Vacía hasta que se configure. | Vacío |
| `VITE_AUTH_MICROSOFT_URL` | URL de autorización provista por el backend para iniciar el flujo OAuth/OIDC con Microsoft. Vacía hasta que se configure. | Vacío |
| `VITE_AUTH_INSTITUCIONAL_URL` | URL de autorización provista por el backend para iniciar el flujo SSO institucional. Vacía hasta que se configure. | Vacío |

Los valores de ejemplo asumen que los servicios Java corren localmente en esos
puertos. Si el backend está en otra dirección, reemplazar la URL correspondiente
en `.env.local`. No credenciales a estas variables: las
variables `VITE_*` quedan accesibles desde el navegador. Las URLs de inicio SSO
deben ser endpoints públicos de autorización, nunca contener un secreto de
cliente.

### Conectar con el backend Java

1. Iniciar los servicios Java requeridos desde su propio proyecto y confirmar sus puertos. El frontend no inicia ni compila el backend.
2. Ajustar en `.env.local` las URLs base indicadas arriba. Por ejemplo, las APIs documentadas usan `8080` para donaciones, `8081` para notificaciones, `8082` para incentivos y `8083` para logística.
3. Configurar CORS en los servicios para permitir el origen del frontend (`http://localhost:5173`). Si se activa autenticación, el backend también debe permitir el encabezado `Authorization`.
4. Reiniciar Vite y probar las vistas con datos reales.

El cliente HTTP común admite JSON y texto plano, `204 No Content` y cargas
`multipart/form-data` como la importación CSV de donantes. Muestra errores de red y HTTP en pantalla. El servicio de notificaciones está configurado, aunque su historial requiere que el servicio esté en ejecución.

### Compilar y servir la versión de producción

```powershell
npm run build
npm run preview
```

El primer comando genera el sitio optimizado en `dist/`; el segundo lo sirve
localmente para comprobarlo. Para detener el servidor de previsualización,
inputar `Ctrl+C`. El despliegue final de `dist/` se hace en el hosting estático
que elija el equipo.

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

El frontend envía el token como `Authorization: Bearer ...`. Sin marcar
“Recordar”, lo conserva en `sessionStorage`; con la opción marcada, en
`localStorage`. Para producción, acuerden con el backend la expiración y
renovación del token, el cierre de sesión y el contrato OAuth/OIDC; es preferible
una cookie `HttpOnly`, `Secure`, `SameSite` antes que guardar tokens persistentes
en JavaScript.

`entidadId` de parte de logística todavia no esta expuesto. Por eso, el panel de entidad muestra explícitamente que falta esa relación en lugar de atribuir entregas de otras organizaciones. Para completar esa sección, el backend debe agregar la entidad a la respuesta o exponer una consulta de entregas por entidad.
