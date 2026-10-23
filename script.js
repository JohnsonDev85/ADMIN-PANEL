const kitufeAnza = document.getElementById("anza");
const kisanduku = document.getElementById("jibu");
const jinaMgeni = document.getElementById("jinaMgeni");
const hali = document.getElementById("hali");
const kitufeMwingine = document.getElementById("mwingine");
const eneoLaKamera = document.getElementById("reader");
const eneoLaVifaa = document.getElementById("vifaaVyaKamera");
const sehemuYaNamba = document.getElementById("njiaNamba");
const kisandukuChaNamba = document.getElementById("nambaYaMgeni");

// Urefu wa namba ya getini (herufi). Ukibadilisha kwenye Admin Panel, badilisha hapa pia.
const UREFU_WA_NAMBA = 4;

let anaangalia = false;
let kameraImewaka = false;
let scanner = null;
let db = null;
let kidokezoTimer = null;

// Matukio yanayotumika kukagua kwa namba kwanza (ya leo, au jipya zaidi)
let matukioYaKukagua = [];
// Matukio YOTE (yanatumika kama namba haijapatikana kwenye ya leo)
let matukioYote = [];
let anakaguaNamba = false;

// Majina ya matukio yote (id -> jina), ili tusisome tukio tena wakati wa ukaguzi
let majinaYaMatukio = {};

// Tukio lililochaguliwa (linabaki hadi ukurasa ufunguliwe upya)
let tukioLililochaguliwa = "";

// Jibu lilitoka wapi: "juu" (QR) au "namba" (kuandika namba)
// Jibu linaonekana JUU kila mara; hii inabadilisha tu kitufe cha kuendelea
let njiaYaJibu = "juu";

// Weka kisanduku cha jibu juu ya kitufe cha Anza
function wekaJibuJuu() {
  if (kisanduku.nextElementSibling !== kitufeAnza) {
    kitufeAnza.parentNode.insertBefore(kisanduku, kitufeAnza);
  }
  kitufeMwingine.style.display = "";
}

// Mstari wa jina la tukio (unatengenezwa na JS, hauhitaji HTML)
function mstariWaTukio() {
  let el = document.getElementById("jinaTukio");
  if (!el) {
    el = document.createElement("p");
    el.id = "jinaTukio";
    el.style.margin = "6px 0 0";
    el.style.fontSize = "0.9rem";
    el.style.opacity = "0.85";
    el.style.letterSpacing = "1px";
    hali.insertAdjacentElement("afterend", el);
  }
  return el;
}

// darasa: imelipwa | haijalipwa | ameshaingia | haijulikani
// tukio (hiari): jina la tukio la kuonyesha chini ya hali
function onyeshaJibu(darasa, jina, maneno, tukio) {
  wekaJibuJuu();

  // Kitufe cha kuendelea kinategemea njia iliyotumika
  kitufeMwingine.textContent =
    njiaYaJibu === "namba" ? "Kagua Namba Nyingine" : "Scan Mwingine";

  kisanduku.className = darasa;
  kisanduku.style.display = "block";
  jinaMgeni.textContent = jina;
  hali.textContent = maneno;

  const mstari = mstariWaTukio();
  mstari.textContent = tukio ? tukio : "";
  mstari.style.display = tukio ? "block" : "none";

  // Hakikisha jibu linaonekana mara moja juu
  try {
    window.scrollTo(0, 0);
  } catch (e) {}
}

// ============ KUFICHA / KUONYESHA KAMERA ============
function fichaKamera() {
  eneoLaKamera.style.display = "none";
  eneoLaVifaa.style.display = "none";
}

function onyeshaKameraTena() {
  eneoLaKamera.style.display = "";
  eneoLaVifaa.style.display = "";
}

// Maliza matokeo na urudi kuscan (kamera inarudi)
function endeleaKuscan() {
  kisanduku.style.display = "none";
  anaangalia = false;
  if (kameraImewaka) {
    onyeshaKameraTena();
    try {
      scanner.resume();
    } catch (e) {}
    anzaKidokezo();
  }
}

window.onerror = function (ujumbe) {
  onyeshaJibu("haijulikani", "Kosa la JS", ujumbe);
};

