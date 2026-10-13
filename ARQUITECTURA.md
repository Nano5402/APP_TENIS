# Organización incremental de la aplicación

Se conserva React/Vite + Express/MySQL y el despliegue de Hostinger. No se cambian las rutas de acceso, el motor de puntuación ni el almacenamiento persistente de fotografías.

## Responsabilidades

- `pages/`: composición de las pantallas y navegación según el rol.
- `components/layout/ProfileMenu`: identidad y navegación de cuenta; cierre de sesión confirmado por el servidor.
- `components/common/ActionDialog`: ventana accesible compartida (foco, Escape, portal).
- `components/match/ClayCourt`: representación ilustrativa aislada, sin lógica de puntos ni solicitudes al servidor. Se detiene fuera de pantalla, pestaña oculta, pausa y fin de partido; respeta movimiento reducido.
- `components/match/MatchStats`: presentación de estadísticas confirmadas, filtros por set y tabla/gráficas.
- `components/match/MatchAuditButton`: consulta administrativa bajo demanda, paginada; nunca modifica eventos.
- `services/`: contrato HTTP; no guardar credenciales en componentes.
- `scores-api/src/modules/`: validación y lógica de negocio por dominio. Middleware controla los roles también en servidor.
- `matchAudit.service`: lectura de eventos e intervenciones, independiente del motor de puntos.
- `news.service`: creación/edición/eliminación de avisos; actualización conserva identidad. Imágenes anteriores se retiran solo después de confirmar la transacción.

## Primera etapa: integración selectiva de web tenis (6).zip

Incorporado: avisos públicos con filtros e imágenes, edición real de avisos, acceso al cambio de contraseña desde perfil/configuración, auditoría para admin/director, aviso reciente en panel. Menú de cuenta y diagrama animado añadidos según las referencias, manteniendo la marca propia.

Cambios de seguridad respecto a la propuesta:

- Se ignoran rutas de imágenes enviadas en JSON; solo el servidor asigna rutas de archivos procesados. Imágenes redecodificadas a WebP, sin metadatos, con límite de píxeles y tamaño de subida existente.
- Cambio de contraseña exige contraseña actual, complejidad y límite de bcrypt; revoca sesiones y códigos de recuperación en una transacción, y detecta cambios concurrentes.
- Auditoría requiere sesión y rol admin/director. Trae hasta 100 eventos por página y las últimas 100 intervenciones (indica si hay más).
- No se incorporaron `.env`, claves VAPID ni scripts de ejecución del ZIP.
- No se importó el cambio global que interpreta toda fecha SQL como UTC: hay que distinguir fecha/hora de programación local de los instantes reales antes de cambiarlo.

## Segunda etapa acordada

Tickets y notificaciones (internas/push/recordatorios) NO se activan en esta entrega. Antes de integrarlos: validar propiedad de tickets/partidos y notificaciones, autenticar suscripciones, limitar destinos push para evitar SSRF, límites de carga, consentimiento y baja por usuario, deduplicación persistente de envíos, reintentos y zona horaria explícita. No usar el envío de notificaciones en la ruta crítica de anotación de puntos.

## Despliegue

### Auditoría de ediciones administrativas

Las ediciones generales y de participantes requieren `expected_control_version`, tomada al abrir el formulario. Se compara con la fila bloqueada antes de escribir; una versión ausente o desactualizada devuelve 409 sin cambios. Las ediciones de nombres visibles también incrementan la versión y guardan su auditoría. La edición general no permite sustituir participantes/orígenes ni cambiar el estado de partidos iniciados o cerrados; se mantienen las acciones supervisadas del director. Desplegar backend y frontend coordinadamente y recargar las sesiones antiguas: los formularios de versiones previas serán rechazados por seguridad hasta actualizarse.

El arranque crea `auditoria_ediciones` de forma aditiva, sin borrar datos ni claves foráneas hacia los registros auditados. Desplegar primero el backend y esperar a que complete la migración, después el frontend. No ejecutar scripts de limpieza. El historial `/admin/auditoria` y su API son exclusivos para administradores.

Se registran diferencias de las ediciones de partidos (incluidos participantes, horario, cancha, juez y configuración), torneos, distribución de grupos y marcador manual. Se usan listas explícitas de campos; no se almacenan contraseñas, tokens ni cuerpos completos de solicitudes. El actor proviene de la sesión del servidor. Los valores anterior/nuevo y la edición se guardan en la misma transacción: un fallo de auditoría revierte la edición. Guardar valores sin cambios no añade entradas. Las intervenciones del director mantienen su auditoría existente. Esta cobertura no incluye todas las entidades de la plataforma ni reconstruye cambios anteriores al despliegue; el historial no permite revertir automáticamente.

### Archivo reversible de torneos

El arranque añade `torneos.archivado_at` (nullable) y `auditoria_archivo_torneos`. Archivar/restaurar requiere administrador y guarda la marca y su auditoría en una transacción. No modifica el estado deportivo, partidos, inscripciones, fotos ni jugadores; no es un cierre ni una suspensión. Se mantiene la eliminación definitiva existente. La auditoría de archivo no tiene claves foráneas para conservarse tras una eliminación.

El listado de torneos omite archivados por defecto; `archivo=archivados` y `archivo=todos` permiten consultarlos. Administración y directorio público tienen filtro de archivo y los enlaces directos siguen funcionando. La edición de un partido existente conserva el torneo archivado. Desplegar backend (con migración completada) y frontend; no ejecutar scripts de limpieza para esta actualización.

La actualización de esquema existente agregará únicamente `anuncios.imagen_url` nullable si no existe. No ejecutar `reset_db.sql`. Imágenes bajo `UPLOAD_DIR/anuncios`; conservar la variable persistente de Hostinger. No se requieren claves nuevas ni dependencias adicionales.
