"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  boxVolumeLiters,
  formatBoxDimensions,
  formatCm,
  formatLiters,
  isValidBoxDimension,
} from "@/lib/boxes";
import { cn } from "@/lib/utils";
import { Box as BoxIcon } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

interface Box3DPreviewProps {
  width?: number;
  height?: number;
  length?: number;
  className?: string;
  logoUrl?: string | null;
}

export const EMPTY_PREVIEW_MESSAGE = "Completa las tres medidas para ver la caja.";

const PREVIEW_SIZE_PX = 180;

/**
 * Caja en 3D con CSS (sin WebGL). Se rota con el puntero — ratón, dedo o
 * lápiz — y solo dibuja cuando las tres medidas son válidas: nunca redondea
 * ni inventa un lado de 1 cm.
 */
export const Box3DPreview = ({
  width,
  height,
  length,
  className,
  logoUrl,
}: Box3DPreviewProps) => {
  const [rotation, setRotation] = useState({ x: -20, y: 45 });
  const dragState = useRef<{ pointerId: number; x: number; y: number } | null>(
    null,
  );

  const isReady =
    isValidBoxDimension(width) &&
    isValidBoxDimension(height) &&
    isValidBoxDimension(length);

  const w = isReady ? width : 0;
  const h = isReady ? height : 0;
  const l = isReady ? length : 0;

  // Escala visual: el lado más largo ocupa siempre PREVIEW_SIZE_PX.
  const maxDim = Math.max(w, h, l, 1);
  const scale = PREVIEW_SIZE_PX / maxDim;
  const sw = w * scale;
  const sh = h * scale;
  const sl = l * scale;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isReady) return;
    dragState.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;

    setRotation((prev) => ({
      x: Math.max(-60, Math.min(60, prev.x - deltaY * 0.5)),
      y: prev.y + deltaX * 0.5,
    }));

    drag.x = event.clientX;
    drag.y = event.clientY;
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) return;
    dragState.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const boxTransform = `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;
  const faceStyle = (faceWidth: number, faceHeight: number, transform: string) => ({
    width: faceWidth,
    height: faceHeight,
    transform,
  });

  const emptyState = (
    <div
      role="status"
      className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"
    >
      <BoxIcon className="h-8 w-8 opacity-50" aria-hidden="true" />
      <p>{EMPTY_PREVIEW_MESSAGE}</p>
    </div>
  );

  return (
    <div
      className={cn(
        "flex h-fit flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <h3 className="text-[15px] font-bold text-card-foreground">
        Vista previa 3D
      </h3>

      <Tabs defaultValue="technical" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="technical">Técnica</TabsTrigger>
          <TabsTrigger value="realistic">Realista</TabsTrigger>
        </TabsList>

        <div
          className={cn(
            "mt-4 select-none rounded-lg border border-dashed border-border bg-muted/30 p-4",
            isReady && "cursor-grab touch-none active:cursor-grabbing",
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div
            className="relative flex h-[300px] w-full items-center justify-center overflow-hidden"
            style={{ perspective: "1200px" }}
          >
            <TabsContent
              value="technical"
              className="absolute inset-0 m-0 flex items-center justify-center"
            >
              {isReady ? (
                <div
                  className="relative transition-transform duration-100 ease-out"
                  style={{
                    width: sw,
                    height: sh,
                    transformStyle: "preserve-3d",
                    transform: boxTransform,
                  }}
                >
                  {/* FRONT FACE */}
                  <div
                    className="absolute flex flex-col items-center justify-center border-2 border-primary/60 bg-primary/10"
                    style={faceStyle(sw, sh, `translateZ(${sl / 2}px)`)}
                  >
                    <span className="text-xs font-medium text-primary/80">
                      Ancho
                    </span>
                    <span className="text-lg font-bold text-primary">
                      {formatCm(w)} cm
                    </span>
                    <div className="absolute -left-6 flex h-full flex-col items-center justify-center">
                      <div className="absolute left-3 h-[90%] w-[2px] rounded-full bg-primary/40" />
                      <span className="rotate-[-90deg] whitespace-nowrap text-xs font-medium text-primary/80">
                        {formatCm(h)} cm
                      </span>
                    </div>
                  </div>

                  {/* BACK FACE */}
                  <div
                    className="absolute border-2 border-primary/40 bg-primary/5"
                    style={faceStyle(
                      sw,
                      sh,
                      `rotateY(180deg) translateZ(${sl / 2}px)`,
                    )}
                  />

                  {/* RIGHT FACE */}
                  <div
                    className="bg-primary/15 absolute flex flex-col items-center justify-center border-2 border-primary/50"
                    style={faceStyle(
                      sl,
                      sh,
                      `rotateY(90deg) translateZ(${sw / 2}px)`,
                    )}
                  >
                    <span className="text-xs font-medium text-primary/80">
                      Largo
                    </span>
                    <span className="text-lg font-bold text-primary">
                      {formatCm(l)} cm
                    </span>
                  </div>

                  {/* LEFT FACE */}
                  <div
                    className="absolute border-2 border-primary/40 bg-primary/10"
                    style={faceStyle(
                      sl,
                      sh,
                      `rotateY(-90deg) translateZ(${sw / 2}px)`,
                    )}
                  />

                  {/* TOP FACE */}
                  <div
                    className="absolute border-2 border-primary/50 bg-primary/20"
                    style={faceStyle(
                      sw,
                      sl,
                      `rotateX(90deg) translateZ(${sh / 2}px)`,
                    )}
                  />

                  {/* BOTTOM FACE */}
                  <div
                    className="absolute border-2 border-primary/30 bg-primary/5"
                    style={faceStyle(
                      sw,
                      sl,
                      `rotateX(-90deg) translateZ(${sh / 2}px)`,
                    )}
                  />
                </div>
              ) : (
                emptyState
              )}
            </TabsContent>

            <TabsContent
              value="realistic"
              className="absolute inset-0 m-0 flex items-center justify-center"
            >
              {isReady ? (
                <div
                  className="relative transition-transform duration-100 ease-out"
                  style={{
                    width: sw,
                    height: sh,
                    transformStyle: "preserve-3d",
                    transform: boxTransform,
                  }}
                >
                  {/* FRONT FACE */}
                  <div
                    className="absolute flex items-center justify-center shadow-inner"
                    style={{
                      ...faceStyle(sw, sh, `translateZ(${sl / 2}px)`),
                      background:
                        "linear-gradient(135deg, hsl(30, 40%, 72%) 0%, hsl(30, 35%, 65%) 100%)",
                      border: "1px solid hsl(30, 30%, 55%)",
                    }}
                  >
                    <div className="flex flex-col items-center opacity-80">
                      {logoUrl && (
                        <div className="relative mb-2 h-10 w-10 overflow-hidden rounded-sm opacity-90 mix-blend-multiply">
                          <Image
                            src={logoUrl}
                            alt=""
                            fill
                            className="object-contain"
                            sizes="40px"
                          />
                        </div>
                      )}
                      <div className="flex h-8 w-8 items-center justify-center rounded border-2 border-amber-900/60">
                        <span className="text-lg text-amber-900/70" aria-hidden="true">
                          ↑
                        </span>
                      </div>
                      <span className="mt-1 text-[10px] font-bold tracking-wide text-amber-900/60">
                        Este lado arriba
                      </span>
                    </div>
                  </div>

                  {/* BACK FACE */}
                  <div
                    className="absolute"
                    style={{
                      ...faceStyle(
                        sw,
                        sh,
                        `rotateY(180deg) translateZ(${sl / 2}px)`,
                      ),
                      background:
                        "linear-gradient(135deg, hsl(30, 38%, 68%) 0%, hsl(30, 33%, 62%) 100%)",
                      border: "1px solid hsl(30, 30%, 55%)",
                    }}
                  />

                  {/* RIGHT FACE */}
                  <div
                    className="absolute flex items-center justify-center"
                    style={{
                      ...faceStyle(
                        sl,
                        sh,
                        `rotateY(90deg) translateZ(${sw / 2}px)`,
                      ),
                      background:
                        "linear-gradient(90deg, hsl(30, 35%, 62%) 0%, hsl(30, 40%, 70%) 100%)",
                      border: "1px solid hsl(30, 30%, 55%)",
                    }}
                  >
                    {/* Tape seam */}
                    <div
                      className="h-full w-5 opacity-40"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent, hsl(40, 20%, 85%), transparent)",
                      }}
                    />
                  </div>

                  {/* LEFT FACE */}
                  <div
                    className="absolute"
                    style={{
                      ...faceStyle(
                        sl,
                        sh,
                        `rotateY(-90deg) translateZ(${sw / 2}px)`,
                      ),
                      background:
                        "linear-gradient(90deg, hsl(30, 40%, 68%) 0%, hsl(30, 35%, 60%) 100%)",
                      border: "1px solid hsl(30, 30%, 55%)",
                    }}
                  />

                  {/* TOP FACE */}
                  <div
                    className="absolute"
                    style={{
                      ...faceStyle(
                        sw,
                        sl,
                        `rotateX(90deg) translateZ(${sh / 2}px)`,
                      ),
                      background:
                        "linear-gradient(180deg, hsl(30, 45%, 75%) 0%, hsl(30, 40%, 70%) 100%)",
                      border: "1px solid hsl(30, 30%, 55%)",
                    }}
                  >
                    {/* Tape strip */}
                    <div
                      className="absolute left-1/2 top-0 h-full w-6 -translate-x-1/2"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent, hsl(45, 15%, 88%) 20%, hsl(45, 15%, 88%) 80%, transparent)",
                      }}
                    />
                  </div>

                  {/* BOTTOM FACE */}
                  <div
                    className="absolute"
                    style={{
                      ...faceStyle(
                        sw,
                        sl,
                        `rotateX(-90deg) translateZ(${sh / 2}px)`,
                      ),
                      background:
                        "linear-gradient(180deg, hsl(30, 35%, 60%) 0%, hsl(30, 30%, 55%) 100%)",
                      border: "1px solid hsl(30, 28%, 50%)",
                    }}
                  />
                </div>
              ) : (
                emptyState
              )}
            </TabsContent>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>
            <p className="font-medium">
              {isReady ? "Arrastra para rotar" : "Sin medidas"}
            </p>
            <p>Escala visual automática</p>
          </div>
          {isReady && (
            <div className="text-right font-mono" data-testid="box-preview-readout">
              <p>{formatBoxDimensions(w, h, l)}</p>
              <p>Vol: {formatLiters(boxVolumeLiters(w, h, l))}</p>
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
};
