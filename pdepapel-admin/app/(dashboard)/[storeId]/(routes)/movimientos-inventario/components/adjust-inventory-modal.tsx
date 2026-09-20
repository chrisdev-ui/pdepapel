"use client";

import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { AsyncProductSelect, type AsyncProductOption } from "@/components/ui/async-product-select";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ProductScanButton } from "@/components/ui/product-scan-button";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { MOVEMENT_INTENTS, resolveIntentSign, type MovementIntent } from "@/lib/movement-reasons";
import { cn } from "@/lib/utils";

interface AdjustInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  defaultProductId?: string | null;
  /** Precarga desde el cuadre del kardex: qué pasó, cuántas y por qué. */
  defaults?: { intentId?: string; action?: "add" | "subtract"; quantity?: number; reasonId?: string } | null;
}

const SIGN_LABEL: Record<MovementIntent["sign"], string> = { add: "+", subtract: "−", both: "+ o −" };
const SIGN_TINT: Record<MovementIntent["sign"], string> = {
  add: "bg-tint-mint",
  subtract: "bg-tint-pink",
  both: "bg-tint-cream",
};

/**
 * Registrar un movimiento a mano.
 *
 * El formulario pregunta primero **qué pasó** y de ahí deduce el tipo y el
 * signo. Antes pedía «Tipo de Ajuste», luego «Acción», y cuando el tipo ya
 * imponía el signo mostraba un campo de solo lectura llamado «Acción
 * Implícita»: vocabulario de la base de datos, no de quien atiende la tienda.
 *
 * El motivo es una categoría fija (ver `lib/movement-reasons.ts`) y la nota
 * libre queda en `description`.
 */
