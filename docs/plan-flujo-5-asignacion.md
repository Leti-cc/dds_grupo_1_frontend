# Plan del flujo 5: Asignación

Alcance: todo lo que hace falta, en backend y en frontend, para que:

- **La persona administradora** vea las donaciones en depósito con el ranking que calcularon los algoritmos durante la noche, asigne cada una a una entidad del ranking (requerimiento 17) y marque como vencidas las que correspondan (requerimiento 16).
- **La entidad beneficiaria** vea el estado de las donaciones que le asignaron (requerimiento 11).

Queda fuera de este plan, aunque se toca en los bordes:

| Tema | Flujo dueño | Cómo se toca con el flujo 5 |
|---|---|---|
| Login, roles e id de la entidad en la sesión | 1. Acceso | El flujo 5 lee el rol y el `entidadId` de la sesión |
| Alta de donaciones | 3. Ingreso | El flujo 5 necesita que la donación guarde su fecha de vencimiento (ver A.4) |
| Mapa de la entrega | 6. Logística | El detalle de donación de la entidad tiene el botón "Ver en mapa" |
| Confirmar recepción con foto | 7. Recepción | El detalle de donación de la entidad tiene el botón "Confirmar recepción" |
| `@RestControllerAdvice` global y partials comunes | Común (día 1) | El flujo 5 lanza sus excepciones y usa los partials |

## Decisiones tomadas

| # | Decisión | Por qué |
|---|---|---|
| D1 | El ranking se calcula **de noche** con un job programado y **se guarda en la base**. La vista solo lee lo guardado. | Los algoritmos recorren todas las entidades y sus necesidades, así que conviene correrlos en horario de baja carga. La vista responde rápido porque no calcula nada. |
| D2 | La vista del admin muestra **solo donaciones `EN_DEPOSITO`**, con **paginado del lado del servidor**. | Son las únicas sobre las que el admin puede actuar (asignar o marcar vencida). Paginar en el servidor evita traer miles de filas. |
| D3 | Patrón **lista y detalle**: la lista paginada y un panel lateral con el ranking de la donación elegida. La confirmación es un **modal**. | No sube la profundidad de navegación (máximo 3 niveles) y deja procesar la cola sin ir y volver entre pantallas. |
| D4 | La entidad tiene **vistas propias**, no una vista `/donaciones` genérica con condicionales por rol. | Tiene otras tareas, otras columnas y otras acciones. Una plantilla con `{{#if esAdmin}}` por todos lados es difícil de mantener. Además, filtrar por entidad en el front no es seguridad: el backend tiene que filtrar. Lo que se comparte entre admin y entidad son los partials. |
| D5 | **No se cambia la interfaz del boceto.** Las tarjetas del inicio del admin se mantienen, pero resumen y llevan a la vista, y reutilizan los mismos modales. | Cumple con "implementar los bocetos de la entrega 1" y baja la carga sin rediseñar. |
| D6 | El "92% coincidencia" del boceto se reemplaza por una **etiqueta cualitativa**. | El backend no calcula ningún porcentaje. Mostrar una precisión inventada engaña al usuario. |

---

# Parte A: Backend (`servicio-donaciones`)

Todas las rutas son relativas a `DonaTrack/servicio-donaciones/src/main/java/org/donatrack/`.

## A.1 Estado actual y problemas

| Pieza | Problema |
|---|---|
| `dominio/algoritmo/CoordinadorAsignacion` | No es un bean de Spring, nadie lo instancia y lee las donaciones del singleton `Deposito` (una lista en memoria que nunca se llena desde la base) |
| `dominio/algoritmo/JobAsignacion` | No es un bean de Spring y no tiene `@Scheduled`, así que nunca se ejecuta |
| `dominio/algoritmo/PrioridadSubatendidos` | No tiene `@Component` (`CompatibilidadSemantica` sí) |
| `AlgoritmoAsignacion` | No expone un nombre, así que no se puede saber qué lista corresponde a qué algoritmo |
| `ResultadoAsignacion` | No se guarda en la base. Guarda los rankings como `List<List<...>>` sin nombre. El constructor recibe `null` en las coincidencias, y si no hay coincidencias `tieneCoincidencias()` lanza NullPointerException |
| `CoordinadorAsignacion.interseccion` | Devuelve un `HashSet` convertido en lista, así que **el orden de las coincidencias es aleatorio** |
| `DonacionesService.cambiarEstadoDonacion` | Lanza `new Error(...)`, que llega al front como 500. Si `entidadId` viene `null`, falla sin un mensaje útil. **No valida que la entidad esté en el ranking**: `ResultadoAsignacion.confirmarDestinoFinal` existe, pero nadie lo usa |
| `DonacionDTO` | No tiene la entidad asignada, el nombre del donante, la fecha de vencimiento ni el historial de estados (el historial sí existe en el dominio, con fechas) |
| `GET /api/donaciones` | No pagina y no filtra por entidad |

