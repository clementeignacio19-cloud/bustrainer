/**
 * Backend de "Eventos QR" — Business Trainer.
 *
 * Este script debe crearse DESDE la Google Sheet que hará de base de datos
 * maestra (Extensiones → Apps Script), para que quede "atado" (bound) a esa
 * hoja y SpreadsheetApp.getActiveSpreadsheet() la encuentre sola.
 *
 * Ver apps-script/README.md para la guía de instalación paso a paso.
 */

// ── Configuración vía Script Properties (Project Settings → Script properties) ──
// EVENT_PIN        : PIN/clave compartida que deben ingresar los que escanean.
// DRIVE_FOLDER_ID   : ID de la carpeta raíz de Drive donde se guardan las fotos.
const PROPS = PropertiesService.getScriptProperties();

const SHEET_MAESTRO = 'Maestro';
const SHEET_EVENTOS = 'Eventos';

// El parseo del QR de la cédula (RUN, nombres, sexo, fecha nacimiento) pasa
// enteramente en el frontend (eventos.html, función parseCedulaChilena) por
// reconocimiento de patrones, no por un orden fijo de campos. Este backend
// solo recibe los campos ya interpretados (o vacíos si no se pudo parsear)
// más el texto crudo del QR en qrRaw, que siempre se guarda como respaldo.