try {
  const firebaseConfig = {
    apiKey: "AIzaSyBhh3nIzAWyvT47HQ-hh6umjqoCMYBI1Lk",
    authDomain: "johcards-2db9b.firebaseapp.com",
    projectId: "johcards-2db9b",
    storageBucket: "johcards-2db9b.firebasestorage.app",
    messagingSenderId: "955656442066",
    appId: "1:955656442066:web:3f0d0335191d67eac61d0b"
  };
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();

  // Mipangilio salama kwa mitandao dhaifu ya simu (lazima iwe kabla ya matumizi yoyote)
  try {
    db.settings({ experimentalAutoDetectLongPolling: true, merge: true });
  } catch (e) {
    console.warn("Mipangilio ya mtandao haikuwekwa:", e);
  }
} catch (error) {
  onyeshaJibu("haijulikani", "Firebase haijapakia", error.message);
}

// ============ MLIO NA MTETEMO ============
let sautiCtx = null;

// Gusa skrini mara ya kwanza: inaandaa sauti na mtetemo
function andaaSautiNaMtetemo() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !sautiCtx) sautiCtx = new AC();
    if (sautiCtx && sautiCtx.state === "suspended") sautiCtx.resume();
  } catch (e) {}
  try {
    if (navigator.vibrate) navigator.vibrate(1);
  } catch (e) {}
}
document.addEventListener("pointerdown", andaaSautiNaMtetemo, { once: true });
document.addEventListener("touchstart", andaaSautiNaMtetemo, { once: true });

function piga(vizuri) {
  try {
    if (!sautiCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) sautiCtx = new AC();
    }
    if (sautiCtx) {
      if (sautiCtx.state === "suspended") sautiCtx.resume();
      const o = sautiCtx.createOscillator();
      const g = sautiCtx.createGain();
      o.connect(g);
      g.connect(sautiCtx.destination);
      o.frequency.value = vizuri ? 1200 : 300;
      g.gain.value = 0.15;
      o.start();
      o.stop(sautiCtx.currentTime + (vizuri ? 0.12 : 0.35));
    }
  } catch (e) {}
  try {
    if (navigator.vibrate) {
      navigator.vibrate(vizuri ? 150 : [250, 100, 250]);
    }
  } catch (e) {}
}

// Maandishi ya SINGLE / DOUBLE
function maandishiYaAina(mgeni) {
  return mgeni.aina === "double" ? "DOUBLE (watu 2)" : "SINGLE (mtu 1)";
}