export function AdjustInventoryModal({ isOpen, onClose, onConfirm, defaultProductId, defaults }: AdjustInventoryModalProps) {
  const params = useParams();
  const storeId = String(params.storeId);
  const { toast } = useToast();

  const [intentId, setIntentId] = useState<string>(MOVEMENT_INTENTS[0].id);
  const [requestedAction, setRequestedAction] = useState<"add" | "subtract">("add");
  const [productId, setProductId] = useState<string>(defaultProductId ?? "");
  const [product, setProduct] = useState<AsyncProductOption | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [reasonId, setReasonId] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const intent = useMemo(() => MOVEMENT_INTENTS.find((item) => item.id === intentId) ?? MOVEMENT_INTENTS[0], [intentId]);
  const sign = resolveIntentSign(intent, requestedAction);
  const reason = intent.reasons.find((item) => item.id === reasonId) ?? null;

  useEffect(() => {
    if (!isOpen) return;
    const nextIntent = MOVEMENT_INTENTS.find((item) => item.id === defaults?.intentId) ?? MOVEMENT_INTENTS[0];
    setIntentId(nextIntent.id);
    setRequestedAction(defaults?.action ?? "add");
    setProductId(defaultProductId ?? "");
    setProduct(null);
    setQuantity(defaults?.quantity && defaults.quantity > 0 ? defaults.quantity : 1);
    setReasonId(defaults?.reasonId ?? "");
    setNote("");
  }, [isOpen, defaultProductId, defaults]);

  // Al cambiar de intención el motivo anterior ya no aplica.
  const chooseIntent = (next: MovementIntent) => {
    setIntentId(next.id);
    setReasonId("");
    if (next.sign !== "both") setRequestedAction(next.sign);
  };

  const delta = sign === "subtract" ? -Math.abs(quantity) : Math.abs(quantity);
  const currentStock = product?.stock ?? null;
  const resultingStock = currentStock === null ? null : currentStock + delta;
  const wouldGoNegative = resultingStock !== null && resultingStock < 0;
  const canSubmit = Boolean(productId) && Boolean(reason) && quantity > 0 && !wouldGoNegative && !loading;

  async function onSubmit() {
    if (!canSubmit || !reason) return;
    try {
      setLoading(true);
      await axios.post(`/api/${storeId}/inventory`, {
        productId,
        type: intent.id,
        action: sign,
        quantity: Math.abs(quantity),
        reason: `${intent.label} · ${reason.label}`,
        description: note.trim() || undefined,
      });
      toast({ title: "Movimiento registrado", description: `${intent.label}: ${sign === "subtract" ? "−" : "+"}${Math.abs(quantity)}` });
      onConfirm();
    } catch (error) {
      toast({ variant: "destructive", title: "No se pudo registrar", description: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Registrar movimiento"
      description="Queda en el kardex con tu nombre y la fecha. No se puede borrar, solo corregir con otro movimiento."
      isOpen={isOpen}
      onClose={loading ? () => undefined : onClose}
      className="max-h-[90vh] max-w-2xl overflow-y-auto"
    >
      <div className="flex flex-col gap-5 pt-2">
        <fieldset className="flex flex-col gap-2.5 border-0 p-0">
          <legend className="text-sm font-semibold text-primary">1 · ¿Qué pasó?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MOVEMENT_INTENTS.map((item) => {
              const active = item.id === intent.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseIntent(item)}
                  className={cn(
                    "flex min-w-0 flex-col gap-1.5 rounded-xl border bg-white p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary ring-1 ring-primary" : "hover:bg-accent",
                  )}
                >
                  <span className={cn("self-start rounded-full px-2 py-0.5 text-[11px] font-bold text-primary", SIGN_TINT[item.sign])}>
                    {SIGN_LABEL[item.sign]}
                  </span>
                  <span className="truncate text-sm font-semibold text-primary">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Las entradas por compra se registran en Aprovisionamiento, para que queden con su costo y su factura.
          </p>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="movimiento-producto" className="text-sm font-semibold text-primary">
            2 · Producto
          </label>
          <div className="flex items-center gap-2">
            <AsyncProductSelect
              id="movimiento-producto"
              value={productId}
              onChange={(value, picked) => {
                setProductId(value);
                setProduct(picked ?? null);
              }}
              modal
              placeholder="Buscar por nombre, SKU o código…"
              className="min-w-0 flex-1"
            />
            <ProductScanButton
              storeId={storeId}
              compact
              notify
              onFound={(found) => {
                setProductId(found.id);
                setProduct(found);
              }}
            />
          </div>
          {product ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {product.sku} · {product.stock.toLocaleString("es-CO")} unidades hoy
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-primary">3 · Cuántas unidades</span>
          <div className="flex flex-wrap items-center gap-3">
            <StockQuantityInput value={quantity} onChange={setQuantity} min={1} ariaLabel="Unidades" />
            {intent.sign === "both" ? (
              <div className="flex gap-1.5">
                {(["add", "subtract"] as const).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={requestedAction === option ? "default" : "outline"}
                    onClick={() => setRequestedAction(option)}
                  >
                    {option === "add" ? "Sumar" : "Restar"}
                  </Button>
                ))}
              </div>
            ) : null}
            {resultingStock !== null ? (
              <span
                className={cn(
                  "ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm tabular-nums",
                  wouldGoNegative ? "bg-tint-pink" : "bg-tint-mint",
                )}
              >
                <span className="text-xs text-muted-foreground">Queda</span>
                <span className="font-bold text-primary">
                  {currentStock?.toLocaleString("es-CO")} → {resultingStock.toLocaleString("es-CO")}
                </span>
              </span>
            ) : null}
          </div>
          {wouldGoNegative ? <p className="text-xs font-medium text-red-600">No se puede restar más de lo que hay.</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-primary">4 · Por qué</span>
          <div className="flex flex-wrap gap-1.5">
            {intent.reasons.map((option) => {
              const active = option.id === reasonId;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setReasonId(option.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:bg-accent",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <Textarea
            aria-label="Nota (opcional)"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Nota opcional: un detalle que ayude a entenderlo después."
          />
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {reason ? (
              <>
                Se registra como <span className="font-semibold text-primary">{`${intent.label} · ${reason.label}`}</span>{" "}
                {sign === "subtract" ? "−" : "+"}
                {Math.abs(quantity)}.
              </>
            ) : (
              "Elige un motivo para poder registrarlo."
            )}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" onClick={onSubmit} disabled={!canSubmit} isLoading={loading}>
              Registrar movimiento
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
