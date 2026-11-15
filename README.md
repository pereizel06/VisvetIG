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

## 🗂️ Estructura

```
index.html                 Página única de la aplicación
css/styles.css             Estilos (tema claro/oscuro, responsive)
js/icons.js                Iconos SVG
js/store.js                Capa de datos (usuarios, posts, citas, mensajes…)
js/seed.js                 Datos e ilustraciones de demostración
js/app.js                  Vistas, rutas (#/…) e interacción
assets/favicon.svg         Icono
.github/workflows/pages.yml  Despliegue automático en GitHub Pages
```

---

## ⚠️ Importante: dónde se guardan los datos

GitHub Pages solo sirve archivos estáticos, no ejecuta un servidor ni una base de datos. Por eso Visvet guarda todo en el **`localStorage` del navegador**:

- Cada navegador/dispositivo tiene **sus propios datos**: lo que publiques en tu móvil no lo verá otra persona en su ordenador.
- Las fotos se reducen y comprimen automáticamente, pero el navegador suele permitir unos **5 MB**; si se llena, Visvet te avisará.
- Las contraseñas se guardan con hash SHA-256 + *salt*, pero al estar en el navegador **no es un sistema de seguridad real**.

Es perfecto como **prototipo, demo o portfolio**. Para convertirlo en una red social real con usuarios compartidos, el siguiente paso es conectar un backend como **Firebase** o **Supabase** (ambos tienen plan gratuito y funcionan desde GitHub Pages): bastaría con sustituir las funciones de `js/store.js` por llamadas a su base de datos, autenticación y almacenamiento de imágenes, sin tocar el resto de la interfaz.
