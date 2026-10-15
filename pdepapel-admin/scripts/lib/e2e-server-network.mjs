// Se carga con `--import` en el servidor de producción de las e2e: nada sale
// a la red salvo la máquina local y Clerk de desarrollo (la sesión de prueba).
import { blockOutboundNetwork } from "./test-isolation.mjs";

blockOutboundNetwork({ allowHosts: ["clerk.accounts.dev", "api.clerk.com", "api.clerk.dev"] });
