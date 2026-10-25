// Los módulos del panel importan `server-only`, que lanza fuera de un servidor
// de React. Un guion de Node (tsx) que use `lib/prismadb` importa esto primero:
// solo `server-only` se cambia por su módulo vacío. `--conditions=react-server`
// no sirve, porque React estable no carga con esa condición.
const Module = require("node:module");
const path = require("node:path");

const emptyServerOnly = path.join(path.dirname(require.resolve("server-only")), "empty.js");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request === "server-only" ? emptyServerOnly : request, ...rest);
};
