# Administración de usuarios y disponibilidad

En Administración → Usuarios se pueden crear cuentas, editar sus datos y alias,
cambiar roles, restablecer contraseñas, cambiar/quitar fotos de perfil, activar/desactivar y eliminar.
El filtro de estado permite encontrar también cuentas inactivas.

- Eliminar requiere escribir el nombre completo. Se bloquea si hay jugadores,
  partidos, acciones de marcador, auditoría, fotografías, torneos u otros registros
  históricos relacionados. La respuesta explica el motivo. Los favoritos y códigos
  de recuperación personales se eliminan con una cuenta sin historial.
- Desactivar conserva todos los registros y revoca las sesiones de esa cuenta.
  Reactivar no vuelve a validar sus tokens anteriores: debe iniciar sesión de nuevo.
- Un administrador no puede eliminarse, desactivarse o degradar su propio rol.
  Las operaciones bloquean los administradores activos dentro de una transacción
  para evitar cambios concurrentes que dejen la plataforma sin administrador.
- Restablecer una contraseña invalida sesiones y códigos de recuperación pendientes.
  Nunca se muestra la contraseña existente. El administrador también puede
  restablecer la propia: tendrá que volver a iniciar sesión después.
- Estas acciones solo están disponibles para administradores, también en la API;
  un Juez Director no recibe acceso de administración de usuarios.

## Miembros sin correo ni cédula

Las nuevas cuentas de miembros se crean con nombres, apellidos, usuario único
y contraseña. Celular, correo y cédula son opcionales y se guardan como NULL,
no como documentos o correos inventados. Administradores y jueces siguen
necesitando correo y documento al crearse, pero un administrador también puede
guardar su celular y luego ingresar con usuario, correo, celular o documento
en el acceso general. Un miembro existente con documento puede
conservar su acceso por documento aunque no tenga celular.

El login general tiene un único campo «Ingresa tu usuario, correo o celular» para
miembros y administradores, sin radios ni selección de tipo de dato. También
reconoce el documento de cuentas existentes por compatibilidad. Si el dato coincide
con dos personas distintas, no elige una: debe usarse un identificador sin conflicto.
El enlace «Ingresar como juez» cambia el formulario en la misma página a usuario
y contraseña para jueces y juez director; «Volver al ingreso general» lo restaura.
El backend aplica la separación de roles para los nuevos modos general/juez.
Los modos antiguos de API se conservan por compatibilidad con clientes anteriores.
El celular siempre requiere contraseña: no es una verificación por SMS.
Sin correo, la recuperación se solicita al administrador.

Se aceptan 10 dígitos colombianos, +57 y 0057. Un celular de acceso no puede
pertenecer a dos cuentas de acceso general (miembro o admin), incluidos inactivos,
ni coincidir con el documento o usuario de otra cuenta. Si ya había números compartidos
o inválidos, no se asigna arbitrariamente una cuenta: el admin puede asignar un
usuario de acceso o corregir el celular. El documento anterior sigue
funcionando. No se importan formularios ni se crean cuentas automáticamente.

El arranque hace opcionales `users.email` y `users.numero_documento` y añade
`users.telefono_acceso` con índice único. Inicializa los números históricos
válidos y no repetidos; no cambia los números de contacto originales.
Los cambios de celular en Mi perfil o en Administración actualizan ese acceso.
No se requieren nuevas variables de entorno.

### Jugador al crear una cuenta de miembro

El formulario permite no vincular jugador, seleccionar uno activo sin cuenta o
crear uno nuevo. Al seleccionar un jugador se copian sus nombres en la cuenta;
no se alteran su foto, estadísticas ni partidos. El jugador nuevo utiliza los
nombres de la cuenta, deporte (tenis por defecto) y categoría opcional.

Cuenta y vinculación/creación se guardan dentro de una transacción. Si algo falla,
no queda una cuenta huérfana. Se bloquea el jugador seleccionado mientras se guarda
y no se puede quitarle silenciosamente la cuenta que ya tenía. Si ya existe un
jugador con el mismo nombre completo, se pide revisar el existente; los homónimos
reales pueden crearse de forma explícita desde Jugadores y seleccionarse después.
La vinculación identifica una persona existente por ID, no se adivina por su nombre.

En el editor de cuenta hay un enlace a la administración general de partidos.
El administrador puede gestionar todos, sin depender del juez asignado; las
validaciones que preservan el marcador y el historial se mantienen.

## Sesiones y despliegue

`useHealthCheck` ya no llama a logout. Los fallos de red/servidor generan un aviso
tras dos fallos, con reintentos espaciados y sin solicitudes simultáneas. Se evita
consultar con la pestaña oculta y se reintenta cuando vuelve la conexión.
Un error temporal de base de datos durante la verificación devuelve 503, no 401.
Los tokens realmente expirados, cuentas inactivas o sesiones revocadas siguen
siendo rechazados con 401.

Al iniciar el backend, `ensureSchema` añade `users.session_version` si no existe
(entero con valor inicial 0). No exige nuevas variables de entorno ni ejecuta
borrados. Los tokens anteriores sin este campo se consideran versión 0 y siguen
siendo válidos hasta su expiración o una revocación explícita. Se requiere el permiso
ALTER habitual de las migraciones de esta aplicación.

## Verificación local

- `npm test` desde `scores-api` (base de datos simulada).
- `npm run build` desde `scores-app`.
- `scripts/qa-users.cjs`: navegador con API simulada, servidor frontend en puerto
  4175; recibe como argumento la ruta de Playwright si no está instalado localmente.
  Comprueba móvil/escritorio, edición, contraseña, estado, eliminación bloqueada
  y conservación de sesión durante fallos de health. No usa la base de producción.

## Actividad de jugador y oficial

Una cuenta conserva su rol y puede vincular una ficha de jugador, también si es juez, director o administrador. La vinculación puede hacerse al crearla o desde «Editar datos del usuario → Actividad como jugador». Solo administración puede vincular; no se sustituye una ficha ya vinculada ni se toma una ficha de otra cuenta.

«Mi actividad» (`/mi-actividad`) muestra únicamente los partidos de la ficha vinculada a la sesión; «Mesa de juez» conserva sus permisos anteriores. Sin ficha, se indica que debe vincularla administración. La consulta pública del partido y del torneo está disponible también para oficiales. No se introduce otro rol ni se duplican cuentas.

La API rechaza el acceso a control y las operaciones de marcación de un encuentro si la cuenta pertenece a uno de sus participantes, incluidos integrantes de parejas. Otro oficial debe marcarlo. El administrador conserva las herramientas de programación; la consulta del resultado sigue disponible.

Antes de iniciar se confirma una revisión breve de participantes, cancha, formato y primer saque. Un resultado con acciones pendientes o pendiente de sincronizar se identifica como cierre no confirmado. No se modifica el motor ni la cola de puntos.
