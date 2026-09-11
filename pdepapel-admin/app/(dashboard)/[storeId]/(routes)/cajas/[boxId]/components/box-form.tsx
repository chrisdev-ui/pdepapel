"use client";

import { useFormPersist } from "@/hooks/use-form-persist";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Box } from "@prisma/client";
import axios from "axios";
import { ArrowLeft, Eraser, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { MeasurementInput } from "@/components/ui/measurement-input";
import { SectionCard } from "@/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api-errors";
import {
  BOX_DIMENSION_MAX_CM,
  BOX_DIMENSION_MIN_CM,
  BOX_NAME_MAX_LENGTH,
  BOX_TYPES,
  VOLUMETRIC_WEIGHT_DIVISOR,
  boxFormSchema,
  boxInUseMessage,
  boxVolumeLiters,
  boxVolumetricWeightKg,
  describeBoxUsage,
  formatKg,
  formatLiters,
  isValidBoxDimension,
  type BoxFormValues,
  type BoxType,
} from "@/lib/boxes";
import { Box3DPreview } from "./box-3d-preview";

interface BoxFormProps {
  initialData: Box | null;
  /** Envíos que ya referencian esta caja (0 para una caja nueva). */
  shipmentsCount?: number;
  storeLogoUrl?: string | null;
}

const BOX_TYPE_HINTS: Record<BoxType, string> = {
  XS: "Pedidos con muchos productos pequeños.",
  S: "Pedidos de varios productos hasta tamaño S.",
  M: "Pedidos de varios productos hasta tamaño M.",
  L: "Pedidos grandes o con más de un producto pesado.",
  XL: "El cotizador hoy empaca lo grande en la caja L; una caja XL solo se usa si la eliges a mano en el envío.",
};

const MEASURE_FIELDS: { name: "width" | "height" | "length"; label: string; placeholder: string }[] = [
  { name: "width", label: "Ancho", placeholder: "Ej. 20" },
  { name: "height", label: "Alto", placeholder: "Ej. 10" },
  { name: "length", label: "Largo", placeholder: "Ej. 30" },
];

export const BoxForm: React.FC<BoxFormProps> = ({
  initialData,
  shipmentsCount = 0,
  storeLogoUrl,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const toastMessage = initialData ? "Caja actualizada." : "Caja creada.";
  const action = initialData ? "Guardar cambios" : "Crear caja";
  const listUrl = `/${params.storeId}/configuracion?tab=envios`;
  const isInUse = shipmentsCount > 0;

  const defaultValues = useMemo<Partial<BoxFormValues>>(
    () =>
      initialData
        ? {
            name: initialData.name,
            type: initialData.type as BoxType,
            width: initialData.width,
            height: initialData.height,
            length: initialData.length,
            isDefault: initialData.isDefault,
          }
        : {
            name: "",
            type: "M",
            width: undefined,
            height: undefined,
            length: undefined,
            isDefault: false,
          },
    [initialData],
  );

  const form = useForm<BoxFormValues>({
    resolver: zodResolver(boxFormSchema),
    defaultValues,
  });

  const { clearStorage } = useFormPersist({
    form,
    key: `box-form-${params.storeId}-${initialData?.id ?? "new"}`,
    enabled: !initialData,
  });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });

  useFormValidationToast({ form });

  const onClear = () => {
    form.reset(defaultValues);
    clearStorage();
    toast({
      title: "Formulario limpiado",
      description: "Los datos han sido restablecidos.",
    });
  };

  const onSubmit = async (data: BoxFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${params.storeId}/boxes/${params.boxId}`, data);
      } else {
        await axios.post(`/api/${params.storeId}/boxes`, data);
      }
      clearStorage();
      router.refresh();
      router.push(listUrl);
      toast({ title: toastMessage, variant: "success" });
    } catch (error) {
      toast({
        title: initialData
          ? "No se pudo guardar la caja"
          : "No se pudo crear la caja",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/boxes/${params.boxId}`);
      router.refresh();
      router.push(listUrl);
      toast({ title: "Caja eliminada.", variant: "success" });
    } catch (error) {
      toast({
        title: "No se pudo eliminar la caja",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const width = form.watch("width");
  const height = form.watch("height");
  const length = form.watch("length");
  const type = form.watch("type");
  const hasAllMeasures =
    isValidBoxDimension(width) &&
    isValidBoxDimension(height) &&
    isValidBoxDimension(length);

  return (
    <>
      {leaveDialog}
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
        title={`¿Eliminar la caja «${initialData?.name ?? ""}»?`}
        description="Ningún envío la usa, así que se elimina de inmediato. Esta acción no se puede deshacer."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Form {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
            autoComplete="off"
            className="flex min-w-0 flex-col gap-4"
          >
            <SectionCard
              id="identificacion"
              title="Identificación"
              description="Cómo verás la caja en la lista y en el envío de cada pedido."
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Volver a Envíos y empaques"
                  onClick={async () => {
                    if (await confirmLeave()) router.push(listUrl);
                  }}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            >
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Nombre</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Ej. Caja mediana kraft"
                          maxLength={BOX_NAME_MAX_LENGTH}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Tipo</FormLabel>
                      <Select
                        disabled={loading}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger aria-label="Tipo de caja">
                            <SelectValue placeholder="Selecciona un tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BOX_TYPES.map((boxType) => (
                            <SelectItem key={boxType} value={boxType}>
                              {boxType}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {BOX_TYPE_HINTS[(field.value as BoxType) ?? "M"]}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </SectionCard>

            <SectionCard
              id="medidas"
              title="Medidas exteriores"
              description={`En centímetros, con hasta un decimal. Las transportadoras aceptan de ${BOX_DIMENSION_MIN_CM} a ${BOX_DIMENSION_MAX_CM} cm por lado.`}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {MEASURE_FIELDS.map((measure) => (
                  <FormField
                    key={measure.name}
                    control={form.control}
                    name={measure.name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel isRequired>{measure.label}</FormLabel>
                        <FormControl>
                          <MeasurementInput
                            disabled={loading}
                            placeholder={measure.placeholder}
                            unit="cm"
                            name={field.name}
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <dl
                className="grid gap-x-6 gap-y-1 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2"
                data-testid="box-measures-readout"
              >
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted-foreground">Volumen</dt>
                  <dd className="font-medium text-foreground">
                    {hasAllMeasures
                      ? formatLiters(boxVolumeLiters(width, height, length))
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted-foreground">
                    Peso volumétrico (÷{VOLUMETRIC_WEIGHT_DIVISOR})
                  </dt>
                  <dd className="font-medium text-foreground">
                    {hasAllMeasures
                      ? formatKg(boxVolumetricWeightKg(width, height, length))
                      : "—"}
                  </dd>
                </div>
                <div className="text-muted-foreground sm:col-span-2">
                  El peso real de cada envío sale de los productos del pedido;
                  la transportadora cobra el mayor entre ese peso y el
                  volumétrico.
                </div>
              </dl>
            </SectionCard>

            <SectionCard
              id="uso"
              title="Uso en el cotizador"
              description="Solo una caja por tipo puede ser la predeterminada; al marcar esta, la anterior deja de serlo."
            >
              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={loading}
                        aria-label={`Predeterminada para el tipo ${type ?? ""}`}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Predeterminada para el tipo {type}</FormLabel>
                      <FormDescription>
                        Cuando el cotizador decide que un pedido va en caja{" "}
                        {type} usa estas medidas. Los pedidos pequeños van en
                        bolsa y no usan ninguna caja.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </SectionCard>

            {initialData && (
              <SectionCard
                id="zona-de-cuidado"
                title="Zona de cuidado"
                tone="care"
                description={
                  isInUse
                    ? boxInUseMessage(shipmentsCount)
                    : "Esta caja está sin envíos todavía: se puede eliminar sin afectar pedidos."
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClear}
                    disabled={loading}
                  >
                    <Eraser className="h-4 w-4" aria-hidden="true" />
                    Limpiar formulario
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading || isInUse}
                    onClick={() => setOpen(true)}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash className="h-4 w-4" aria-hidden="true" />
                    Eliminar caja
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {describeBoxUsage(shipmentsCount)}
                  </span>
                </div>
              </SectionCard>
            )}

            <div className="flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {initialData
                  ? "Los cambios aplican a los próximos envíos; los ya cotizados conservan sus medidas."
                  : "La caja queda disponible para el cotizador al crearla."}
              </p>
              <div className="flex items-center gap-2">
                {!initialData && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClear}
                    disabled={loading}
                  >
                    <Eraser className="h-4 w-4" aria-hidden="true" />
                    Limpiar
                  </Button>
                )}
                <Button type="submit" isLoading={loading} loadingText="Guardando…">
                  {action}
                </Button>
              </div>
            </div>
          </form>
        </Form>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Box3DPreview
            width={width}
            height={height}
            length={length}
            logoUrl={storeLogoUrl || undefined}
          />
        </div>
      </div>
    </>
  );
};
