# Bodega Folclor

PWA para llevar el registro de vestuario e inventario de la bodega del folclor. Prototipo v1.0.

- 📦 **Inventario**: cajas con número, nombre, categoría, ubicación y contenido.
- 🗺️ **Mapa**: buscas una caja (ej. "Cayambe") y se resalta en la grilla mientras el resto se atenúa, para encontrarla rápido en la bodega.
- 🔄 **Movimientos**: los vestuaristas anotan quién se llevó o devolvió qué, con historial en tiempo real.
- Todo se guarda en **Firebase Firestore**, así que cualquiera que entre al link ve la info actualizada al instante.
- Instalable en el celular (PWA) desde el navegador.

No hay build step: es HTML/CSS/JS plano, así que funciona directo en GitHub Pages.

## 1. Configurar Firebase (una vez)

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) y crea un proyecto (gratis, plan Spark alcanza).
2. En el menú, entra a **Compilación → Firestore Database → Crear base de datos**. Elige modo producción y una ubicación cercana (ej. `southamerica-east1` o `us-central1`).
3. En la pestaña **Reglas** de Firestore, para el prototipo puedes partir con esto (deja lectura/escritura abierta a quien tenga el link — endurécelo cuando agregues login):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```

4. En **Configuración del proyecto** (ícono de tuerca) → **Tus apps** → ícono web `</>`, registra una app. Firebase te va a mostrar un objeto `firebaseConfig`.
5. Copia esos valores dentro de `js/firebase-config.js`, reemplazando los `"TU_..."`.

## 2. Probar en el celular/notebook antes de publicar

Como los navegadores bloquean `fetch`/módulos si abres el `index.html` directo con doble clic, corre un servidor local simple desde la carpeta del proyecto:

```
python3 -m http.server 8000
```

y abre `http://localhost:8000` en el navegador.

## 3. Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser público o privado si tienes GitHub Pro).
2. Sube todo el contenido de esta carpeta a la raíz del repo:

   ```
   git init
   git add .
   git commit -m "Bodega Folclor v1.0"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```

3. En GitHub: **Settings → Pages → Source**, elige la rama `main` y carpeta `/ (root)`. Guarda.
4. En un par de minutos tu app queda disponible en `https://TU_USUARIO.github.io/TU_REPO/`.

## 4. Instalar en el celular

Abre el link de GitHub Pages desde el navegador del celular (Chrome/Safari) y usa la opción **"Agregar a pantalla de inicio"** / **"Instalar app"**. Queda como una app normal, con ícono propio.

## 5. Cargar el inventario actual

Por ahora la carga es manual desde el botón **+** en Inventario (número, nombre, categoría, ubicación, contenido). Para v1.1 se puede agregar una importación masiva desde la planilla que ya usan.

## Estructura del proyecto

```
bodega-folclor/
├── index.html          # app principal (inventario, mapa, movimientos)
├── changelog.html       # historial de versiones
├── manifest.json        # metadata de la PWA
├── sw.js                 # service worker (instalable + caché básico)
├── css/style.css
├── js/
│   ├── firebase-config.js   # ← pega aquí tus credenciales de Firebase
│   └── app.js                # lógica de la app
└── icons/                # íconos de la PWA
```

## Actualizar la versión

Cuando publiques cambios: sube el número en `index.html` / `changelog.html` (el `version-pill`), agrega una entrada nueva en `changelog.html`, y sube el `CACHE_NAME` en `sw.js` (ej. `bodega-folclor-v1.1.0`) para que los celulares que ya instalaron la app bajen los archivos nuevos.
