// ==========================================================================
// CONFIGURACIÓN DE FIREBASE
// ==========================================================================
// 1. Ve a https://console.firebase.google.com y crea un proyecto (gratis).
// 2. Dentro del proyecto: Compilación > Firestore Database > Crear base de
//    datos (modo "producción", elige una ubicación cercana, ej. us-central).
// 3. En "Reglas" de Firestore, para el prototipo puedes empezar con algo
//    simple (ver reglas de ejemplo al final de este archivo) y luego
//    endurecerlas cuando agregues usuarios/login.
// 4. En Configuración del proyecto (ícono de tuerca) > Tus apps > Web (</>),
//    registra una app y copia el objeto firebaseConfig que te entrega aquí
//    abajo, reemplazando los valores de ejemplo.
// ==========================================================================

const firebaseConfig = {
  apiKey: "AIzaSyBkRf88mmhjtl5Q92ynZmJTcyqac15Px00",
  authDomain: "bodeguitapp-563f0.firebaseapp.com",
  projectId: "bodeguitapp-563f0",
  storageBucket: "bodeguitapp-563f0.firebasestorage.app",
  messagingSenderId: "665064711367",
  appId: "1:665064711367:web:b6cb0858f552d3a82f0ae2"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==========================================================================
// REGLAS DE FIRESTORE DE EJEMPLO (pégalas en Firestore > Reglas)
// Para el prototipo: lectura pública, escritura pública. Ábrelo solo a tu
// grupo compartiendo el link, y endurécelo apenas puedas con Firebase Auth.
// ==========================================================================
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /{document=**} {
//       allow read, write: if true;
//     }
//   }
// }
