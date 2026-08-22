# Instructivo de uso de BarberApp

Este instructivo explica para qué sirve cada página del sistema y cómo se usa en el trabajo diario de la barbería.

## Ingreso al sistema

La página de ingreso permite acceder al panel con email y contraseña. Cada usuario entra con su propio rol, por eso puede ver distintas opciones según sea administrador, barbero o superadministrador.

Desde esta pantalla también se puede solicitar un cambio de contraseña si el usuario la olvidó. El sistema envía un email con un enlace para crear una nueva contraseña.

## Activación de cuenta

Cuando se crea un usuario nuevo, recibe una invitación por email. Al abrirla, el sistema muestra una página para establecer la contraseña.

Esta pantalla sirve para activar la cuenta por primera vez o para completar un cambio de contraseña. Una vez guardada la contraseña, el usuario puede ingresar normalmente al panel.

## Panel principal

El panel principal organiza todas las secciones del sistema. En computadora se navega desde el menú lateral, y en celular desde la barra inferior y el menú de más opciones.

El menú cambia según el rol del usuario:

- Administrador: puede gestionar turnos, barberos, servicios, productos, caja, WhatsApp, solicitudes y configuración.
- Barbero: ve su panel operativo y su cuenta.
- Superadministrador: administra las barberías dadas de alta en la plataforma.

## Turnos

La página de Turnos es la agenda principal de la barbería. Sirve para cargar nuevos turnos, ver los turnos existentes, buscar clientes y controlar el estado de cada reserva.

Desde esta pantalla se puede:

- Crear un turno indicando cliente, teléfono, servicio, barbero, fecha y hora.
- Filtrar turnos por nombre de cliente o por fecha.
- Cambiar el estado del turno: pendiente, confirmado, completado o cancelado.
- Editar datos del turno si hubo un cambio de horario, servicio o barbero.
- Eliminar un turno cuando ya no corresponde.
- Registrar pagos asociados al turno.
- Agregar productos vendidos dentro del turno.

Los turnos muestran también el estado de pago, por ejemplo sin pagar, con seña, parcial o pagado. Esto ayuda a saber rápidamente qué falta cobrar.

## Barberos

La página de Barberos sirve para administrar el equipo de trabajo de la barbería.

Desde esta pantalla se puede:

- Agregar un barbero con nombre, teléfono y email.
- Enviar o reenviar la invitación para que el barbero cree su contraseña.
- Ver la lista de barberos registrados.
- Eliminar un barbero cuando ya no trabaja en la barbería.
- Configurar los horarios de atención semanales de cada barbero.
- Cargar excepciones, como feriados, vacaciones o días con horario especial.

La configuración de horarios es importante porque el sistema usa esa información para ofrecer horarios disponibles al crear turnos.

## Servicios

La página de Servicios permite configurar lo que vende la barbería.

Está dividida en dos partes:

- Servicios: cortes, barba, color, combos u otros trabajos que se realizan durante un turno.
- Productos: artículos que se pueden vender al cliente, como ceras, shampoos, aceites o accesorios.

Desde esta pantalla se puede:

- Agregar servicios con su precio.
- Editar el nombre o precio de un servicio.
- Eliminar servicios que ya no se ofrecen.
- Agregar productos con precio de venta, costo, stock y stock mínimo.
- Editar productos existentes.
- Marcar productos como inactivos.
- Detectar productos con stock bajo.

Los servicios se usan al crear turnos. Los productos se pueden sumar luego al cobro del turno.

## Cola

La página de Cola sirve para manejar clientes que llegan sin turno reservado.

Desde esta pantalla se puede:

- Agregar un cliente a la cola de espera.
- Ver cuántos clientes están esperando.
- Ver qué barberos están libres y cuáles están atendiendo.
- Llamar al siguiente cliente cuando un barbero queda disponible.
- Marcar que un barbero terminó una atención.

La cola se actualiza en tiempo real, por eso ayuda a organizar la atención del local durante el día.

## Facturación

La página de Facturación reúne la información económica de la barbería. Sirve para cobrar, revisar movimientos, controlar la caja y analizar resultados.

Desde esta pantalla se puede filtrar por período usando fecha desde y fecha hasta.

La sección incluye varias vistas:

### Caja

Muestra los pagos registrados en el período seleccionado. Permite controlar cuánto se cobró por cada método de pago, cargar el monto contado y ver si hay diferencias.

