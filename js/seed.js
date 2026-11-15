/* Visvet — datos de demostración.
 * Las imágenes de ejemplo son ilustraciones SVG generadas aquí mismo,
 * así no se depende de imágenes externas.
 * Todas las cuentas demo usan la contraseña: demo1234
 */
(function () {
  // Carteles tipográficos para las publicaciones de ejemplo (sin degradados ni emojis)
  const TONES = [
    { bg:'#1B2A24', fg:'#ECEBE3', mark:'#E0662B' }, // tinta
    { bg:'#E6E4DA', fg:'#1B2A24', mark:'#C9562A' }, // hueso
    { bg:'#3D5A4C', fg:'#F1F0E8', mark:'#F2B36B' }, // musgo
    { bg:'#C9562A', fg:'#FBF6EE', mark:'#1B2A24' }, // yodo
    { bg:'#2E3B44', fg:'#E9ECEA', mark:'#E0662B' }, // pizarra
  ];
  let counter = 0;
  const xml = (t) => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  function wrap(text, max) {
    const lines = [];
    let cur ='';
    String(text).split(/\s+/).forEach((w) => {
      if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function art(_emoji, c1, _c2, label) {
    counter++;
    let h = 0;
    for (const ch of String(c1) + label) h = (h * 31 + ch.charCodeAt(0)) % 997;
    const t = TONES[h % TONES.length];
    const lines = wrap(label ||'Visvet', 14).slice(0, 4);
    const size = lines.length > 3 ? 62 : 72;
    const y0 = 560 - (lines.length - 1) * (size * 1.02);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
      <rect width="600" height="600" fill="${t.bg}"/>
      <g fill="${t.fg}" opacity=".07"><rect x="380" y="-40" width="90" height="330"/><rect x="260" y="80" width="330" height="90"/></g>
      <text x="40" y="104" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="17" letter-spacing="3" fill="${t.fg}" opacity=".75">VISVET — Nº ${String(counter).padStart(2,'0')}</text>
      <g fill="${t.mark}"><rect x="537" y="82" width="8" height="24"/><rect x="529" y="90" width="24" height="8"/></g>
      <line x1="40" x2="560" y1="${y0 - size - 14}" y2="${y0 - size - 14}" stroke="${t.fg}" stroke-opacity=".35" stroke-width="1.5"/>
      ${lines.map((l, i) => `<text x="38" y="${y0 + i * size * 1.02 - 20}" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-weight="800" font-size="${size}" letter-spacing="-2.5" fill="${t.fg}">${xml(l)}</text>`).join('')}
    </svg>`;
    return'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // Los usuarios de ejemplo usan iniciales (avatar vacío)
  function avatar() { return''; }

  window.VisvetArt = { art, avatar };

  window.buildSeed = async function (hashPassword, uid) {
    const now = Date.now();
    const H = 3600 * 1000;
    const D = 24 * H;

    const base = [
      {
        username: 'dra.lucia', name: 'Dra. Lucía Fernández', role: 'vet', email: 'lucia@visvet.demo',
        avatar: avatar('', '#0f9d8a', '#7fd34e'), city: 'Madrid',
        clinic: 'Clínica Veterinaria Huellitas', license: 'COLVET-M 2841', specialty: 'Medicina felina',
        phone: '+34 600 111 222', schedule: 'L-V 9:00-20:00 · S 10:00-14:00',
        bio: 'Veterinaria especializada en gatos · 12 años cuidando a los más exigentes de la casa. Consejos cada semana.',
      },
      {
        username: 'dr.marcos', name: 'Dr. Marcos Ruiz', role: 'vet', email: 'marcos@visvet.demo',
        avatar: avatar('', '#2563eb', '#22d3ee'), city: 'Barcelona',
        clinic: 'Hospital Veterinario Norte', license: 'COVB 1977', specialty: 'Cirugía y traumatología',
        phone: '+34 600 333 444', schedule: 'Urgencias 24 h',
        bio: 'Cirujano veterinario. Traumatología y rehabilitación. Urgencias 24 h en Barcelona.',
      },
      {
        username: 'vet.exoticos', name: 'Dra. Sara Núñez', role: 'vet', email: 'sara@visvet.demo',
        avatar: avatar('', '#f97316', '#facc15'), city: 'Valencia',
        clinic: 'Exóticos Valencia', license: 'ICOVV 3305', specialty: 'Animales exóticos',
        phone: '+34 600 555 666', schedule: 'L-V 10:00-19:00',
        bio: 'Conejos, hurones, aves y reptiles. Si no ladra ni maúlla, probablemente sea mi paciente.',
      },
      {
        username: 'ana.y.toby', name: 'Ana Martínez', role: 'client', email: 'ana@visvet.demo',
        avatar: avatar('', '#ec4899', '#f59e0b'), city: 'Madrid',
        pets: [{ name: 'Toby', species: 'Perro', breed: 'Golden Retriever', age: '3 años' }],
        bio: 'Mamá humana de Toby. Paseos, pelotas y mucho pelo en el sofá.',
      },
      {
        username: 'carlos.michi', name: 'Carlos Gómez', role: 'client', email: 'carlos@visvet.demo',
        avatar: avatar('', '#8b5cf6', '#ec4899'), city: 'Barcelona',
        pets: [
          { name: 'Michi', species: 'Gato', breed: 'Europeo común', age: '5 años' },
          { name: 'Luna', species: 'Gato', breed: 'Siamés', age: '1 año' },
        ],
        bio: 'Dos gatos, cero control',
      },
      {
        username: 'refugio.patitas', name: 'Refugio Patitas Felices', role: 'client', email: 'refugio@visvet.demo',
        avatar: avatar('', '#16a34a', '#84cc16'), city: 'Sevilla',
        pets: [{ name: 'Nala', species: 'Perro', breed: 'Mestiza', age: '2 años' }],
        bio: 'Asociación protectora. ¡Adopta, no compres! Escríbenos por mensaje.',
      },
    ];

    const users = [];
    for (const b of base) {
      const salt = uid('s');
      users.push(Object.assign({
        id: uid('u'), salt, passwordHash: await hashPassword('demo1234', salt),
        clinic: '', license: '', specialty: '', phone: '', schedule: '', pets: [], following: [],
        createdAt: now - 30 * D,
      }, b));
    }
    const by = (n) => users.find((u) => u.username === n);
    const lucia = by('dra.lucia'), marcos = by('dr.marcos'), sara = by('vet.exoticos');
    const ana = by('ana.y.toby'), carlos = by('carlos.michi'), refugio = by('refugio.patitas');

    lucia.following = [marcos.id, sara.id, carlos.id];
    marcos.following = [lucia.id, ana.id];
    sara.following = [lucia.id];
    ana.following = [lucia.id, marcos.id, refugio.id];
    carlos.following = [lucia.id, sara.id];
    refugio.following = [lucia.id, marcos.id, sara.id];

    const posts = [];
    const P = (user, image, caption, category, ago, likes = [], comments = []) => {
      posts.push({
        id: uid('p'), userId: user.id, image, caption, category,
        likes: likes.map((u) => u.id),
        comments: comments.map(([u, t], i) => ({ id: uid('c'), userId: u.id, text: t, createdAt: now - ago + (i + 1) * 20 * 60 * 1000 })),
        savedBy: [], createdAt: now - ago,
      });
    };

    P(lucia, art('', '#0f9d8a', '#7fd34e', '5 señales de dolor en gatos'),
      '¿Sabías que los gatos esconden el dolor? Fíjate en: 1) se esconde más de lo normal, 2) deja de acicalarse, 3) cambia su postura (encorvado), 4) orina fuera del arenero, 5) entrecierra los ojos. Ante la duda, consulta. #MedicinaFelina #SaludGatuna',
      'consejo', 3 * H, [ana, carlos, marcos, refugio],
      [[carlos, '¡Muy útil! Michi a veces se esconde, lo vigilaré'], [lucia, '@carlos.michi si dura más de un día, pásate por consulta']]);

    P(marcos, art('', '#2563eb', '#22d3ee', 'Caso clínico: fractura de radio'),
      'Caso clínico de la semana: Rocky, 2 años, fractura de radio y cúbito tras una caída. Osteosíntesis con placa y 8 semanas después ¡corriendo como siempre! Gracias a su familia por seguir la rehabilitación al pie de la letra. #Traumatología #CasoClínico',
      'caso', 9 * H, [lucia, ana, sara],
      [[ana, '¡Qué bien que se haya recuperado!']]);

    P(ana, art('', '#f59e0b', '', 'Revisión anual de Toby'),
      'Primera revisión del año de Toby. Vacunas al día y 32 kg de puro amor. ¡Gracias @dra.lucia por la paciencia con este cobarde!',
      'mascota', 20 * H, [lucia, marcos],
      [[lucia, '¡Toby es un sol! Nos vemos en 6 meses']]);

    P(refugio, art('', '#16a34a', '#84cc16', 'Nala busca hogar'),
      'NALA BUSCA FAMILIA. Mestiza de 2 años, 15 kg, vacunada, esterilizada y con chip. Es tranquila, se lleva bien con otros perros y le encantan los niños. Está en Sevilla. ¡Escríbenos por mensaje! #AdoptaNoCompres',
      'adopcion', 1.5 * D, [ana, lucia, carlos, sara, marcos],
      [[sara, '¡Qué preciosidad! Lo comparto'], [ana, 'Ojalá encuentre pronto una familia']]);

    P(sara, art('', '#f97316', '#facc15', 'Conejos: la dieta correcta'),
      'El 80 % de la dieta de un conejo debe ser HENO de calidad. Verdura fresca a diario y el pienso, en poca cantidad. Las zanahorias son un premio, no la base. ¿Tienes dudas? Pregunta en comentarios.',
      'consejo', 2 * D, [carlos, lucia],
      [[carlos, '¡No tenía ni idea de lo de la zanahoria!']]);

    P(carlos, art('', '#8b5cf6', '', 'Luna contra la caja de cartón'),
      'Luna descubrió la caja del pedido antes que yo. Prioridades.',
      'mascota', 2.5 * D, [lucia, ana]);

    P(lucia, art('', '#0ea5e9', '#0f9d8a', 'Calendario de vacunas'),
      'Recordatorio: los gatitos necesitan su primera vacuna (trivalente) a las 8-9 semanas, refuerzo a las 12 y otra a las 16. Después, anual o según indique tu veterinario. Guarda este post',
      'consejo', 4 * D, [ana, carlos, refugio]);

    P(marcos, art('', '#ef4444', '#f97316', 'Golpe de calor'),
      'AVISO. Con estas temperaturas: nunca dejes a tu perro en el coche, paseos a primera hora o al anochecer y agua fresca siempre. Jadeo excesivo, encías muy rojas o vómitos = URGENCIA.',
      'aviso', 5 * D, [ana, lucia, sara, refugio]);

    const stories = [
      { id: uid('s'), userId: lucia.id, image: art('', '#0f9d8a', '#7fd34e', '¡Buenos días desde la clínica!'), createdAt: now - 2 * H, seenBy: [], pinned: true },
      { id: uid('s'), userId: marcos.id, image: art('', '#2563eb', '#22d3ee', 'Quirófano listo'), createdAt: now - 5 * H, seenBy: [], pinned: true },
      { id: uid('s'), userId: refugio.id, image: art('', '#16a34a', '#84cc16', 'Jornada de adopción el sábado'), createdAt: now - 7 * H, seenBy: [], pinned: true },
      { id: uid('s'), userId: sara.id, image: art('', '#f97316', '#facc15', 'Paciente de hoy: Rex'), createdAt: now - 8 * H, seenBy: [], pinned: true },
    ];

    const day = (n) => new Date(now + n * D).toISOString().slice(0, 10);
    const appointments = [
      { id: uid('a'), clientId: ana.id, vetId: lucia.id, petName: 'Toby', date: day(2), time: '10:30', reason: 'Revisión de oídos, se rasca mucho', status: 'confirmada', vetNote: 'Traed la cartilla de vacunación.', createdAt: now - D },
      { id: uid('a'), clientId: carlos.id, vetId: lucia.id, petName: 'Luna', date: day(5), time: '17:00', reason: 'Consulta para esterilización', status: 'pendiente', vetNote: '', createdAt: now - 3 * H },
    ];

    const messages = [
      { id: uid('m'), from: ana.id, to: lucia.id, text: 'Hola Lucía, ¿Toby necesita ayuno antes de la cita?', createdAt: now - 6 * H, read: true },
      { id: uid('m'), from: lucia.id, to: ana.id, text: '¡Hola Ana! No hace falta, solo es una revisión de oídos', createdAt: now - 5.5 * H, read: false },
      { id: uid('m'), from: refugio.id, to: marcos.id, text: 'Marcos, ¿podrías revisar a un cachorro que nos ha llegado cojeando?', createdAt: now - 26 * H, read: false },
    ];

    const notifications = [
      { id: uid('n'), userId: lucia.id, type: 'appointment_request', fromId: carlos.id, createdAt: now - 3 * H, read: false, text: 'Luna · ' + day(5) + ' 17:00' },
      { id: uid('n'), userId: lucia.id, type: 'like', fromId: marcos.id, postId: posts[0].id, createdAt: now - 2 * H, read: false },
      { id: uid('n'), userId: ana.id, type: 'appointment_confirmada', fromId: lucia.id, createdAt: now - 20 * H, read: false, text: 'Toby · ' + day(2) + ' 10:30' },
    ];

    return { version: 1, users, posts, stories, appointments, messages, notifications };
  };
})();
