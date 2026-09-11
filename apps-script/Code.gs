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
  const rows = payload.rows;
  if (!evento || !fecha) return { ok: false, error: 'evento_o_fecha_faltante' };
  if (!Array.isArray(rows) || rows.length < 2) return { ok: false, error: 'archivo_vacio' };

  const headers = rows[0].map(h => String(h || '').trim());
  if (findColBy(headers, ['rut']) === -1) return { ok: false, error: 'sin_columna_rut' };

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
  const row = [
    now, evento, fechaEvento, run,
    payload.apellidoPaterno || '', payload.apellidoMaterno || '', payload.nombres || '',
    payload.fechaNacimiento || '', payload.sexo || '', payload.nacionalidad || '',
    fotoUrl, payload.qrRaw || '',
    inscrito ? 'Sí' : 'No',
    inscrito ? inscrito.correo : '', inscrito ? inscrito.telefono : '',
    inscrito ? inscrito.comuna : '', inscrito ? inscrito.region : '',
    inscrito ? inscrito.ocupacion : '', inscrito ? inscrito.edad : '',
    inscrito ? inscrito.genero : ''
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

function buscarInscrito(ss, evento, fecha, run) {
  const sheet = ss.getSheetByName(inscritosTabName(evento, fecha));
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return null;
  const headers = rows[0];

  const colRut = findColBy(headers, ['rut']);
  if (colRut === -1) return null;

  for (let i = 1; i < rows.length; i++) {
    if (normalizeRun(rows[i][colRut]) === run) {
      const get = (keywords, exclude) => {
        const idx = findColBy(headers, keywords, exclude);
        return idx === -1 ? '' : String(rows[i][idx] || '');
      };
      return {
        nombres: get(['nombre'], ['evento']),
        apellidoPaterno: get(['apellido']),
        fechaNacimiento: normalizeFechaTexto(get(['nacimiento'])),
        correo: get(['correo', 'email']),
        telefono: get(['telefono', 'teléfono', 'whatsapp', 'celular', 'fono']),
        comuna: get(['comuna']),
        region: get(['region', 'región']),
        ocupacion: get(['ocupacion', 'ocupación']),
        edad: get(['edad']),
        genero: get(['genero', 'género', 'identifica'], ['evento'])
      };
    }
  }
  return null;
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