## A.2 Ranking nocturno guardado en la base

### Modelo de datos

Se convierte `ResultadoAsignacion` en entidad JPA. Se reutiliza el modelo del dominio que ya diseñaron, incluida la regla de `confirmarDestinoFinal`.

```
resultados_asignacion
  id                   PK
  donacion_id          FK → donaciones, UNIQUE   (un ranking vigente por donación)
  tiene_coincidencias  boolean
  fecha_calculo        datetime

items_ranking_asignacion
  id                   PK
  resultado_id         FK → resultados_asignacion (cascade delete)
  entidad_id           FK → entidades_beneficiarias
  lista                enum: COINCIDENCIAS | COMPATIBILIDAD_SEMANTICA | PRIORIDAD_SUBATENDIDOS
  posicion             int (1..10)
  puntaje              int (nullable)
  motivo               varchar(255)   ej.: "Necesita arroz (25 kg)", "0 donaciones en el último trimestre"

ejecuciones_asignacion (opcional, pero recomendado)
  id, inicio, fin, donaciones_procesadas, estado (OK | ERROR)
```

- `motivo` alimenta el texto de ayuda de la UI, que explica por qué se sugiere cada entidad. Lo genera cada algoritmo al rankear.
- `ejecuciones_asignacion` permite mostrar "Último cálculo: hoy 03:02" en la vista y deja registro si el job falla.

### Cambios en el dominio

- [ ] `AlgoritmoAsignacion`: agregar `TipoListaRanking tipo()` (o `nombre()`) y devolver, para cada entidad, su puntaje y su motivo. Por ejemplo, que devuelva `List<CandidatoRanking>` con entidad, puntaje y motivo, en lugar de `List<EntidadBeneficiaria>`.
- [ ] `PrioridadSubatendidos`: agregar `@Component`.
- [ ] `ResultadoAsignacion`: `@Entity` con `@OneToMany List<ItemRankingAsignacion>`. Inicializar las listas vacías (nunca `null`). `confirmarDestinoFinal(entidad)` sigue siendo la regla: si hay coincidencias, solo se puede elegir entre ellas; si no, entre cualquiera de las listas.
- [ ] `CoordinadorAsignacion`: volverlo `@Service`. Que reciba `DonacionesRepository` en lugar de usar `Deposito`, y que guarde cada `ResultadoAsignacion` reemplazando el anterior de la misma donación.
- [ ] `interseccion`: **orden determinístico**. Propuesta: ordenar por la suma de las posiciones en cada algoritmo (menor suma, primero).
- [ ] Verificar `equals`/`hashCode` de `EntidadBeneficiaria` (por `id`). La intersección usa `HashSet` y no puede depender de que los objetos sean la misma instancia.
- [ ] Sacar `Deposito` (singleton en memoria) del flujo de asignación.

### Job

- [ ] `JobAsignacion` como `@Component`, con `@Scheduled(cron = "${donaciones.asignacion.cron:0 0 3 * * ?}")`. `@EnableScheduling` ya está activo en `DonatrackDonacionesApplication`.
- [ ] En `application.properties`, agregar `donaciones.asignacion.cron=0 0 3 * * ?`.
- [ ] Procesar las donaciones `EN_DEPOSITO` **por lotes** (`Slice` de 200, por ejemplo) con una transacción por lote, para no cargar todo en memoria.
- [ ] Borrar los resultados de las donaciones que ya no están `EN_DEPOSITO`. También se pueden borrar al asignar o vencer (ver A.4).
- [ ] Registrar la ejecución en `ejecuciones_asignacion`.

## A.3 Endpoints nuevos

### Admin

