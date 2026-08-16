export class UpstreamServiceError extends Error {
  constructor(resource: string, status?: number) {
    super(
      status
        ? `No se pudo cargar ${resource} (respuesta ${status}).`
        : `No se pudo conectar con el servicio de ${resource}.`,
    );
    this.name = "UpstreamServiceError";
  }
}
