# Plan del flujo 5: Asignación (frontend con Express)

Reemplaza la parte B de `docs/plan-flujo-5-asignacion.md`, que quedó vieja: estaba pensada para la SPA con Vite, que ya no existe. Para el backend, la referencia es `/home/franco/DdS_Grupo_1/DonaTrack/docs/plan-flujo-5-asignacion-backend.md` (rama `Franco/Asignacion`), que es lo que realmente está implementado.

Alcance: solo el flujo 5.

- **Admin:** ver las donaciones en depósito con su ranking, asignar cada una a una entidad del ranking (requerimiento 17), marcar como vencidas las que correspondan (requerimiento 16) y consultar todas las donaciones en cualquier estado, con su detalle.
- **Entidad:** ver las donaciones que le asignaron y su estado (requerimiento 11).

---

## 1. Cómo es la arquitectura nueva

El front pasó de una SPA (Vite y JavaScript en el navegador) a un **servidor Express que hace de Backend for Frontend (BFF)**:

```
Navegador ──HTML/forms──▶ Express (BFF, puerto 3000) ──REST + token──▶ servicio-donaciones (8080)
          ◀──HTML listo──                            ◀──JSON──────────
```

- **El navegador nunca llama a las APIs.** Pide páginas y manda formularios a Express. Express llama a las APIs con el token guardado en la sesión (`req.session.accessToken`), arma el modelo y renderiza el `.hbs`. Por eso no hace falta CORS y el token nunca llega al navegador.
- **Las lecturas son `GET` que devuelven HTML** y **las acciones son `<form method="post">`**. Después de cada `POST` se aplica **Post/Redirect/Get**: si sale bien, se guarda un mensaje flash (`req.flash`) y se redirige; el toast lo muestra el layout. Si hay un error de validación, se vuelve a renderizar la misma vista con status 4xx y el error al lado del formulario.
- **El JavaScript del navegador solo maneja la interacción:** abrir `<dialog>`, el estado "Guardando…" de los botones, la barra de progreso y las ayudas. No pide datos, salvo casos puntuales como el polling del mapa, que le pega a un endpoint del propio Express.

### Convención que fijó el flujo 6 (Logística), y que el flujo 5 copia

| Pieza | Flujo 6 (referencia) | Flujo 5 (a crear) |
|---|---|---|
| Router con prefijo y control de rol | `app.use("/admin/logistica", requireRole("ADMIN"), logisticaRoutes)` | `app.use("/admin/donaciones", requireRole("ADMIN"), asignacionesRoutes)` |
| Cliente HTTP del flujo | `src/services/logistica-client.js` (traduce los errores a `mensajeUsuario`) | `src/services/asignaciones-client.js` |
| Lógica pura y testeable | `src/lib/logistica-vista.js`, `-format.js`, `-validacion.js` | `src/lib/asignaciones-vista.js`, `asignaciones-validacion.js` |
| Vistas | `views/admin/logistica/*.hbs` | `views/admin/donaciones/*.hbs` y `views/entidad/donaciones/*.hbs` |
| Partials | `views/partials/logistica-*.hbs` (incluye `logistica-tabs.hbs`) | `views/partials/asignaciones-*.hbs` y `donaciones-tabs.hbs` |
| JS del navegador | `public/js/logistica/` (`modales.js`, ayudas) | No hace falta JS propio (ver 6.4) |
| Link en el menú según el rol | `LOGISTICA_LINK` en `middleware/locals.js` | `DONACIONES_LINK` ("Donaciones", `activePrefix: "/admin/donaciones"`) |
| Tests | `test/logistica-*.test.js` con `node:test` | `test/asignaciones-*.test.js` |
| Nombres | En castellano (`listarCamiones`, `vistaRuta`) | Igual |

### Qué cambia respecto del plan anterior

| Plan anterior (SPA) | Ahora (BFF) |
|---|---|
| Rutas con hash (`#/admin/...`) | Rutas reales de Express (`/admin/donaciones/...`) |
| El panel lateral pedía datos con `fetch` y `AbortController` | El servidor renderiza la lista **y** el panel en el mismo `GET` (`?donacion=128`) |
| Skeletons mientras carga el navegador | La página llega completa. Durante la espera se ven la barra de progreso y el botón "Asignando…" |
| Modal hecho a mano | `<dialog>` nativo con `<form method="post">`, como en el flujo 6 |
| Orden y filtro por vencimiento | **No se implementó en el backend.** El orden es por fecha de ingreso, la más antigua primero |
| `templates/`, `js/controllers/` | `views/`, `routes/`, `src/lib/` |