| Método y ruta | Para qué | Respuesta |
|---|---|---|
| `GET /api/asignaciones/pendientes` | Lista paginada de donaciones `EN_DEPOSITO` con un resumen de su ranking | `PaginaDTO<DonacionPendienteDTO>` |
| `GET /api/asignaciones/pendientes/{donacionId}` | Ranking completo de una donación, para el panel lateral | `RankingDonacionDTO` |
| `GET /api/asignaciones/ejecuciones/ultima` | Fecha y resultado del último cálculo, para el texto de ayuda | `EjecucionAsignacionDTO` |
| `POST /api/asignaciones/ejecuciones` | Ejecuta el job a mano (desarrollo, demo, corrección) | `202 Accepted` |

Parámetros de `GET /api/asignaciones/pendientes`:

| Parámetro | Ejemplo | Nota |
|---|---|---|
| `page`, `size` | `page=0&size=20` | `Pageable` estándar de Spring. Limitar `size` a 50 como máximo |
| `sort` | `sort=fechaVencimiento,asc` | Orden por defecto: **vencimiento ascendente (las vacías al final) y después fecha de ingreso**. Lo más urgente aparece primero |
| `subcategoriaId` | `3` | Filtro |
| `soloConCoincidencias` | `true` | Para la tarjeta "Asignaciones sugeridas" del inicio |
| `venceAntesDe` | `2026-11-14` | Para la tarjeta "Vencidas / por vencer" y el filtro "Por vencer" |

Contrato de `DonacionPendienteDTO` dentro de `PaginaDTO`:

```json
{
  "contenido": [
    {
      "donacionId": 128,
      "descripcion": "Ropa de abrigo",
      "subcategoriaNombre": "Camperas",
      "cantidadTotal": 10,
      "fechaIngreso": "2026-11-05T10:30:00",
      "fechaVencimiento": null,
      "donanteNombre": "Ana Pérez",
      "ranking": {
        "estado": "CALCULADO",
        "tieneCoincidencias": true,
        "fechaCalculo": "2026-11-07T03:02:00",
        "sugerenciaPrincipal": {
          "entidadId": 4,
          "entidadNombre": "Hogar Los Peques",
          "motivo": "Necesita camperas de abrigo (10)"
        }
      }
    }
  ],
  "pagina": 0,
  "tamanio": 20,
  "totalElementos": 36,
  "totalPaginas": 2
}
```

- `ranking.estado` vale `PENDIENTE` cuando la donación entró después del último cálculo. En ese caso, `sugerenciaPrincipal` es `null`.
- `PaginaDTO<T>` es un DTO propio y genérico. No conviene serializar `PageImpl` directamente, porque Spring advierte que su JSON no es estable.
- **Evitar consultas N+1:** traer la página de donaciones y después, en **una sola consulta**, los resultados de esos ids (`findByDonacionIdIn`).

Contrato de `RankingDonacionDTO`:

```json
{
  "donacionId": 128,
  "descripcion": "Ropa de abrigo",
  "subcategoriaNombre": "Camperas",
  "cantidadTotal": 10,
  "fechaVencimiento": null,
  "ranking": {
    "estado": "CALCULADO",
    "fechaCalculo": "2026-11-07T03:02:00",
    "tieneCoincidencias": false,
    "listas": [
      {
        "tipo": "COMPATIBILIDAD_SEMANTICA",
        "entidades": [
          { "posicion": 1, "entidadId": 4, "entidadNombre": "Hogar Los Peques",
            "direccion": "Av. Siempreviva 742", "puntaje": 10,
            "motivo": "Necesita camperas de abrigo (10)" }
        ]
      },
      {
        "tipo": "PRIORIDAD_SUBATENDIDOS",
        "entidades": [ ... ]
      }
    ]
  }
}
```

Si `tieneCoincidencias` es `true`, `listas` trae una sola lista de tipo `COINCIDENCIAS`.

### Entidad

| Método y ruta | Para qué | Respuesta |
|---|---|---|
| `GET /api/entidades-beneficiarias/{id}/donaciones?estado=...&page=&size=` | Donaciones asignadas a la entidad, paginadas | `PaginaDTO<DonacionDTO>` |

