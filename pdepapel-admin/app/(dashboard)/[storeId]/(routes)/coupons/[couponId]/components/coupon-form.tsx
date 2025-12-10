"use client";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Models, discountOptions } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { datePresets } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Coupon, DiscountType } from "@prisma/client";
import axios from "axios";
import { DollarSign, Loader2, Percent, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CouponCodeField } from "../../components/coupon-code-field";

const formSchema = z.object({
  code: z
    .string()
    .min(4, "El código del cupón debe tener al menos 4 caracteres")
    .max(20, "El código del cupón no puede tener más de 20 caracteres")
    .regex(/^[A-Z0-9]+$/, {
      message:
        "El código del cupón solo puede contener letras mayúsculas y números",
    }),
  type: z.nativeEnum(DiscountType),
  amount: z.coerce.number().min(0, "El monto debe ser mayor a 0"),
  dateRange: z.object({
    from: z.date({
      required_error: "La fecha de inicio es requerida",
      invalid_type_error: "La fecha de inicio debe ser una fecha válida",
    }),
    to: z.date({
      required_error: "La fecha de finalización es requerida",
      invalid_type_error: "La fecha de finalización debe ser una fecha válida",
    }),
  }),
  maxUses: z.coerce.number().optional(),
  minOrderValue: z.coerce.number().optional().default(0),
  isActive: z.coerce.boolean().default(true).optional(),
});

type CouponFormValues = z.infer<typeof formSchema>;

interface CouponFormProps {
  initialData: Coupon | null;
}

export const CouponForm: React.FC<CouponFormProps> = ({ initialData }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { title, description, toastMessage, action, pendingText } = useMemo(
    () => ({
      title: initialData ? "Editar cupón" : "Crear cupón",
      description: initialData ? "Editar un cupón" : "Crear un nuevo cupón",
      toastMessage: initialData ? "Cupón actualizado" : "Cupón creado",
      action: initialData ? "Guardar cambios" : "Crear",
      pendingText: initialData ? "Actualizando..." : "Creando...",
    }),
    [initialData],
  );

  const form = useForm<CouponFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          maxUses: initialData.maxUses as number,
          minOrderValue: initialData.minOrderValue as number,
          dateRange: {
            from: initialData.startDate,
            to: initialData.endDate,
          },
        }
      : {
          code: "",
          type: undefined,
          amount: undefined,
          dateRange: {
            from: undefined,
            to: undefined,
          },
          maxUses: undefined,
          minOrderValue: undefined,
          isActive: true,
        },
  });

  const onSubmit = async ({ dateRange, ...data }: CouponFormValues) => {
    const payload = {
      ...data,
      startDate: dateRange.from,
      endDate: dateRange.to,
    };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/${Models.Coupons}/${params.couponId}`,
          payload,
        );
      } else {
        await axios.post(`/api/${params.storeId}/${Models.Coupons}`, payload);
      }
      router.refresh();
      router.push(`/${params.storeId}/${Models.Coupons}`);
      toast({
        description: toastMessage,
        variant: "success",
      });
    } catch (error) {
      toast({
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
      await axios.delete(
        `/api/${params.storeId}/${Models.Coupons}/${params.couponId}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/${Models.Coupons}`);
      toast({
        description: "Cupón eliminado",
        variant: "success",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <div className="flex items-center justify-between">
        <Heading title={title} description={description} />
        {initialData && (
          <Button
            disabled={loading}
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Trash className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-8"
        >
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <CouponCodeField
                      form={form}
                      fieldName="code"
                      placeholder="VERANO2025 o generar automáticamente"
                      disabled={loading}
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
                  <FormLabel>Tipo de descuento</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(DiscountType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {discountOptions[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto del descuento</FormLabel>
                  <FormControl>
                    <div className="relative">
                      {form.watch("type") === DiscountType.PERCENTAGE ? (
                        <Percent className="absolute left-3 top-3 h-4 w-4" />
                      ) : (
                        <DollarSign className="absolute left-3 top-3 h-4 w-4" />
                      )}
                      <Input
                        type="number"
                        disabled={loading}
                        className="pl-8"
                        placeholder={
                          form.watch("type") === DiscountType.PERCENTAGE
                            ? "10"
                            : "10000"
                        }
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateRange"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de inicio y finalización</FormLabel>
                  <FormControl>
                    <DateRangePicker
                      customDates={datePresets}
                      name={field.name}
                      control={form.control}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxUses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Máximo de usos</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      disabled={loading}
                      placeholder="Límite de usos"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="minOrderValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto mínimo de compra</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4" />
                      <Input
                        type="number"
                        disabled={loading}
                        className="pl-8"
                        placeholder="50000"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Estado del cupón</FormLabel>
                    <FormDescription>
                      Te permite activar o desactivar el cupón al momento de
                      crearlo o editarlo.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {pendingText}
              </>
            ) : (
              action
            )}
          </Button>
        </form>
      </Form>
    </>
  );
};