---

## 2. Antes de arrancar

1. **Actualizar `main`.** Tu `main` local está 3 commits atrás de `origin/main` y no tiene el flujo 6, que es la referencia de todo este plan. Además, tenés `.env.example` borrado sin commitear, y eso va a chocar con el pull:
   ```bash
   git restore .env.example
   git pull
   git switch -c Asignacion    # ya existe una rama local "Asignacion" vacía: usá esa o borrala
   ```
2. En `.env`, poner `AUTH_DEV_BYPASS=true` para entrar a `/admin/...` sin el servicio de autenticación.
3. Levantar el backend desde la rama `Franco/Asignacion`.
4. Correr una vez `POST http://localhost:8080/api/asignaciones/ejecuciones` con Postman para tener rankings sin esperar a la noche. El front no expone esta acción (ver F9).

---

## 3. Contratos del backend que usa el front

Todos son de `servicio-donaciones` y ya están implementados.

| Uso en el front | Llamada | Respuesta |
|---|---|---|
| Lista de pendientes | `GET /api/asignaciones/pendientes?page=&size=&subcategoriaId=` | `PaginaDTO<DonacionPendienteDTO>` |
| Panel de ranking | `GET /api/asignaciones/pendientes/{donacionId}` | `RankingDonacionDTO`. Devuelve 404 si la donación ya no está en depósito |
| Ítems y vencimiento en el panel; detalle de cualquier donación | `GET /api/donaciones/{id}` | `DonacionDTO`, con `items[].fechaVencimiento` |
| Pestaña "Todas" | `GET /api/donaciones/paginadas?estado=&subcategoriaId=&page=&size=` | `PaginaDTO<DonacionDTO>`. **Endpoint nuevo, falta hacerlo en el backend** (ver sección 9) |
| Filtro por subcategoría | `GET /api/subcategorias` | Ya existe en `donatrackService.getSubcategories` |
| Asignar | `PATCH /api/donaciones/{id}` con `{ "tipoEstado": "ASIGNACION_REALIZADA", "entidadId": 4 }` | `DonacionDTO` |
| Marcar vencida | `PATCH /api/donaciones/{id}` con `{ "tipoEstado": "VENCIDA" }` | `DonacionDTO` |
| Donaciones de la entidad | `GET /api/entidades-beneficiarias/{id}/donaciones?estado=&estado=&page=&size=` | `PaginaDTO<DonacionDTO>` |
| Detalle para la entidad | `GET /api/donaciones/{id}` | `DonacionDTO` |

### Errores: el backend responde `ErrorDTO { status, codigo, mensaje }`

> ⚠️ `src/services/api-client.js` arma el mensaje con `data.message ?? data.detail ?? data.error`, y **no lee `mensaje`**, así que hoy los textos del backend se pierden. Hay dos formas de resolverlo:
> - **En el cliente del flujo 5**, sin tocar código común: leer `error.data?.mensaje` y `error.data?.codigo` en `llamar()`.
> - **En `api-client.js`**, sumando `data.mensaje` a la cadena. Es una línea y les sirve a todos los flujos, pero hay que avisarle al grupo.
>
> Recomiendo hacer las dos: la primera ya mismo y la segunda, propuesta al grupo.

Qué hace el BFF con cada `codigo` (siempre con PRG: flash y redirect, sin pantallas de error):

| `codigo` | HTTP | Toast | Redirige a |
|---|---|---|---|
| `TRANSICION_INVALIDA`, `CONFLICTO_CONCURRENCIA` | 409 | El `mensaje` del backend ("Otra persona ya actualizó esta donación.") | La lista, sin el panel. La lista vuelve actualizada |
| `RANKING_NO_CALCULADO` | 409 | El `mensaje` del backend | El panel de esa donación |
| `ENTIDAD_FUERA_DEL_RANKING` | 422 | "El ranking cambió desde que abriste la página. Revisalo de nuevo." | El panel, con el ranking actualizado |
| `SOLICITUD_INVALIDA` | 400 | El `mensaje` del backend | El panel |
| `DONACION_NO_ENCONTRADA`, o 404 en `/pendientes/{id}` | 404 | "La donación ya no está en depósito." | La lista |
| status 0 (timeout o conexión) | — | "El servicio de donaciones no está disponible." | Misma página, con un aviso y "Reintentar" |