- `estado` se puede repetir (`?estado=ASIGNACION_REALIZADA&estado=EN_TRASLADO`) y Spring lo recibe como `List<TipoEstado>`. Hace falta para la tarjeta "Donaciones asignadas", que cuenta las que todavía no se entregaron.
- Orden por defecto: fecha de asignación, la más reciente primero.
- Es un endpoint **nuevo**, a propósito. Cambiar `GET /api/donaciones` de lista a página rompería lo que usan otros flujos.

## A.4 Cambios en lo que ya existe

- [ ] **`PATCH /api/donaciones/{id}` con `ASIGNACION_REALIZADA`:**
  - devolver 400 si falta `entidadId`;
  - buscar el `ResultadoAsignacion` de la donación y devolver 409 si no existe ("ranking no calculado");
  - llamar a `resultado.confirmarDestinoFinal(entidad)`, que valida que la entidad esté en el ranking y avanza el estado;
  - mantener la notificación y el envío a logística que ya existen;
  - borrar el resultado, que ya no sirve.
- [ ] **`PATCH /api/donaciones/{id}` con `VENCIDA`:** ya funciona (`EN_DEPOSITO → VENCIDA`). Solo falta borrar el resultado del ranking.
- [ ] **`DonacionDTO`:** agregar estos campos. Son nuevos, así que no rompen a nadie:
  - `entidadId` y `entidadNombre` (desde `organizacion.razonSocial`);
  - `donanteNombre`;
  - `cantidadTotal` (ya existe `getCantidadTotal()` en el dominio);
  - `fechaVencimiento`;
  - `historialEstados: [{ estado, fecha, detalle }]`, donde `detalle` lleva la justificación si la entrega falló.
- [ ] **`fechaVencimiento` en `Donacion`:** hoy está dentro de `BienMediblePerecedero`, en una colección de ítems, y así no se puede ordenar ni filtrar en SQL. Propuesta: guardar en `Donacion` la fecha más próxima entre sus ítems perecederos, calculada en `segmentarDonacion()`. **Hay que coordinarlo con el flujo 3**, porque toca el alta.

## A.5 Errores

El flujo 5 lanza estas excepciones. El `@RestControllerAdvice` común las convierte en un JSON uniforme (`{ status, codigo, mensaje }`).

| Excepción | HTTP | Cuándo | Mensaje para el toast |
|---|---|---|---|
| `DonacionNoEncontradaException` | 404 | id inexistente | "La donación no existe o fue eliminada." |
| `TransicionEstadoInvalidaException` (reemplaza `new Error`) | 409 | La donación ya no está en depósito, por ejemplo porque otra persona la asignó | "Otra persona ya actualizó esta donación." |
| `RankingNoCalculadoException` | 409 | Asignación sin ranking guardado | "Esta donación todavía no tiene ranking." |
| `EntidadFueraDelRankingException` | 422 | `entidadId` no figura en el ranking | "La entidad elegida no está entre las sugeridas." |
| `IllegalArgumentException` por un parámetro faltante | 400 | Falta `entidadId` | "Falta elegir la entidad." |

## A.6 Seguridad (depende del flujo 1)

- `/api/asignaciones/**` y los `PATCH` de asignar o vencer: **solo el rol ADMIN**.
- `/api/entidades-beneficiarias/{id}/donaciones` y `GET /api/donaciones/{id}`: una entidad solo puede ver lo suyo. **El backend compara el `{id}` con el `entidadId` del token** y devuelve 403 si no coinciden. Filtrar en el front no protege nada.
- Hasta que exista el login, se aceptan sin token. Hay que dejar un `// TODO flujo 1` en cada punto.

## A.7 Tests

- [ ] `CoordinadorAsignacion` con algoritmos falsos: el caso con coincidencias (y su orden determinístico) y el caso sin coincidencias.
- [ ] `ResultadoAsignacion.confirmarDestinoFinal`: entidad válida, entidad fuera del ranking y listas vacías (que no haya NullPointerException).
- [ ] Repositorio: la consulta paginada de pendientes con filtros y orden por vencimiento.
- [ ] Controladores con MockMvc: 400 / 404 / 409 / 422 al asignar, y 409 cuando dos admins asignan la misma donación.
- [ ] Job: procesa por lotes, guarda resultados y borra los de donaciones que ya no están en depósito.

## A.8 Orden de trabajo en el backend

