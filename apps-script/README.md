# Eventos QR — Guía de instalación (Google Apps Script)

Esta app usa una **Google Sheet como base de datos maestra** y una **carpeta
de Drive** para las fotos de los QR escaneados. El backend es un Google
Apps Script gratuito, sin necesidad de tarjeta de crédito ni cuentas
técnicas nuevas.

## 1. Google Sheet (ya creada ✅)

Ya está creada en tu Drive (clementeignacio19@gmail.com):

- **"Eventos QR — Maestro"** → https://docs.google.com/spreadsheets/d/1Sb8KZi840krYImiRxeO554N23VuRbFycvOhb2vFhaGY/edit
- ID: `1Sb8KZi840krYImiRxeO554N23VuRbFycvOhb2vFhaGY`

No hace falta crear pestañas ni columnas a mano — el script las crea solo
la primera vez que alguien registra un asistente (`Maestro`, `Eventos`, y
una pestaña por cada evento).

## 2. Carpeta de Drive para las fotos (ya creada ✅)

También ya está creada:

- **"Eventos QR — Fotos"** → https://drive.google.com/drive/folders/1cR8lErr3tjeurW2evH61YdeEWRnzaGTW
- ID: `1cR8lErr3tjeurW2evH61YdeEWRnzaGTW`

Guarda este ID — lo vas a pegar en el paso 4 (`DRIVE_FOLDER_ID`).

## 3. Crear el Apps Script (atado a la Sheet)

Este paso sí lo tienes que hacer tú manualmente: no existe una API pública
para crear y desplegar un Apps Script desde afuera, así que no puedo
automatizarlo. Son ~3 minutos:

1. Abre la Sheet del paso 1 (el link de arriba).
2. Ve a **Extensiones → Apps Script**.
3. Borra el contenido del archivo `Code.gs` que se abre y pega el contenido
   completo de [`Code.gs`](./Code.gs) de esta carpeta.
4. Guarda el proyecto (ícono de disquete). Ponle un nombre, ej. "Eventos QR Backend".

## 4. Configurar las Script Properties (PIN y carpeta de Drive)

1. En el editor de Apps Script, ve a **Configuración del proyecto** (ícono
   de engranaje a la izquierda).
2. Baja hasta **Propiedades del script** → **Añadir propiedad del script**.
3. Agrega estas dos:
   - `EVENT_PIN` → la clave que van a usar las personas que escaneen (ej. `2026`).
   - `DRIVE_FOLDER_ID` → `1cR8lErr3tjeurW2evH61YdeEWRnzaGTW` (la carpeta ya creada del paso 2).
4. Guarda.

## 5. Publicar como Web App

1. En el editor de Apps Script, arriba a la derecha: **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Configuración:
   - **Ejecutar como:** Yo (tu cuenta) — así el script puede escribir en la
     Sheet y en Drive sin pedirle login a cada persona que escanea.
   - **Quién tiene acceso:** Cualquier usuario.
4. Haz clic en **Implementar** y autoriza los permisos que pida Google
   (acceso a tu Sheet y a Drive).
5. Copia la **URL de la aplicación web** que te entrega (termina en `/exec`).

## 6. Conectar el frontend

1. Abre `eventos.html` en este repo.
2. Busca la línea:
   ```js
   const APPS_SCRIPT_URL = "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT";
   ```
3. Reemplázala por la URL que copiaste en el paso 5.
4. Sube el cambio (commit + push) para que Vercel lo despliegue en `/eventos`.

## 7. Probar

1. Abre `/eventos` desde el celular (necesita cámara y HTTPS — Vercel ya
   sirve en HTTPS).
2. Ingresa el `EVENT_PIN` que configuraste.
3. Crea un evento (nombre + fecha, la fecha viene con el día de hoy por
   defecto).
4. Escanea el QR del carnet de una persona. Se abre una tarjeta con los
   datos leídos (nombre, apellidos, sexo, fecha de nacimiento) y la foto
   capturada — revisa y confirma.
5. Verifica en la Sheet que apareció la fila en la pestaña `Maestro` y en la
   pestaña del evento, y que la foto quedó en la carpeta de Drive.

## 7.b Instalarla como app en el celular (gratis, sin tienda de apps)

`eventos.html` ya está preparado como PWA (Progressive Web App): tiene
manifest e ícono propios, así que se puede "instalar" desde el navegador y
queda como un ícono más en la pantalla de inicio, abriendo directo al
escáner — sin pasar por Play Store / App Store ni pagar nada.

- **Android (Chrome):** abre `/eventos`, toca el menú (⋮) → **"Instalar
  app"** (o aparece un banner automático abajo). Queda con el ícono "QR"
  en la pantalla de inicio y abre en modo app, sin barra del navegador.
- **iPhone (Safari):** abre `/eventos`, toca el botón de compartir (□↑) →
  **"Añadir a pantalla de inicio"**.

Cada persona del equipo que vaya a escanear hace esto una sola vez en su
propio celular; todas comparten el mismo backend (Sheet + Drive) a través
del PIN.

## 8. (Opcional) Cruzar con la lista de inscritos previos

