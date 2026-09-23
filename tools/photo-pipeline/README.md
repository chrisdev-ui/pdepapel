# Revelado automático de las fotos de producto

Paula dispara en RAW (`.ARW`) con la Sony a6400. Esto revela esas fotos solas:
ella copia los RAW a una carpeta, y salen los JPEG **ya cuadrados y con el
color puesto**, listos para subir al panel.

**Dónde para esto:** en la carpeta `salida`. Las fotos **las sube Paula a
mano** por el panel, como siempre, mirándolas antes. Es un alto a propósito,
para que ninguna foto rara llegue sola a la tienda.

Funciona igual en **Windows** (el computador de Paula) y en **macOS** (donde
se desarrolla). Esto no es parte de la tienda ni del panel: vive aparte, en
`tools/`, y no toca ningún despliegue.

---

# Windows — el computador de Paula

## Para Paula: el día a día

Son dos pasos y ninguno es la Terminal.

1. **Doble clic en `Revelar fotos`.** Se abre una ventana negra con letras.
   **Déjala abierta**: mientras esté ahí, está trabajando.
2. **Copia los `.ARW` de la tarjeta a la carpeta `entrada`.** Puedes
   arrastrarlas todas de una vez. Cada foto aparece revelada en `salida` a
   los pocos segundos.

Cuando termines, **cierra la ventana**. Ya está.

En la ventana se va viendo lo que pasa, en cristiano:

```
[10:14:02] Revelando DSC00412.ARW (24.8 MB)…
[10:14:05] ✓ DSC00412.ARW → DSC00412.jpg 4016×4016
```

