'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Trash } from 'lucide-react'
import { useForm } from 'react-hook-form'
import z from 'zod'

import { AlertModal } from '@/components/modals/alert-modal'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { Post, Social } from '@prisma/client'
import axios from 'axios'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'

const formSchema = z.object({
  social: z.nativeEnum(Social),
  postId: z.string().min(1, 'El id del post no puede estar vacío')
})

type PostFormValues = z.infer<typeof formSchema>

interface PostFormProps {
  initialData: Post | null
}

export const PostForm: React.FC<PostFormProps> = ({ initialData }) => {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const title = initialData ? 'Editar post' : 'Crear post'
  const description = initialData ? 'Editar un post' : 'Crear un nuevo post'
  const toastMessage = initialData ? 'Post actualizado' : 'Post creado'
  const action = initialData ? 'Guardar cambios' : 'Crear'

  const form = useForm<PostFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      social: undefined,
      postId: ''
    }
  })
  const onSubmit = async (data: PostFormValues) => {
    try {
      setLoading(true)
      if (initialData) {
        await axios.patch(`/api/${params.storeId}/posts/${params.postId}`, data)
      } else {
        await axios.post(`/api/${params.storeId}/posts`, data)
      }
      router.refresh()
      router.push(`/${params.storeId}/posts`)
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
      await axios.delete(`/api/${params.storeId}/posts/${params.postId}`)
      router.refresh()
      router.push(`/${params.storeId}/posts`)
      toast({
        description: 'Post eliminado',
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
          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="social"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Red Social</FormLabel>
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
                          placeholder="Selecciona una red social"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(Social).map((social) => (
                        <SelectItem key={social} value={social}>
                          {social}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  <FormDescription>
                    La red social de dónde se extraerá el post, verifica muy
                    bien el id del post.
                  </FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="postId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Id del post</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Id del post"
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
