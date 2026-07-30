"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface Box3DPreviewProps {
  width: number;
  height: number;
  length: number;
  className?: string;
  logoUrl?: string;
}

export const Box3DPreview = ({
  width,
  height,
  length,
  className,
  logoUrl,
}: Box3DPreviewProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [rotation, setRotation] = useState({ x: -20, y: 45 });
  const lastPosition = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse dimensions safely
  const w = Math.max(Number(width) || 1, 1);
  const h = Math.max(Number(height) || 1, 1);
  const l = Math.max(Number(length) || 1, 1);

  // Determine scale factor relative to container
  const maxDim = Math.max(w, h, l, 1);
  const scale = 180 / maxDim;

  // Scaled Dimensions
  const sw = w * scale;
  const sh = h * scale;
  const sl = l * scale;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastPosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - lastPosition.current.x;
    const deltaY = e.clientY - lastPosition.current.y;

    setRotation((prev) => ({
      x: Math.max(-60, Math.min(60, prev.x - deltaY * 0.5)),
      y: prev.y + deltaX * 0.5,
    }));

    lastPosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const boxTransform = `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;

  return (
    <div
      className={cn(
        "flex h-fit flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <h3 className="text-lg font-semibold text-card-foreground">
        Vista Previa 3D
      </h3>

      <Tabs defaultValue="technical" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="technical">Técnica</TabsTrigger>
          <TabsTrigger value="realistic">Realista</TabsTrigger>
        </TabsList>

        <div
          ref={containerRef}
          className="mt-4 cursor-grab select-none rounded-lg border border-dashed border-border bg-muted/30 p-4 active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="relative flex h-[300px] w-full items-center justify-center overflow-hidden"
            style={{ perspective: "1200px" }}
          >
            <TabsContent
              value="technical"
              className="absolute inset-0 m-0 flex items-center justify-center"
            >
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
                  className="absolute flex flex-col items-center justify-center border-2 border-primary/60 bg-primary/10 backdrop-blur-sm"
                  style={{
                    width: sw,
                    height: sh,
                    transform: `translateZ(${sl / 2}px)`,
                  }}
                >
                  <span className="text-xs font-medium text-primary/80">
                    Ancho
                  </span>
                  <span className="text-lg font-bold text-primary">{w} cm</span>
                  <div className="absolute -left-6 flex h-full flex-col items-center justify-center">
                    <div className="absolute left-3 h-[90%] w-[2px] rounded-full bg-primary/40" />
                    <span className="rotate-[-90deg] whitespace-nowrap text-xs font-medium text-primary/80">
                      {h} cm
                    </span>
                  </div>
                </div>

                {/* BACK FACE */}
                <div
                  className="absolute border-2 border-primary/40 bg-primary/5"
                  style={{
                    width: sw,
                    height: sh,
                    transform: `rotateY(180deg) translateZ(${sl / 2}px)`,
                  }}
                />

                {/* RIGHT FACE */}
                <div
                  className="bg-primary/15 absolute flex flex-col items-center justify-center border-2 border-primary/50"
                  style={{
                    width: sl,
                    height: sh,
                    transform: `rotateY(90deg) translateZ(${sw / 2}px)`,
                  }}
                >
                  <span className="text-xs font-medium text-primary/80">
                    Largo
                  </span>
                  <span className="text-lg font-bold text-primary">{l} cm</span>
                </div>

                {/* LEFT FACE */}
                <div
                  className="absolute border-2 border-primary/40 bg-primary/10"
                  style={{
                    width: sl,
                    height: sh,
                    transform: `rotateY(-90deg) translateZ(${sw / 2}px)`,
                  }}
                />

                {/* TOP FACE */}
                <div
                  className="absolute border-2 border-primary/50 bg-primary/20"
                  style={{
                    width: sw,
                    height: sl,
                    transform: `rotateX(90deg) translateZ(${sh / 2}px)`,
                  }}
                />

                {/* BOTTOM FACE */}
                <div
                  className="absolute border-2 border-primary/30 bg-primary/5"
                  style={{
                    width: sw,
                    height: sl,
                    transform: `rotateX(-90deg) translateZ(${sh / 2}px)`,
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent
              value="realistic"
              className="absolute inset-0 m-0 flex items-center justify-center"
            >
              <div
                className="relative transition-transform duration-100 ease-out"
                style={{
                  width: sw,
                  height: sh,
                  transformStyle: "preserve-3d",
                  transform: boxTransform,
                }}
              >
                {/* Cardboard texture colors */}
                {/* FRONT FACE */}
                <div
                  className="absolute flex items-center justify-center shadow-inner"
                  style={{
                    width: sw,
                    height: sh,
                    transform: `translateZ(${sl / 2}px)`,
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
                          alt="Logo"
                          fill
                          className="object-contain"
                          sizes="40px"
                        />
                      </div>
                    )}
                    <div className="flex h-8 w-8 items-center justify-center rounded border-2 border-amber-900/60">
                      <span className="text-lg text-amber-900/70">↑</span>
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
                    width: sw,
                    height: sh,
                    transform: `rotateY(180deg) translateZ(${sl / 2}px)`,
                    background:
                      "linear-gradient(135deg, hsl(30, 38%, 68%) 0%, hsl(30, 33%, 62%) 100%)",
                    border: "1px solid hsl(30, 30%, 55%)",
                  }}
                />

                {/* RIGHT FACE */}
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    width: sl,
                    height: sh,
                    transform: `rotateY(90deg) translateZ(${sw / 2}px)`,
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
                    width: sl,
                    height: sh,
                    transform: `rotateY(-90deg) translateZ(${sw / 2}px)`,
                    background:
                      "linear-gradient(90deg, hsl(30, 40%, 68%) 0%, hsl(30, 35%, 60%) 100%)",
                    border: "1px solid hsl(30, 30%, 55%)",
                  }}
                />

                {/* TOP FACE */}
                <div
                  className="absolute"
                  style={{
                    width: sw,
                    height: sl,
                    transform: `rotateX(90deg) translateZ(${sh / 2}px)`,
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
                    width: sw,
                    height: sl,
                    transform: `rotateX(-90deg) translateZ(${sh / 2}px)`,
                    background:
                      "linear-gradient(180deg, hsl(30, 35%, 60%) 0%, hsl(30, 30%, 55%) 100%)",
                    border: "1px solid hsl(30, 28%, 50%)",
                  }}
                />
              </div>
            </TabsContent>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <div>
            <p className="font-medium">Arrastra para rotar</p>
            <p>Escala visual automática</p>
          </div>
          <div className="text-right font-mono">
            <p>
              {w} × {h} × {l} cm
            </p>
            <p>Vol: {((w * h * l) / 1000).toFixed(2)} L</p>
          </div>
        </div>
      </Tabs>
    </div>
  );
};
