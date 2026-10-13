# Soporte y notificaciones internas

Esta entrega añade tickets para jueces, jueces directores y administradores. Los jueces consultan únicamente sus solicitudes; administración puede ver las últimas 100 de todos y responder cambiando el estado. Los textos no admiten HTML ejecutable ni archivos adjuntos.

El servidor crea las tablas `tickets_soporte`, `ticket_respuestas` y `notificaciones` mediante la migración existente al arrancar. No borra partidos, usuarios ni otros datos. Se requiere el permiso de creación de tablas que ya utiliza la aplicación. Los tickets y la campana interna no necesitan variables nuevas; push sí requiere las claves descritas abajo.

Cada creación tiene un identificador de reintento; las respuestas requieren la versión vigente. Ticket y aviso se guardan en la misma transacción. Los avisos pertenecen a usuarios concretos y solo su destinatario puede marcarlos como leídos. La campana consulta cada minuto únicamente con la página visible y con conexión, y al abrirse. No agrega consultas a cada punto ni cierra sesiones por una caída temporal de red.

Las solicitudes y respuestas conservan autoría: una cuenta con ese historial debe desactivarse, no eliminarse. Las notificaciones personales por sí solas no impiden borrar una cuenta.

## Alcance de esta etapa

### Agenda y cambios de programación

Administración dispone de `/admin/agenda` y dirección de `/director/agenda`: lista cronológica móvil y columnas por cancha en escritorio, con fecha (Colombia), filtro de cancha y actualización manual. Incluye partidos sin cancha, pero los que no tienen fecha se revisan desde el panel de pendientes.

Los cambios de fecha/hora, cancha, cancelación y suspensión desde mesa de juez generan avisos internos a las cuentas activas vinculadas a los participantes (incluidos ambos integrantes de cada pareja). No se envían motivos privados, correos ni push de estos cambios. En la campana se puede desactivar esta categoría. Guardar sin cambios no vuelve a notificar; aviso y edición se confirman juntos en una transacción. Los jugadores sin cuenta vinculada no reciben avisos.

El arranque añade la tabla `preferencias_avisos` sin modificar registros existentes. Desplegar backend y frontend juntos. No se envían avisos retrospectivos.

- Incluido: solicitudes, historial, respuesta y estado, campana interna para avisos de soporte.
- Incluido: push opcional por dispositivo para avisos de soporte, sujeto a configuración del servidor y permiso del navegador.
- Pendiente: recordatorios de partidos y avisos automáticos de asignación/inicio/finalización.
- El envío requiere conexión. Si falla, el formulario conserva el texto mientras siga abierto y permite reintentar; no es una cola persistente sin conexión.
- La prioridad urgente no sustituye contactar directamente al director del torneo.

## Estadísticas de visitas

- Desplegar API y frontend juntos. Al arrancar, el módulo prepara únicamente sus tablas `analytics_*`; si falla, responde como no disponible sin bloquear la aplicación. No hay importación de visitas anteriores.
- Acceso: **Administración → Visitas**. Cuenta navegaciones de rutas públicas autorizadas, sin parámetros de URL. Excluye cuentas admin/juez/director, rutas privadas, robots reconocidos y preferencias DNT/GPC. Las pantallas se consultan por separado.
- La medición está activa de forma predeterminada, sin solicitud de autorización ni controles visibles para desactivarla. Se conservan las desactivaciones previamente expresadas y se respetan DNT/GPC. El navegador conserva un identificador aleatorio hasta 180 días y una sesión de 30 minutos de inactividad; el servidor guarda hashes, nunca nombres, IP ni el referente completo. Bloqueadores, preferencias previas y fallos de conexión pueden reducir los conteos; no son el total de personas que acceden. El cliente no presenta esta activación automática como consentimiento explícito.
- Vistas incluyen recargas; sesiones cuenta inicios; visitantes distintos se deduplican dentro del rango consultado solo en los últimos 90 días. Para rangos anteriores aparece “no disponible”, nunca una suma incorrecta de únicos diarios. Los rankings muestran hasta 50 resultados. Fechas en hora de Colombia; comparación con el período anterior de igual duración.
- Detalles/identificadores del servidor: 90 días; agregados sin identificadores: 730 días. Limpieza por lotes al iniciar y cada seis horas mientras Node está activo; reintenta cada minuto ante errores o acumulación. No toca datos deportivos. Las copias de seguridad del proveedor tienen una conservación independiente.
- Opcional: definir `ANALYTICS_SECRET` como un secreto aleatorio estable en las variables de la API (nunca `VITE_`). Si no existe se utiliza `JWT_SECRET`; rotar el secreto cambia los hashes y puede aumentar visitantes/sesiones estimados durante el período de transición. No publicar secretos en el repositorio.
- Pruebas aisladas: `node --test scores-api/test/analytics*.test.js` y `scripts/qa-analytics.cjs` con el frontend local en 4173. No iniciar una API conectada a producción para probarlo.

