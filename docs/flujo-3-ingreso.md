# Flujo 3: Ingreso de donaciones (frontend)

Sección del panel de administración. Vive dentro de `/admin/donaciones` como tercera y cuarta pestaña (punto 16 de `coordinacion-flujo-5.md`). Solo rol ADMIN.

| Pantalla | Ruta | Qué hace |
|---|---|---|
| Paso 1: buscar donante | `/admin/donaciones/nueva` | Busca por nombre, DNI/CUIT, razón social o correo (`GET /api/donantes?q=`). |
| Alta de donante | `/admin/donaciones/nueva/donante` (`?tipo=JURIDICA`) | Persona humana o jurídica (`POST /api/donantes`). |
| Paso 2: cargar bienes | `/admin/donaciones/nueva/:donanteId` | Descripción + N bienes (`POST /api/donaciones`). Vista previa de la segmentación. |
| Paso 3: resultado | `/admin/donaciones/nueva/resultado?ids=1,2,3` | Muestra las donaciones que generó la segmentación (`GET /api/donaciones/:id`). |
| Importar CSV | `/admin/donaciones/importar` | `POST /api/donantes/importaciones`, con resumen y tabla de errores. |

## Archivos
Nuevos: `routes/ingreso.js`, `src/services/ingreso-client.js`, `src/lib/ingreso-validacion.js`, `src/lib/ingreso-vista.js`, `src/lib/multipart.js`, `views/admin/ingreso/*.hbs`, `views/partials/ingreso-*.hbs`, `public/css/ingreso.css`, `public/js/ingreso/*.js`, `public/plantillas/donantes-plantilla.csv`, `test/ingreso-*.test.js`.
Modificados (agregados mínimos): `server.js` (monta el router ANTES del de asignaciones) y `views/partials/donaciones-tabs.hbs` (2 pestañas nuevas).

## Decisiones a tener presentes
- La segmentación la hace el backend (agrupa solo por subcategoría). La vista previa del navegador es una estimación con la misma regla.
- Qué campos pide cada bien lo decide la subcategoría: `requiereEstadoUso` → nuevo/usado; `perecedero` → vencimiento; resto → unidad y medida.
- El backend solo guarda el correo como contacto del donante: no hay campo de teléfono en el alta.
- Registrar donación usa timeout de 30 s y la importación 120 s (el normal es 5 s). Si vence el de registro, se avisa que revisen "Todas" antes de reintentar, para no duplicar.
- Depende de `asignaciones-validacion.js` (`leerId`), `asignaciones-vista.js` (`vistaEstado`, `conParametros`), `logistica-format.js` y el parcial `asignaciones-no-disponible.hbs`.
