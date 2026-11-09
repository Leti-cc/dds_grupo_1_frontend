# Flujo 5: qué hay que coordinar con el grupo antes de ejecutar el plan

Este documento **no cambia** `docs/plan-flujo-5-frontend.md` ni las decisiones del grupo. Junta los puntos donde el flujo 5 toca código, vistas o contratos de otros, para acordarlos **antes** de programar.

Cada punto es una **propuesta**. Si el grupo no la acepta, se usa la **alternativa**, que no toca nada ajeno. Los datos de "Hoy" están verificados contra el código de la rama `Asignacion` (que ya incluye el flujo 6) al 08/11/2026.

---

## 0. Resumen

| # | Tema | Con quién | ¿Bloquea al flujo 5? |
|---|---|---|---|
| 1 | Pestaña "Todas" con el endpoint que ya existe, sin paginar | Flujo 3 (aviso) | No. Paginar queda como mejora (sección 5) |
| 2 | `entidadId` dentro de `session.user` | Flujo 1 (autenticación) | **Sí**, solo las vistas de la entidad |
| 3 | Nombres de rol definitivos | Flujo 1 | No (hay alias provisorios) |
| 4 | `api-client.js` lee `mensaje` | Todos | No |
| 5 | `statusLabel` con `VENCIDA` | Todos | No |
| 6 | Mover `modales.js` a una carpeta común | Flujo 6 | No |
| 7 | Ayuda descartable (`data-hint`) reutilizable | Flujo 6 | No |
| 8 | Partial "servicio no disponible" genérico | Flujo 6 | No |
| 9 | Partial `paginacion.hbs` nuevo | Todos (aviso) | No |
| 10 | Archivos comunes que se tocan (`server.js`, `locals.js`, `styles.css`) | Todos (aviso) | No |
| 11 | Menú según el perfil del usuario | Todos | No, pero hoy la barra del admin se desborda entre 761 y ~795 px (ver punto) |
| 12 | `requireRole` en las páginas de cada perfil | Dueños de cada vista | No |
| 13 | Sidebar en el layout | Todos | No |
| 14 | `/entidad?id=` toma el id de la URL | Flujo 4 | No |
| 15 | Puntos de entrada en `admin.hbs` y `entity.hbs` | Dueños de esas vistas | No |
| 16 | "Registrar donación" como pestaña de `/admin/donaciones` | Flujo 3 | No |
| 17 | Rutas de "Ver en mapa" y "Confirmar recepción" | Flujos 6 y 7 | No |
| 18 | Mejoras recomendadas del backend | Backend | No |

---

## 1. Contratos que el flujo 5 necesita de otros

### 1. Pestaña "Todas las donaciones" sin paginar

- **Hoy:** no existe `GET /api/donaciones/paginadas`. Sí existe `GET /api/donaciones` (del flujo 3), que devuelve todas las donaciones sin paginar y acepta `?tipoEstado=` (el parámetro se llama así, no `estado`). Su filtro por subcategoría espera un objeto `Subcategoria`, no un id.
- **Decisión:** por ahora la pestaña "Todas" se hace **sin paginar y sin tocar el backend**. El BFF:
  1. Llama a `GET /api/donaciones`, con `?tipoEstado=` solo si el admin eligió un estado.
  2. Filtra por `subcategoriaId`, que viene en cada `DonacionDTO`.
  3. Ordena por `fechaIngreso`, la más reciente primero, y muestra la lista completa.

  Todo queda en una función `listarDonaciones({ estado, subcategoriaId })` de `asignaciones-client.js`, así que las rutas y las vistas no saben de dónde salen los datos. Sigue siendo cliente liviano: el navegador recibe HTML listo. `routes/admin.js` y `routes/public.js` ya usan este mismo endpoint de esta forma.
- **A avisar al flujo 3:** el flujo 5 pasa a depender de `GET /api/donaciones` y de su parámetro `tipoEstado`. Conviene que no los cambien sin avisar.
- **Límite conocido:** cada vista de la pestaña trae todas las donaciones con sus ítems. Con el volumen del TP no se nota. Paginar en el backend queda como mejora (sección 5).

### 2. `entidadId` dentro de `session.user`

- **Hoy:** `auth-service.js` guarda en la sesión el `user` tal como lo devuelve el servicio de autenticación y solo exige `role`. No está acordado que traiga `entidadId`.
- **Propuesta:** que el login de una entidad devuelva `user.entidadId`. El plan lo necesita para F7 (el id sale de la sesión, no de la URL) y F8.
- **A acordar:** el nombre exacto del campo con el flujo 1. El contrato de login propuesto en el `README.md` (sección "Autenticación") ya incluye `user.entidadId`, y el flujo 5 lee ese nombre: alcanza con que el backend lo confirme.
- **Alternativa:** mientras no esté, las vistas de la entidad solo se prueban con `AUTH_DEV_BYPASS=true` y `?entidadId=`, como ya prevé F7.

### 3. Nombres de rol definitivos