Las carpetas están en **`C:\Users\<tu usuario>\Fotos P de Papel\`**:

| Carpeta      | Qué hay ahí                                                   |
|--------------|---------------------------------------------------------------|
| `entrada`    | Aquí copias los `.ARW` de la tarjeta                           |
| `salida`     | Aquí salen los JPEG listos para subir al panel                 |
| `procesadas` | Los RAW ya revelados (**no se borran nunca**)                  |
| `fallidas`   | Los RAW que dieron problema, por si hay que mirarlos           |

### Si algo sale mal

La ventana lo dice con el nombre de la foto y el motivo, y esa foto queda en
`fallidas` (no se pierde). Si no entiendes el mensaje, mándale la foto de la
pantalla a Christian. Lo más común:

- **«Error loading file»**: la foto se copió a medias o está dañada. Vuelve a
  copiarla de la tarjeta.
- **«No encuentro RawTherapee»** o **«No encuentro Node»**: falta algo de la
  instalación. Eso lo arregla Christian.

---

## Para Christian: preparar el computador de Paula (una sola vez)

Son tres cosas. Al terminar, Paula no vuelve a ver nada de esto.

### 1. RawTherapee

Bajar de <https://www.rawtherapee.com/downloads/> la versión de Windows
(**5.13**, julio de 2026). Hay dos formas y sirven las dos:

- **Instalador** `RawTherapee_5.13_win64_x86_64_release.exe` (45 MB), o
- **Portátil** `RawTherapee_5.13_win64_x86_64_release.zip` (115 MB), que no
  instala nada: se descomprime y ya.

> Hay también versión **arm64**, por si el portátil es de esos. El archivo se
> llama igual pero con `arm64`.

**El paquete ya trae `rawtherapee-cli.exe`**, que es lo que usa este
programa; no hay que bajar nada aparte. (Comprobado leyendo el contenido del
`.zip` oficial de la versión 5.13.)

Si se usa la versión portátil, lo más cómodo es dejarla **aquí mismo**, en
`windows\RawTherapee\`, junto a este README: el programa la busca ahí
primero. Si se usa el instalador, la encuentra sola en `Archivos de programa`.

### 2. Node portátil

No hace falta instalar Node en el computador de Paula. Se baja el **zip** de
Windows desde <https://nodejs.org/en/download> (la opción *Windows Binary
(.zip)*, no el instalador `.msi`), se descomprime, y se copia el contenido a:

```
tools\photo-pipeline\windows\node\
```

de modo que quede **`windows\node\node.exe`**. Eso es todo lo que se necesita:
no hay `npm install` ni dependencias.

> Esta carpeta `windows\` **no va en git** (está en el `.gitignore`): son
> cientos de MB y se bajan una vez por computador.

### 3. Comprobar

Doble clic en **`Comprobar instalacion`**. Revisa que Node, RawTherapee, el
perfil y las carpetas estén en su sitio, y lo dice en pantalla. Si sale todo
con ✓, ya se puede usar.

### Dejarlo a mano para Paula

Clic derecho sobre `Revelar fotos.bat` → **Enviar a** → **Escritorio (crear
acceso directo)**. Y renombrar el acceso directo a algo como
**«Revelar fotos»**. Eso es lo único que Paula toca.

---

# macOS — el computador de Christian

```bash
brew install --cask rawtherapee
```

Y desde esta carpeta:

```bash
node procesar-fotos.mjs            # se queda vigilando; Ctrl+C para parar
node procesar-fotos.mjs --una-vez  # procesa lo que haya y termina
node procesar-fotos.mjs --comprobar
```

Las carpetas cuelgan de `~/Fotos P de Papel/`.

---

# Cambiar el color y la luz

El perfil que viene puesto —`perfiles/producto-cuadrado.pp3`— tiene un
arranque **neutro**: balance de blancos y exposición automáticos. **No es
todavía el look de P de Papel.** Ese hay que dejarlo una vez, mirando fotos
de verdad, y después queda para siempre.

Cómo se hace, entre Paula y Christian, una sola tarde:

1. Abrir **RawTherapee** (la aplicación, no la ventana negra).
2. Abrir una foto de producto representativa, de las normales, ni la más
   clara ni la más oscura.
3. Ajustar hasta que se vea como debe verse: exposición, balance de blancos,
   contraste, saturación, lo que haga falta. Es el mismo trabajo que hoy se
   hace a mano, pero **una sola vez**.
4. Cuando esté, en la pestaña de la izquierda buscar el botón de **guardar el
   perfil de procesado** (el icono de diskette bajo la lista de ajustes) y
   guardarlo encima de `perfiles/producto-cuadrado.pp3`, reemplazándolo.
5. **Importante:** después de guardar, abrir ese archivo y comprobar que la
   sección `[Crop]` siga con estos valores. Si RawTherapee la cambió, hay que
   dejarla así:

   ```ini
   [Crop]
   Enabled=true
   X=1000
   Y=0
   W=4016
   H=4016
   FixedRatio=true
   Ratio=1:1
   ```

6. Probar con dos o tres fotos y mirar el resultado antes de darlo por bueno.

A partir de ahí, todas las fotos salen con ese look.

---

# Cómo encuadrar para que el recorte no corte el producto

Esta es la parte que depende de Paula, y es la que hace que todo lo demás
funcione.

**El recorte es cuadrado, centrado y fijo.** No piensa, no busca el producto:
siempre quita **1000 píxeles por la izquierda y 1000 por la derecha**, y deja
el cuadrado del centro.

**Es así a propósito.** En septiembre de 2026 se probó un recorte
«inteligente», de los que buscan el producto solos (`g_auto` de Cloudinary),
con fotos de verdad del catálogo. Falló en **la mitad**: a un planillero le
dejó solo la pinza y llenó el resto de hojas verdes del fondo, a una
cartuchera le cortó la cremallera, y en una foto con dos blocs de notas borró
justo el que diferenciaba un producto de otro. Un recorte que se equivoca la
mitad de las veces y nadie revisa es peor que recortar a mano. Por eso este
es tonto: es predecible, y con el encuadre correcto no se equivoca nunca.

### La regla

> **Deja aire a los lados.** El producto tiene que caber en el cuadrado del
> centro, no tocar los bordes izquierdo ni derecho.

En la pantalla de la cámara: imagina un cuadrado en el centro del encuadre y
mete el producto ahí dentro, con un poco de margen. Lo que quede a los lados
se va a perder.

### Un ejemplo de verdad

Estas dos son la misma foto, antes y después del recorte:

| Como salió de la cámara (3:2) | Como queda al recortar (1:1) |
|---|---|
| ![Antes](ejemplos/encuadre-antes.jpg) | ![Después](ejemplos/encuadre-despues.jpg) |

La ranita está pegada al borde izquierdo, así que el recorte **le corta la
cara**. Si estuviera un poco más al centro, cabría entera. Con un producto
pasaría exactamente igual.

### Pistas rápidas

- Producto **alargado y acostado** (una cartuchera, una regla): es el caso
  más peligroso, porque lo ancho es lo que se recorta. Aléjate un paso o
  ponlo en diagonal.
- Producto **vertical** (un cuaderno de pie): suele caber sin problema.
- **Dos productos en la misma foto**: mejor no. Si uno queda fuera del
  cuadrado, esa foto no sirve para el que quedó cortado.
- Ante la duda, **aléjate un poco**. Sobra encuadre; nunca falta.

---

# Si las fotos no salen cuadradas

Si aparece este error:

```
salió de 3000×4016, y tiene que salir cuadrada.
```

significa que las fotos ya no miden lo que el perfil da por sentado
(**6016×4016**, que es lo que saca la a6400). Pasa si se cambia de cámara o
si se dispara en un modo distinto. **No se arregla solo a propósito**: una
foto detenida con un aviso es mejor que cientos recortadas mal en silencio.

Para arreglarlo, hay que recalcular el recorte una vez:

1. Abrir una de esas fotos en RawTherapee y mirar cuánto mide (ancho × alto).
2. El lado del cuadrado es **el menor de los dos**.
3. `X` es `(ancho − lado) ÷ 2`, y `Y` es `(alto − lado) ÷ 2`.
4. Poner esos cuatro números en la sección `[Crop]` de
   `perfiles/producto-cuadrado.pp3`.

Ejemplo con los de la a6400: 6016 × 4016 → lado 4016, X = (6016−4016)÷2 =
1000, Y = 0.

---

# Detalles para Christian

- **Sin dependencias.** Es Node pelado (`procesar-fotos.mjs`), sin
  `package.json` ni `node_modules`. El mismo archivo corre en Windows y en
  macOS; no hay dos versiones que mantener.
- **Por qué Node portátil y no un ejecutable (SEA):** el
  *single executable application* de Node sigue en **estabilidad 1.1,
  «desarrollo activo»**, y además habría que compilarlo y probarlo en
  Windows cada vez que se cambie una línea. Con Node portátil, cambiar el
  programa es reemplazar un archivo de texto.
- **Por qué sondeo y no `fs.watch`:** hay que esperar a que el archivo deje
  de crecer de todos modos (una tarjeta SD no copia al instante), y
  `fs.watch` es poco de fiar en unidades extraíbles. Se mira la carpeta cada
  3 segundos y se procesa un archivo cuando mide igual dos veces seguidas.
- **Medir el JPEG se hace leyendo el archivo**, no con un programa de fuera.
  Antes era `sips`, que solo existe en macOS; ahora se lee el marcador SOF
  de la cabecera JPEG, que es idéntico en los dos sistemas.
- **Dónde busca `rawtherapee-cli`**, en orden: la opción `--rawtherapee`, la
  variable `RAWTHERAPEE_CLI`, la copia portátil en `windows\RawTherapee\`,
  las carpetas de `Archivos de programa` (incluida la subcarpeta con el
  número de versión) y, por último, el `PATH`. En macOS,
  `/Applications/RawTherapee.app/…` y luego el `PATH`.
- **Los RAW no se borran nunca**, se mueven a `procesadas/`. Si ya hay uno
  con ese nombre, el nuevo queda como `DSC00087-2.ARW`.
- **Los errores se apartan** a `fallidas/` en vez de dejarlos en `entrada/`.
  Si se quedaran, se reintentarían cada 3 segundos para siempre y el registro
  se llenaría del mismo error.
- **Nada de `shell: true`** al lanzar RawTherapee: Node le pasa el ejecutable
  y los argumentos por separado, así que los espacios de
  `C:\Archivos de programa\…` no hay que escaparlos. Con `shell: true` sí, y
  es de ahí de donde salen los errores clásicos de rutas en Windows.
- **Opciones** (`--ayuda` las lista): `--entrada`, `--salida`,
  `--procesadas`, `--fallidas`, `--perfil`, `--rawtherapee`, `--una-vez`,
  `--comprobar`.
- **No hay arranque automático** (ni servicio de Windows ni launchd) a
  propósito: para v1 basta con el doble clic antes de una sesión de fotos.

---

# Lista de comprobación de la primera vez en el computador de Paula

Esto **no se ha podido probar en un Windows de verdad** —se desarrolló y se
probó en un Mac—, así que la primera vez hay que ir punto por punto. Marca
cada uno; si alguno falla, ahí está el problema.

### Antes de empezar

- [ ] **1.** Está la carpeta `windows\node\node.exe`.
- [ ] **2.** RawTherapee está instalado, o está la carpeta
      `windows\RawTherapee\rawtherapee-cli.exe`.
- [ ] **3.** Doble clic en **`Comprobar instalacion`**: sale todo con ✓ y
      dice «Todo listo». Anota la ruta de RawTherapee que imprime.

### Que arranque y se quede corriendo

- [ ] **4.** Doble clic en **`Revelar fotos`**: se abre la ventana negra,
      muestra las rutas de entrada/salida y dice «Vigilando».
- [ ] **5.** La ventana **sigue abierta** un minuto después, sin cerrarse
      sola y sin mensajes de error.
- [ ] **6.** Se crearon solas las cuatro carpetas dentro de
      `C:\Users\<usuario>\Fotos P de Papel\`.

### Que revele una foto de verdad

- [ ] **7.** Copiar **un** `.ARW` de la tarjeta a `entrada`.
- [ ] **8.** En la ventana sale `Revelando …` y después `✓ … → ….jpg`.
- [ ] **9.** El JPEG está en `salida`, y al abrirlo **se ve bien** (no
      cuadros de colores ni medio gris).
- [ ] **10.** Clic derecho en el JPEG → Propiedades → Detalles: mide
      **4016 × 4016** (los dos números iguales).
- [ ] **11.** El `.ARW` ya no está en `entrada` y sí está en `procesadas`.

### Que aguante varias a la vez

- [ ] **12.** Copiar **diez o más** `.ARW` de golpe, arrastrándolas juntas.
- [ ] **13.** Salen todas, una tras otra, y ninguna queda a medias. Aquí es
      donde se vería si la espera a que termine la copia funciona en Windows:
      **ninguna** debe fallar con «Error loading file».

### Que un archivo malo no tumbe el programa

- [ ] **14.** Crear un archivo de mentira: un `.txt` cualquiera renombrado a
      `PRUEBA.ARW`, y copiarlo a `entrada`.
- [ ] **15.** La ventana muestra un ✗ con el motivo, y `PRUEBA.ARW` aparece
      en `fallidas`.
- [ ] **16.** **La ventana sigue abierta y funcionando.** Copiar otro `.ARW`
      bueno después: debe revelarse con normalidad.

### Cerrar

- [ ] **17.** Cerrar la ventana. No queda ningún proceso raro (Administrador
      de tareas: no debería haber un `node.exe` suelto).

Si los 17 salen bien, el pipeline funciona en Windows. Si falla alguno,
apunta **cuál** y qué decía la pantalla.
