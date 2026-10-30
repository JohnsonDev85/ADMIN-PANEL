// ============ FIREBASE CONFIG ============
const firebaseConfig = {
  apiKey: "AIzaSyBhh3nIzAWyvT47HQ-hh6umjqoCMYBI1Lk",
  authDomain: "johcards-2db9b.firebaseapp.com",
  projectId: "johcards-2db9b",
  storageBucket: "johcards-2db9b.firebasestorage.app",
  messagingSenderId: "955656442066",
  appId: "1:955656442066:web:3f0d0335191d67eac61d0b"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============ STATE ============
let activeEventId = null;
let activeEventData = null;
let guestsUnsubscribe = null;
let editingEventId = null; // si null tunapohariri tukio
let wageniWaFaili = [];    // wageni waliosomwa kutoka kwenye faili (Excel/CSV)

// Namba zote zilizokwisha kutumika (zinasomwa mara moja tu, kisha zinakumbukwa)
let nambaZilizotumikaCache = null;

// Kadi za wageni zilizopo kwenye ukurasa (guestId -> kipengele cha kadi)
let kadiZaWageni = new Map();

// Taarifa za wageni (guestId -> data) kwa ajili ya kitufe cha WhatsApp
let dataZaWageni = new Map();

// Mwangalizi wa QR: QR inatengenezwa kadi inapokaribia kuonekana kwenye skrini
let qrObserver = null;

// Utafutaji wa wageni
let tafutaManeno = [];     // maneno yanayotafutwa (herufi ndogo)
let tafutaTimer = null;

// ============ HELPERS ============
function randomCode(len){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for(let i=0;i<len;i++){ out += chars[Math.floor(Math.random()*chars.length)]; }
  return out;
}

// Namba ya getini: mchanganyiko wa herufi na namba (angalau herufi 1 na namba 1)
// Haina herufi/namba zinazochanganya: O, I, L, 0, 1
function randomNamba(len){
  const herufi = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const namba = '23456789';
  const zote = herufi + namba;
  const pick = (s) => s[Math.floor(Math.random() * s.length)];

  const chars = [];
  chars.push(pick(herufi)); // herufi 1 hakika
  chars.push(pick(namba));  // namba 1 hakika
  for(let i = 2; i < len; i++){
    chars.push(pick(zote));
  }

  // Changanya mpangilio ili herufi/namba zisiwe na nafasi maalum
  for(let i = chars.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function sanitizeFilename(name){
  return name.replace(/[^a-z0-9\-_]+/gi, '_');
}

function futaFomuYaTukio(){
  document.getElementById('eventName').value = '';
  document.getElementById('eventCode').value = '';
  document.getElementById('eventDate').value = '';
  document.getElementById('eventVenue').value = '';
}

// Nakili namba ya mgeni
function copyNamba(namba){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(namba)
      .then(() => alert('Namba ' + namba + ' imenakiliwa.'))
      .catch(() => prompt('Nakili namba hii:', namba));
  }else{
    prompt('Nakili namba hii:', namba);
  }
}

// ============ WHATSAPP ============

const UJUMBE_WA_MWANZO =
  'Habari [JINA], hii ni JOHCARDS. Tumetumwa kukuletea kadi yako ya mwaliko wa [TUKIO]. Karibu sana!\n\n' +
  'Kodi yako ya getini: [KODI]';

const UFUNGUO_UJUMBE_WA = 'johcards_wa_ujumbe';

// Pakia ujumbe uliohifadhiwa (au tumia wa mwanzo)
function pakiaUjumbeWaWhatsApp(){
  const kisanduku = document.getElementById('waMessage');
  if(!kisanduku) return;
  let ujumbe = '';
  try{ ujumbe = localStorage.getItem(UFUNGUO_UJUMBE_WA) || ''; }catch(e){}
  kisanduku.value = ujumbe || UJUMBE_WA_MWANZO;
}

// Hifadhi ujumbe kila unapoandika
function hifadhiUjumbe(){
  const kisanduku = document.getElementById('waMessage');
  if(!kisanduku) return;
  try{ localStorage.setItem(UFUNGUO_UJUMBE_WA, kisanduku.value); }catch(e){}
}

// Geuza namba ya simu kuwa muundo wa kimataifa kwa wa.me (255712345678)
function nambaYaWhatsApp(simu){
  let n = String(simu == null ? '' : simu).replace(/\D/g, ''); // acha tarakimu tu
  if(!n) return '';
  if(n.indexOf('255') === 0) return n;           // tayari ina 255
  if(n.charAt(0) === '0') return '255' + n.slice(1); // 0712... -> 255712...
  if(n.length === 9) return '255' + n;           // 712... -> 255712...
  return n;                                      // namba nyingine (ya nje)
}

// Fungua WhatsApp ikiwa na ujumbe tayari kwa mgeni huyu
function tumaWhatsApp(guestId){
  const g = dataZaWageni.get(guestId);
  if(!g) return;

  const nambaWA = nambaYaWhatsApp(g.phone);
  if(!nambaWA){
    alert('Mgeni huyu hana namba ya simu.');
    return;
  }

  const kisanduku = document.getElementById('waMessage');
  let ujumbe = kisanduku && kisanduku.value.trim() ? kisanduku.value : UJUMBE_WA_MWANZO;

  const jinaLaTukio = activeEventData ? (activeEventData.name || '') : '';
  ujumbe = ujumbe
    .replace(/\[JINA\]/gi, g.name || '')
    .replace(/\[TUKIO\]/gi, jinaLaTukio)
    .replace(/\[KODI\]/gi, g.namba || '');

  const url = 'https://wa.me/' + nambaWA + '?text=' + encodeURIComponent(ujumbe);
  window.open(url, '_blank');
}

// ============ EVENTS ============
async function loadEvents(){
  const select = document.getElementById('selectEvent');
  try{
    const snap = await db.collection('events').orderBy('createdAt', 'desc').get();
    select.innerHTML = '<option value="">— Chagua tukio —</option>';
    snap.forEach(doc => {
      const d = doc.data();
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = `${d.name} (${d.code})`;
      select.appendChild(opt);
    });
  }catch(err){
    console.error('Imeshindikana kupakia matukio:', err);
    document.getElementById('eventStatusMsg').textContent = 'Hitilafu kupakia matukio.';
  }
}

// Unda tukio jipya AU hifadhi mabadiliko ya tukio linalohaririwa
async function saveEvent(){
  const name = document.getElementById('eventName').value.trim();
  const code = document.getElementById('eventCode').value.trim().toUpperCase().replace(/\s+/g,'');
  const date = document.getElementById('eventDate').value;
  const venue = document.getElementById('eventVenue').value.trim();
  const msg = document.getElementById('eventStatusMsg');

  if(!name || !code){
    msg.textContent = 'Jaza jina la tukio na kodi fupi kwanza.';
    return;
  }

  // ----- Hali ya kuhariri -----
  if(editingEventId){
    const id = editingEventId;
    msg.textContent = 'Inahifadhi mabadiliko...';
    try{
      await db.collection('events').doc(id).update({ name, code, date, venue });
      cancelEditEvent();
      await loadEvents();
      document.getElementById('selectEvent').value = id;
      await onEventSelected(id);
      msg.textContent = 'Mabadiliko yamehifadhiwa!';
    }catch(err){
      console.error(err);
      msg.textContent = 'Hitilafu: ' + err.message;
    }
    return;
  }

  // ----- Hali ya kuunda tukio jipya -----
  msg.textContent = 'Inaunda tukio...';
  try{
    const docRef = await db.collection('events').add({
      name, code, date, venue,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    msg.textContent = 'Tukio limeundwa!';
    futaFomuYaTukio();
    await loadEvents();
    document.getElementById('selectEvent').value = docRef.id;
    onEventSelected(docRef.id);
  }catch(err){
    console.error(err);
    msg.textContent = 'Hitilafu: ' + err.message;
  }
}

function startEditEvent(){
  if(!activeEventId || !activeEventData) return;

  editingEventId = activeEventId;
  document.getElementById('eventName').value = activeEventData.name || '';
  document.getElementById('eventCode').value = activeEventData.code || '';
  document.getElementById('eventDate').value = activeEventData.date || '';
  document.getElementById('eventVenue').value = activeEventData.venue || '';

  document.getElementById('eventSaveBtn').textContent = 'Hifadhi Mabadiliko';
  document.getElementById('eventCancelBtn').style.display = 'inline-block';
  document.getElementById('eventStatusMsg').textContent =
    'Unahariri: ' + (activeEventData.name || '') + '. Badilisha kisha bonyeza Hifadhi Mabadiliko.';
}

function cancelEditEvent(){
  editingEventId = null;
  futaFomuYaTukio();
  document.getElementById('eventSaveBtn').textContent = 'Unda Tukio Jipya';
  document.getElementById('eventCancelBtn').style.display = 'none';
  document.getElementById('eventStatusMsg').textContent = '';
}

async function deleteEvent(){
  if(!activeEventId || !activeEventData) return;

  const eventId = activeEventId;
  const jina = activeEventData.name;
  const msg = document.getElementById('eventStatusMsg');

  if(!confirm('Una uhakika unataka kufuta tukio "' + jina + '" pamoja na wageni wake wote? Hili haliwezi kurudishwa.')) return;

  msg.textContent = 'Inafuta tukio na wageni wake...';

  // Simamisha orodha ya moja kwa moja wakati wa kufuta
  if(guestsUnsubscribe) guestsUnsubscribe();

  try{
    // Futa wageni wote kwa vipande (Firestore haifuti subcollection yenyewe)
    const guestsRef = db.collection('events').doc(eventId).collection('guests');
    while(true){
      const snap = await guestsRef.limit(400).get();
      if(snap.empty) break;
      const batch = db.batch();
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Kisha futa tukio lenyewe
    await db.collection('events').doc(eventId).delete();

    if(editingEventId === eventId) cancelEditEvent();
    await loadEvents();
    document.getElementById('selectEvent').value = '';
    await onEventSelected('');
    msg.textContent = 'Tukio "' + jina + '" limefutwa.';
  }catch(err){
    console.error(err);
    msg.textContent = 'Hitilafu wakati wa kufuta: ' + err.message;
    // Rudisha orodha ya moja kwa moja kama kufuta kumeshindwa
    if(activeEventId) listenToGuests(activeEventId);
  }
}

async function onEventSelected(eventId){
  if(editingEventId && editingEventId !== eventId) cancelEditEvent();

  // Ficha kisanduku cha kufuta wote tukio linapobadilika
  ghairiFutaWote();

  // Futa utafutaji wa tukio lililopita
  ufutaUtafutaji(true);

  activeEventId = eventId;
  if(!eventId){
    activeEventData = null;
    document.getElementById('eventTools').style.display = 'none';
    document.getElementById('guestsPanel').style.display = 'none';
    document.getElementById('listSection').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
    if(guestsUnsubscribe) guestsUnsubscribe();
    return;
  }

  try{
    const doc = await db.collection('events').doc(eventId).get();
    if(!doc.exists){
      alert('Tukio hili halipatikani.');
      return;
    }
    activeEventData = doc.data();

    document.getElementById('eventTools').style.display = 'flex';
    document.getElementById('guestsPanel').style.display = 'block';
    document.getElementById('listSection').style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('activeEventTag').textContent =
      `Tukio hai: ${activeEventData.name} (${activeEventData.code})`;

    listenToGuests(eventId);
  }catch(err){
    console.error('onEventSelected error:', err);
    alert('Imeshindikana kupakia tukio: ' + err.message);
  }
}

// ============ GUESTS ============

// Badilisha kati ya kuandika na kupakia faili
function badilishaNjiaYaKuingiza(){
  const njia = document.getElementById('guestInputMode').value;
  document.getElementById('njiaAndika').style.display = (njia === 'andika') ? '' : 'none';
  document.getElementById('njiaFaili').style.display = (njia === 'faili') ? '' : 'none';
}

// Safisha namba ya simu iliyotoka kwenye faili
// (Excel mara nyingi huondoa sifuri ya mwanzo, mfano 712345678)
function safishaNambaYaSimu(raw){
  let n = String(raw == null ? '' : raw).trim().replace(/[\s\-()]/g, '');
  if(/^[67]\d{8}$/.test(n)) n = '0' + n;
  return n;
}

// Soma faili la CSV au Excel kisha onyesha preview
function somaFailiLaWageni(input){
  const preview = document.getElementById('failiPreview');
  wageniWaFaili = [];
  preview.innerHTML = '';

  const file = input.files && input.files[0];
  if(!file) return;

  const isCsv = /\.csv$/i.test(file.name);
  const reader = new FileReader();

  reader.onerror = () => {
    preview.textContent = 'Imeshindikana kusoma faili.';
  };

  reader.onload = (e) => {
    try{
      let wb;
      if(isCsv){
        wb = XLSX.read(e.target.result, { type: 'string', raw: true });
      }else{
        wb = XLSX.read(e.target.result, { type: 'array' });
      }

      const ws = wb.Sheets[wb.SheetNames[0]];
      // raw:true = tunapata thamani halisi (namba kamili, si E+11)
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

      const wageni = [];
      let zenyeE = 0; // idadi ya namba zilizoandikwa kama E+11 kwenye faili lenyewe

      rows.forEach((row, i) => {
        const jina = String(row[0] == null ? '' : row[0]).trim();
        if(!jina) return;

        // Ruka mstari wa kichwa cha habari (jina, namba ya simu)
        if(i === 0){
          const j = jina.toLowerCase();
          if(['jina', 'majina', 'name', 'names'].includes(j)) return;
        }

        // Namba ya simu: ikiwa namba, igeuze kuwa maandishi kamili (bila E+11)
        let simuMbichi = row[1];
        if(typeof simuMbichi === 'number'){
          simuMbichi = simuMbichi.toFixed(0);
        }else if(typeof simuMbichi === 'string' && /^\d+(\.\d+)?e\+?\d+$/i.test(simuMbichi.trim())){
          // Faili lenyewe lina maandishi ya E+11: tarakimu zimeshapotea
          zenyeE++;
          simuMbichi = Number(simuMbichi.trim()).toFixed(0);
        }

        wageni.push({ name: jina, phone: safishaNambaYaSimu(simuMbichi) });
      });

      wageniWaFaili = wageni;

      if(wageni.length === 0){
        preview.textContent = 'Hakuna wageni waliopatikana kwenye faili hili.';
        return;
      }

      const mfano = wageni.slice(0, 5).map(g =>
        `<li>${escapeHtml(g.name)}${g.phone ? ' · ' + escapeHtml(g.phone) : ''}</li>`
      ).join('');
      const zaidi = wageni.length > 5 ? `<div>...na wengine ${wageni.length - 5}</div>` : '';

      const onyo = zenyeE > 0
        ? `<div style="margin:8px 0;padding:8px 10px;border:1px solid #b3261e;border-radius:8px;color:#ffb4ab;">` +
          `Tahadhari: namba ${zenyeE} kwenye faili zimeandikwa kama "E+11". Tarakimu za mwisho zimepotea ndani ya faili lenyewe. ` +
          `Fungua Excel, chagua safu ya namba, weka format ya Text, kisha andika namba upya.</div>`
        : '';

      preview.innerHTML =
        `<strong>Wageni ${wageni.length} wamepatikana.</strong>` +
        `<ul style="margin:6px 0 6px 18px;padding:0;">${mfano}</ul>${zaidi}` +
        onyo +
        `<div style="margin-top:6px;">Bonyeza "Ongeza Wageni + Tengeneza QR" kuwahifadhi.</div>`;
    }catch(err){
      console.error(err);
      preview.textContent = 'Faili halisomeki: ' + err.message;
    }
  };

  if(isCsv){
    reader.readAsText(file);
  }else{
    reader.readAsArrayBuffer(file);
  }
}

async function addGuests(){
  if(!activeEventId){
    alert('Chagua au unda tukio kwanza.');
    return;
  }

  const modeEl = document.getElementById('guestInputMode');
  const mode = modeEl ? modeEl.value : 'andika';

  // Pata orodha ya wageni kutoka kwenye faili AU kwenye sanduku la maandishi
  let parsedGuests = [];

  if(mode === 'faili'){
    if(wageniWaFaili.length === 0){
      alert('Chagua faili lenye wageni kwanza.');
      return;
    }
    parsedGuests = wageniWaFaili.slice();
  }else{
    const rawLines = document.getElementById('guestNames').value;
    const lines = rawLines.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if(lines.length === 0){
      alert('Andika jina la mgeni angalau mmoja.');
      return;
    }

    // Parse kila mstari kuwa {name, phone}
    parsedGuests = lines.map(line => {
      const parts = line.split(',').map(p => p.trim());
      return { name: parts[0] || '', phone: parts[1] || '' };
    }).filter(g => g.name.length > 0);
  }

  // Hali ya malipo ya mwanzo
  const kisanduku = document.getElementById('guestPaid');
  const amelipaMwanzo = kisanduku ? kisanduku.value === 'true' : false;

  // Aina ya kadi: single au double
  const kisandukuAina = document.getElementById('guestAina');
  const aina = kisandukuAina ? kisandukuAina.value : 'single';

  // Njia ya kumfikia mgeni: qr (WhatsApp) au namba (SMS)
  const kisandukuNjia = document.getElementById('guestNjia');
  const njia = kisandukuNjia ? kisandukuNjia.value : 'qr';

  const countTag = document.getElementById('guestCountTag');
  countTag.textContent = 'Inaongeza wageni...';

  // Namba zilizokwisha kutumika kwenye MATUKIO YOTE (ili zisijirudie popote)
  // Zinasomwa MARA MOJA tu (ukurasa ukifunguliwa), kisha zinakumbukwa
  if(!nambaZilizotumikaCache){
    countTag.textContent = 'Inaandaa namba (mara ya kwanza tu)...';
    try{
      const set = new Set();
      const snapZilizopo = await db.collectionGroup('guests').get();
      snapZilizopo.forEach(d => {
        const n = d.data().namba;
        if(n) set.add(n);
      });
      nambaZilizotumikaCache = set;
    }catch(err){
      console.error(err);
      countTag.textContent = 'Hitilafu kusoma namba zilizopo: ' + err.message;
      return;
    }
  }
  const zilizotumika = nambaZilizotumikaCache;

  const guestsRef = db.collection('events').doc(activeEventId).collection('guests');

  try{
    // Tunahifadhi kwa vipande vya wageni 400 (Firestore inaruhusu hadi 500 kwa batch)
    const ukubwaWaKipande = 400;
    for(let i = 0; i < parsedGuests.length; i += ukubwaWaKipande){
      const kipande = parsedGuests.slice(i, i + ukubwaWaKipande);
      const batch = db.batch();

      kipande.forEach(g => {
        const guestId = `${activeEventData.code}-${randomCode(6)}`;
        const ref = guestsRef.doc(guestId);

        // Kila mgeni anapata namba ya kipekee kwenye matukio yote (code ya SMS)
        let namba;
        do { namba = randomNamba(4); } while(zilizotumika.has(namba));
        zilizotumika.add(namba);

        batch.set(ref, {
          name: g.name,
          phone: g.phone,
          paid: amelipaMwanzo,
          aina: aina,
          njia: njia,
          namba: namba,
          attended: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });

      await batch.commit();

      if(parsedGuests.length > ukubwaWaKipande){
        const tayari = Math.min(i + ukubwaWaKipande, parsedGuests.length);
        countTag.textContent = `Inaongeza ${tayari} kati ya ${parsedGuests.length}...`;
      }
    }

    // Safisha fomu baada ya kuhifadhi
    document.getElementById('guestNames').value = '';
    const faili = document.getElementById('guestFile');
    if(faili) faili.value = '';
    wageniWaFaili = [];
    document.getElementById('failiPreview').innerHTML = '';

    countTag.textContent = `Wageni ${parsedGuests.length} wameongezwa.`;
  }catch(err){
    console.error(err);
    countTag.textContent = 'Hitilafu: ' + err.message;
  }
}

// ============ FUTA WAGENI WOTE ============
let futaWoteEventId = null;
let futaWoteIdadi = 0;

// Hatua ya 1: onyesha kisanduku cha kuthibitisha
async function deleteAllGuests(){
  const status = document.getElementById('deleteAllStatus');

  if(!activeEventId || !activeEventData){
    status.textContent = 'Chagua tukio kwanza.';
    return;
  }

  status.textContent = 'Inahesabu wageni...';
  try{
    const snap = await db.collection('events').doc(activeEventId)
      .collection('guests').get();

    if(snap.empty){
      status.textContent = 'Hakuna wageni kwenye tukio hili.';
      return;
    }

    futaWoteEventId = activeEventId;
    futaWoteIdadi = snap.size;

    document.getElementById('deleteAllText').textContent =
      'Utafuta wageni ' + futaWoteIdadi + ' wa tukio "' + activeEventData.name +
      '" pamoja na QR zao zote. Hili haliwezi kurudishwa, na kadi ulizokwisha kutuma hazitafanya kazi tena.';
    document.getElementById('deleteAllInput').value = '';
    document.getElementById('deleteAllBox').style.display = 'block';
    status.textContent = '';
  }catch(err){
    console.error(err);
    status.textContent = 'Hitilafu: ' + err.message;
  }
}

function ghairiFutaWote(){
  const box = document.getElementById('deleteAllBox');
  const input = document.getElementById('deleteAllInput');
  const status = document.getElementById('deleteAllStatus');
  if(box) box.style.display = 'none';
  if(input) input.value = '';
  if(status) status.textContent = '';
  futaWoteEventId = null;
}

// Hatua ya 2: thibitisha kisha futa
async function thibitishaFutaWote(){
  const status = document.getElementById('deleteAllStatus');
  const jibu = document.getElementById('deleteAllInput').value.trim().toUpperCase();

  if(jibu !== 'FUTA'){
    status.textContent = 'Andika neno FUTA kwenye kisanduku kuthibitisha.';
    return;
  }

  if(!futaWoteEventId || futaWoteEventId !== activeEventId){
    ghairiFutaWote();
    status.textContent = 'Tukio limebadilika. Bonyeza "Futa Wageni Wote" tena.';
    return;
  }

  const eventId = futaWoteEventId;
  const idadi = futaWoteIdadi;
  const guestsRef = db.collection('events').doc(eventId).collection('guests');

  // Ficha kisanduku, simamisha orodha ya moja kwa moja wakati wa kufuta
  document.getElementById('deleteAllBox').style.display = 'none';
  if(guestsUnsubscribe) guestsUnsubscribe();
  futaKadiZote();
  status.textContent = 'Inafuta wageni...';

  try{
    let zilizofutwa = 0;
    while(true){
      const snap = await guestsRef.limit(400).get();
      if(snap.empty) break;
      const batch = db.batch();
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
      zilizofutwa += snap.size;
      status.textContent = 'Imefuta ' + zilizofutwa + ' kati ya ' + idadi + '...';
    }
    status.textContent = 'Wageni ' + zilizofutwa + ' wamefutwa.';
  }catch(err){
    console.error(err);
    status.textContent = 'Hitilafu wakati wa kufuta: ' + err.message;
  }finally{
    futaWoteEventId = null;
    if(activeEventId === eventId) listenToGuests(eventId);
  }
}

// ============ TAFUTA MGENI ============

// Maandishi ya kutafuta yanayowekwa kwenye kila kadi: jina + simu + namba ya getini
function wekaMaandishiYaKutafuta(card, data){
  const maandishi = [data.name || '', data.phone || '', data.namba || ''].join(' ').toLowerCase();
  card.dataset.tafuta = maandishi;
}

// Kadi inalingana kama maneno YOTE yaliyoandikwa yamo ndani yake
function kadiInalingana(card){
  if(tafutaManeno.length === 0) return true;
  const hay = card.dataset.tafuta || '';
  return tafutaManeno.every(neno => hay.indexOf(neno) !== -1);
}

// Chuja kadi: onyesha zinazolingana, ficha nyingine
function tumiaUtafutaji(){
  const kisanduku = document.getElementById('guestSearch');
  const info = document.getElementById('searchInfo');
  const kitufeFuta = document.getElementById('searchClear');

  const neno = (kisanduku ? kisanduku.value : '').toLowerCase().trim();
  tafutaManeno = neno ? neno.split(/\s+/) : [];

  let zinazolingana = 0;
  kadiZaWageni.forEach(card => {
    const sawa = kadiInalingana(card);
    card.style.display = sawa ? '' : 'none';
    if(sawa) zinazolingana++;
  });

  if(kitufeFuta) kitufeFuta.style.display = tafutaManeno.length ? 'inline-block' : 'none';

  if(info){
    if(tafutaManeno.length === 0){
      info.textContent = '';
    }else if(zinazolingana === 0){
      info.textContent = 'Hakuna mgeni anayelingana na "' + neno + '".';
    }else{
      info.textContent = 'Imepatikana ' + zinazolingana + ' kati ya ' + kadiZaWageni.size + '.';
    }
  }
}

// Subiri kidogo mtu anapoandika, ili isichuje kila herufi mara moja
function ratibishaUtafutaji(){
  if(tafutaTimer) clearTimeout(tafutaTimer);
  tafutaTimer = setTimeout(tumiaUtafutaji, 150);
}

// Futa utafutaji na urudishe wageni wote
function ufutaUtafutaji(bilaKuweka){
  const kisanduku = document.getElementById('guestSearch');
  if(kisanduku) kisanduku.value = '';
  tumiaUtafutaji();
  if(!bilaKuweka && kisanduku){
    try{ kisanduku.focus(); }catch(e){}
  }
}

// ============ ORODHA YA WAGENI (YA HARAKA) ============

// Hesabu wageni wote kwenye orodha: jumla, single, double, waliohudhuria
// docs = orodha nzima ya wageni wa tukio (kutoka Firestore). Bila docs = sifuri.
function sasishaTakwimu(docs){
  let jumla = 0, single = 0, dbl = 0, wamehudhuria = 0;

  if(docs){
    docs.forEach(d => {
      const g = d.data();
      jumla++;
      if(g.aina === 'double') dbl++; else single++;
      if(g.attended === true) wamehudhuria++;
    });
  }

  const wekaThamani = (id, thamani) => {
    const el = document.getElementById(id);
    if(el) el.textContent = String(thamani);
  };
  wekaThamani('statJumla', jumla);
  wekaThamani('statSingle', single);
  wekaThamani('statDouble', dbl);
  wekaThamani('statAttended', wamehudhuria);
}

// Futa kadi zote kwenye ukurasa na usafishe mwangalizi wa QR
function futaKadiZote(){
  const grid = document.getElementById('guestGrid');
  if(qrObserver){
    qrObserver.disconnect();
    qrObserver = null;
  }
  kadiZaWageni = new Map();
  dataZaWageni = new Map();
  sasishaTakwimu();
  if(grid) grid.innerHTML = '';
}

// Tengeneza QR ya kisanduku kimoja (mara moja tu)
function tengenezaQR(box){
  if(!box || box.dataset.tayari === '1') return;
  box.dataset.tayari = '1';
  new QRCode(box, {
    text: box.dataset.payload,
    width: 150,
    height: 150,
    colorDark: "#0a2540",
    colorLight: "#f5f0e6",
    correctLevel: QRCode.CorrectLevel.L // kiwango cha chini = vitone vikubwa, rahisi kusoma
  });
}

// Mwangalizi: QR inatengenezwa kadi ikikaribia kuonekana
function andaaMwangalizi(){
  if(qrObserver) qrObserver.disconnect();
  if('IntersectionObserver' in window){
    qrObserver = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if(en.isIntersecting){
          tengenezaQR(en.target);
          qrObserver.unobserve(en.target);
        }
      });
    }, { rootMargin: '400px' });
  }else{
    qrObserver = null; // simu ya zamani: QR zitatengenezwa mara moja
  }
}

// Jaza sehemu ya chini ya kadi (jina, hali, vitufe). QR haiguswi hapa.
function jazaMwiliWaKadi(mwili, eventId, guestId, data){
  // Kumbuka taarifa za mgeni kwa ajili ya kitufe cha WhatsApp
  dataZaWageni.set(guestId, data);

  const ainaMaandishi = data.aina === 'double' ? 'DOUBLE' : 'SINGLE';

  // Code ya mgeni (kwa SMS), inaonekana chini ya QR
  const nambaHtml = data.namba
    ? `<div style="text-align:center;font-size:26px;font-weight:700;letter-spacing:5px;font-family:monospace;margin:8px 0;">${escapeHtml(data.namba)}</div>`
    : '';

  const kitufeNamba = data.namba
    ? `<button class="dl" onclick="copyNamba('${data.namba}')">Nakili Namba</button>`
    : '';

  // Kitufe cha WhatsApp (kinaonekana kwa mgeni mwenye namba ya simu tu)
  const kitufeWhatsApp = data.phone
    ? `<button class="dl" style="background:#25D366;color:#fff;" onclick="tumaWhatsApp('${guestId}')">WhatsApp</button>`
    : '';

  mwili.innerHTML = `
    ${nambaHtml}
    <div class="g-name">${escapeHtml(data.name)}</div>
    <div class="g-id">${guestId}${data.phone ? ' · ' + escapeHtml(data.phone) : ''}</div>
    <div class="badges">
      <span class="badge ${data.paid ? 'paid-yes' : 'paid-no'}" onclick="togglePaid('${eventId}','${guestId}', ${data.paid})">
        ${data.paid ? '✓ Amelipa' : '✕ Hajalipa'}
      </span>
      <span class="badge ${data.attended ? 'att-yes' : 'att-no'}">
        ${data.attended ? '✓ Amehudhuria' : 'Bado'}
      </span>
      <span class="badge">${ainaMaandishi}</span>
    </div>
    <div class="card-actions">
      <button class="dl" onclick="downloadQR('${eventId}','${guestId}','${sanitizeFilename(data.name)}')">Pakua QR</button>
      ${kitufeWhatsApp}
      ${kitufeNamba}
      <button class="dl del" onclick="deleteGuest('${eventId}','${guestId}')">Futa</button>
    </div>
  `;
}

// Tengeneza kadi mpya (bila QR bado; QR inakuja kadi ikikaribia skrini)
function tengenezaKadi(eventId, guestId, data){
  const card = document.createElement('div');
  card.className = 'card';

  const qrBox = document.createElement('div');
  qrBox.className = 'qr-box';
  qrBox.id = 'qr_' + guestId;
  qrBox.dataset.payload = `${eventId}::${guestId}`;
  // Nafasi ya QR inabaki wazi hata kabla haijatengenezwa
  qrBox.style.minWidth = '150px';
  qrBox.style.minHeight = '150px';

  // Mwili wa kadi: "display: contents" ili muonekano ubaki kama ulivyokuwa
  const mwili = document.createElement('div');
  mwili.className = 'card-body';
  mwili.style.display = 'contents';

  card.appendChild(qrBox);
  card.appendChild(mwili);
  jazaMwiliWaKadi(mwili, eventId, guestId, data);
  wekaMaandishiYaKutafuta(card, data);
  return card;
}

function weka(grid, card, nafasi){
  const mbele = grid.children[nafasi] || null;
  grid.insertBefore(card, mbele);
}

function listenToGuests(eventId){
  if(guestsUnsubscribe) guestsUnsubscribe();

  futaKadiZote();
  andaaMwangalizi();

  const grid = document.getElementById('guestGrid');
  const hitilafuEneo = document.getElementById('deleteAllStatus');

  guestsUnsubscribe = db.collection('events').doc(eventId).collection('guests')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      // Tunashughulikia mabadiliko tu kwa kadi (si orodha nzima upya)
      snap.docChanges().forEach(change => {
        const id = change.doc.id;
        const data = change.doc.data();

        if(change.type === 'added'){
          const card = tengenezaKadi(eventId, id, data);
          kadiZaWageni.set(id, card);
          weka(grid, card, change.newIndex);

          const box = card.querySelector('.qr-box');
          if(qrObserver){
            qrObserver.observe(box);
          }else{
            tengenezaQR(box);
          }

        }else if(change.type === 'modified'){
          const card = kadiZaWageni.get(id);
          if(!card) return;

          // Sasisha maandishi na vitufe tu; QR inabaki kama ilivyo
          jazaMwiliWaKadi(card.querySelector('.card-body'), eventId, id, data);
          wekaMaandishiYaKutafuta(card, data);

          // Kama nafasi imebadilika, hamisha kadi
          if(change.oldIndex !== change.newIndex){
            card.remove();
            weka(grid, card, change.newIndex);
          }

        }else if(change.type === 'removed'){
          const card = kadiZaWageni.get(id);
          if(card){
            const box = card.querySelector('.qr-box');
            if(qrObserver && box) qrObserver.unobserve(box);
            card.remove();
            kadiZaWageni.delete(id);
          }
          dataZaWageni.delete(id);
        }
      });

      // Hesabu zinatoka kwenye orodha NZIMA ya wageni (wa zamani na wapya)
      sasishaTakwimu(snap.docs);

      // Tumia utafutaji uliopo (mgeni mpya au aliyebadilika ajichuje pia)
      tumiaUtafutaji();

      if(hitilafuEneo && hitilafuEneo.textContent.indexOf('Hitilafu kusoma orodha') === 0){
        hitilafuEneo.textContent = '';
      }
    }, err => {
      console.error('Guests listener error:', err);
      if(hitilafuEneo){
        hitilafuEneo.textContent = 'Hitilafu kusoma orodha: ' + err.message;
      }
    });
}

async function togglePaid(eventId, guestId, currentValue){
  try{
    await db.collection('events').doc(eventId).collection('guests').doc(guestId)
      .update({ paid: !currentValue });
  }catch(err){
    console.error(err);
    alert('Imeshindikana kubadili hali ya malipo: ' + err.message);
  }
}

async function deleteGuest(eventId, guestId){
  if(!confirm('Una uhakika unataka kufuta mgeni huyu?')) return;
  try{
    await db.collection('events').doc(eventId).collection('guests').doc(guestId).delete();
  }catch(err){
    console.error(err);
    alert('Imeshindikana kufuta: ' + err.message);
  }
}

// Pakua QR: kubwa na mpaka mweupe mpana kuzunguka (rahisi kusoma kwa kamera dhaifu)
function downloadQR(eventId, guestId, filename){
  const ukubwaQR = 800;   // ukubwa wa QR yenyewe
  const mpaka = 120;      // mpaka mweupe kuzunguka
  const jumla = ukubwaQR + mpaka * 2;

  // QR kubwa ya muda, haionekani kwenye ukurasa
  const temp = document.createElement('div');
  temp.style.position = 'absolute';
  temp.style.left = '-9999px';
  document.body.appendChild(temp);

  new QRCode(temp, {
    text: `${eventId}::${guestId}`,
    width: ukubwaQR,
    height: ukubwaQR,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.L // kiwango cha chini = vitone vikubwa, rahisi kusoma
  });

  const qrCanvas = temp.querySelector('canvas');

  // Picha ya mwisho: mraba mweupe wenye QR katikati
  const canvas = document.createElement('canvas');
  canvas.width = jumla;
  canvas.height = jumla;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, jumla, jumla);
  ctx.drawImage(qrCanvas, mpaka, mpaka, ukubwaQR, ukubwaQR);

  const link = document.createElement('a');
  link.download = `${filename || 'mgeni'}_QR.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();

  document.body.removeChild(temp);
}

// ============ EXCEL YA WAGENI WOTE ============
// Pakua Excel ya wageni WOTE wa tukio lililochaguliwa
// Safu: jina | namba ya simu | kodi
async function downloadExcelNamba(){
  if(!activeEventId || !activeEventData){
    alert('Chagua tukio kwanza.');
    return;
  }

  try{
    const snap = await db.collection('events').doc(activeEventId)
      .collection('guests')
      .get();

    if(snap.empty){
      alert('Hakuna wageni kwenye tukio hili.');
      return;
    }

    // Panga kwa mpangilio waliongezwa
    const wageni = [];
    snap.forEach(doc => wageni.push(doc.data()));
    wageni.sort((a, b) => {
      const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return ta - tb;
    });

    // Safu ya kwanza ni vichwa vya habari; simu zinahifadhiwa kama maandishi
    const rows = [['jina', 'namba ya simu', 'kodi']];
    wageni.forEach(g => {
      rows.push([
        String(g.name || ''),
        String(g.phone || ''),
        String(g.namba || '')
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Wageni');

    XLSX.writeFile(wb, `Wageni_${sanitizeFilename(activeEventData.name)}.xlsx`);
  }catch(err){
    console.error(err);
    alert('Imeshindikana kutengeneza Excel: ' + err.message);
  }
}

// ============ EVENT LISTENERS ============
document.getElementById('selectEvent').addEventListener('change', (e) => {
  onEventSelected(e.target.value);
});

// ============ INIT ============
pakiaUjumbeWaWhatsApp();
loadEvents();
