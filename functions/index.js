/* Barbería — funciones del servidor (Firebase Cloud Functions)
 * 1) sendPush: cada aviso que se crea en «notifications» se envía como
 *    notificación push a los móviles del destinatario, aunque tengan la app cerrada.
 * 2) reminders: cada 15 minutos crea recordatorios de cita (la víspera por la
 *    tarde y 2 horas antes), que a su vez se envían como push.
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });
const db = getFirestore();
const APP_URL = process.env.APP_URL || 'https://pereizel06.github.io/VisvetIG/';
const TZ = 'Europe/Madrid';

async function uidsFor(to) {
  if (to === 'all') return (await db.collection('users').listDocuments()).map((d) => d.id);
  if (to === 'owner') { const o = await db.doc('meta/owner').get(); return o.exists ? [o.data().uid] : []; }
  return [to];
}

exports.sendPush = onDocumentCreated('notifications/{id}', async (event) => {
  const n = event.data && event.data.data();
  if (!n) return;
  const uids = (await uidsFor(n.to)).filter((u) => u && u !== n.from);
  const refs = [];
  for (const uid of uids) {
    const snap = await db.collection(`users/${uid}/tokens`).get();
    snap.forEach((d) => refs.push(d.ref));
  }
  if (!refs.length) return;
  for (let i = 0; i < refs.length; i += 500) {
    const batch = refs.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({
      tokens: batch.map((r) => r.id),
      notification: { title: n.title || 'Barbería', body: n.body || '' },
      webpush: {
        notification: { icon: `${APP_URL}assets/icons/icon-192.png`, badge: `${APP_URL}assets/icons/icon-192.png` },
        fcmOptions: { link: APP_URL + (n.link || '#/') },
      },
    });
    // borrar dispositivos que ya no existen
    await Promise.all(res.responses.map((r, k) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test((r.error && r.error.code) || '') ? batch[k].delete() : null)));
  }
});

function madridNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute) };
}
const addDay = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

exports.reminders = onSchedule({ schedule: 'every 15 minutes', timeZone: TZ }, async () => {
  const now = madridNow();
  const tomorrow = addDay(now.date);
  const snap = await db.collection('bookings').where('status', '==', 'confirmada').where('date', 'in', [now.date, tomorrow]).get();
  const owner = await db.doc('meta/owner').get();
  const from = owner.exists ? owner.data().uid : 'system';
  const shop = await db.doc('shop/info').get();
  const shopName = (shop.exists && shop.data().name) || 'la barbería';
  const writes = [];
  snap.forEach((d) => {
    const b = d.data();
    if (!b.userId) return;
    const diff = b.date === now.date ? toMin(b.start) - now.min : null;
    if (b.date === now.date && diff > 0 && diff <= 120 && !b.remind2h) {
      writes.push(db.collection('notifications').add({ to: b.userId, from, title: `Tu cita es a las ${b.start}`, body: `${b.serviceName} en ${shopName}. ¡Te esperamos!`, link: '#/appts', createdAt: Date.now() }));
      writes.push(d.ref.update({ remind2h: true }));
    }
    if (b.date === tomorrow && now.min >= 19 * 60 && !b.remind24h) {
      writes.push(db.collection('notifications').add({ to: b.userId, from, title: 'Mañana tienes cita', body: `${b.serviceName} a las ${b.start} en ${shopName}.`, link: '#/appts', createdAt: Date.now() }));
      writes.push(d.ref.update({ remind24h: true }));
    }
  });
  await Promise.all(writes);
});
