# Publicar el mapa y hacer que los puntos se compartan

Son dos cosas distintas y hay que hacer las dos.

---

## 1. Que la página se vea bien (Jekyll)

GitHub Pages estaba metiendo el mapa dentro de una plantilla de Jekyll, y por eso
se veía angosto y desarmado. Se nota en el título: la página servía
`MAPA-DE-EMERGENCIA-TERREMOTO-7.4-CALI | ...` (el nombre del repositorio) en vez
del título real del mapa.

**Solución:** subir a la **raíz** del repositorio estos tres archivos:

```
index.html     ← el mapa (no hace falta abrirlo nunca)
config.js      ← el único que se edita
.nojekyll      ← archivo vacío
```

El `.nojekyll` está vacío a propósito: su sola presencia le ordena a GitHub
publicar los archivos tal cual, sin plantilla.

Revisá también que no exista `_config.yml` ni `index.md` en el repositorio, y que
el `index.html` no empiece con un bloque de tres guiones (`---`). Cualquiera de
esas tres cosas vuelve a activar Jekyll.

**Cómo comprobarlo:** la pestaña del navegador debe decir
*Mapa de Emergencia Sísmica Cali · Terremoto 7.4*.

> Ojo: los archivos que empiezan con punto suelen quedar ocultos al arrastrarlos
> desde el escritorio. Verificá que `.nojekyll` haya subido de verdad.

---

## 2. Que los puntos que marca la gente los vean los demás

Esta es la parte que hoy **no** está funcionando, y no es un error del código:
es una limitación de cómo está montado.

Un sitio en GitHub Pages son **archivos estáticos**. Puede mostrar información,
pero no puede recibirla ni guardarla. Por eso, cuando alguien marca un punto, se
guarda en la memoria de **su propio navegador**: esa persona lo ve, le sobrevive
a recargar la página, pero nadie más se entera.

Para que un punto marcado por una persona llegue a las demás hace falta un
servidor en el medio. Ese servidor ya está construido: es la carpeta
`ingesta-chat` (el Cloudflare Worker), que además recibe reportes por WhatsApp y
Telegram.

### Los tres pasos

1. Desplegar el Worker siguiendo su propio `README.md`. Quedan unos 10 minutos de
   trabajo y el plan gratuito de Cloudflare alcanza de sobra.

2. Copiar la dirección que queda, del estilo
   `https://ingesta-chat-emergencia-cali.TU-CUENTA.workers.dev`.

3. Abrir **`config.js`** (con el Bloc de notas sirve). Es un archivo de tres
   líneas, no hay que buscar nada. Pegar la dirección entre las comillas:

   ```js
   window.SERVIDOR_MAPA = "";
   ```

   Debe quedar así:

   ```js
   window.SERVIDOR_MAPA = "https://mapa-emergencia-cali.TU-USUARIO.workers.dev";
   ```

Subir el `config.js` cambiado y listo. **El `index.html` no se toca.**

> Que la configuración viva aparte tiene una ventaja: cuando el mapa se
> actualice, se reemplaza el `index.html` y el `config.js` se queda como está.
> No hay que volver a configurar nada.

### Qué cambia cuando está configurado

- Cada punto que alguien marca se envía al servidor apenas se guarda.
- El mapa consulta cada 20 segundos y suma los puntos de los demás.
- La barra superior muestra **● En vivo** en verde.
- Los reportes que entren por WhatsApp o Telegram aparecen en el mismo mapa.

### Qué pasa mientras no lo esté

El mapa avisa, en tres lugares distintos, que los puntos no se están
compartiendo:

- un aviso rojo permanente sobre el mapa;
- una advertencia dentro del formulario, antes de guardar;
- una insignia **«Solo en este dispositivo»** en la ficha del punto.

Esto es a propósito. En una emergencia, creer que uno avisó cuando en realidad
no avisó es peor que no haber avisado.

### Cómo comprobar que quedó bien

Abrí el mapa en dos navegadores distintos —o en el celular y en el computador—,
marcá un punto en uno y esperá hasta 20 segundos. Debe aparecer en el otro.
