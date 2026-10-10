import { Fragment } from "react";

/** Solo **negrita**: el resto del texto se muestra tal cual. */
export function BoldText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((piece, index) =>
        /^\*\*[^*]+\*\*$/.test(piece) ? <strong key={index}>{piece.slice(2, -2)}</strong> : <Fragment key={index}>{piece}</Fragment>,
      )}
    </>
  );
}