1. [ ] Arreglos de dominio (nombres de algoritmos, listas no nulas, orden determinístico, `@Component`).
2. [ ] `ResultadoAsignacion` como entidad, su repositorio y `CoordinadorAsignacion` como servicio.
3. [ ] `JobAsignacion` programado, más `POST /api/asignaciones/ejecuciones` para probar sin esperar a la noche.
4. [ ] `GET /api/asignaciones/pendientes` (con `PaginaDTO`) y `GET /api/asignaciones/pendientes/{id}`.
5. [ ] `PATCH` con validación contra el ranking y excepciones propias.
6. [ ] `DonacionDTO` ampliado, `fechaVencimiento` (coordinado con el flujo 3) y el endpoint de donaciones por entidad.
7. [ ] Tests.
8. [ ] Agregar las colecciones de Postman a `docs/postman`.

---

# Parte B: Frontend (arquitectura, patrones y diseño)

## B.1 Vistas y rutas

```
Admin
├─ #/administracion                          (inicio, boceto)        nivel 1
│    ├─ tarjeta "Pendientes de asignación"   → asignacion-donaciones
│    ├─ tarjeta "Vencidas / por vencer"      → asignacion-donaciones?filtro=por-vencer
│    ├─ bloque "Asignaciones sugeridas"      → modal de asignar / "Ver todas"
│    └─ bloque "Donaciones disponibles"      → modal de vencida / "Ver todas"
└─ #/administracion/asignacion-donaciones    (lista + panel)         nivel 2
     └─ panel lateral ?donacion=128          (ranking)               nivel 3
          └─ modal de confirmación           (no cuenta como nivel)

Entidad
├─ #/entidad                                 (inicio, boceto)        nivel 1
│    ├─ tarjeta "Donaciones asignadas"       → donaciones-asignadas
│    └─ bloque "Últimas donaciones asignadas"→ detalle
├─ #/entidad/donaciones-asignadas            (lista)                 nivel 2
└─ #/entidad/donacion?id=123                 (detalle, boceto)       nivel 3
```

- Las rutas siguen el esquema que ya existe: hash y query params, igual que `#/seguimiento?id=`. Así no hace falta tocar el router compartido.
- Hay protección por rol en cada ruta: las de admin exigen ADMIN y las de entidad exigen ENTIDAD, con `userHasRole` (ya existe en `app.js`).
- En el menú del admin se usa el ítem "Asignaciones" del boceto. En el de la entidad, "Donaciones asignadas".

## B.2 Admin: Asignación de donaciones