// ============ UKAGUZI WA MGENI (QR na namba) ============
// mgeniAwali (hiari): data ya mgeni tuliyokwisha kuisoma (kwa namba).
// Kama ameshaingia au hajalipa, jibu linatoka mara moja bila transaction.
async function kaguaMgeni(ref, mgeniAwali) {
  try {
    // Jina la tukio: linatoka kwenye kumbukumbu; likikosekana, linatafutwa
    // sambamba na ukaguzi (halichelewesha)
    const tukioRef = ref.parent.parent;
    const eventId = tukioRef.id;
    let jinaPromise;
    if (majinaYaMatukio[eventId] !== undefined) {
      jinaPromise = Promise.resolve(majinaYaMatukio[eventId]);
    } else {
      jinaPromise = tukioRef.get()
        .then(function (d) {
          const n = d.exists ? (d.data().name || "") : "";
          majinaYaMatukio[eventId] = n;
          return n;
        })
        .catch(function () { return ""; });
    }

    let matokeo;

    if (mgeniAwali && mgeniAwali.attended === true) {
      // Njia ya haraka: ameshaingia
      matokeo = { aina: "ameshaingia", jina: mgeniAwali.name };
    } else if (mgeniAwali && mgeniAwali.paid !== true) {
      // Njia ya haraka: hajalipa
      matokeo = { aina: "haijalipwa", jina: mgeniAwali.name };
    } else {
      // Transaction: inazuia watu wawili kuingia kwa kadi moja kwa wakati mmoja
      // Inasoma mgeni tu (jina la tukio halisomwi tena hapa)
      matokeo = await db.runTransaction(async function (t) {
        const doc = await t.get(ref);

        if (!doc.exists) {
          return { aina: "haijulikani" };
        }

        const mgeni = doc.data();

        // Kwanza: ameshaingia? (inafanya kazi kwa QR na kwa namba)
        if (mgeni.attended === true) {
          return { aina: "ameshaingia", jina: mgeni.name };
        }

        // Kisha: amelipa?
        if (mgeni.paid !== true) {
          return { aina: "haijalipwa", jina: mgeni.name };
        }

        t.update(ref, {
          attended: true,
          attendedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return {
          aina: "karibu",
          jina: mgeni.name,
          ainaKadi: maandishiYaAina(mgeni)
        };
      });
    }

    const jinaLaTukio = await jinaPromise;
    const tukio = jinaLaTukio ? "Tukio: " + jinaLaTukio : "";

    if (matokeo.aina === "haijulikani") {
      onyeshaJibu("haijulikani", "", "KADI HII HAIPO");
      piga(false);
    } else if (matokeo.aina === "haijalipwa") {
      onyeshaJibu("haijalipwa", matokeo.jina, "HAJALIPA ✘", tukio);
      piga(false);
    } else if (matokeo.aina === "ameshaingia") {
      onyeshaJibu("ameshaingia", matokeo.jina, "ALISHAINGIA TAYARI", tukio);
      piga(false);
    } else {
      onyeshaJibu(
        "imelipwa",
        matokeo.jina,
        "AMELIPA ✔ KARIBU · " + matokeo.ainaKadi,
        tukio
      );
      piga(true);
    }
  } catch (error) {
    onyeshaJibu("haijulikani", "Kosa", error.message);
    piga(false);
  }
}

// Ukaguzi kwa QR (haihitaji kuchagua tukio)
async function angaliaMgeni(maandishi) {
  const sehemu = maandishi.split("::");

  if (sehemu.length !== 2) {
    onyeshaJibu("haijulikani", "", "KADI HII HAIPO");
    piga(false);
    return;
  }

  const ref = db
    .collection("events").doc(sehemu[0])
    .collection("guests").doc(sehemu[1]);

  await kaguaMgeni(ref);
}

// ============ KUTAFUTA TUKIO LA KUKAGUA KWA NAMBA ============
function tareheYaLeo() {
  const d = new Date();
  return (
    d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

// Jaza orodha ya kuchagua tukio (inaonekana tu kama matukio ni zaidi ya moja)
// Ni hiari: bila kuchagua, matukio yote ya leo yanakaguliwa
function andaaOrodhaYaMatukio() {
  const orodha = document.getElementById("chaguaTukio");
  if (!orodha) return;

  if (matukioYaKukagua.length > 1) {
    orodha.innerHTML = "";

    const kwanza = document.createElement("option");
    kwanza.value = "";
    kwanza.textContent = "— Matukio yote ya leo —";
    orodha.appendChild(kwanza);

    matukioYaKukagua.forEach(function (e) {
      const op = document.createElement("option");
      op.value = e.id;
      op.textContent = e.name;
      orodha.appendChild(op);
    });

    // Rudisha chaguo la awali kama bado lipo
    const bado = matukioYaKukagua.some(function (e) { return e.id === tukioLililochaguliwa; });
    if (!bado) tukioLililochaguliwa = "";
    orodha.value = tukioLililochaguliwa;

    orodha.style.display = "block";
  } else {
    orodha.style.display = "none";
    tukioLililochaguliwa = "";
  }
}

// Matukio ya leo; kama hakuna, tukio jipya zaidi
async function tafutaMatukio() {
  const lebo = document.getElementById("lebo");
  try {
    const snap = await db.collection("events").orderBy("createdAt", "desc").get();
    const wote = [];
    snap.forEach(function (doc) {
      wote.push({ id: doc.id, ...doc.data() });
    });

    // Matukio yote yanakumbukwa kwa utafutaji wa ziada
    matukioYote = wote;

    // Kumbuka majina ya matukio yote (kwa ukaguzi wa haraka)
    majinaYaMatukio = {};
    wote.forEach(function (e) {
      majinaYaMatukio[e.id] = e.name || "";
    });

    const leo = tareheYaLeo();
    let waLeo = wote.filter(function (e) { return e.date === leo; });
    if (waLeo.length === 0 && wote.length > 0) {
      waLeo = [wote[0]];
    }

    matukioYaKukagua = waLeo;
    andaaOrodhaYaMatukio();
    onyeshaLeboLaTukio();
  } catch (error) {
    console.error(error);
    if (lebo) lebo.textContent = "Imeshindikana kupakia tukio";
  }
}

// Maandishi chini ya sehemu ya namba (kama kipengele cha #lebo kipo kwenye HTML)
function onyeshaLeboLaTukio() {
  const lebo = document.getElementById("lebo");
  if (!lebo) return;

  if (matukioYaKukagua.length === 0) {
    lebo.textContent = "Hakuna tukio";
  } else if (matukioYaKukagua.length === 1) {
    lebo.textContent = "Tukio: " + matukioYaKukagua[0].name;
  } else if (tukioLililochaguliwa) {
    const t = matukioYaKukagua.find(function (e) { return e.id === tukioLililochaguliwa; });
    lebo.textContent = "Tukio: " + (t ? t.name : "");
  } else {
    lebo.textContent = "Matukio ya leo: " + matukioYaKukagua.length + " (yote yanakaguliwa)";
  }
}

// ============ UKAGUZI KWA NAMBA ============

// Tafuta namba kwenye orodha ya matukio (kwa wakati mmoja)
async function tafutaNambaKwenyeMatukio(orodha, namba) {
  const majibu = await Promise.all(
    orodha.map(function (e) {
      return db
        .collection("events").doc(e.id)
        .collection("guests")
        .where("namba", "==", namba)
        .limit(1)
        .get();
    })
  );

  const zilizopatikana = [];
  majibu.forEach(function (snap) {
    if (!snap.empty) {
      zilizopatikana.push({ ref: snap.docs[0].ref, data: snap.docs[0].data() });
    }
  });
  return zilizopatikana;
}

async function angaliaKwaNamba() {
  if (anakaguaNamba) return;

  // Jibu linaonekana juu, na kitufe kitakuwa "Kagua Namba Nyingine"
  njiaYaJibu = "namba";

  const namba = kisandukuChaNamba.value.trim().toUpperCase().replace(/\s+/g, "");

  if (!db) {
    onyeshaJibu("haijulikani", "Kosa", "Firebase haijapakia");
    return;
  }
  if (!namba) {
    onyeshaJibu("haijulikani", "", "ANDIKA NAMBA KWANZA");
    return;
  }

  anakaguaNamba = true;

  // Funga kibodi ili jibu lionekane vizuri, na onyesha kuwa inakagua mara moja
  try { kisandukuChaNamba.blur(); } catch (e) {}
  onyeshaJibu("haijulikani", namba, "Inakagua...");
  kitufeMwingine.style.display = "none";

  try {
    // Matukio yakiwa hayajapakia bado, yatafute kwanza
    if (matukioYaKukagua.length === 0) {
      await tafutaMatukio();
    }
    if (matukioYaKukagua.length === 0) {
      onyeshaJibu("haijulikani", "", "HAKUNA TUKIO");
      piga(false);
      return;
    }

    // Kama ameshachagua tukio, tafuta humo tu; vinginevyo tafuta kwenye matukio ya leo kwanza
    const matukioYaKutafuta =
      tukioLililochaguliwa
        ? matukioYaKukagua.filter(function (e) { return e.id === tukioLililochaguliwa; })
        : matukioYaKukagua;

    let zilizopatikana = await tafutaNambaKwenyeMatukio(matukioYaKutafuta, namba);

    // Haikupatikana kwenye ya leo: tafuta kwenye matukio MENGINE YOTE
    // (si pale mlinzi alipochagua tukio mwenyewe)
    if (zilizopatikana.length === 0 && !tukioLililochaguliwa) {
      const wengine = matukioYote.filter(function (e) {
        return !matukioYaKutafuta.some(function (x) { return x.id === e.id; });
      });
      if (wengine.length > 0) {
        zilizopatikana = await tafutaNambaKwenyeMatukio(wengine, namba);
      }
    }

    if (zilizopatikana.length === 0) {
      onyeshaJibu("haijulikani", namba, "NAMBA HII HAIPO");
      piga(false);
    } else if (zilizopatikana.length > 1) {
      // Kodi ileile ipo kwenye matukio zaidi ya moja (wageni wa zamani): usikisie
      onyeshaJibu("haijulikani", namba, "NAMBA IMEJIRUDIA - CHAGUA TUKIO");
      piga(false);
    } else {
      await kaguaMgeni(zilizopatikana[0].ref, zilizopatikana[0].data);
    }
  } catch (error) {
    onyeshaJibu("haijulikani", "Kosa", error.message);
    piga(false);
  } finally {
    anakaguaNamba = false;
    // Usifanye focus hapa: ingerudisha ukurasa chini na kuficha jibu
    kisandukuChaNamba.value = "";
  }
}

// Unganisha sehemu ya "kagua kwa namba" (HTML yake iko kwenye index.html)
function andaaNjiaYaNamba() {
  const kitufeKagua = document.getElementById("kagua");
  const orodha = document.getElementById("chaguaTukio");
  if (!kisandukuChaNamba || !kitufeKagua) return;

  kisandukuChaNamba.maxLength = UREFU_WA_NAMBA;

  kitufeKagua.addEventListener("click", angaliaKwaNamba);

  // Mtu akichagua tukio, linakumbukwa hadi ukurasa ufunguliwe upya
  if (orodha) {
    orodha.addEventListener("change", function () {
      tukioLililochaguliwa = orodha.value;
      onyeshaLeboLaTukio();
      kisandukuChaNamba.focus();
    });
  }

  kisandukuChaNamba.addEventListener("keydown", function (e) {
    if (e.key === "Enter") angaliaKwaNamba();
  });

  // Ukianza kuandika namba mpya, jibu la awali la namba linafutika
  kisandukuChaNamba.addEventListener("input", function () {
    if (njiaYaJibu === "namba" && !anakaguaNamba) {
      kisanduku.style.display = "none";
    }

    kisandukuChaNamba.value = kisandukuChaNamba.value.toUpperCase().replace(/\s+/g, "");

    // Ikifika herufi zote, kagua yenyewe (hakuna kubonyeza kitufe)
    if (kisandukuChaNamba.value.length >= UREFU_WA_NAMBA) {
      angaliaKwaNamba();
    }
  });

  if (db) tafutaMatukio();
}

// ============ KIDOKEZO KAMA QR HAISOMEKI ============
function futaKidokezo() {
  if (kidokezoTimer) {
    clearTimeout(kidokezoTimer);
    kidokezoTimer = null;
  }
  const k = document.getElementById("kidokezo");
  if (k) k.classList.remove("onekana");
}

function anzaKidokezo() {
  futaKidokezo();
  kidokezoTimer = setTimeout(function () {
    const k = document.getElementById("kidokezo");
    if (!k) return;
    k.textContent =
      "QR haisomeki? Sogeza simu mbali au karibu, ongeza mwanga, au washa tochi.";
    k.classList.add("onekana");
  }, 10000);
}

// ============ TOCHI NA ZOOM (kama simu inaruhusu) ============
function onyeshaVifaaVyaKamera() {
  const eneo = document.getElementById("vifaaVyaKamera");
  if (!eneo) return;
  eneo.innerHTML = "";

  let uwezo = null;
  try {
    uwezo = scanner.getRunningTrackCameraCapabilities();
  } catch (e) {
    return; // simu haiungi mkono
  }
  if (!uwezo) return;

  // Tochi
  try {
    const tochi = uwezo.torchFeature();
    if (tochi && tochi.isSupported()) {
      let imewaka = false;
      const kitufe = document.createElement("button");
      kitufe.type = "button";
      kitufe.textContent = "🔦 Washa Tochi";
      kitufe.addEventListener("click", async function () {
        try {
          await tochi.apply(!imewaka);
          imewaka = !imewaka;
          kitufe.textContent = imewaka ? "🔦 Zima Tochi" : "🔦 Washa Tochi";
        } catch (e) {
          console.warn("Tochi imeshindikana:", e);
        }
      });
      eneo.appendChild(kitufe);
    }
  } catch (e) {}

  // Zoom
  try {
    const zum = uwezo.zoomFeature();
    if (zum && zum.isSupported()) {
      const lebo = document.createElement("label");
      lebo.textContent = "Zoom ";
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = zum.min();
      slider.max = zum.max();
      slider.step = zum.step();
      slider.value = zum.value();
      slider.addEventListener("input", function () {
        zum.apply(parseFloat(slider.value)).catch(function () {});
      });
      lebo.appendChild(slider);
      eneo.appendChild(lebo);
    }
  } catch (e) {}
}

// ============ KUSCAN QR ============
// Scanner inasimama baada ya kila mgeni; bonyeza "mwingine" kuendelea
function scanImefanikiwa(maandishi) {
  if (anaangalia) return;
  anaangalia = true;

  // Matokeo ya QR yanaonekana juu ya kamera
  njiaYaJibu = "juu";

  futaKidokezo();

  // Mtetemo mfupi tu kuonyesha QR imesomwa (mlio unatoka baada ya jibu)
  try {
    if (navigator.vibrate) navigator.vibrate(30);
  } catch (e) {}

  // Simamisha kamera na uifiche ili matokeo yaonekane juu bila kuscroll
  try {
    scanner.pause(true);
  } catch (e) {}
  fichaKamera();

  onyeshaJibu("haijulikani", "Inakagua...", "Subiri kidogo");
  // Kitufe cha kuendelea kinafichwa hadi jibu litoke
  kitufeMwingine.style.display = "none";

  angaliaMgeni(maandishi);
}

// Mipangilio ya kamera inayofaa simu zote, hata za kawaida
const mipangilioYaKamera = {
  fps: 15, // kasi zaidi ya kusoma fremu
  disableFlip: true,
  qrbox: function (upana, urefu) {
    // Soma karibu fremu nzima, QR hahitaji kuwa katikati kabisa
    const ndogo = Math.min(upana, urefu);
    const ukubwa = Math.max(50, Math.floor(ndogo * 0.9));
    return { width: ukubwa, height: ukubwa };
  }
};

// Jaribu njia kadhaa za kufungua kamera ili ifanye kazi kwenye simu yoyote
async function fungulaKamera() {
  // 1. Kamera ya nyuma (njia ya kawaida)
  try {
    await scanner.start({ facingMode: "environment" }, mipangilioYaKamera, scanImefanikiwa);
    return;
  } catch (e1) {
    console.warn("Kamera ya nyuma imeshindikana, najaribu nyingine:", e1);
  }

  // 2. Tafuta kamera zote za simu, chagua ya nyuma (au ya mwisho kwenye orodha)
  try {
    const kamera = await Html5Qrcode.getCameras();
    if (kamera && kamera.length) {
      const nyuma =
        kamera.find(function (k) { return /back|rear|environment|nyuma/i.test(k.label); }) ||
        kamera[kamera.length - 1];
      await scanner.start(nyuma.id, mipangilioYaKamera, scanImefanikiwa);
      return;
    }
  } catch (e2) {
    console.warn("Orodha ya kamera imeshindikana, najaribu ya mbele:", e2);
  }

  // 3. Kamera ya mbele kama ya mwisho
  await scanner.start({ facingMode: "user" }, mipangilioYaKamera, scanImefanikiwa);
}

kitufeAnza.addEventListener("click", function () {
  // Ujumbe wa kamera unaonekana juu
  njiaYaJibu = "juu";

  if (typeof Html5Qrcode === "undefined") {
    onyeshaJibu("haijulikani", "Kosa", "Maktaba ya scanner haijapakia");
    return;
  }

  // Kamera tayari imewaka: usifungue mara mbili
  if (kameraImewaka) return;

  if (!scanner) {
    const mipangilio = { verbose: false, useBarCodeDetectorIfSupported: true };
    if (typeof Html5QrcodeSupportedFormats !== "undefined") {
      mipangilio.formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE];
    }
    scanner = new Html5Qrcode("reader", mipangilio);
  }

  // Washa sauti (inahitaji kubonyeza kitufe mara ya kwanza)
  piga(true);

  onyeshaJibu("haijulikani", "Subiri...", "Inafungua kamera");

  fungulaKamera()
    .then(function () {
      kameraImewaka = true;
      kisanduku.style.display = "none";

      // Omba focus ya kuendelea (kamera zisizo na focus nzuri)
      try {
        if (typeof scanner.applyVideoConstraints === "function") {
          scanner
            .applyVideoConstraints({ advanced: [{ focusMode: "continuous" }] })
            .catch(function () {});
        }
      } catch (e) {}

      onyeshaVifaaVyaKamera();
      anzaKidokezo();
    })
    .catch(function (error) {
      const maelezo = String(error);
      if (/NotAllowed|Permission|denied/i.test(maelezo)) {
        onyeshaJibu(
          "haijulikani",
          "Kamera imezuiwa",
          "Ruhusu kamera kwenye browser, kisha bonyeza Anza tena"
        );
      } else {
        onyeshaJibu("haijulikani", "Kamera haijafunguka", maelezo);
      }
    });
});

// Kitufe cha kuendelea:
// - Baada ya QR: matokeo yanaondoka na kamera inarudi ("Scan Mwingine")
// - Baada ya namba: jibu linaondoka na kisanduku cha namba kinafunguka ("Kagua Namba Nyingine")
kitufeMwingine.addEventListener("click", function () {
  if (njiaYaJibu === "namba") {
    kisanduku.style.display = "none";
    kisandukuChaNamba.value = "";
    try {
      sehemuYaNamba.scrollIntoView({ block: "center" });
    } catch (e) {}
    kisandukuChaNamba.focus();
  } else {
    endeleaKuscan();
  }
});

// ============ INIT ============
andaaNjiaYaNamba();