También permite:

- Copiar un resumen de caja.
- Exportar movimientos en CSV.
- Cerrar caja.
- Ver el historial de cierres.
- Anular un cierre si fue necesario corregirlo.

### Cobrar

Muestra turnos completados pendientes de cobro. Desde ahí se puede registrar un pago indicando monto, método, tipo de pago y una nota opcional.

### Análisis

Muestra reportes para entender el rendimiento de la barbería:

- Total facturado.
- Productos vendidos.
- Cantidad de pagos o turnos completados.
- Ticket promedio.
- Barbero con mayor aporte.
- Ranking por barbero.
- Ranking por servicio.
- Ranking por método de pago.
- Ranking por producto.
- Reparto por barbero.

### Movimientos

Lista todos los pagos registrados. Desde esta vista se puede revisar cada movimiento y anular un pago si hubo un error.

## WhatsApp

La página de WhatsApp muestra el estado de conexión del canal de mensajes.

Según la configuración de la barbería, puede funcionar de dos maneras:

- WhatsApp Web con QR: el usuario escanea un código QR para conectar el teléfono.
- Cloud API: la conexión se configura desde el panel de SuperAdmin y no requiere QR.

Desde esta pantalla se puede ver si WhatsApp está conectado, sin conectar, reconectando o con error. Si usa QR, también permite iniciar o renovar la conexión.

## Solicitudes WhatsApp

La página de Solicitudes WhatsApp funciona como una bandeja de pedidos recibidos por mensajes.

Sirve para revisar solicitudes antes de convertirlas en turnos reales.

Desde esta pantalla se puede:

- Filtrar solicitudes por estado: pendientes, en revisión, resueltas, descartadas o todas.
- Buscar por cliente, teléfono, servicio o profesional.
- Ver qué datos pidió el cliente.
- Detectar si faltan datos para poder agendar.
- Crear un turno a partir de una solicitud completa.
- Marcar una solicitud como en revisión.
- Descartar una solicitud.

Cuando una solicitud ya fue agendada, el sistema la muestra como turno registrado.

## Configuración

La página de Configuración contiene los datos generales de la barbería.

Desde esta pantalla se puede ver y editar:

- Nombre de la barbería.
- Teléfono del administrador.
- Número de WhatsApp.
- Estado de la barbería.

También muestra las notificaciones activas del sistema, como recordatorios y confirmaciones al cliente.

## Mi cuenta

La página Mi cuenta muestra los datos del usuario que inició sesión.

Desde esta pantalla se puede:

- Ver nombre, email, rol e identificador de usuario.
- Ver la barbería asociada.
- Revisar permisos de acceso.
- Enviar un link para cambiar la contraseña.
- Cerrar sesión.

Es una sección útil para confirmar con qué usuario se está trabajando y gestionar la seguridad de la cuenta.

## Mi Panel

Mi Panel es la pantalla principal para usuarios con rol de barbero.

Está pensada para el trabajo operativo del día. El barbero puede ver su próximo cliente y sus turnos de hoy.

Desde esta pantalla se puede:

- Ver si el próximo cliente viene de un turno reservado o de la cola de espera.
- Marcar una atención como terminada.
- Registrar el servicio y precio cuando el cliente viene desde la cola.
- Consultar la lista de turnos del día con hora, cliente, servicio y estado.

Esta vista evita que el barbero tenga que usar todas las secciones administrativas.

## Panel SuperAdmin

El Panel SuperAdmin es una sección interna para administrar barberías dentro de la plataforma.

Desde esta pantalla se puede:

- Crear una nueva barbería.
- Crear el usuario administrador de esa barbería.
- Activar o desactivar barberías.
- Ver el estado de configuración de WhatsApp.
- Cargar datos de WhatsApp Cloud API.

Esta pantalla no es para el uso diario de una barbería, sino para la administración general del sistema.

## Recomendación de uso diario

Para una barbería, el flujo habitual sería:

1. Configurar servicios, productos y barberos.
2. Cargar los horarios de cada barbero.
3. Crear turnos desde la agenda o recibir solicitudes por WhatsApp.
4. Usar la cola para clientes sin reserva.
5. Marcar turnos como completados al finalizar la atención.
6. Registrar pagos desde Turnos o Facturación.
7. Cerrar caja al final del día.
8. Revisar reportes para analizar ventas y rendimiento.