### Layout en desktop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Asignación de donaciones                                                    │
│ ⓘ Los rankings se calculan cada noche. Último cálculo: hoy 03:02.          │
│ [Subcategoría ▾] [☐ Solo con coincidencia] [☐ Por vencer (7 días)]          │
├──────────────────────────────────────────────┬──────────────────────────────┤
│ ID     Subcat.  Cant.  Vence     Ranking      │ D-000128 · Camperas · 10 un. │
│ D-126  Arroz    25kg   hace 2d   ● Coincide   │ Calculado hoy 03:02          │
│        [Ver ranking] [Marcar vencida]         │                              │
│ D-128  Camperas 10un   —         ● Coincide ◀ │ ● Sugeridas por ambos        │
│        [Ver ranking] [Marcar vencida]         │ 1. Hogar Los Peques          │
│ D-131  Leche    30un   en 3d     ○ Pendiente  │    Necesita camperas (10)    │
│        [Marcar vencida]                       │              [Asignar]       │
│ ...                                           │ 2. Comedor Esperanza         │
│ ‹ Anterior  Página 1 de 2  Siguiente ›        │    ...           [Asignar]   │
└──────────────────────────────────────────────┴──────────────────────────────┘
```

### Comportamiento

- **Lista:** paginada en el servidor, 20 por página. La página, los filtros y la donación abierta **viven en la URL** (`?page=1&subcategoriaId=3&donacion=128`). Así funcionan el botón "atrás" y los links directos, y al recargar no se pierde lo que estaba abierto.
- **Orden por defecto:** las que vencen antes van primero. Es lo más urgente de decidir.
- **Etiqueta de ranking** en cada fila:
  - *Coincide* (verde): ambos algoritmos sugieren las mismas entidades.
  - *Sin coincidencia* (azul): el admin elige entre las listas de cada algoritmo.
  - *Pendiente* (gris): la donación entró después del último cálculo. No tiene botón "Ver ranking", y un tooltip explica "Se calcula esta noche".
- **Panel lateral (detalle):**
  - Con coincidencias: una sola lista.
  - Sin coincidencias: dos columnas tituladas "Compatibilidad con necesidades" y "Prioridad a entidades menos atendidas", con un texto que diga: "Los algoritmos no coinciden: elegí de cualquiera de las dos listas".
  - Cada entidad muestra su posición, nombre, dirección, el **motivo** y el botón "Asignar".
  - El panel se cierra con Esc o con ✕, y el foco vuelve al botón que lo abrió.
- **Modal "Asignar":** dice qué donación va a qué entidad y qué consecuencias tiene: "Se notificará a la entidad y se enviará a logística. No se puede deshacer". Al confirmar, llama al `PATCH`, muestra un toast de éxito, saca la fila y cierra el panel.
- **Modal "Marcar vencida":** muestra la fecha de vencimiento. Si la donación **todavía no venció**, agrega una advertencia: "Esta donación vence en 3 días. ¿Seguro que querés marcarla como vencida?". Avisa que no se puede deshacer, porque `VENCIDA` no tiene transiciones posibles.
- **Actualización pesimista:** la fila solo se saca cuando el backend confirma, y después se recarga la página actual. No se hace actualización optimista, porque la acción no se puede deshacer y puede haber dos admins trabajando a la vez.
- **Error 409:** toast "Otra persona ya actualizó esta donación" y recarga de la lista.

### Estados de la vista

| Estado | Qué se ve |
|---|---|
| Cargando la lista | 5 filas skeleton (más de 300 ms) |
| Cargando el panel | Skeleton de 3 entidades. Si se cambia de donación, se cancela el pedido anterior con `AbortController` |
| Lista vacía | "No hay donaciones en depósito para asignar 🎉" |
| Vacía por filtros | "Ninguna donación coincide con los filtros" + [Limpiar filtros] |
| Error de conexión | Banner con [Reintentar]. No se muestra una tabla vacía engañosa |
| Ranking pendiente | Panel con la explicación y la hora del próximo cálculo |

### En celular (menos de 768 px)

- La tabla pasa a **tarjetas**, una por donación, con las acciones abajo y botones de ancho completo.
- El panel lateral pasa a una **hoja a pantalla completa** con "← Volver".
- El paginado se reduce a "‹ Página 1 de 2 ›".

## B.3 Admin: bloques del inicio (boceto, sin cambiar la interfaz)

| Bloque del boceto | Datos | Cambio mínimo |
|---|---|---|
| Tarjeta "Pendientes de asignación" | `totalElementos` de `/pendientes?size=1` | Ninguno |
| Tarjeta "Vencidas / por vencer" | `/pendientes?venceAntesDe=hoy+7&size=1` | Ninguno |
| "Asignaciones sugeridas por el sistema" | `/pendientes?soloConCoincidencias=true&size=3` | "92%" pasa a ser una etiqueta cualitativa. "Asignar entidad" abre **el mismo modal** con la sugerencia principal ya elegida |
| "Donaciones disponibles (actualizar estado)" | `/pendientes?size=4` (ya ordenado por vencimiento) | "Marcar vencida" abre **el mismo modal**. "Marcar disponible" se saca porque no existe la transición `VENCIDA → EN_DEPOSITO` |

**A confirmar con el grupo:** el boceto muestra "En depósito: 128" y "Pendientes de asignación: 36", pero en el modelo actual son lo mismo. Propuesta: que "Pendientes" cuente las que están en depósito **y ya tienen ranking calculado**, es decir, las que están listas para decidir.

## B.4 Entidad

### Donaciones asignadas (`#/entidad/donaciones-asignadas`)

- **Filtro por estado:** Todas · Asignada · Lista para entregar · En traslado · Entregada · Entrega fallida.
- **Columnas:** Donación (descripción y subcategoría) · Cantidad · Estado · Fecha de asignación · [Ver detalle].
- Paginado en el servidor y estado guardado en la URL, igual que en la vista del admin.
- En celular, tarjetas.
- Inicio de la entidad: tarjeta "Donaciones asignadas" (las que todavía no se entregaron) y bloque "Últimas donaciones asignadas" (`size=3`).
- El `entidadId` sale **de la sesión**. Mientras no exista el login, se mantiene el campo manual que ya tiene `entity.hbs`, como parche.

