# Despliegue de producción

- URL pública: https://isla-universal.vercel.app/
- Código: https://github.com/Rapidfiend34/CatanUniversal
- Plataforma: Vercel, proyecto `isla-universal` (`prj_b8EJkD68SFuQ2qoV1rkzze5MZZQZ`).
- Despliegue: `dpl_9FX9h2TeSMckbXVHcwaqLy4x21ay`.
- URL inmutable: https://isla-universal-lovb3ljhq-afr-34.vercel.app/
- Fecha: 15 de octubre de 2026.
- Versión: juego local, Online con salas por código y Party con TV pública y mandos privados.
- Estado comprobado: `READY`; la URL pública devuelve HTTP 200 y el JS `index-lRrzSFYa.js`.
- Almacenamiento: Vercel Blob **privado**, `isla-universal-rooms`, región `fra1`, conectado al proyecto en producción, preview y desarrollo. Su credencial la administra Vercel como `BLOB_READ_WRITE_TOKEN`, solo para el servidor.

La publicación contiene el código fuente, no solo `dist/`. Vercel ejecuta `npm ci` y `npm run build`, sirve el frontend de Vite y compila `api/rooms.ts` como función Node.js 24. La función valida las acciones y devuelve una vista diferente para cada jugador y para la televisión. Su estado persiste fuera de la memoria de las funciones, con lecturas actuales y escrituras condicionales por ETag.

Los imports del servidor usan extensiones `.js` para Node ESM. La compilación comprueba además `tsconfig.server.json` con resolución NodeNext. Las lecturas de Blob usan `useCache: false` y `Accept-Encoding: identity`: una respuesta comprimida puede devolver un ETag débil que impide las escrituras condicionales.

## Comprobaciones

- `npm test`: 42 pruebas aprobadas, incluyendo reglas, partidas completas de IA, permisos, vistas privadas, concurrencia, reintentos, robos, intercambios y persistencia local.
- TypeScript del frontend y del servidor comprobado; compilación de Vite aprobada.
- Playwright cubre los 16 escenarios locales y dos escenarios con contextos independientes: amigos Online, y TV Party con dos móviles, cambio de vista y recuperación de conexión. La prueba Online simula además un HTTP 503 al unirse para verificar el reintento automático.
- Pruebas HTTP sobre la URL pública completan la colocación inicial de Online y Party, verifican que las actualizaciones concurrentes de preparación conservan ambos jugadores, que todos leen la misma versión y que no se entregan manos ajenas ni orden del mazo. Una sesión desconocida recibe HTTP 401.

Para repetir las pruebas públicas de interfaz:

```sh
APP_URL=https://isla-universal.vercel.app npm run test:e2e -- tests/online.spec.ts --output=test-results/public-online
```

La publicación no está conectada a GitHub para despliegue automático. Las actualizaciones requieren volver a desplegar la raíz del repositorio en este proyecto; publicar únicamente `dist/` no incluye la API. Las credenciales no se guardan en Git ni se incorporan a la compilación del navegador.

Las salas permiten 3 o 4 jugadores, con al menos dos personas y plazas restantes completadas por IA. Caducan a las 48 horas desde su creación; los documentos caducados no se eliminan automáticamente del almacén. La recuperación requiere el mismo navegador y sus datos del sitio. No hay cuentas, migración de anfitrión ni sustitución de personas desconectadas. Todos los dispositivos necesitan internet. El uso consume las cuotas de funciones y Blob del proyecto; consulta el README para los detalles de funcionamiento y límites.
