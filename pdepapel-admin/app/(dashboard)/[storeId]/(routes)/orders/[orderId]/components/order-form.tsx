'use client'

import {
  Order,
  OrderStatus,
  PaymentDetails,
  PaymentMethod,
  Shipping,
  ShippingStatus
} from '@prisma/client'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import z from 'zod'

import { AlertModal } from '@/components/modals/alert-modal'
import { AutoComplete } from '@/components/ui/autocomplete'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form'
import { Heading } from '@/components/ui/heading'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { formatter } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { DollarSign, Trash } from 'lucide-react'
import { useForm } from 'react-hook-form'

const paymentSchema = z
  .object({
    method: z.nativeEnum(PaymentMethod),
    transactionId: z.string()
  })
  .partial()

const shippingSchema = z
  .object({
    status: z.nativeEnum(ShippingStatus),
    courier: z.string(),
    cost: z.coerce.number(),
    trackingCode: z.string()
  })
  .partial()

const formSchema = z.object({
  fullName: z.string().min(1, 'Debes agregar un nombre'),
  phone: z
    .string()
    .min(10, 'El número telefónico debe tener 10 dígitos')
    .max(13, 'El número telefónico debe tener 13 dígitos'),
  address: z.string().min(1, 'Debes agregar una dirección'),
  orderItems: z
    .array(z.string())
    .nonempty({ message: 'Debes agregar al menos 1 producto' }),
  status: z.nativeEnum(OrderStatus),
  payment: paymentSchema,
  shipping: shippingSchema
})

type OrderFormValues = z.infer<typeof formSchema>

type OrderItem = {
  id: string
  orderId: string
  productId: string
}

type ProductOption = {
  value: string
  label: string
  price?: number
}

interface OrderFormProps {
  initialData:
    | (Order & {
        orderItems: OrderItem[]
        payment: PaymentDetails | null
        shipping: Shipping | null
      })
    | null
  products: ProductOption[]
}

