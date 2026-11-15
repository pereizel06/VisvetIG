# Visvet

**La app de tu clínica veterinaria.** Una cuenta de administración (**Visvet**, la clínica) y cuentas de clientes. Cada cliente tiene sus animales, y cada animal tiene su **cartilla digital** y su **chat privado** con la clínica.

La app está hecha con HTML, CSS y JavaScript, sin compilación, y se aloja en **GitHub Pages**. Los datos van en **Firebase** (gratis), así que todo se actualiza **en tiempo real** en todos los móviles, como una app normal. También se puede **instalar en el móvil** desde el navegador.

---

## ✨ Qué hace

### Para los clientes
- Registro con correo y contraseña. Recuperación de contraseña por correo.
- Varios animales por cuenta, con foto, especie, raza, sexo, fecha de nacimiento (calcula la edad), microchip, esterilización, alergias y notas.
- **Cartilla digital** de cada animal: diagnósticos, vacunas, facturas, analíticas, recetas, radiografías, informes… con los PDF y fotos que suba la clínica, y un visor dentro de la app.
- **Chat privado con la clínica para cada animal**, con fotos y documentos adjuntos, confirmación de "Visto" y avisos de mensajes nuevos.
- **Salud**: gráfica de peso, estado de las vacunas (al día, próxima o vencida) y alergias.
- Recordatorios de **próximas vacunas** y **pagos pendientes** en el inicio.
- **Citas**: se piden desde la app, la clínica las confirma y se pueden añadir al calendario del móvil (.ics).
- Datos de contacto, horario y teléfono de urgencias de la clínica.

### Para la clínica (cuenta admin «Visvet»)
- **Panel** con mensajes sin leer, citas por confirmar, clientes, animales y total pendiente de cobro.
- **Bandeja de mensajes** con todos los chats ordenados, respuestas rápidas y adjuntos.
- **Clientes**: buscador por nombre, teléfono, animal o microchip, y ficha de cada cliente con sus animales.
- **Adjuntar a la cartilla** de cada animal cualquier documento: diagnóstico, vacuna (con fecha de la próxima dosis), factura (con importe y estado pagada o pendiente), analítica, receta, imagen o Rx, informe u otro, con varios archivos de hasta 10 MB.
- **Agenda** por días: confirmar, rechazar o completar citas, añadir notas para el cliente y crear citas.
- **Ajustes**: datos de la clínica que ven los clientes.

### Estética
Inspirada en iOS 26 ("Liquid Glass"):
- Cristal translúcido sobre un fondo de color en movimiento, con brillos que siguen al cursor.
- Barra de pestañas flotante.
- Hojas que suben desde abajo y se cierran deslizando.
- Avisos tipo "Dynamic Island".
- Transiciones animadas entre pantallas.
- Tarjetas que se inclinan en 3D.
- Confeti, contadores animados y modo oscuro automático.

---

## 🚀 Puesta en marcha

### 1. Publicar en GitHub Pages
1. En el repositorio: **Settings → Pages**.
2. **Source: Deploy from a branch**. Elige la rama y la carpeta `/ (root)` y pulsa **Save**.
3. La app quedará en `https://<usuario>.github.io/<repositorio>/`.

### 2. Conectar la base de datos (Firebase, gratis, unos 10 minutos)
1. Crea un proyecto en <https://console.firebase.google.com>. Analytics no hace falta.
2. **Authentication → Comenzar → Correo electrónico/contraseña → Habilitar**.
3. **Authentication → Configuración → Dominios autorizados →** añade `<usuario>.github.io`.
4. **Firestore Database → Crear base de datos → modo producción**. La ubicación `eur3` está bien.
5. **Firestore → Reglas**: pega **tal cual** el contenido de [`firestore.rules`](firestore.rules) y pulsa **Publicar**.
6. **⚙ Configuración del proyecto → Tus apps → `</>` (Web)**: registra la app y copia el bloque `firebaseConfig` en [`js/config.js`](js/config.js), en `firebase:`.

### 3. Crear la cuenta de la clínica
Abre la app. Como todavía no hay clínica, aparece **«Configura tu clínica»**. Escribe el nombre de la clínica, el correo y la contraseña. Esa cuenta queda como **administradora** y nadie más podrá crear otra.

Después comparte el enlace con tus clientes: cada uno crea su cuenta, añade a sus animales y ya puede escribiros.

Todo funciona con el **plan gratuito (Spark)**. Los documentos se guardan troceados en Firestore, así que no hace falta Cloud Storage.

---

## 🔒 Seguridad (reglas de Firestore)
- Solo la primera cuenta de clínica creada desde la app tiene permisos de administración, y no se puede crear una segunda.
- Cada cliente solo ve sus animales, sus chats, sus citas y sus documentos.
- La cartilla solo la puede modificar la clínica. El cliente solo la lee.
- El cliente solo puede cancelar sus citas; confirmar, rechazar o completarlas es cosa de la clínica.

## 🗂️ Estructura
```
index.html               Página de la app
manifest.webmanifest     Instalación como app (PWA)
sw.js                    Service worker (abre al instante)
css/app.css              Estilos «Liquid Glass»
js/config.js             Configuración de Firebase
js/app.js                Pantallas, navegación y lógica
js/ui.js                 Iconos, avisos, hojas, archivos, confeti…
js/backend/firebase.js   Datos en Firebase (tiempo real)
firestore.rules          Reglas de seguridad
firebase.json            Emulador local de Firebase (desarrollo)
```

## 🧪 Desarrollo local
```bash
python3 -m http.server 8000      # y abre http://localhost:8000
```
Para probar con Firebase en local:
```bash
npx firebase-tools emulators:start --only auth,firestore --project demo-visvet
```
En `js/config.js` pon `firebase: { apiKey: 'x', projectId: 'demo-visvet', emulator: true }`.
