# Despliegue de producción

- URL pública: https://isla-universal.vercel.app/
- Plataforma: Vercel.
- Proyecto: `isla-universal` (`prj_b8EJkD68SFuQ2qoV1rkzze5MZZQZ`).
- Despliegue: `dpl_9KgZtXCcvtGhyTht6tupgE5d5YK8`.
- URL inmutable: https://isla-universal-fuv61il2f-afr-34.vercel.app/
- Fecha: 15 de octubre de 2026.
- Artefacto: contenido de `dist/`, generado con `npm run build` después de `npm ci` y las pruebas del motor.
- Vercel comunicó estado `READY`; la URL de producción respondió HTTP 200 con el HTML y las referencias a los recursos compilados correctos.
- Dos pruebas de navegador sobre la URL pública pasaron: renderizado WebGL y construcción con clic real, persistencia de la partida y controles en móvil.

La publicación es estática y no está conectada a GitHub. El token se utilizó únicamente en memoria para este despliegue y no está guardado en los archivos del proyecto. Las actualizaciones futuras requieren acceso autorizado a Vercel y volver a desplegar la compilación. El archivo `vercel.json` prepara un futuro despliegue desde el código fuente con Vite.
