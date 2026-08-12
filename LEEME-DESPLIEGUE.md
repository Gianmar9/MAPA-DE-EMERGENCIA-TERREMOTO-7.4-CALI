# Cómo publicar el mapa en GitHub Pages

## El problema que está ocurriendo ahora

La página publicada está devolviendo este título:

> `MAPA-DE-EMERGENCIA-TERREMOTO-7.4-CALI | geovisor de de emergencia por TERREMOTO 7.4 CALI`

pero el archivo del mapa trae este otro:

> `Mapa de Emergencia Sísmica Cali · Terremoto 7.4`

Ese primer formato — *nombre del repositorio* + `|` + *descripción del repositorio* — es
exactamente el que genera **Jekyll**, el motor de plantillas que GitHub Pages activa por
defecto. Es decir: GitHub no está sirviendo el archivo tal cual, sino que lo está metiendo
dentro de una plantilla de tema. Eso hace dos cosas que rompen el mapa:

1. Carga el CSS del tema, que pelea con el del mapa.
2. Encierra la aplicación dentro de una columna angosta y centrada (los temas de Jekyll
   suelen limitar el ancho a unos 700 px), así que el mapa queda espichado y el diseño de
   tres columnas se desarma.

## La solución

Subí estos dos archivos a la **raíz** del repositorio:

```
index.html     ← el mapa
.nojekyll      ← archivo vacío
```

El archivo `.nojekyll` está vacío a propósito: su sola presencia le ordena a GitHub Pages
publicar los archivos tal como están, sin pasarlos por Jekyll.

### Además, revisá que no esté nada de esto en el repositorio

- **`_config.yml`** — si existe, borralo. Es lo que fija el tema, el título y la descripción.
- **`index.md`** — si existe, borralo. Le gana a `index.html` y muestra el README.
- **Un bloque de tres guiones al principio del `index.html`**, así:

  ```
  ---
  layout: default
  ---
  ```

  Si aparece, borrá esas tres líneas. Ese bloque es lo que le pide a Jekyll que envuelva
  el archivo en la plantilla.

- En **Settings → Pages**, si alguna vez usaste el botón *Choose a theme*, quitá el tema.

## Cómo comprobar que quedó bien

Abrí la página y mirá la pestaña del navegador. Debe decir:

> Mapa de Emergencia Sísmica Cali · Terremoto 7.4

Si dice el nombre del repositorio, Jekyll sigue activo. GitHub tarda entre uno y dos
minutos en volver a publicar después de cada cambio, y conviene recargar con la caché
limpia (Ctrl+Shift+R, o Cmd+Shift+R en Mac).

## Una ventaja de estar en GitHub Pages

El sitio queda servido por HTTPS, que es justo lo que exigen los navegadores para varias
funciones. El marcado de puntos ya funciona en cualquier caso, pero ahora también quedaría
habilitada la ubicación del dispositivo si más adelante deciden volver a activarla.
