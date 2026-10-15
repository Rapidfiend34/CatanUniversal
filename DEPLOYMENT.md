# Despliegue de producción

- URL pública: https://isla-universal.vercel.app/
- Plataforma: Vercel.
- Proyecto: `isla-universal` (`prj_b8EJkD68SFuQ2qoV1rkzze5MZZQZ`).
- Despliegue: `dpl_8FeVBoLnK2SpDw9dA1hZhBaKkE7m`.
- URL inmutable: https://isla-universal-6x3uhre1e-afr-34.vercel.app/
- Fecha: 15 de octubre de 2026.
- Artefacto: contenido de `dist/`, generado con `npm run build` después de `npm ci` y las pruebas del motor.
- Vercel comunicó estado `READY`; la URL de producción respondió HTTP 200 con el HTML y las referencias a los recursos compilados correctos.
- Versión con negociación de intercambios entre personas e IA: 19 pruebas del motor y 10 pruebas de navegador aprobadas sobre la compilación de producción antes de publicarla.
- Cuatro pruebas adicionales ejecutadas sobre la URL pública verifican ofertas aceptadas y rechazadas por la IA, propuestas automáticas con consentimiento humano, recuperación tras recargar y resolución automática entre rivales.

La publicación es estática y no está conectada a GitHub. El token se utilizó únicamente en memoria para este despliegue y no está guardado en los archivos del proyecto. Las actualizaciones futuras requieren acceso autorizado a Vercel y volver a desplegar la compilación. El archivo `vercel.json` prepara un futuro despliegue desde el código fuente con Vite.
