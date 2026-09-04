# Eventos QR — Guía de instalación (Google Apps Script)

Esta app usa una **Google Sheet como base de datos maestra** y una **carpeta
de Drive** para las fotos de los QR escaneados. El backend es un Google
Apps Script gratuito, sin necesidad de tarjeta de crédito ni cuentas
técnicas nuevas.

## 1. Crear la Google Sheet

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva.
   Ponle un nombre, por ejemplo **"Eventos QR — Maestro"**.
2. No hace falta crear pestañas ni columnas a mano — el script las crea solo
   la primera vez que alguien registra un asistente (`Maestro`, `Eventos`, y
   una pestaña por cada evento).

## 2. Crear la carpeta de Drive para las fotos

1. Ve a [drive.google.com](https://drive.google.com) y crea una carpeta,
   por ejemplo **"Eventos QR — Fotos"**.
2. Ábrela y copia el ID desde la URL:
   `https://drive.google.com/drive/folders/`**`ESTE_ES_EL_ID`**

## 3. Crear el Apps Script (atado a la Sheet)

1. Abre la Sheet del paso 1.
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
   - `DRIVE_FOLDER_ID` → el ID de la carpeta de Drive del paso 2.
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
