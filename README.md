# Mi Barbería — app de reservas

App para una **peluquería o barbería**: los clientes reservan su hora en segundos y ven sus estadísticas, y el administrador gestiona la agenda, los clientes y el negocio. Todo se actualiza **en tiempo real** en todos los móviles y se puede **instalar como app**.

Está hecha con HTML, CSS y JavaScript, sin compilación, se aloja en **GitHub Pages** y guarda los datos en **Firebase**.

## ✨ Funciones

### Clientes
- **Reserva en 4 pasos:** servicio, barbero (o "sin preferencia"), día y hora. Solo se ven los huecos libres de verdad y es imposible que dos personas reserven la misma hora.
- **Cuenta atrás** en directo hasta la próxima cita, botón de **añadir al calendario** y cancelación (hasta X horas antes).
- **Mi estilo:**
  - Cortes de este mes y gráfica de cortes por mes.
  - Gasto del año, servicio y barbero favoritos y cada cuántos días te cortas.
  - **"Según tu ritmo, te toca el día X"**.
- **Tarjeta de fidelidad** con sellos: cada N cortes, uno gratis.
- **Galería de cortes** con la foto que sube la barbería y el botón **"Quiero este mismo"**.
- **Valoración** con estrellas, **"Repetir mi último corte"**, promociones y avisos.

### Administrador
- Una sola cuenta: se crea como cuenta normal y en **Perfil → Soy el administrador** se introduce la **súper contraseña**. Las reglas de Firebase solo guardan su huella SHA-256 y no se puede crear un segundo administrador.
- **Agenda** por días: cita en curso, ingresos previstos y ocupación. Desde cada cita se puede completar, marcar "no vino", cancelar o subir la foto del corte.
- **Panel con gráficas:**
  - Ingresos por mes.
  - Reservas de los últimos 14 días.
  - Horas punta y días más fuertes.
  - Servicios más pedidos e ingresos por barbero.
  - Valoración media, porcentaje de clientes que no se presentan y últimas opiniones.
- **Clientes:** buscador, ficha con historial, gasto, ritmo, **notas privadas** y acceso directo a WhatsApp.
- **Reservas manuales** para quien llama por teléfono o entra sin cita.
- **Ajustes:**
  - Servicios y precios, con plantilla de servicios típicos.
  - Barberos con color, foto y días de trabajo.
  - Horario partido y días cerrados.
  - Logo, dirección, Instagram, número de sellos de fidelidad, plazo de cancelación y antelación mínima.
- **Promociones:** se envían como notificación a todos los clientes.

### Notificaciones
- **En la app** (estilo Dynamic Island) y **del sistema** mientras la app está abierta o en segundo plano.
- **Push con la app cerrada y recordatorios automáticos** (la víspera y 2 horas antes) mediante las funciones de `functions/`. Requiere activarlas (ver más abajo).

## 🚀 Puesta en marcha
1. **GitHub Pages:** Settings → Pages → Deploy from a branch → rama y carpeta `/ (root)`.
2. **Firebase:** Authentication con correo y contraseña activado, Firestore creado y el contenido de [`firestore.rules`](firestore.rules) pegado en Firestore → Reglas → Publicar.
3. La configuración de Firebase está en [`js/config.js`](js/config.js).
4. Entra en la app, crea tu cuenta y ve a **Perfil → Soy el administrador**.

### Activar push con la app cerrada (opcional)
1. Firebase → **Configuración del proyecto → Cloud Messaging → Certificados push web → Generar par de claves**. Copia la clave en `vapidKey` de `js/config.js`.
2. Cambia el proyecto al plan **Blaze** (pago por uso, con cuota gratuita amplia; una barbería normalmente no paga nada).
3. Despliega las funciones y las reglas desde [Google Cloud Shell](https://shell.cloud.google.com):
   ```bash
   git clone -b claude/visvet-veterinary-social-network-r6q3zy https://github.com/pereizel06/VisvetIG.git
   cd VisvetIG/functions && npm install && cd ..
   npx firebase-tools deploy --only functions,firestore:rules --project visvet-62c75
   ```
En iPhone, las notificaciones push solo funcionan con la app **añadida a la pantalla de inicio** (iOS 16.4 o posterior).

## 🗂️ Estructura
```
index.html, manifest.webmanifest, sw.js   App instalable + push en segundo plano
css/app.css                               Estética «Liquid Glass»
js/config.js                              Configuración de Firebase
js/app.js                                 Pantallas y lógica (cliente y administrador)
js/backend.js                             Datos en Firebase en tiempo real
js/ui.js                                  Iconos, avisos, hojas, confeti…
firestore.rules                           Reglas de seguridad (incluye la súper contraseña cifrada)
functions/                                Push y recordatorios automáticos
```
