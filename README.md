# Musicala Manager Firebase

Nueva versión de Musicala Manager pensada para salir de Apps Script y funcionar como una app web moderna con:

- Vite + React
- Firebase Hosting
- Firebase Authentication
- Cloud Firestore
- Reglas de seguridad por rol
- Importador temporal para datos antiguos

## 1. Crear proyecto en Firebase

1. Entra a Firebase Console.
2. Crea un proyecto nuevo.
3. Activa Authentication con el proveedor `Google`.
4. Activa Firestore Database.
5. Crea una app web y copia las credenciales.

## 2. Configurar variables

Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

Luego pega tus credenciales Firebase:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_BOOTSTRAP_ADMIN_EMAIL=alekcaballeromusic@gmail.com
VITE_FIRESTORE_APP_ROOT=apps/manager-musicala
```

El correo `VITE_BOOTSTRAP_ADMIN_EMAIL` será el primer administrador automático.
`VITE_FIRESTORE_APP_ROOT` separa los datos de esta app dentro de un proyecto Firebase compartido. Para Manager Musicala debe quedar como `apps/manager-musicala`, así no se cruza con Admin HUB ni con otras apps del mismo proyecto.

> Importante: el mismo correo también está en `firestore.rules`. Si lo cambias en `.env`, cambia también la función `bootstrapEmail()` en reglas.

## 3. Instalar y probar localmente

```bash
npm install
npm run dev
```

Abre la URL local que muestra Vite.

## 4. Crear primer administrador

1. En la app, usa **Continuar con Google**.
2. Ingresa con el correo definido como `VITE_BOOTSTRAP_ADMIN_EMAIL`.
3. Ese perfil queda como `admin`, activo y con acceso a todos los botones.

Las demás personas pueden ingresar con Google, pero quedarán pendientes hasta que el administrador las active en la sección **Usuarios**.

## 5. Desplegar reglas y hosting

Primero inicia sesión en Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase init
```

En `firebase init`, selecciona:

- Hosting
- Firestore
- Proyecto Firebase correspondiente
- Directorio público: `dist`
- Single page app: `yes`

Luego compila y despliega:

```bash
npm run build
firebase deploy
```

También puedes usar:

```bash
npm run deploy
```

## 6. Estructura de Firestore

Todos los datos de Manager quedan debajo de `apps/manager-musicala`.

### `apps/manager-musicala/users/{uid}`

```js
{
  uid: "...",
  email: "correo@imusicala.com",
  displayName: "Nombre",
  role: "admin | asistente | docente",
  active: true,
  pending: false,
  buttonAccess: ["*"],
  createdAt,
  updatedAt,
  lastLoginAt
}
```

### `apps/manager-musicala/buttons/{buttonId}`

```js
{
  name: "Registrar Clase",
  url: "https://...",
  type: "externo",
  section: "Académico",
  icon: "🎵",
  order: 1,
  active: true
}
```

### `apps/manager-musicala/schedule/{taskId}`

```js
{
  day: "Lunes",
  dayIndex: 0,
  startTime: "09:00",
  endTime: "10:00",
  startMinutes: 540,
  endMinutes: 600,
  assistantName: "Camila Rodríguez",
  assistantEmail: "camila@imusicala.com",
  task: "Programación de clases",
  description: "Revisar novedades",
  note: "Priorizar estudiantes pendientes",
  color: "azul",
  active: true
}
```

## 7. Importador temporal

La sección **Importar** permite subir:

- CSV / TSV / JSON de botones
- CSV / TSV / JSON de horario
- CSV / TSV / JSON de usuarios antiguos
- Paquete JSON completo

### Formato paquete JSON completo

```json
{
  "usuarios": [],
  "botones": [],
  "horario": []
}
```

Los usuarios antiguos no crean cuentas de Firebase Auth automáticamente. Quedan en:

- `apps/manager-musicala/userInvites`: si tienen correo.
- `apps/manager-musicala/legacyUsers`: si no tienen correo.

Luego cada usuario debe ingresar con Google y el administrador activa su perfil real en la sección **Usuarios**.

## 8. Plantillas de importación

En la carpeta `import-templates` quedan ejemplos:

- `botones.csv`
- `horario.csv`
- `usuarios.csv`
- `paquete-completo.json`

## 9. Notas importantes

- Esta versión reemplaza `google.script.run` por servicios Firebase.
- Las pausas activas se calculan desde el horario; no se guardan como registros propios.
- Para correos automáticos o notificaciones aunque la app esté cerrada, el siguiente paso debe ser Cloud Functions + Cloud Scheduler / Firebase Cloud Messaging.
- Este proyecto no trae credenciales reales de Firebase. Deben agregarse en `.env`.
