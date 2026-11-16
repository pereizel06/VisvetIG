# ECLIPSE · Grieta Estelar

Roguelite de supervivencia espacial para móvil, del género *survivor-like* (como Survivor.io o Archero). Incluye el meta-juego típico de los juegos híbrido-casuales que más facturan: pase de batalla, recompensas diarias, misiones, equipo con rarezas y patrulla pasiva.

**Sin dependencias ni compilación.** Todo se genera por código: gráficos, música y efectos. No hay imágenes ni audios externos.

## Cómo jugar
- **En local:** `cd juego && python3 -m http.server 8000` y abre `http://localhost:8000`. En el ordenador se juega con WASD o con las flechas.
- **En el iPhone:**
  1. Publícalo en un servidor HTTPS (por ejemplo, GitHub Pages) y ábrelo en Safari.
  2. Pulsa **Compartir → Añadir a pantalla de inicio**. Se abrirá a pantalla completa, como una app, y funcionará sin conexión.

## Contenido
- **Partidas de unos 5 minutos:** oleadas crecientes, emboscadas en anillo, élites que sueltan un cofre y un jefe final dentro de una arena.
- **Armas y pasivas:** 6 armas automáticas y 8 pasivas. Cada arma a nivel 5, combinada con su pasiva emparejada, **evoluciona** a una versión definitiva.
- **Capítulos y jefes:** 10 capítulos, cada uno con su paleta y su planeta. Hay 3 jefes con patrones propios (embestidas, espirales de balas e invocaciones) y una fase de furia.
- **Meta-juego:**
  - Mejoras permanentes con oro.
  - Equipo en 4 ranuras con 5 rarezas: 3 objetos iguales se fusionan en uno de rareza superior.
  - 4 pilotos.
  - Pase Estelar de 30 niveles, con vía gratuita y vía premium.
  - Recompensas por iniciar sesión durante 7 días.
  - Misiones diarias con cofres de actividad.
  - Patrulla que genera oro aunque no juegues.
  - Energía.
  - Tienda con cofres y un regalo gratis cada 4 horas.
- **Guardado:** el progreso se guarda en el propio dispositivo (`localStorage`).

## Estructura
```
index.html, manifest.webmanifest, sw.js   App instalable y sin conexión
css/style.css      Interfaz (cristal, neón y animaciones)
js/main.js         Arranque
js/ui.js           Menús, modales y HUD
js/game.js         Motor: combate, armas, enemigos, jefes y render
js/sprites.js      Sprites con brillo pre-renderizados y fondos de nebulosa
js/menubg.js       Fondo animado del menú (planeta del capítulo)
js/audio.js        Efectos y música sintetizados con WebAudio
js/data.js         Tablas de equilibrio y contenido
js/save.js         Guardado y economía
```

## Llevarlo a la App Store
Se puede envolver con [Capacitor](https://capacitorjs.com) (`npx cap add ios`). Para compilarlo y firmarlo hace falta un Mac con Xcode y una cuenta de Apple Developer.