---

## 4. Rutas del flujo 5

### Admin: `routes/asignaciones.js`, montado en `/admin/donaciones` con `requireRole("ADMIN")`

La sección "Donaciones" tiene dos pestañas (partial `donaciones-tabs.hbs`, igual que `logistica-tabs.hbs`): **Pendientes de asignación** y **Todas las donaciones**.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/admin/donaciones` | Redirige a `/admin/donaciones/pendientes`, como hace el flujo 6 con `/admin/logistica` |
| GET | `/admin/donaciones/pendientes?page=&subcategoriaId=&donacion=&confirmar=` | Cola paginada de las donaciones en depósito. Si viene `donacion`, también el panel de ranking. Si viene `confirmar=vencer`, el panel abre directamente el diálogo de vencida |
| GET | `/admin/donaciones/todas?estado=&subcategoriaId=&page=` | Todas las donaciones, en cualquier estado, paginadas y **de solo lectura** |
| GET | `/admin/donaciones/:id` | Detalle de solo lectura de cualquier donación, con línea de tiempo |
| POST | `/admin/donaciones/:id/asignar` | Body: `entidadId`, `volver`. Llama al `PATCH` con `ASIGNACION_REALIZADA` y aplica PRG |
| POST | `/admin/donaciones/:id/vencer` | Body: `volver`. Llama al `PATCH` con `VENCIDA` y aplica PRG |

Las rutas literales (`/pendientes`, `/todas`) se declaran **antes** que `/:id`. En `/:id`, si el valor no es un entero positivo, se responde 404 (Express 5 ya no acepta regex dentro de la ruta).

### Entidad: `routes/donaciones-entidad.js`, montado en `/entidad/donaciones` con `requireRole("ENTIDAD")`

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/entidad/donaciones?estado=&page=` | Lista paginada de las donaciones asignadas a la entidad de la sesión |
| GET | `/entidad/donaciones/:id` | Detalle con línea de tiempo (boceto `interfaz-visualizar-donacion-entidad.png`) |

### Profundidad de navegación (máximo 3 niveles)

```
Admin:   Administración › Donaciones: Pendientes › Panel de la donación (?donacion=128) › <dialog>
Admin:   Administración › Donaciones: Todas › Detalle (/admin/donaciones/128)
Entidad: Entidad › Donaciones asignadas › Detalle
```

Las dos pestañas están en el mismo nivel y los `<dialog>` no suman nivel.

---

## 5. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| F1 | **Lista y detalle en una sola ruta**: el panel se abre con `?donacion=128` y el servidor renderiza las dos cosas | Es el patrón lista y detalle llevado al render en el servidor: funciona sin JS, el botón "atrás" y los links directos andan, y la página y los filtros no se pierden. En desktop son dos columnas. En celular, con una donación elegida, se ve solo el panel con "← Volver a la lista" (es CSS, no JS) |
| F2 | **Una sola sección `/admin/donaciones` con dos pestañas**: "Pendientes de asignación" (la cola, con acciones) y "Todas las donaciones" (consulta de solo lectura) | El admin necesita ver también las donaciones que ya no están en depósito. Como pestañas comparten un link en el menú y un prefijo, y no suman nivel de navegación. Asignar y vencer quedan **solo** en "Pendientes", donde aplican, para no mezclar la tarea de decidir con la de consultar |
| F3 | **"Marcar vencida" desde la fila** lleva a `?donacion=128&confirmar=vencer` y abre el diálogo ya con el detalle | La lista no trae la fecha de vencimiento. Para decidir, el admin tiene que ver los ítems con su vencimiento, y eso está en el panel (`GET /api/donaciones/{id}`). Se reutiliza el mecanismo `data-dialog-abierto` del flujo 6 |
| F4 | **El contexto se conserva después de un `POST`**: cada form manda un hidden `volver` con la página y los filtros actuales | Después de asignar, el admin vuelve a la misma página de la lista. El BFF **valida** que `volver` empiece con `/admin/donaciones/` para evitar un open redirect |
| F5 | **Página fuera de rango** (por ejemplo, después de asignar la última donación de la última página): redirigir a la última página válida | Evita una lista vacía engañosa |
| F6 | **La entidad tiene vistas propias** (`/entidad/donaciones`) | Tiene otras tareas y otras columnas. Además, el filtro tiene que salir de la sesión, no de un parámetro |
| F7 | **El `entidadId` sale de la sesión** (`req.session.user.entidadId`). Solo con `AUTH_DEV_BYPASS=true` se acepta `?entidadId=` para probar | Si el id viniera en la URL, cualquiera podría ver las donaciones de otra entidad cambiando un número |
| F8 | **El BFF verifica que la donación sea de la entidad** en el detalle (`donacion.entidadId === entidadId de la sesión`) y si no, responde 404 | El backend todavía no lo controla (`// TODO flujo 1`), así que el BFF es la primera barrera |
| F9 | **No hay botón para recalcular los rankings.** `POST /api/asignaciones/ejecuciones` queda solo para desarrollo y demo, desde Postman | El ranking se calcula de noche, en horario de baja carga. Si el admin pudiera dispararlo en cualquier momento, se perdería ese objetivo. Una donación que entra durante el día espera al cálculo de esa noche |
| F10 | **Etiquetas en lenguaje humano para las listas**, con una alternativa para nombres desconocidos | El backend guarda el tipo de lista como `varchar` para poder agregar algoritmos (D3). Si llega un nombre nuevo, se muestra "Nombre del algoritmo" a partir de `NOMBRE_DEL_ALGORITMO`, sin romper la vista |
| F11 | **Sin porcentajes de coincidencia** | El backend no los calcula. Se usan las etiquetas *Coincide*, *Sin coincidencia* y *Pendiente* |

