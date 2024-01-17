import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid h-screen place-content-center bg-white px-4">
      <div className="text-center">
        <h1 className="text-9xl font-black text-gray-200">404</h1>

        <p className="text-2xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          ¡Página no encontrada!
        </p>

        <p className="mt-4 text-gray-500">
          La página que estás buscando no existe.
        </p>

        <Link
          href="/"
          className="mt-6 inline-block rounded bg-black px-5 py-3 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring"
        >
          Regresar al inicio
        </Link>
      </div>
    </div>
  );
}
