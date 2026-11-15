# 🐾 Visvet — la red social veterinaria

**Visvet** es una red social al estilo Instagram pensada para el mundo veterinario: los **veterinarios** comparten consejos y casos clínicos y gestionan su agenda, y los **clientes** (dueños de mascotas) siguen a su veterinario, comparten fotos de sus mascotas y piden cita.

Es una web **100 % estática** (HTML + CSS + JavaScript, sin servidor ni compilación), así que se puede alojar gratis en **GitHub Pages**.

---

## ✨ Funcionalidades

### Para todos
- **Registro e inicio de sesión** eligiendo el tipo de cuenta: *Veterinario/a* o *Cliente*.
- **Inicio (feed)** con las publicaciones de la gente a la que sigues.
- **Historias** de 24 h con barra de progreso, respuestas por mensaje y contador de vistas.
- **Publicaciones** con foto, descripción, `#hashtags` y `@menciones`.
- **Me gusta** (también con doble toque sobre la foto), **comentarios**, **guardar** y **compartir** por mensaje.
- **Categorías**: 💡 Consejo veterinario, 🩺 Caso clínico, 🐾 Mi mascota, 🏡 Adopción, 🚨 Aviso/Urgencia, ✨ Antes y después.
- **Explorar**: buscador de publicaciones y hashtags, directorio de veterinarios (filtro por especialidad) y de dueños de mascotas.
- **Perfiles** con seguidores/seguidos, cuadrícula de fotos y publicaciones guardadas.
- **Mensajes directos** privados.
- **Notificaciones** (me gusta, comentarios, nuevos seguidores y citas).
- **Modo oscuro** automático y diseño adaptado a móvil.

### Para veterinarios 🩺
- Insignia de **veterinario verificado** y perfil profesional: clínica, especialidad, nº de colegiado, horario y teléfono.
- Categorías exclusivas: **Consejo veterinario** y **Caso clínico**.
- **Agenda**: recibe solicitudes de cita, confírmalas, recházalas, márcalas como completadas y deja notas para el cliente.

### Para clientes 🐶🐱
- Ficha de **mis mascotas** (nombre, especie, raza y edad).
- **Pedir cita** a cualquier veterinario desde su perfil, desde un chat o desde «Mis citas».
- Seguimiento del estado de cada cita y cancelación.

---

## 🚀 Publicar en GitHub Pages

### Opción A — con GitHub Actions (incluida)
1. Sube este código a la rama `main` de tu repositorio.
2. En GitHub ve a **Settings → Pages**.
3. En **Build and deployment → Source** elige **GitHub Actions**.
4. Cada vez que hagas *push* a `main` se publicará solo. La web quedará en:
   `https://<tu-usuario>.github.io/<nombre-del-repo>/`

### Opción B — sin Actions
1. **Settings → Pages → Source: Deploy from a branch**.
2. Elige la rama (`main`) y la carpeta `/ (root)` y guarda.

---

## 🧪 Probarlo en tu ordenador

No necesita instalar nada. Abre `index.html` en el navegador, o mejor, levanta un servidor local:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

### Cuentas de demostración
Todas usan la contraseña **`demo1234`**:

| Usuario | Tipo |
|---|---|
| `dra.lucia` | Veterinaria (medicina felina) |
| `dr.marcos` | Veterinario (cirugía y traumatología) |
| `vet.exoticos` | Veterinaria (animales exóticos) |
| `ana.y.toby` | Cliente |
| `carlos.michi` | Cliente |
| `refugio.patitas` | Cliente (protectora) |

En **Configuración → Restablecer datos de demostración** puedes volver al estado inicial.

---

## 🔥 Firebase: convertirla en una red social real

Visvet tiene **dos modos**:

| | Modo demo (por defecto) | Modo Firebase |
|---|---|---|
| Dónde se guardan los datos | En el navegador de cada persona | En la nube (Firebase), compartidos |
| ¿Ves lo que publican otros? | No | **Sí, en tiempo real** |
| Cuentas demo | Sí | No (la red empieza vacía) |
| Inicio de sesión | Usuario o correo | Correo + recuperación de contraseña |