---

## 6. Vistas

### 6.1 Admin, pestaña Pendientes: `views/admin/donaciones/pendientes.hbs`

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Administración · Donaciones                                                   │
│ Asignación de donaciones                                                      │
│ [Pendientes de asignación] [Todas las donaciones]                             │
│ ⓘ Los rankings se calculan cada noche. Elegí una donación para ver a qué      │
│   entidades conviene asignarla.                                    [×]        │
│ Subcategoría [Todas ▾] [Filtrar]                                              │
├────────────────────────────────────────────────┬──────────────────────────────┤
│ Donación          Cant.  Ingreso   Ranking      │ #128 · Ropa de abrigo        │
│ #126 Arroz        25     03/11     ● Coincide   │ Camperas · 10 · Ana Pérez    │
│   Sugerida: Comedor Esperanza                   │ Ítems: Campera (vence —)     │
│   [Ver ranking] [Marcar vencida]                │ Calculado: 08/11 03:02       │
│ #128 Camperas     10     05/11     ● Coincide ◀ │                              │
│   [Ver ranking] [Marcar vencida]                │ Sugeridas por ambos algoritmos│
│ #131 Leche        30     08/11     ○ Pendiente  │ 1. Hogar Los Peques          │
│   ⓘ Se calcula esta noche                       │    Av. Siempreviva 742       │
│   [Marcar vencida]                              │                   [Asignar]  │
│                                                 │ 2. Comedor Esperanza [Asignar]│
│ ‹ Anterior   Página 1 de 2   Siguiente ›        │                              │
│                                                 │ [Marcar vencida]             │
└────────────────────────────────────────────────┴──────────────────────────────┘
```

**Datos que arma el router** en un solo `GET`, en paralelo con `Promise.all` y una carga independiente por sección:

1. `GET /api/asignaciones/pendientes?page=&size=20&subcategoriaId=`
2. `GET /api/subcategorias` (para el filtro)
3. Si viene `donacion`: `GET /api/asignaciones/pendientes/{id}` y `GET /api/donaciones/{id}`

Si falla el panel, la lista se muestra igual con un aviso dentro del panel, como hace el flujo 6 con su función `cargarSeccion`.

**Lista:**
- La columna "Ranking" muestra un chip con texto, no solo color. Si hay coincidencias, debajo va la sugerencia principal (`sugerenciaPrincipal.entidadNombre`).
- La fila elegida lleva `aria-current="true"` y se resalta.
- "Ver ranking" es un **link** (`?donacion=128&page=…`), no un botón. Es navegación.
- Las donaciones con ranking `PENDIENTE` no tienen "Ver ranking" y muestran un tooltip: "Entró después del último cálculo. Va a tener ranking después del cálculo de esta noche".
- El paginado va en un partial `paginacion.hbs` con `<nav aria-label="Paginación">`, `aria-current="page"` y links que conservan los filtros.

**Panel:**
- **Con coincidencias:** una lista titulada "Sugeridas por ambos algoritmos".
- **Sin coincidencias:** dos columnas, "Compatibilidad con necesidades" y "Prioridad a entidades menos atendidas", con la ayuda: "Los algoritmos no coinciden: podés elegir de cualquiera de las dos listas".
- **Ranking pendiente:** explica que la donación va a tener ranking después del cálculo de esta noche. Se puede marcar como vencida, pero no asignar.
- Cada candidato muestra su posición, nombre, dirección y el botón **[Asignar]**, que abre su `<dialog>`.
- Datos de la donación: descripción, subcategoría, cantidad, donante e ítems con su vencimiento, más el botón **[Marcar vencida]**.
- "✕ Cerrar panel" es un link a la misma URL sin `donacion`.

**Diálogos** (`<dialog>` nativo: Esc y foco atrapado los da el navegador):

| Diálogo | Texto | Form |
|---|---|---|
| Asignar | "¿Asignar la donación #128 (10 camperas) a **Hogar Los Peques**? Se le va a notificar a la entidad y se va a generar la entrega en logística. No se puede deshacer." | `POST /admin/donaciones/128/asignar` con `entidadId` y `volver` hidden. Botón `data-busy-text="Asignando…"` |
| Marcar vencida | "¿Marcar como vencida la donación #128? Deja de estar disponible para asignar y no se puede deshacer." Si ningún ítem tiene fecha o la fecha es futura, se suma: "⚠️ Según la fecha cargada, todavía no venció." | `POST /admin/donaciones/128/vencer` |

**Estados de la vista:**

| Estado | Qué se ve |
|---|---|
| Lista vacía | "No hay donaciones en depósito para asignar." |
| Vacía por el filtro | "Ninguna donación de esta subcategoría está en depósito." + [Quitar filtro] |
| Backend caído | El partial de "servicio no disponible" con [Reintentar] (ver 6.4) |
| Error en el panel | Aviso dentro del panel. La lista sigue funcionando |

### 6.2 Admin, pestaña Todas: `views/admin/donaciones/todas.hbs` y `detalle.hbs`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Administración · Donaciones                                                  │
│ Todas las donaciones                                                         │
│ [Pendientes de asignación] [Todas las donaciones]                            │
│ Estado [Todos ▾]  Subcategoría [Todas ▾]  [Filtrar]                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ #    Donación        Cant.  Donante      Estado            Entidad          │
│ 140  Fideos secos    50     Juan Gómez   ○ En depósito     —     [Ver]      │
│ 128  Ropa de abrigo  10     Ana Pérez    ● Asignada        Hogar L. [Ver]   │
│ 121  Leche           30     Arcos S.A.   ● En camino       Comedor E.[Ver]  │
│ 117  Arroz           25     Ana Pérez    ✕ Vencida         —     [Ver]      │
│ ‹ Anterior   Página 1 de 9   Siguiente ›                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Lista (`todas.hbs`):**
- **Es de solo lectura:** no tiene botones de asignar ni de vencer. En las filas `EN_DEPOSITO`, en lugar de esas acciones, va el link "Asignar →" a `/admin/donaciones/pendientes?donacion=128`, que abre esa donación en la cola. La lista de la cola arranca en la página 1, pero el panel se carga por id, así que se ve igual.
- **Filtros** (form `GET`): estado (Todos · En depósito · Asignada · Lista para entregar · En camino · Entregada · Entrega fallida · Vencida) y subcategoría. Los dos quedan en la URL.
- **Columnas:** # · Donación (descripción y subcategoría) · Cantidad · Donante · Estado (chip con texto) · Entidad asignada (o "—") · [Ver]. Usa `table-cards` para celular y el partial `paginacion.hbs`.
- **Orden:** fecha de ingreso, la más reciente primero. Es una consulta, así que conviene ver primero lo último que entró. En la cola el orden es el inverso, porque ahí importa lo que más tiempo lleva esperando.
- **Estados vacíos:** "Todavía no hay donaciones registradas" y "Ninguna donación coincide con los filtros" + [Quitar filtros].

**Detalle (`detalle.hbs`, `/admin/donaciones/:id`):**
- Datos de la donación: descripción, subcategoría, cantidad, donante, entidad asignada, fecha de ingreso, ítems con su vencimiento y, si existe, la foto de la entrega (`fotoEntrega`).
- **Línea de tiempo:** el mismo partial `asignaciones-linea.hbs` que usa el detalle de la entidad (6.3). Se escribe una sola vez.
- Si la donación está `EN_DEPOSITO`, link "Ir a asignar →" a la cola.
- "← Volver a todas las donaciones" vuelve a la lista con los mismos filtros y la misma página (hidden `volver`, validado como en F4).
- Si la donación no existe: flash "La donación no existe" y redirect a la lista.

### 6.3 Entidad

**`views/entidad/donaciones/listado.hbs`**
- Filtro de estado: Todas · Asignada · Lista para entregar · En camino · Entregada · Entrega fallida. Es un `<select>` dentro de un form `GET`.
- Columnas: Donación (descripción) · Subcategoría · Cantidad · Donante · Estado · [Ver detalle].
- Usa la clase `table-cards` del flujo 6, que pasa a tarjetas en celular, y el mismo partial `paginacion.hbs`.
- Orden: el que trae el backend (último cambio de estado, el más reciente primero).

**`views/entidad/donaciones/detalle.hbs`** (boceto)
- Izquierda: subcategoría, descripción, cantidad, donante e ítems.
- Derecha: **línea de tiempo** con los estados reales: `Asignada → Lista para entregar → En camino → Entregada`, o la rama `Entrega fallida` en rojo.
  - Hoy `DonacionDTO` **no trae el historial**, así que la línea de tiempo marca como hechos los pasos anteriores al estado actual, **sin fechas**. Si el backend suma `historialEstados` (ver sección 9), se agregan las fechas y la "Fecha de asignación" del boceto.
- Botones "Ver en mapa" (flujo 6) y "Confirmar recepción" (flujo 7): **solo en `EN_TRASLADO`** y como links a las rutas que definan esos flujos. Mientras no existan, no se muestran. No se dejan botones muertos.

### 6.4 Piezas compartidas (coordinar con el grupo)

| Pieza | Situación | Propuesta |
|---|---|---|
| `public/js/logistica/modales.js` | Es genérico: abre los `<dialog>`, devuelve el foco y reabre con `data-dialog-abierto`. Pero vive en la carpeta del flujo 6 | Pedirle al flujo 6 que lo mueva a `public/js/dialogos.js`. Mientras tanto, la vista del flujo 5 lo carga desde donde está, sin duplicarlo |
| Ayuda inicial descartable (`data-hint`) | La implementa el flujo 6 | Reutilizarla igual |
| `views/partials/logistica-no-disponible.hbs` | Igual que el anterior | Generalizarlo a `servicio-no-disponible.hbs` con el parámetro `servicio` |
| `views/partials/paginacion.hbs` | No existe; es el primer listado paginado del front | Crearlo genérico (recibe `pagina`, `totalPaginas` y `baseUrl` con los filtros) para que lo usen los demás |
| `api-client.js` y el campo `mensaje` | Ver sección 3 | Una línea en el cliente común |
| Helper `statusLabel` | Le falta `VENCIDA` | Sumar `VENCIDA: "Vencida"` |

### 6.5 Puntos de entrada (sin cambiar el boceto)

- **Menú:** `DONACIONES_LINK` ("Donaciones") en `middleware/locals.js`, visible solo para ADMIN, igual que `LOGISTICA_LINK`.
- **`views/admin.hbs` (inicio del admin):**
  - la tarjeta "Pendientes de asignación" con `totalElementos` de `GET /pendientes?size=1` y el link "Ver asignaciones →" a `/admin/donaciones/pendientes`;
  - en el bloque "Donaciones recientes", el link "Ver todas →" a `/admin/donaciones/todas`.

  Son líneas sueltas en la vista y una llamada más en `loadAdminPage`. Hay que coordinarlo con quien mantiene `admin.hbs`.
- **Flujo 3 (Ingreso):** si mueve "Registrar donación" a una página propia, le conviene que sea `/admin/donaciones/nueva`, como tercera pestaña de `donaciones-tabs.hbs`. Así todo lo de donaciones queda en una sola sección. Hay que acordarlo con esa persona.
- **Bloque "Asignaciones sugeridas" del boceto:** depende del filtro `soloConCoincidencias`, que es opcional en el backend (ver sección 9). Sin ese filtro, se muestran las 3 primeras pendientes que tengan `sugerenciaPrincipal`, sacadas de una página de 50. El botón del bloque **lleva al panel** de esa donación, no asigna directamente.
- **Tarjeta "Vencidas / por vencer" del boceto:** **queda fuera** del flujo 5, porque no hay filtro por vencimiento.
- **Botón "Marcar disponible" del boceto:** se saca, porque no existe la transición `VENCIDA → EN_DEPOSITO`.
- **`views/entity.hbs`:** un link "Donaciones asignadas →" que lleve a `/entidad/donaciones` (coordinar con el flujo 4, dueño de esa vista).

---

## 7. Archivos

```
routes/
  asignaciones.js               /admin/donaciones: pendientes (cola+panel), todas, detalle;
                                POST asignar / vencer
  donaciones-entidad.js         GET lista y detalle de la entidad