- **Hoy:** `middleware/auth.js` acepta varios alias por rol (`ADMIN`, `ROLE_ADMIN`, `ENTIDAD_BENEFICIARIA`, …) porque el contrato no está cerrado.
- **A acordar:** con el flujo 1. El flujo 5 usa `requireRole("ADMIN")` y `requireRole("ENTIDAD")` y no necesita nada más.

---

## 2. Código común (cambios de una línea o de un archivo)

### 4. `api-client.js` no lee el campo `mensaje` del backend

- **Hoy:** `src/services/api-client.js:37` arma el texto con `data.message ?? data.detail ?? data.error`. Los `ErrorDTO` del backend usan `mensaje`, que se pierde.
- **Propuesta:** sumar `data.mensaje` al principio de esa cadena. Les sirve a todos los flujos.
- **Alternativa:** el flujo 5 lo lee en su propio `asignaciones-client.js` (el plan ya lo hace así de entrada).

### 5. `statusLabel` no tiene `VENCIDA`

- **Hoy:** `src/helpers/handlebars.js` no tiene la clave, así que se muestra "VENCIDA" en mayúsculas.
- **Propuesta:** sumar `VENCIDA: "Vencida"`.
- **Alternativa:** la etiqueta se resuelve en `asignaciones-vista.js`.

### 6. `public/js/logistica/modales.js`

- **Hoy:** es genérico (abre `<dialog>`, devuelve el foco, reabre con `data-dialog-abierto`), pero vive en la carpeta del flujo 6.
- **Propuesta:** moverlo a `public/js/dialogos.js`.
- **Alternativa:** las vistas del flujo 5 lo cargan desde donde está, sin duplicarlo.

### 7. Ayuda descartable (`data-hint`)

- **Hoy:** el código que la maneja está **dentro de `public/js/logistica/camiones.js`**, junto con lógica propia de camiones. No se puede cargar solo.
- **Propuesta:** extraer esa parte a `public/js/ayudas.js`, que cargan las dos vistas.
- **Alternativa:** en el flujo 5, la ayuda del cálculo nocturno se muestra fija (sin botón de cerrar). No se carga `camiones.js` en otra vista.

### 8. Partial "servicio no disponible"

- **Hoy:** `views/partials/logistica-no-disponible.hbs` tiene el texto "El servicio de logística…" escrito adentro.
- **Propuesta:** generalizarlo a `servicio-no-disponible.hbs` con el parámetro `servicio` y actualizar las 3 vistas del flujo 6 que lo usan.
- **Alternativa:** el flujo 5 crea su propio `asignaciones-no-disponible.hbs` con la misma estructura y las mismas clases.

### 9. Partial `paginacion.hbs`

- **Hoy:** no existe. El flujo 5 tiene el primer listado paginado del front.
- **A avisar:** se crea genérico (`pagina`, `totalPaginas`, `baseUrl`) para que lo reutilicen los demás. No cambia nada existente.

### 10. Archivos comunes que se tocan

Son agregados, no cambios a lo que ya existe. Conviene avisar para evitar conflictos de merge:

- `server.js`: montar `/admin/donaciones` y `/entidad/donaciones`.
- `middleware/locals.js`: sumar `DONACIONES_LINK` igual que `LOGISTICA_LINK`.
- `public/css/styles.css`: layout de dos columnas para la cola y su regla para celular.

> Ya verificado: `.button-small` tiene `min-height: 48px`, así que la duda del plan (sección 8) sobre las áreas táctiles está resuelta.

---

## 3. Navegación y perfiles

Estos puntos **no son parte del flujo 5**, pero el flujo 5 los hace más visibles: suma un link más al menú y crea vistas para la entidad.

### 11. Menú según el perfil del usuario

- **Hoy:** `NAVIGATION` en `middleware/locals.js` es fijo. Cualquiera, con o sin sesión, ve Inicio, Seguimiento, Donante, Entidad y Administración. Solo "Logística" depende del rol. Con el flujo 5, el admin vería 7 links en la barra.
- **Propuesta:** que cada ítem tenga `roles: [...]` y que `layoutLocals` filtre con `userHasRole`. Por ejemplo:

  | Perfil | Links |
  |---|---|
  | Sin sesión | Inicio, Seguimiento |
  | Donante | Inicio, Donante, Seguimiento |
  | Entidad | Inicio, Entidad, Donaciones asignadas |
  | Admin | Inicio, Administración, Donaciones, Logística |
  | `AUTH_DEV_BYPASS=true` | Todos, para desarrollar |

- **A acordar:** qué links ve cada perfil y quién hace el cambio (es un solo archivo).
- **Alternativa:** el flujo 5 solo suma `DONACIONES_LINK` con la misma condición que `LOGISTICA_LINK`, como dice el plan. **Es lo que quedó implementado.**
- **Hallazgo al implementar:** con el séptimo link, la barra del admin (o con `AUTH_DEV_BYPASS=true`) **se desborda entre 761 y unos 795 px de ancho**: "Ingresar" queda cortado. Antes del flujo 5 entraba justo en 768 px. Por debajo de 761 px el menú pasa al botón ☰ y no hay problema. Con sesión iniciada ("usuario" + "Salir" ocupan más que "Ingresar") el rango probablemente sea mayor. No se tocaron los estilos del menú porque son comunes. Se resuelve con este punto (menos links por perfil) o subiendo el corte del menú ☰ en `styles.css`.