### Detalle de donación (`#/entidad/donacion?id=123`, boceto)

- **Izquierda:** subcategoría, descripción, cantidad, donante y fecha de asignación.
- **Derecha:** línea de tiempo con los **estados reales** y su fecha, sacados de `historialEstados`:
  `Asignada → Lista para entregar → En traslado → Entregada`.
  Si la entrega falló, la línea de tiempo muestra esa rama en rojo, con la justificación.
  Se corrige el vocabulario del boceto, que usaba "En camino" y "En reparto".
- **Botones:** "Ver en mapa" (flujo 6) y "Confirmar recepción" (flujo 7). Solo aparecen en `EN_TRASLADO`. El flujo 5 deja el lugar y el link a la ruta que definan esos flujos.

## B.5 Arquitectura (MVC con cliente liviano)

| Capa | Archivos del flujo 5 | Responsabilidad |
|---|---|---|
| Modelo (acceso a la API) | `js/services/asignaciones-service.js` | Una función por endpoint. Sin lógica de negocio |
| Controlador | `js/controllers/admin/asignacion-donaciones.js`<br>`js/controllers/entidad/donaciones-asignadas.js`<br>`js/controllers/entidad/donacion-detalle.js` | Lee la URL, pide los datos, prepara el objeto para la vista y maneja los eventos |
| Vista | `templates/admin/asignacion-donaciones.hbs`<br>`templates/entidad/donaciones-asignadas.hbs`<br>`templates/entidad/donacion-detalle.hbs` | Solo HTML con huecos. Sin cálculos |
| Componentes propios | `templates/partials/asignacion/ranking-panel.hbs`<br>`.../candidato-entidad.hbs`<br>`.../fila-donacion-deposito.hbs`<br>`.../timeline-estados.hbs` | Piezas reutilizables del flujo |
| Router | `js/app.js` | **Solo** registrar las rutas nuevas, sin lógica |

Cada flujo tiene su servicio y sus controladores en archivos separados, para que 8 personas no editen el mismo `app.js` (que hoy tiene 708 líneas).

## B.6 Patrones aplicados

| Patrón | Dónde | Para qué |
|---|---|---|
| **Lista y detalle** (master-detail) | Lista de pendientes y panel de ranking | Procesar la cola sin cambiar de pantalla |
| **La URL guarda el estado de la vista** | Página, filtros y donación abierta | Funcionan "atrás", los links directos y la recarga |
| **Paginado en el servidor** | Ambas listas | Rendimiento con muchos datos |
| **Acciones según el estado** | Botones por fila | Solo se muestra lo que se puede hacer en ese estado |
| **Confirmar antes de una acción destructiva** | Modales de asignar y vencer | Las dos acciones no se pueden deshacer |
| **Actualización pesimista y recarga** | Después del `PATCH` | Consistencia cuando hay concurrencia |
| **Delegación de eventos** (`data-action`) | Botones de las filas | Ya se usa en `app.js`. Un solo listener sobrevive a cada re-render |
| **Cancelar pedidos viejos** | Panel de ranking | Que la respuesta de una donación anterior no pise la actual |
| **Revelar de a poco** | En la lista va la sugerencia principal; el ranking completo, en el panel | Menos información de entrada |
| **Rutas protegidas por rol** | Cada ruta | Coherente con lo que valida el backend |

## B.7 Componentes

**Partials comunes** (ya los aprobó el grupo y el flujo 5 los usa):
`status-tag`, `data-table` (pasa a tarjetas en celular), `paginacion`, `empty-state`, `skeleton`, `confirm-dialog`, `toast`, `filtros`.

**Partials propios del flujo 5:**

| Partial | Recibe | Notas |
|---|---|---|
| `fila-donacion-deposito` | Una `DonacionPendienteDTO` | Fila en desktop y tarjeta en celular. Acciones según el estado del ranking |
| `ranking-panel` | Un `RankingDonacionDTO` | Elige entre una lista o dos columnas según `tieneCoincidencias` |
| `candidato-entidad` | Un ítem del ranking | Posición, nombre, motivo y botón "Asignar" |
| `timeline-estados` | `historialEstados` | Lista ordenada (`<ol>`) con estado y fecha. Contempla la rama de entrega fallida |