function doGet(e) {
  try {
    const action = (e.parameter.action || '').trim();
    if (action === 'init') return jsonResponse(initResponse(e.parameter.pin));
    if (action === 'list') return jsonResponse(listAsistentes(e.parameter.evento, e.parameter.fecha, e.parameter.pin));
    if (action === 'buscarInscrito') return jsonResponse(buscarInscritoPublico(e.parameter.evento, e.parameter.fecha, e.parameter.run, e.parameter.pin));
    if (action === 'listInscritos') return jsonResponse(listInscritosPublico(e.parameter.evento, e.parameter.fecha, e.parameter.pin));
    return jsonResponse({ ok: false, error: 'accion_invalida' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (!checkPin(payload.pin)) return jsonResponse({ ok: false, error: 'pin_invalido' });
    if (payload.action === 'cargarInscritos') return jsonResponse(cargarInscritos(payload));
    return jsonResponse(registrarAsistente(payload));
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// ── Buscar un inscrito por RUT, para autocompletar ANTES de guardar ──
// (a diferencia de registrarAsistente, que solo enriquece al momento de
// grabar). El frontend llama esto justo después de leer el QR.
function buscarInscritoPublico(evento, fecha, run, pin) {
  if (!checkPin(pin)) return { ok: false, error: 'pin_invalido' };
  if (!evento || !fecha || !run) return { ok: false, error: 'datos_incompletos' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inscrito = buscarInscrito(ss, evento, fecha, normalizeRun(run));
  return { ok: true, encontrado: !!inscrito, inscrito: inscrito || null };
}

// ── Carga masiva de inscritos desde un Excel subido en la app ──
// Reemplaza por completo la lista de inscritos de ese evento cada vez que
// se sube un archivo nuevo (así no quedan filas viejas mezcladas con las
// nuevas). "rows" es una matriz (array de arrays): la primera fila son los
// encabezados tal cual venían en el Excel, no se exige ningún formato fijo
// más que tener una columna con "Rut" en el título.
function cargarInscritos(payload) {
  const evento = String(payload.evento || '').trim();
  const fecha = String(payload.fechaEvento || '').trim();
  const rowsIn = payload.rows;
  if (!evento || !fecha) return { ok: false, error: 'evento_o_fecha_faltante' };
  if (!Array.isArray(rowsIn) || rowsIn.length < 2) return { ok: false, error: 'archivo_vacio' };

  // Busca la fila de encabezados entre las primeras 10, en vez de asumir
  // que siempre es la primera — muchos Excel traen una fila de título (o
  // filas vacías) antes de los encabezados reales, y eso hacía fallar la
  // detección de la columna "Rut" aunque sí estuviera en el archivo.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rowsIn.length); i++) {
    const candidata = (rowsIn[i] || []).map(h => String(h || '').trim());
    if (findColBy(candidata, ['rut']) !== -1) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return { ok: false, error: 'sin_columna_rut' };
  const rows = rowsIn.slice(headerIdx);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabName = inscritosTabName(evento, fecha);
  const existente = ss.getSheetByName(tabName);
  if (existente) ss.deleteSheet(existente);

  const sheet = ss.insertSheet(tabName);
  const numCols = Math.max(...rows.map(r => r.length));
  const normalized = rows.map(r => {
    const row = r.slice(0, numCols);
    while (row.length < numCols) row.push('');
    return row;
  });
  sheet.getRange(1, 1, normalized.length, numCols).setValues(normalized);
  sheet.setFrozenRows(1);

  // Registra el evento en "Eventos recientes" (índice) aunque todavía no se
  // haya escaneado a nadie. Así aparece como tarjeta seleccionable en la
  // app, en vez de tener que volver a teclear el nombre y la fecha exactos
  // más tarde — un nombre escrito ligeramente distinto (mayúsculas, un
  // espacio, etc.) apunta a otra pestaña y la lista sube pero nunca se
  // encuentra al escanear, lo que parece un problema de lectura del Excel
  // pero en realidad es un evento con dos nombres que no calzan.
  registerEventInIndex(ss, evento, fecha, eventTabName(evento, fecha));

  return { ok: true, filas: normalized.length - 1, tab: tabName };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkPin(pin) {
  const real = PROPS.getProperty('EVENT_PIN');
  return !!real && String(pin || '') === real;
}

// ── Init: valida PIN y devuelve el listado de eventos existentes ──
function initResponse(pin) {
  if (!checkPin(pin)) return { ok: false, error: 'pin_invalido' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss, SHEET_EVENTOS, ['Evento', 'Fecha', 'Tab', 'Carpeta Drive ID', 'Asistentes', 'Creado']);
  const rows = sheet.getDataRange().getValues();
  const eventos = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    eventos.push({ nombre: r[0], fecha: formatFecha(r[1]), tab: r[2], asistentes: r[4] || 0 });
  }
  eventos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return { ok: true, eventos: eventos };
}

// ── Lista de asistentes de un evento puntual (para revisar en la app) ──
function listAsistentes(evento, fecha, pin) {
  if (!checkPin(pin)) return { ok: false, error: 'pin_invalido' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabName = eventTabName(evento, fecha);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return { ok: true, asistentes: [] };
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const asistentes = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    asistentes.push({
      timestamp: r[headers.indexOf('Timestamp')],
      run: r[headers.indexOf('RUN')],
      nombres: r[headers.indexOf('Nombres')],
      apellidoPaterno: r[headers.indexOf('Apellido Paterno')],
      apellidoMaterno: r[headers.indexOf('Apellido Materno')],
      sexo: r[headers.indexOf('Sexo')],
      fechaNacimiento: r[headers.indexOf('Fecha Nacimiento')],
      inscritoPrevio: r[headers.indexOf('Inscrito Previo')]
    });
  }
  return { ok: true, asistentes: asistentes };
}

// ── Registrar un asistente escaneado ──
function registrarAsistente(payload) {
  const evento = String(payload.evento || '').trim();
  const fechaEvento = String(payload.fechaEvento || '').trim(); // YYYY-MM-DD
  if (!evento || !fechaEvento) return { ok: false, error: 'evento_o_fecha_faltante' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabName = eventTabName(evento, fechaEvento);
  const eventSheet = getOrCreateSheet(ss, tabName, rowHeaders());
  registerEventInIndex(ss, evento, fechaEvento, tabName);

  const run = normalizeRun(payload.run);

  // Evitar duplicados dentro del mismo evento (misma persona escaneada 2 veces).
  if (run) {
    const existing = findByRun(eventSheet, run);
    if (existing) {
      return { ok: true, duplicate: true, existing: existing, count: countRows(eventSheet) };
    }
  }

  // Cruce con la lista de inscritos previos (formulario de inscripción), si existe
  // una pestaña para este evento. No es obligatorio: si no hay lista cargada, o el
  // RUT no aparece en ella, la persona igual queda registrada como asistente.
  const inscrito = run ? buscarInscrito(ss, evento, fechaEvento, run) : null;

  let fotoUrl = '';
  if (payload.fotoBase64) {
    fotoUrl = savePhotoToDrive(payload.fotoBase64, evento, fechaEvento, run || 'sin_run');
  }

  const now = new Date();
  // Si la persona no estaba en la lista de inscritos (walk-in), se usan los
  // datos que el operador completó en el momento en la app (payload.correo,
  // payload.comuna, etc. — la misma info que pediría el Formulario de
  // inscripción). Si sí estaba, manda lo que ya trae la lista, no lo que
  // haya quedado en esos campos (que la app deja vacíos en ese caso).
  const row = [
    now, evento, fechaEvento, run,
    payload.apellidoPaterno || '', payload.apellidoMaterno || '', payload.nombres || '',
    payload.fechaNacimiento || '', payload.sexo || '', payload.nacionalidad || '',
    fotoUrl, payload.qrRaw || '',
    inscrito ? 'Sí' : 'No',
    inscrito ? inscrito.correo : (payload.correo || ''),
    inscrito ? inscrito.telefono : (payload.telefono || ''),
    inscrito ? inscrito.comuna : (payload.comuna || ''),
    inscrito ? inscrito.region : (payload.region || ''),
    inscrito ? inscrito.ocupacion : (payload.ocupacion || ''),
    inscrito ? inscrito.edad : (payload.edad || ''),
    inscrito ? inscrito.genero : (payload.sexo || '')
  ];

  eventSheet.appendRow(row);
  const maestro = getOrCreateSheet(ss, SHEET_MAESTRO, rowHeaders());
  maestro.appendRow(row);

  const count = countRows(eventSheet);
  updateEventCount(ss, tabName, count);

  return { ok: true, duplicate: false, count: count, fotoUrl: fotoUrl, inscritoPrevio: !!inscrito };
}

function rowHeaders() {
  return ['Timestamp', 'Evento', 'Fecha Evento', 'RUN', 'Apellido Paterno', 'Apellido Materno',
    'Nombres', 'Fecha Nacimiento', 'Sexo', 'Nacionalidad', 'Foto URL', 'QR Raw',
    'Inscrito Previo', 'Correo (inscripción)', 'Teléfono (inscripción)', 'Comuna (inscripción)',
    'Región (inscripción)', 'Ocupación (inscripción)', 'Edad (inscripción)', 'Género autoidentificado (inscripción)'];
}

// ── Lista de inscritos previos ──
// Pestaña opcional por evento, nombrada "Insc <evento> <fecha>" (ver
// inscritosTabName). Se puede pegar ahí directamente la hoja de respuestas
// del Formulario de inscripción (Google Forms). Solo se exige una columna
// cuyo encabezado contenga "rut"; el resto de las columnas se detectan por
// palabras clave en el título, sin importar el orden ni el texto exacto.
function inscritosTabName(evento, fecha) {
  const base = 'Insc ' + eventTabName(evento, fecha);
  return base.length > 95 ? base.substring(0, 95) : base;
}

// Ubica, una sola vez por hoja, en qué columna está cada dato de interés
// (por palabras clave en el encabezado). Se reutiliza tanto para buscar
// una sola persona (buscarInscrito) como para traer la lista completa de
// una vez (listInscritosPublico, usada para precargar en la app y evitar
// una llamada a la red por cada escaneo).
function inscritoColumnIndexes(headers) {
  return {
    rut: findColBy(headers, ['rut']),
    nombres: findColBy(headers, ['nombre'], ['evento']),
    apellidoPaterno: findColBy(headers, ['apellido paterno', 'apellido']),
    apellidoMaterno: findColBy(headers, ['apellido materno']),
    fechaNacimiento: findColBy(headers, ['nacimiento']),
    correo: findColBy(headers, ['correo', 'email']),
    telefono: findColBy(headers, ['telefono', 'teléfono', 'whatsapp', 'celular', 'fono']),
    comuna: findColBy(headers, ['comuna']),
    region: findColBy(headers, ['region', 'región']),
    ocupacion: findColBy(headers, ['ocupacion', 'ocupación']),
    edad: findColBy(headers, ['edad']),
    genero: findColBy(headers, ['genero', 'género', 'identifica', 'sexo'], ['evento'])
  };
}

// row: una fila de valores. idx: el resultado de inscritoColumnIndexes.
// La fecha se lee del valor crudo de la celda (no via String()) porque
// Sheets convierte solo los textos con pinta de fecha a un objeto Date
// real al escribir la fila, y normalizeFechaTexto necesita distinguir
// ambos casos.
function extractInscrito(row, idx) {
  const get = (i) => i === -1 ? '' : String(row[i] || '');
  return {
    nombres: get(idx.nombres),
    apellidoPaterno: get(idx.apellidoPaterno),
    apellidoMaterno: get(idx.apellidoMaterno),
    fechaNacimiento: idx.fechaNacimiento === -1 ? '' : normalizeFechaTexto(row[idx.fechaNacimiento]),
    correo: get(idx.correo),
    telefono: get(idx.telefono),
    comuna: get(idx.comuna),
    region: get(idx.region),
    ocupacion: get(idx.ocupacion),
    edad: get(idx.edad),
    genero: get(idx.genero)
  };
}

function buscarInscrito(ss, evento, fecha, run) {
  const sheet = ss.getSheetByName(inscritosTabName(evento, fecha));
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return null;
  const idx = inscritoColumnIndexes(rows[0]);
  if (idx.rut === -1) return null;

  for (let i = 1; i < rows.length; i++) {
    if (normalizeRun(rows[i][idx.rut]) === run) return extractInscrito(rows[i], idx);
  }
  return null;
}

// Trae TODA la lista de inscritos de un evento de una vez, para que la app
// la precargue al entrar a escanear y busque por RUT localmente (sin red)
// en cada escaneo — clave para no perder tiempo con 200+ personas.
function listInscritosPublico(evento, fecha, pin) {
  if (!checkPin(pin)) return { ok: false, error: 'pin_invalido' };
  if (!evento || !fecha) return { ok: false, error: 'datos_incompletos' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(inscritosTabName(evento, fecha));
  if (!sheet) return { ok: true, inscritos: [] };
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { ok: true, inscritos: [] };
  const idx = inscritoColumnIndexes(rows[0]);
  if (idx.rut === -1) return { ok: true, inscritos: [] };

  const inscritos = [];
  for (let i = 1; i < rows.length; i++) {
    const run = normalizeRun(rows[i][idx.rut]);
    if (!run) continue;
    inscritos.push(Object.assign({ run: run }, extractInscrito(rows[i], idx)));
  }
  return { ok: true, inscritos: inscritos };
}

// keywords: coincide si el encabezado contiene alguna de estas palabras.
// exclude: descarta la columna si además contiene alguna de estas (para no
// confundir, p. ej., "Nombre" de la persona con "Nombre del evento").
function findColBy(headers, keywords, exclude) {
  const norm = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita tildes
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (exclude && exclude.some(k => h.indexOf(norm(k)) !== -1)) continue;
    if (keywords.some(k => h.indexOf(norm(k)) !== -1)) return i;
  }
  return -1;
}

// Intenta llevar una fecha de texto libre (como viene de un Excel: puede
// ser "12/05/1990", "1990-05-12", o ya un objeto Date de Sheets) a YYYY-MM-DD.
function normalizeFechaTexto(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

function countRows(sheet) {
  return Math.max(0, sheet.getLastRow() - 1);
}

function findByRun(sheet, run) {
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const runCol = headers.indexOf('RUN');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][runCol]) === run) {
      return {
        run: run,
        nombres: rows[i][headers.indexOf('Nombres')],
        apellidoPaterno: rows[i][headers.indexOf('Apellido Paterno')],
        timestamp: rows[i][headers.indexOf('Timestamp')]
      };
    }
  }
  return null;
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function eventTabName(evento, fecha) {
  const clean = (evento + ' ' + fecha).replace(/[\[\]\*\/\\\?:]/g, '').trim();
  return clean.length > 95 ? clean.substring(0, 95) : clean;
}

function registerEventInIndex(ss, evento, fecha, tabName) {
  const sheet = getOrCreateSheet(ss, SHEET_EVENTOS, ['Evento', 'Fecha', 'Tab', 'Carpeta Drive ID', 'Asistentes', 'Creado']);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === tabName) return; // ya existe
  }
  sheet.appendRow([evento, fecha, tabName, '', 0, new Date()]);
}

function updateEventCount(ss, tabName, count) {
  const sheet = ss.getSheetByName(SHEET_EVENTOS);
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][2] === tabName) {
      sheet.getRange(i + 1, 5).setValue(count);
      return;
    }
  }
}

// ── Fotos a Drive, organizadas en una subcarpeta por evento ──
function savePhotoToDrive(base64DataUrl, evento, fecha, run) {
  const rootId = PROPS.getProperty('DRIVE_FOLDER_ID');
  if (!rootId) return '';
  const root = DriveApp.getFolderById(rootId);

  const folderName = eventTabName(evento, fecha);
  const folders = root.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : root.createFolder(folderName);

  const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
  const mime = match ? match[1] : 'image/jpeg';
  const b64 = match ? match[2] : base64DataUrl;
  const bytes = Utilities.base64Decode(b64);
  const blob = Utilities.newBlob(bytes, mime, run + '_' + new Date().getTime() + '.jpg');

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// ── Utilidades de formato ──
function normalizeRun(run) {
  if (!run) return '';
  let r = String(run).replace(/\./g, '').trim().toUpperCase();
  if (!r.includes('-') && r.length > 1) {
    r = r.slice(0, -1) + '-' + r.slice(-1);
  }
  return r;
}

function formatFecha(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}
