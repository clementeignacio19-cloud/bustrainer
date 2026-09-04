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

Si el evento ya tuvo un **Formulario de inscripción** previo (Google Forms
con los campos nombre, edad, género, correo, teléfono, RUT, comuna, etc.),
puedes cargar esas respuestas en la misma Sheet para que la app QR las
cruce automáticamente por RUT al hacer el check-in — así el registro final
queda enriquecido con correo, teléfono, comuna, región, ocupación y género
autoidentificado, sin que el operador tenga que volver a preguntarlos.

1. Crea (o pega) una pestaña con el nombre exacto:
   `Insc <Nombre del evento> <Fecha YYYY-MM-DD>`
   Por ejemplo, para el evento "Taller Bienestar" del 23 de septiembre de
   2026, la pestaña debe llamarse `Insc Taller Bienestar 2026-09-23`
   (mismo nombre + fecha que uses al crear el evento en la app).
2. Esa pestaña debe tener una fila de encabezados con al menos una columna
   cuyo título contenga la palabra "Rut" (mayúsculas o minúsculas, no
   importa). Las demás columnas (correo, teléfono/WhatsApp, comuna,
   región, ocupación, edad, género) se detectan automáticamente por
   palabras clave en el encabezado — puedes pegar tal cual la hoja de
   respuestas que genera un Google Form con el Formulario de inscripción
   del documento de Fundación Bienestar Mayor, sin reordenar columnas.
3. Si no existe la pestaña `Insc ...` para un evento, la app simplemente
   registra a todos como asistentes sin cruce (comportamiento actual, sin
   romper nada).
4. En cada check-in, si el RUT escaneado aparece en esa lista, la fila del
   `Maestro` y la del evento quedan con `Inscrito Previo: Sí` y los datos
   de inscripción anexados; si no aparece, queda `Inscrito Previo: No`
   (asistencia igual registrada, como "walk-in").

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