## Activar push en Hostinger

1. En una terminal local, dentro de `scores-api`, ejecuta `npm run push:keys` después de instalar dependencias. Genera las claves una sola vez y guárdalas de forma segura. No ejecutes el comando en los logs del hosting ni compartas la clave privada en chats.
2. Copia las tres variables que imprime en **Environment variables** de Hostinger: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`. La última puede ser `https://legal-branding.com`. Ninguna debe usar el prefijo `VITE_`; únicamente la clave pública se entrega al navegador mediante un endpoint autenticado.
3. Despliega el código y reinicia la aplicación. La migración añade `push_suscripciones` y `push_entregas`. Sin claves válidas, el sitio y la campana interna siguen funcionando; push permanece desactivado.
4. Inicia sesión como juez/director/admin, abre la campana y pulsa **Activar push**. Acepta el permiso. En iPhone/iPad (16.4 o posterior), primero añade la web a la pantalla de inicio y ábrela desde allí. Se requiere HTTPS, salvo desarrollo en localhost.
5. Para probar: activa un dispositivo de administrador, crea un ticket desde otra cuenta de juez con push activo, verifica el aviso del administrador, responde y verifica el aviso del juez. Hazlo también con la página cerrada. Este ensayo real requiere el despliegue y los permisos; las pruebas locales simulan los proveedores.

### Seguridad y operación

- Máximo cinco suscripciones por cuenta, alta/baja autenticada, sin transferir silenciosamente un dispositivo a otro usuario. URLs limitadas a proveedores Google, Mozilla, Apple y Windows; no se permite enviar a URLs arbitrarias. Las claves de suscripción son sensibles: proteger las copias de seguridad de la base de datos.
- La cola se crea junto con el ticket en la misma transacción; el envío ocurre aparte, en lotes de diez, con timeout de ocho segundos, bloqueo por entrega y hasta cuatro intentos espaciados. Usa etiquetas para agrupar reenvíos: la entrega es al menos una vez, no una garantía de entrega exactamente una vez.
- La cola se revisa cada 15 segundos mientras el proceso Node esté activo. Un proceso suspendido por el hosting no puede ejecutar la cola hasta despertar. No es un sistema de emergencia ni garantiza entrega inmediata. Reintenta pendientes recientes después de un reinicio; no envía trabajos de más de un día.
- Suscripciones vencidas/revocadas no se usan; los errores 404/410 del proveedor eliminan la suscripción. El cierre normal de sesión anula la suscripción local incluso si falla la red. Las suscripciones vencen con la sesión que las activó: tras un nuevo ingreso usa **Renovar activación** si hace falta. Cambiar claves VAPID requiere reactivar dispositivos.
- El push no contiene nombres, texto del ticket ni enlaces externos; al pulsarlo abre el inicio seguro y se consulta la campana. El service worker no almacena páginas ni intercepta solicitudes del marcador.
- Se limpian trabajos de más de siete días. Sin configuración VAPID el trabajador no arranca. No se modifican los partidos, fotos ni puntos.

Referencias: [Web Push (biblioteca oficial)](https://github.com/web-push-libs/web-push), [permiso y suscripción](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe), [requisitos de iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