src/services/
  asignaciones-client.js        llamar() con mensajeUsuario y codigo; una función por endpoint
src/lib/
  asignaciones-vista.js         vistaPendiente, vistaRanking, etiquetaLista, pasosLinea,
                                vistaPaginacion, avisoVencimiento
  asignaciones-validacion.js    leerPagina, leerId, leerEstados, urlVolverSegura
views/admin/donaciones/
  pendientes.hbs                cola + panel de ranking
  todas.hbs                     consulta de todas las donaciones
  detalle.hbs                   detalle de solo lectura
views/entidad/donaciones/
  listado.hbs
  detalle.hbs
views/partials/
  donaciones-tabs.hbs           pestañas Pendientes / Todas
  asignaciones-fila.hbs         fila/tarjeta de una donación pendiente
  asignaciones-panel.hbs        datos de la donación + listas del ranking
  asignaciones-candidato.hbs    candidato + su <dialog> de asignar
  asignaciones-linea.hbs        línea de tiempo de estados (detalle del admin y de la entidad)
  paginacion.hbs                genérico (ver 6.4)
test/
  asignaciones-vista.test.js
  asignaciones-validacion.test.js
  asignaciones-client.test.js
```

Archivos comunes que se tocan, de a una línea cada uno:
- `server.js`: montar los dos routers.
- `middleware/locals.js`: el link del menú.
- `src/helpers/handlebars.js`: `VENCIDA`.
- `public/css/styles.css`: el layout de dos columnas y la regla para celular.

**Modelo, vista y controlador en el BFF:**

| Capa | Dónde | Regla |
|---|---|---|
| Modelo (acceso a datos) | `asignaciones-client.js` | Solo HTTP y traducción de errores. Sin lógica de pantalla |
| Controlador | `routes/*.js` | Lee y valida la request, llama al cliente, adapta con `src/lib` y hace `res.render` o PRG |
| Adaptadores (view models) | `asignaciones-vista.js` | Funciones puras: textos, etiquetas y pasos de la línea de tiempo. Así las vistas no calculan nada y todo se puede testear sin Express |
| Vista | `views/**/*.hbs` | Solo HTML con huecos |

---

## 8. Requisitos de UI/UX de la entrega 6

| Requisito | Cómo lo cumple el flujo 5 |
|---|---|
| Curva de aprendizaje mínima | Una tarea por vista. Se muestran solo las donaciones sobre las que se puede actuar. Lenguaje del dominio ("Asignar", "Marcar vencida") |
| Máximo 3 niveles | Ver la sección 4. Los diálogos no suman nivel |
| Patrones conocidos | Lista y detalle, chips de estado, diálogos de confirmación, paginado clásico, tabla que pasa a tarjetas |
| Microcopy y ayudas | Ayuda descartable sobre el cálculo nocturno, tooltip en *Pendiente*, explicación del caso sin coincidencias, consecuencias en cada diálogo, aviso si la donación todavía no venció |
| Notificaciones no intrusivas | Toast con PRG para cada resultado, aviso de "servicio no disponible" con reintento y errores en lenguaje humano gracias al `mensaje` del backend |
| Indicador de carga si tarda más de 300 ms | La página llega renderizada, así que no hay skeletons. La espera se ve con la barra `.page-progress` en cada navegación y con `data-busy-text` en los botones ("Asignando…", "Marcando…"), que también evita el doble envío |
| Responsive | Desktop con dos columnas. En celular, `table-cards` y, con una donación elegida, solo el panel con "← Volver" |
| Sin superposición | El panel es una columna de la grilla, no un overlay |
| WCAG AA | `<th scope>` en las tablas; el panel como `<aside aria-labelledby>`; `<dialog>` nativo con `aria-labelledby`/`aria-describedby`; paginado con `aria-current`; estados con texto además de color; toast con `aria-live` (ya está en el layout) |
| Áreas táctiles de 48×48 px | Botones y links de acción con texto. Revisar que `button-small` llegue a 48 px de alto, porque hoy es probable que no |
| Tokens unificados | Solo clases y tokens existentes (`tag-*`, `surface-card`, `table-cards`, `dialog`, `button-*`) |

---

## 9. Lo que todavía falta en el backend (solo lo que necesita el front)

Del `plan-flujo-5-asignacion-backend.md`, las fases 1 a 8 están hechas. Esto es lo pendiente y cómo impacta en el front:

| Pendiente | Prioridad | Impacto en el front si no se hace |
|---|---|---|
| **`GET /api/donaciones/paginadas?estado=&subcategoriaId=&page=&size=`** → `PaginaDTO<DonacionDTO>` | **Necesario** | No se puede hacer la pestaña "Todas las donaciones". `GET /api/donaciones` no sirve: devuelve todas sin paginar, la usan otros flujos (no se puede cambiar su respuesta) y su filtro por subcategoría espera un objeto `Subcategoria`, no un id, así que no funciona por query param. Cómo hacerlo con lo que ya existe: generalizar `DonacionesRepository.buscarPorEstado` para que el estado sea opcional (`:estado is null or ...`) y acepte varios (`estado` repetible, como en el endpoint de la entidad). Orden: `fechaIngreso` descendente, `size` de 50 como máximo. Para no editar el controller del flujo 3, ponerlo en un controller nuevo, como se hizo con `DonacionesEntidadController`. Solo ADMIN (`// TODO flujo 1`) |
| `historialEstados` en `DonacionDTO` (`[{ estado, fecha, detalle }]`) | **Recomendado** | La línea de tiempo de la entidad queda sin fechas y no se puede mostrar la "Fecha de asignación" del boceto ni la justificación de una entrega fallida |
| Filtro `soloConCoincidencias` en `/pendientes` | **Recomendado** | El bloque "Asignaciones sugeridas" del inicio usa la alternativa aproximada de la sección 6.5 |
| `motivo` por candidato | Opcional | El panel no explica por qué se sugiere cada entidad, que es la ayuda de más valor para decidir |
| Tabla `ejecuciones_asignacion` y `GET /ejecuciones/ultima` | Opcional | La ayuda dice "cada noche" en lugar de "Último cálculo: hoy 03:02" |
| Controles de seguridad (`// TODO flujo 1`) | Depende del flujo 1 | Mientras tanto, los controles F7 y F8 del BFF son la única barrera |
| Diagrama de clases, DER y justificaciones (fase 9) | Entregable | — |

