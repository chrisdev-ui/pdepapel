'use client'

import { Order } from '@prisma/client'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import z from 'zod'

import { AlertModal } from '@/components/modals/alert-modal'
import { AutoComplete } from '@/components/ui/autocomplete'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form'
import { Heading } from '@/components/ui/heading'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { formatter } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { Trash } from 'lucide-react'
import { useForm } from 'react-hook-form'

const formSchema = z.object({
  phone: z
    .string()
    .min(10, 'El número telefónico debe tener 10 dígitos')
    .max(13, 'El número telefónico debe tener 13 dígitos'),
  address: z.string().min(1, 'Debes agregar una dirección'),
  orderItems: z
    .array(z.string())
    .nonempty({ message: 'Debes agregar al menos 1 producto' }),
  isPaid: z.boolean().default(false).optional(),
  isDelivered: z.boolean().default(false).optional()
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

  const title = initialData ? 'Editar orden' : 'Crear orden'
  const description = initialData ? 'Editar una orden' : 'Crear una nueva orden'
  const toastMessage = initialData ? 'Orden actualizada' : 'Orden creada'
  const action = initialData ? 'Guardar cambios' : 'Crear'

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: initialData
      ? {
          ...initialData,
          orderItems: initialData.orderItems.map((item) => item.productId)
        }
      : {
          orderItems: [],
          phone: '',
          address: '',
          isPaid: false,
          isDelivered: false
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
              name="isPaid"
              render={({ field }) => (
                <FormItem className="flex items-start space-x-3 space-y-0 rounded-md border p-4 h-fit mt-auto">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Estado del pago</FormLabel>
                    <FormDescription>
                      Marca la casilla si el pago ya fue realizado
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isDelivered"
              render={({ field }) => (
                <FormItem className="flex items-start space-x-3 space-y-0 rounded-md border p-4 h-fit mt-auto">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Estado del envio</FormLabel>
                    <FormDescription>
                      Marca la casilla si el envio ya fue realizado
                    </FormDescription>
                  </div>
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