export const OrderForm: React.FC<OrderFormProps> = ({
  initialData,
  products
}) => {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [productsSelected, setProductsSelected] = useState<ProductOption[]>(
    initialData
      ? (initialData.orderItems
          .map((item) =>
            products.find((product) => product.value === item.productId)
          )
          .filter(Boolean) as ProductOption[])
      : []
  )
  const [totalPrice, setTotalPrice] = useState(
    initialData
      ? initialData.orderItems.reduce(
          (sum, item) =>
            sum +
            (products.find((product) => product.value === item.productId)
              ?.price || 0),
          0
        )
      : 0
  )
  const [loading, setLoading] = useState(false)

  const statusOptions = {
    [OrderStatus.CREATED]: 'Creada',
    [OrderStatus.PENDING]: 'Pendiente',
    [OrderStatus.PAID]: 'Pagada',
    [OrderStatus.CANCELLED]: 'Cancelada'
  }

  const paymentOptions = {
    [PaymentMethod.BankTransfer]: 'Transferencia bancaria',
    [PaymentMethod.COD]: 'Contra entrega',
    [PaymentMethod.Stripe]: 'Tarjeta de crédito o débito',
    [PaymentMethod.Bancolombia]: 'Bancolombia'
  }

  const shippingOptions = {
    [ShippingStatus.Preparing]: 'En preparación',
    [ShippingStatus.Shipped]: 'Enviada',
    [ShippingStatus.InTransit]: 'En tránsito',
    [ShippingStatus.Delivered]: 'Entregada',
    [ShippingStatus.Returned]: 'Devuelta'
  }

  const title = initialData ? 'Editar orden' : 'Crear orden'
  const description = initialData ? 'Editar una orden' : 'Crear una nueva orden'
  const toastMessage = initialData ? 'Orden actualizada' : 'Orden creada'
  const action = initialData ? 'Guardar cambios' : 'Crear'

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          orderItems: initialData.orderItems.map((item) => item.productId),
          payment: {
            ...initialData.payment,
            transactionId: initialData.payment?.transactionId || undefined
          },
          shipping: {
            ...initialData.shipping,
            courier: initialData.shipping?.courier || undefined,
            trackingCode: initialData.shipping?.trackingCode || undefined,
            cost: initialData.shipping?.cost || undefined
          }
        }
      : {
          fullName: '',
          orderItems: [],
          phone: '',
          address: '',
          status: OrderStatus.CREATED,
          payment: {},
          shipping: {}
        }
  })

  const onSubmit = async (data: OrderFormValues) => {
    try {
      setLoading(true)
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/orders/${params.orderId}`,
          data
        )
      } else {
        await axios.post(`/api/${params.storeId}/orders`, data)
      }
      router.refresh()
      router.push(`/${params.storeId}/orders`)
      toast({
        description: toastMessage,
        variant: 'success'
      })
    } catch (error) {
      toast({
        description:
          '¡Ups! Algo salió mal. Por favor, verifica tu conexión e inténtalo nuevamente más tarde.',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const onDelete = async () => {
    try {
      setLoading(true)
      await axios.delete(`/api/${params.storeId}/orders/${params.orderId}`)
      router.refresh()
      router.push(`/${params.storeId}/orders`)
      toast({
        description: 'Orden eliminada',
        variant: 'success'
      })
    } catch (error) {
      toast({
        description:
          '¡Ups! Algo salió mal. Por favor, verifica tu conexión e inténtalo nuevamente más tarde.',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

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
          className="space-y-8 w-full"
        >
          <h2 className="text-lg font-semibold">
            Orden # {initialData?.orderNumber}
          </h2>
          <div className="flex w-full items-start gap-2">
            {productsSelected.length > 0 &&
              productsSelected.map((product) => (
                <Button variant="outline" key={product.value}>
                  {product.label}
                </Button>
              ))}
            <div className="ml-auto text-lg font-semibold">
              Total: {formatter.format(totalPrice)}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-8">
            <FormField
              control={form.control}
              name="orderItems"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lista de Productos</FormLabel>
                  <FormControl>
                    <AutoComplete
                      options={products}
                      emptyMessage="No se encontraron productos"
                      placeholder='Escribe el nombre del producto y presiona "Enter"'
                      isLoading={loading}
                      onValuesChange={(selectedOptions) => {
                        const ids = selectedOptions.map(
                          (option) => option.value
                        )
                        field.onChange(ids)
                        setProductsSelected(selectedOptions)
                        const newTotal = selectedOptions.reduce(
                          (sum, option) => sum + Number(option?.price),
                          0
                        )
                        setTotalPrice(newTotal)
                      }}
                      values={products.filter((product) =>
                        field.value.includes(product.value)
                      )}
                      multiSelect
                      disabled={loading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Nombre completo"
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
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Número de teléfono"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Dirección"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado de la orden</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona un estado para la orden"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(OrderStatus).map((state) => (
                        <SelectItem key={state} value={state}>
                          {statusOptions[state]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Separator />
          <h2 className="text-lg font-semibold">
            Estado del pago # {initialData?.payment?.id}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-8">
            <FormField
              control={form.control}
              name="payment.method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método de pago</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona un método de pago"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(PaymentMethod).map((state) => (
                        <SelectItem key={state} value={state}>
                          {paymentOptions[state]}
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
              name="payment.transactionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de la transacción</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Número de la transacción (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Separator />
          <h2 className="text-lg font-semibold">
            Estado del envío # {initialData?.shipping?.id}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-8">
            <FormField
              control={form.control}
              name="shipping.status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado del envío</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Selecciona un estado para el envío"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(ShippingStatus).map((state) => (
                        <SelectItem key={state} value={state}>
                          {shippingOptions[state]}
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
              name="shipping.courier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la transportadora</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Empresa (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.cost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Costo</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="h-4 w-4 absolute left-3 top-3" />
                      <Input
                        type="number"
                        disabled={loading}
                        placeholder="10000 (opcional)"
                        className="pl-8"
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
              name="shipping.trackingCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de guía</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Guía (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  )
}