---

## 10. Orden de trabajo

1. [ ] Actualizar `main` y crear la rama (sección 2).
2. [ ] `asignaciones-client.js`, con `llamar()` leyendo `mensaje` y `codigo`, más sus tests.
3. [ ] `asignaciones-validacion.js` (página, ids, estados, `volver` seguro) y `asignaciones-vista.js`, con sus tests.
4. [ ] `routes/asignaciones.js`: la pestaña Pendientes con `donaciones-tabs.hbs` y `paginacion.hbs`. Montarlo en `/admin/donaciones` (`server.js`) y sumar el link del menú.
5. [ ] El panel de ranking en el mismo `GET`, con `?donacion=`.
6. [ ] Los diálogos y los `POST` de asignar y vencer, con PRG y el mapeo de errores por `codigo`.
7. [ ] **Backend:** `GET /api/donaciones/paginadas` (sección 9), con su test y su paso en Postman.
8. [ ] La pestaña Todas y el detalle del admin, con el partial `asignaciones-linea.hbs`.
9. [ ] `routes/donaciones-entidad.js`: lista y detalle, con el `entidadId` de la sesión y el control F8. Reutiliza `asignaciones-linea.hbs`.
10. [ ] Puntos de entrada: la tarjeta y el link "Ver todas" en `admin.hbs`, y el link en `entity.hbs`, coordinados con sus dueños.
11. [ ] Pasada de accesibilidad y responsive: solo teclado, lector de pantalla, 360 / 768 / 1280 px y alturas de 48 px.
12. [ ] Sección "Flujo 5: Asignación" en el `README.md`, con un guion de demo como el del flujo 6:
    calcular los rankings con Postman (`POST /api/asignaciones/ejecuciones`) → asignar → ver la donación como "Asignada" en *Todas las donaciones* → ver la entrega nueva en *Logística → Entregas y rutas* → ver la donación desde la entidad.
