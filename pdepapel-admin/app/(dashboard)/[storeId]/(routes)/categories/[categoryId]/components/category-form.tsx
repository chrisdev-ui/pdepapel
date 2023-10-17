'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Category, Type } from '@prisma/client'
import { Trash } from 'lucide-react'
import { useForm } from 'react-hook-form'
import z from 'zod'

import { AlertModal } from '@/components/modals/alert-modal'
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
import axios from 'axios'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'

const formSchema = z.object({
  name: z.string().min(1, 'El nombre de la categoria no puede estar vacío'),
  typeId: z.string().min(1)
})

type CategoryFormValues = z.infer<typeof formSchema>

interface CategoryFormProps {
  initialData: Category | null
  types: Type[]
}

export const CategoryForm: React.FC<CategoryFormProps> = ({
  initialData,
  types
}) => {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const title = initialData ? 'Editar categoría' : 'Crear categoría'
  const description = initialData
    ? 'Editar una categoría'
    : 'Crear una nueva categoría'
  const toastMessage = initialData
    ? 'Categoría actualizada'
    : 'Categoría creada'
  const action = initialData ? 'Guardar cambios' : 'Crear'

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: '',
      typeId: ''
    }
  })
  const onSubmit = async (data: CategoryFormValues) => {
    try {
      setLoading(true)
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/categories/${params.categoryId}`,
          data
        )
      } else {
        await axios.post(`/api/${params.storeId}/categories`, data)
      }
      router.refresh()
      router.push(`/${params.storeId}/categories`)
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
      await axios.delete(
        `/api/${params.storeId}/categories/${params.categoryId}`
      )
      router.refresh()
      router.push(`/${params.storeId}/categories`)
      toast({
        description: 'Categoría eliminada',
        variant: 'success'
      })
    } catch (error) {
      toast({
        description:
          'Asegúrate de haber eliminado todas las productos que usen esta categoría primero.',
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
          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Nombre de la categoría"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="typeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
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
                          placeholder="Selecciona un tipo"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {types.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