### 12. `requireRole` en las páginas de cada perfil

- **Hoy:** `/administracion`, `/entidad` y `/donante` se montan sin `requireRole` (`server.js:64-66`). Solo `/admin/logistica` lo tiene. Esconder un link del menú no impide entrar escribiendo la URL.
- **Propuesta:** proteger cada página con su rol, igual que el flujo 6.
- **A acordar:** con el dueño de cada vista, porque hoy algunas se usan sin sesión para probar (con `AUTH_DEV_BYPASS=true` siguen andando).
- **Alternativa:** el flujo 5 protege solo sus propias rutas, como ya dice el plan.

### 13. Sidebar en el layout

- **Hoy:** la navegación es una barra superior (`views/layouts/main.hbs`) con menú desplegable en celular.
- **Propuesta:** decidirlo como grupo. Una sidebar tiene sentido para el admin, que va a tener varias secciones, pero cambia `main.hbs`, `styles.css` y el comportamiento en celular de **todas** las vistas. Si se hace, conviene apoyarla en la lista de links por perfil del punto 11.
- **El flujo 5 no depende de esto:** sus pestañas (`donaciones-tabs.hbs`) funcionan igual con barra o con sidebar.

### 14. `/entidad?id=` toma el id de la URL

- **Hoy:** `routes/entity.js` usa `req.query.id` antes que `session.user.entidadId`. Cambiando el número se ven los datos de otra entidad.
- **A avisar al flujo 4:** el flujo 5 toma la decisión contraria (F7: el id sale de la sesión). Conviene que las dos vistas de la entidad se comporten igual. No es un cambio que haga el flujo 5.

---

## 4. Puntos de entrada en vistas de otros

### 15. `admin.hbs` y `entity.hbs`

Lo que describe la sección 6.5 del plan:

- **`views/admin.hbs`:** la tarjeta "Pendientes de asignación" (con `GET /api/asignaciones/pendientes?size=1` en `loadAdminPage`) y el link "Ver todas →" en "Donaciones recientes".
- **`views/entity.hbs`** (flujo 4): el link "Donaciones asignadas →".
- **Alternativa:** si los dueños prefieren no tocarlas todavía, se llega al flujo 5 solo por el menú.

### 16. "Registrar donación" (flujo 3)

- **Propuesta:** si el flujo 3 la mueve a una página propia, que sea `/admin/donaciones/nueva` y se sume como tercera pestaña en `donaciones-tabs.hbs`.
- **Alternativa:** queda donde esté hoy. Las pestañas del flujo 5 no cambian.

### 17. "Ver en mapa" y "Confirmar recepción" (flujos 6 y 7)

- **A acordar:** las rutas de esas pantallas para la entidad. El detalle de la entidad muestra esos botones solo en `EN_TRASLADO` y **no los muestra** mientras las rutas no existan.

---

## 5. Backend: mejoras recomendadas (no bloquean)

De la sección 9 del plan. Si no se hacen, el front tiene un comportamiento alternativo ya definido:

| Mejora | Sin ella |
|---|---|
| `GET /api/donaciones/paginadas?estado=&subcategoriaId=&page=&size=` → `PaginaDTO<DonacionDTO>`, como describe la sección 9 del plan (controller nuevo, `estado` opcional y repetible, orden por `fechaIngreso` descendente, `size` máximo 50) | La pestaña "Todas" muestra la lista completa sin paginar (punto 1). Cuando exista, solo cambia `listarDonaciones` y se suma `paginacion.hbs` a la vista |
| `historialEstados` en `DonacionDTO` | La línea de tiempo no muestra fechas |
| Filtro `soloConCoincidencias` en `/pendientes` | "Asignaciones sugeridas" usa la aproximación de la sección 6.5 |
| `motivo` por candidato | El panel no explica por qué se sugiere cada entidad |
| `GET /ejecuciones/ultima` | La ayuda dice "cada noche" en vez de la hora del último cálculo |
| Controles de seguridad (`// TODO flujo 1`) | Los controles F7 y F8 del BFF son la única barrera |

---

## 6. Checklist antes de ejecutar el plan

- [ ] Ya resuelto: `main` actualizado con el flujo 6 y `.env.example` restaurado.
- [ ] Flujo 3 avisado de que el flujo 5 usa `GET /api/donaciones` (punto 1).
- [ ] Puntos 2 y 3 acordados (o elegida la alternativa).
- [ ] Respuesta del grupo sobre los puntos 4 a 8: propuesta o alternativa, punto por punto.
- [ ] Aviso al grupo de los puntos 9 y 10.
- [ ] Decisión del grupo sobre navegación (11 a 13) y aviso al flujo 4 (punto 14).
- [ ] Dueños de `admin.hbs` y `entity.hbs` avisados (punto 15).
- [ ] Flujos 3, 6 y 7 avisados (puntos 16 y 17).

Con eso cerrado, se ejecuta la sección 10 del plan tal como está.
