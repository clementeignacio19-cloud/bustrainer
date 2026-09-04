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

// Orden de los campos del QR de la cédula chilena (2013+). Si al probar con
// un carnet real el orden sale distinto, ajusta este arreglo — es lo único
// que hay que tocar para corregir el parseo.
const CEDULA_FIELD_ORDER = [
  'run', 'apellidoPaterno', 'apellidoMaterno', 'nombres',
  'nacionalidad', 'fechaNacimiento', 'sexo', 'fechaEmision', 'numeroDocumento'
];

function doGet(e) {
  try {
    const action = (e.parameter.action || '').trim();
    if (action === 'init') return jsonResponse(initResponse(e.parameter.pin));
    if (action === 'list') return jsonResponse(listAsistentes(e.parameter.evento, e.parameter.fecha, e.parameter.pin));
    return jsonResponse({ ok: false, error: 'accion_invalida' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (!checkPin(payload.pin)) return jsonResponse({ ok: false, error: 'pin_invalido' });
    return jsonResponse(registrarAsistente(payload));
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
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
      fechaNacimiento: r[headers.indexOf('Fecha Nacimiento')]
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

  let fotoUrl = '';
  if (payload.fotoBase64) {
    fotoUrl = savePhotoToDrive(payload.fotoBase64, evento, fechaEvento, run || 'sin_run');
  }

  const now = new Date();
  const row = [
    now, evento, fechaEvento, run,
    payload.apellidoPaterno || '', payload.apellidoMaterno || '', payload.nombres || '',
    payload.fechaNacimiento || '', payload.sexo || '', payload.nacionalidad || '',
    fotoUrl, payload.qrRaw || ''
  ];

  eventSheet.appendRow(row);
  const maestro = getOrCreateSheet(ss, SHEET_MAESTRO, rowHeaders());
  maestro.appendRow(row);

  const count = countRows(eventSheet);
  updateEventCount(ss, tabName, count);

  return { ok: true, duplicate: false, count: count, fotoUrl: fotoUrl };
}

function rowHeaders() {
  return ['Timestamp', 'Evento', 'Fecha Evento', 'RUN', 'Apellido Paterno', 'Apellido Materno',
    'Nombres', 'Fecha Nacimiento', 'Sexo', 'Nacionalidad', 'Foto URL', 'QR Raw'];
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
