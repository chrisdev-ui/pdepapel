"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  ArrowLeft,
  Eraser,
  Mail,
  NotebookPen,
  PackageSearch,
  Trash,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";
import { TintBadge } from "@/components/ui/tint-badge";
import { Models } from "@/constants";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";
import { RESTOCK_STATUS_LABELS, RESTOCK_STATUS_TONES } from "@/lib/restock-orders";
import {
  EMPTY_SUPPLIER_FORM,
  SUPPLIER_CONTACT_MAX_LENGTH,
  SUPPLIER_LEAD_TIME_MAX_DAYS,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_NIT_MAX_LENGTH,
  SUPPLIER_NOTES_MAX_LENGTH,
  describeOpenRestockOrders,
  describeSupplierHeadline,
  describeSupplierProducts,
  describeSupplierRestockOrders,
  formatSupplierDate,
  supplierDeleteBlockedMessage,
  supplierFormSchema,
  supplierHasReferences,
  supplierToFormValues,
  toSupplierPayload,
  type SupplierDetail,
  type SupplierFormValues,
} from "@/lib/suppliers";

interface SupplierFormProps {
  initialData: SupplierDetail | null;
}

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export const SupplierForm: React.FC<SupplierFormProps> = ({ initialData }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();

  const [loading, setLoading] = useState(false);

  const storeId = String(params.storeId);
  const listHref = `/${storeId}/${Models.Suppliers}`;
  const blocked = Boolean(initialData) && supplierHasReferences(initialData!.usage);

  const defaultValues = useMemo<SupplierFormValues>(
    () => (initialData ? supplierToFormValues(initialData) : EMPTY_SUPPLIER_FORM),
    [initialData],
  );

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues,
  });

  const { clearStorage } = useFormPersist({
    form,
    key: `supplier-form-${storeId}-${initialData?.id ?? "new"}`,
    enabled: !initialData,
  });
  const { confirmLeave, confirmationDialog: leaveDialog } =
    useUnsavedChangesGuard(form, { enabled: !loading });

  useFormValidationToast({ form });

  const onClear = () => {
    form.reset(defaultValues);
    clearStorage();
    toast({
      title: "Formulario limpiado",
      description: "Los datos han sido restablecidos.",
    });
  };

  const onSubmit = async (values: SupplierFormValues) => {
    try {
      setLoading(true);
      const payload = toSupplierPayload(values);
      if (initialData) {
        await axios.patch(
          `/api/${storeId}/${Models.Suppliers}/${initialData.id}`,
          payload,
        );
      } else {
        await axios.post(`/api/${storeId}/${Models.Suppliers}`, payload);
      }
      clearStorage();
      form.reset(values);
      router.push(listHref);
      router.refresh();
      toast({
        title: initialData ? "Proveedor actualizado." : "Proveedor creado.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: initialData
          ? "No se pudo guardar el proveedor"
          : "No se pudo crear el proveedor",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    if (!initialData || blocked) return;
    const confirmed = await requestConfirmation({
      title: `¿Eliminar el proveedor «${initialData.name}»?`,
      description:
        "Ningún producto ni pedido de aprovisionamiento lo referencia, así que se elimina de inmediato. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      await axios.delete(
        `/api/${storeId}/${Models.Suppliers}/${initialData.id}`,
      );
      router.push(listHref);
      router.refresh();
      toast({ title: "Proveedor eliminado.", variant: "success" });
    } catch (error) {
      toast({
        title: "No se pudo eliminar el proveedor",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {confirmationDialog}
      {leaveDialog}

      <div className="flex items-start gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Volver a proveedores"
          onClick={async () => {
            if (await confirmLeave()) router.push(listHref);
          }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            {initialData ? "Editar proveedor" : "Nuevo proveedor"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {initialData
              ? describeSupplierHeadline(initialData.name, initialData.usage)
              : "A quién le compras: sus datos de contacto y cuánto suele tardar en entregar."}
          </p>
        </div>
      </div>

      <div className={initialData ? "grid gap-5 lg:grid-cols-3" : "grid gap-5"}>
        <Form {...form}>
          <form
            id="supplier-form"
            noValidate
            autoComplete="off"
            onSubmit={form.handleSubmit(onSubmit)}
            className={
              initialData
                ? "flex min-w-0 flex-col gap-5 lg:col-span-2"
                : "flex min-w-0 flex-col gap-5"
            }
          >
            <SectionCard
              id="identificacion"
              title="Identificación"
              description="Cómo verás al proveedor en productos, pedidos y facturas."
            >
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Nombre</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Ej. Henko Importaciones"
                          maxLength={SUPPLIER_NAME_MAX_LENGTH}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NIT o cédula</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Ej. 900.123.456-7"
                          maxLength={SUPPLIER_NIT_MAX_LENGTH}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Para cruzar con las facturas de proveedores.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </SectionCard>

            <SectionCard
              id="contacto"
              title="Contacto"
              description="A quién escribirle cuando haya que pedir, reclamar o preguntar."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Persona de contacto</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Ej. Laura Gómez"
                          maxLength={SUPPLIER_CONTACT_MAX_LENGTH}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="supplier-phone">
                        WhatsApp o teléfono
                      </FormLabel>
                      <FormControl>
                        <PhoneInput
                          id="supplier-phone"
                          disabled={loading}
                          placeholder="300 123 4567"
                          value={field.value as never}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          defaultCountry="CO"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo</FormLabel>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <FormControl>
                          <Input
                            type="email"
                            inputMode="email"
                            disabled={loading}
                            placeholder="ventas@proveedor.com"
                            className="pl-9"
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="leadTimeDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tiempo de entrega habitual</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={SUPPLIER_LEAD_TIME_MAX_DAYS}
                            step={1}
                            disabled={loading}
                            placeholder="Ej. 15"
                            className="pr-14"
                            {...field}
                          />
                        </FormControl>
                        <span
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                          aria-hidden="true"
                        >
                          días
                        </span>
                      </div>
                      <FormDescription>
                        Se usa para avisar cuando un pedido se pasa de fecha.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <div className="relative">
                      <NotebookPen
                        className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          rows={4}
                          maxLength={SUPPLIER_NOTES_MAX_LENGTH}
                          placeholder="Condiciones de pago, mínimos de compra, cómo hacen los envíos…"
                          className="pl-9"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SectionCard>

            <div className="sticky bottom-2 z-10 flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {initialData
                  ? "Los cambios aplican a los productos y pedidos que ya lo usan."
                  : "Después podrás asignarlo a productos y pedidos de aprovisionamiento."}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClear}
                  disabled={loading}
                >
                  <Eraser className="h-4 w-4" aria-hidden="true" />
                  Limpiar
                </Button>
                <Button
                  type="submit"
                  isLoading={loading}
                  loadingText={initialData ? "Guardando…" : "Creando…"}
                >
                  {initialData ? "Guardar cambios" : "Crear proveedor"}
                </Button>
              </div>
            </div>
          </form>
        </Form>

        {initialData && (
          <aside className="flex min-w-0 flex-col gap-5">
            <SectionCard
              id="con-este-proveedor"
              title="Con este proveedor"
              description="Lo que ya depende de él en la tienda."
            >
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Productos</dt>
                  <dd>
                    <Link
                      href={`/${storeId}/productos?proveedor=${initialData.id}`}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {describeSupplierProducts(initialData.usage.products)}
                    </Link>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">
                    Pedidos de aprovisionamiento
                  </dt>
                  <dd>
                    <Link
                      href={`/${storeId}/aprovisionamiento?proveedor=${initialData.id}`}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {initialData.usage.restockOrders}
                    </Link>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Abiertos ahora</dt>
                  <dd className="font-semibold text-foreground">
                    {describeOpenRestockOrders(initialData.usage)}
                  </dd>
                </div>
              </dl>
              {initialData.recentRestockOrders.length > 0 ? (
                <ul className="divide-y border-t" aria-label="Últimos pedidos">
                  {initialData.recentRestockOrders.map((order) => (
                    <li
                      key={order.id}
                      className="flex items-center justify-between gap-2 py-2.5"
                    >
                      <div className="flex min-w-0 flex-col">
                        <Link
                          href={`/${storeId}/aprovisionamiento/${order.id}`}
                          className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {formatSupplierDate(new Date(order.createdAt))} ·{" "}
                          {currency.format(order.totalAmount)}
                        </span>
                      </div>
                      <TintBadge
                        label={RESTOCK_STATUS_LABELS[order.status]}
                        tone={RESTOCK_STATUS_TONES[order.status]}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <PackageSearch className="h-4 w-4" aria-hidden="true" />
                  Todavía no le has hecho pedidos.
                </p>
              )}
              {initialData.usage.restockOrders >
                initialData.recentRestockOrders.length && (
                <p className="text-xs text-muted-foreground">
                  Mostrando los {initialData.recentRestockOrders.length} más
                  recientes de{" "}
                  {describeSupplierRestockOrders(initialData.usage.restockOrders)}.
                </p>
              )}
            </SectionCard>

            <SectionCard
              id="eliminar-proveedor"
              title="Eliminar proveedor"
              tone="care"
              description={
                blocked
                  ? supplierDeleteBlockedMessage(initialData.usage)
                  : "Nada lo referencia todavía, así que se puede eliminar sin afectar productos ni pedidos. Esta acción no se puede deshacer."
              }
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start text-destructive"
                onClick={() => void onDelete()}
                disabled={blocked || loading}
              >
                <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
                Eliminar
              </Button>
            </SectionCard>
          </aside>
        )}
      </div>
    </>
  );
};