Como el QR de la cédula chilena moderna solo trae el RUN (ver nota más
abajo), este cruce es lo que permite que el nombre, sexo y demás datos se
completen solos al escanear, en vez de tener que escribirlos a mano cada
vez — con tal de que la persona ya se haya inscrito antes al evento (por
ejemplo, con el Formulario de inscripción: nombre, edad, género, correo,
teléfono, RUT, comuna, etc.).

**Forma recomendada — subir el Excel desde la app:**

1. En la app, en la pantalla "¿Qué evento vas a registrar?", completa el
   nombre y la fecha del evento (igual que para crearlo).
2. Toca **"📥 Subir lista de inscritos (Excel)"** y elige el archivo
   (.xlsx, .xls o .csv) con las respuestas de inscripción.
3. Listo — la app lo sube solo, sin tocar la Sheet a mano. Si vuelves a
   subir un archivo para el mismo evento, reemplaza la lista anterior
   completa (no se duplica).

El único requisito del archivo es tener **una columna con "Rut" en el
título** (mayúsculas o minúsculas, no importa) — el resto de las columnas
(nombre, apellido, correo, teléfono/WhatsApp, comuna, región, ocupación,
edad, género, fecha de nacimiento) se detectan solas por palabras clave en
el encabezado, en cualquier orden, así que puedes subir tal cual el Excel
que exporte tu Google Form u otro sistema.

**Forma manual (alternativa):** también puedes seguir pegando los datos
directo en una pestaña de la Sheet, con el nombre exacto
`Insc <Nombre del evento> <Fecha YYYY-MM-DD>` (ej. `Insc Taller Bienestar
2026-09-23` — mismo nombre y fecha que uses en la app), misma regla de la
columna "Rut".

**Qué pasa en cada escaneo:**
- Si el RUN leído del QR aparece en esa lista, la app **autocompleta**
  nombre, apellido, sexo y fecha de nacimiento (si están disponibles) antes
  de mostrarte la tarjeta de confirmación — revisas y guardas. Además, la
  fila del `Maestro` y la del evento quedan con `Inscrito Previo: Sí` y el
  resto de los datos de inscripción (correo, teléfono, comuna, etc.)
  anexados.
- Si no aparece (o no hay lista cargada para ese evento), la tarjeta de
  confirmación muestra además una sección **"Datos de inscripción"** con
  edad, comuna, correo, teléfono, región y ocupación — los mismos campos
  del Formulario de inscripción oficial — para completar ahí mismo, en el
  momento. Así una persona que se inscribe el mismo día del evento, o que
  nunca llenó el formulario antes, queda con el registro completo igual,
  sin tener que inscribirla aparte después. Queda con `Inscrito Previo: No`.

> ¿Quieres que también arme el Formulario de inscripción (Google Form) con
> los campos del documento de Fundación Bienestar Mayor, conectado
> directamente a esta misma Sheet? Es un paso aparte que puedo dejar listo
> si lo pides.

## Notas importantes

- **Formato del QR de la cédula chilena**: el parser en `eventos.html`
  (función `parseCedulaChilena`) asume el orden de campos más común
  reportado para las cédulas chilenas 2013+: `RUN;Paterno;Materno;Nombres;
  Nacionalidad;FechaNacimiento;Sexo;FechaEmisión;NúmeroDocumento`. **Pruébalo
  con un carnet real** — si algún campo sale en la posición incorrecta, es
  un ajuste de una línea en el arreglo de índices de esa función (y su
  espejo en `Code.gs`, constante `CEDULA_FIELD_ORDER`, documentado ahí
  mismo). Si el QR no calza con ningún patrón conocido, la app igual
  muestra la tarjeta de confirmación vacía para completar los datos a mano
  — nunca se pierde el escaneo, y el texto crudo del QR (`qrRaw`) siempre
  se guarda en la Sheet como respaldo.
- **PIN compartido**: es una barrera simple para que no cualquiera con el
  link cargue datos, no es autenticación real por persona. Si necesitas
  saber *quién* de tu equipo escaneó cada fila, avísame y agrego un campo
  de "nombre del operador" al formulario.
- **Sin conexión**: si el celular pierde señal al guardar, `eventos.html`
  guarda el registro en `localStorage` y reintenta solo cada 15 segundos o
  al recuperar conexión (ver badge amarillo "pendientes de subir").
- **Cuotas de Apps Script**: la cuenta gratuita de Google permite bastantes
  miles de llamadas diarias, de sobra para un evento normal. Si esperas
  varios cientos de escaneos por minuto en simultáneo, conviene migrar a
  un backend con base de datos real (Firebase/Supabase) — se puede hacer
  después sin rehacer el frontend de la cámara.
- **Costo total: $0.** Google Sheets, Drive, Apps Script y el hosting en
  Vercel (plan gratuito) no cobran nada para este uso — mientras no superes
  los límites gratuitos de cada uno (Drive: 15 GB compartidos con tu Gmail;
  Apps Script: cuota diaria de ejecuciones, de sobra para un evento). No
  hay tarjeta de crédito ni suscripción de por medio en ningún punto de
  este flujo, incluyendo instalar la app en los celulares del equipo.