**Helpers de Handlebars** que hacen falta:
- `statusLabel`: hoy le falta `VENCIDA`;
- `formatFecha`;
- `diasParaVencer`: "vence en 3 días", "venció hace 2 días";
- `etiquetaLista`: el tipo de lista en lenguaje humano;
- `etiquetaRanking`: Coincide / Sin coincidencia / Pendiente.

## B.8 Requisitos de UI/UX de la entrega 6

| Requisito | Cómo lo cumple el flujo 5 |
|---|---|
| Usabilidad y curva de aprendizaje mínima | Una tarea por vista, acciones visibles según el estado, lenguaje del dominio ("Asignar", no "Cambiar estado") |
| Navegación de máximo 3 niveles | Inicio › Asignación › Panel. Los modales no suman nivel |
| Patrones conocidos (Material Design / Apple HIG) | Lista con detalle, chips de estado, diálogos de confirmación, paginado clásico |
| Microcopy, tooltips, placeholders, ayudas | Texto de "Último cálculo", motivo en cada entidad, tooltip de las etiquetas de ranking, consecuencias explicadas en los modales, ayuda para el caso sin coincidencias |
| Notificaciones no intrusivas | Toasts de éxito y error, banner con reintento, modales de confirmación |
| Indicadores si tarda más de 300 ms | Skeleton en la lista y en el panel. Botón "Asignando…" deshabilitado mientras espera |
| Responsive | La tabla pasa a tarjetas, el panel a pantalla completa, el paginado se reduce. Breakpoint de 768 px |
| Sin superposición en ningún dispositivo | El panel nunca tapa la lista en desktop: es una columna, no un overlay |
| WCAG AA | `<table>` con `<th scope>`; el panel como `<aside aria-labelledby>`; modal con `role="dialog"`, `aria-modal`, foco atrapado y Esc; toasts con `aria-live="polite"`; paginado con `<nav aria-label="Paginación">` y `aria-current="page"`; estados con texto además de color; contraste AA en los chips |
| Áreas táctiles de 48×48 px | Botones de fila con texto, sin íconos sueltos. Altura mínima de 48 px con el token común |
| Tokens visuales unificados | Solo se usan los tokens y partials comunes |

## B.9 Decisiones para bajar la carga cognitiva

- La vista del admin muestra **solo lo que se puede hacer** (las donaciones en depósito). El historial y otros estados no están ahí.
- La fila muestra **una sola sugerencia**. El ranking completo aparece **solo cuando se pide**.
- Se ordena por urgencia (vencimiento), así que el admin no tiene que buscar qué conviene asignar primero.
- Cada sugerencia explica **por qué** se sugiere, y el admin no tiene que deducir el criterio del algoritmo.
- Los nombres de los algoritmos se muestran en lenguaje humano ("Prioridad a entidades menos atendidas"), nunca como `PRIORIDAD_SUBATENDIDOS`.
- No se muestran porcentajes inventados.
- La entidad ve **solo lo suyo**, con el vocabulario real de los estados y una línea de tiempo en lugar de una tabla de cambios.
- Los mismos modales se usan desde el inicio y desde la vista, así que el usuario aprende una sola forma de asignar o vencer.

## B.10 Orden de trabajo en el frontend

1. [ ] `asignaciones-service.js` y los helpers (`statusLabel` con `VENCIDA`, fechas, etiquetas).
2. [ ] Vista `asignacion-donaciones`: lista paginada, filtros y estado en la URL, con skeleton, estados vacíos y errores.
3. [ ] Panel de ranking (`ranking-panel` y `candidato-entidad`), con cancelación de pedidos viejos.
4. [ ] Modales de asignar y marcar vencida, con toasts y manejo del 409.
5. [ ] Bloques del inicio del admin, reutilizando los modales.
6. [ ] Vista de entidad `donaciones-asignadas` y los bloques de su inicio.
7. [ ] Detalle de donación con `timeline-estados` y el lugar para los botones de los flujos 6 y 7.
8. [ ] Pasada de accesibilidad (solo teclado, lector de pantalla, contraste) y de responsive (360 px, 768 px, 1280 px).
