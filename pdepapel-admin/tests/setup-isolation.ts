// Prisma copia `.env` en process.env al importarse; este import va primero
// para que los interruptores se borren después y queden como en CI.
import "@prisma/client";

import { ABSENT_IN_TESTS, blockOutboundNetwork } from "../scripts/lib/test-isolation.mjs";

// Primer archivo de arranque de las unitarias y de integración: las claves ya
// llegan dobladas desde `test.env`; aquí se corta toda red que no sea local.
// Las evaluaciones del copiloto no lo cargan: van contra OpenAI de verdad.
blockOutboundNetwork();
for (const name of ABSENT_IN_TESTS) delete process.env[name];