El modo se elige solo: si `js/firebase-config.js` está vacío → demo; si tiene tu configuración → Firebase. Todo es **gratis** con el plan *Spark* de Firebase (no hace falta tarjeta).

### Paso a paso (unos 10 minutos)

1. **Crea el proyecto**: entra en <https://console.firebase.google.com> → *Crear un proyecto* → nombre `visvet` → puedes desactivar Google Analytics → *Crear*.
2. **Activa el registro con correo**: menú *Compilación → Authentication* → *Comenzar* → pestaña *Método de acceso* → *Correo electrónico/contraseña* → activar → *Guardar*.
3. **Autoriza tu web**: en *Authentication → Configuración → Dominios autorizados* → *Agregar dominio* → `pereizel06.github.io` (tu usuario de GitHub seguido de `.github.io`).
4. **Crea la base de datos**: *Compilación → Firestore Database* → *Crear base de datos* → ubicación `eur3 (europe-west)` → *Iniciar en modo de producción* → *Crear*.
5. **Pega las reglas de seguridad**: en Firestore, pestaña *Reglas* → borra lo que haya → pega el contenido del archivo [`firestore.rules`](firestore.rules) → *Publicar*.
6. **Registra la app web**: ⚙️ *Configuración del proyecto* → *Tus apps* → icono **`</>`** (Web) → apodo `Visvet` (sin marcar Firebase Hosting) → *Registrar app*. Copia el bloque `firebaseConfig` que aparece.
7. **Pega la configuración** en [`js/firebase-config.js`](js/firebase-config.js), sustituyendo `null`:
   ```js
   window.VISVET_FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "visvet-xxxx.firebaseapp.com",
     projectId: "visvet-xxxx",
     storageBucket: "visvet-xxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
   Guarda el cambio en GitHub y espera 1–2 minutos a que se publique.

> Estos datos **no son secretos**: Firebase está diseñado para que vayan en la web. Lo que protege la información son las reglas del paso 5.

### Qué protegen las reglas de seguridad
- Solo los usuarios registrados pueden ver contenido.
- Cada persona solo puede editar o borrar **su** perfil, **sus** publicaciones e historias.
- Los mensajes privados solo los leen el emisor y el receptor.
- Las citas solo las ven el cliente y el veterinario implicados; el cliente solo puede cancelarlas y solo el veterinario puede confirmarlas, rechazarlas o completarlas.
- El correo de cada usuario es privado (no se guarda en el perfil público).

### Límites del plan gratuito
- 50.000 lecturas y 20.000 escrituras al día en Firestore, y 1 GB de almacenamiento: de sobra para empezar y para cientos de usuarios activos.
- Las fotos se comprimen y se guardan en Firestore (≈100–300 KB cada una), así que no hace falta Cloud Storage (que ya no es gratuito en Firebase).
- El inicio carga las 300 publicaciones más recientes. Si la red crece mucho, el siguiente paso sería paginar.
- La insignia de veterinario se basa en lo que declara cada usuario al registrarse; para verificar el nº de colegiado de verdad haría falta un proceso de revisión manual.

### Probar con el emulador (opcional, para desarrolladores)
```bash
npm i -g firebase-tools
firebase emulators:start --only auth,firestore --project demo-visvet
```
Y en `js/firebase-config.js` usa `{ apiKey: "x", projectId: "demo-visvet", emulator: true }`.

---

## 🗂️ Estructura

```
index.html                   Página única de la aplicación
css/styles.css               Estilos (tema claro/oscuro, responsive)
js/icons.js                  Iconos SVG
js/store.js                  Datos en modo demo (localStorage)
js/store-firebase.js         Datos en modo Firebase (Authentication + Firestore)
js/firebase-config.js        Tu configuración de Firebase (vacía = modo demo)
js/boot.js                   Elige el modo y arranca la app
js/seed.js                   Datos e ilustraciones de demostración
js/app.js                    Vistas, rutas (#/…) e interacción
firestore.rules              Reglas de seguridad de la base de datos
firebase.json                Configuración del emulador / Firebase CLI
assets/favicon.svg           Icono
.github/workflows/pages.yml  Despliegue automático en GitHub Pages
```
