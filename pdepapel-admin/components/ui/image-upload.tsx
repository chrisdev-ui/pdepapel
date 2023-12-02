'use client'

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import axios from 'axios'
import { ImagePlus, Trash } from 'lucide-react'
import { CldUploadWidget } from 'next-cloudinary'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

interface ImageUploadProps {
  disabled?: boolean
  onChange: (value: string) => void
  onRemove: (value: string) => void
  value: string[]
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  disabled,
  onChange,
  onRemove,
  value
}) => {
  const [isMounted, setIsMounted] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()
  const params = useParams()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const onUpload = (result: any) => {
    onChange(result.info.secure_url)
  }

  const handleRemove = async (url: string) => {
    try {
      setIsDeleting(true)
      await axios.post(`/api/${params.storeId}/cloudinary`, { imageUrl: url })
    } catch (error) {
      toast({
        description:
          '¡Ups! Algo salió mal. Por favor, verifica tu conexión e inténtalo nuevamente más tarde.',
        variant: 'destructive'
      })
    } finally {
      setIsDeleting(false)
      onRemove(url)
    }
  }

  if (!isMounted) {
    return null
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        {value.map((url) => (
          <div
            key={url}
            className="relative w-[200px] h-[200px] rounded-md overflow-hidden"
          >
            <div className="z-10 absolute top-2 right-2">
              <Button
                type="button"
                onClick={() => handleRemove(url)}
                variant="destructive"
                size="icon"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
            <Image
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
              alt="Image"
              src={url}
            />
            {isDeleting && (
              <div className="w-full h-full backdrop-brightness-50 absolute top-0 left-0 flex justify-center items-center">
                <span className="text-xs animate-pulse backdrop-brightness-50 text-white">
                  Eliminando...
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <CldUploadWidget onUpload={onUpload} uploadPreset="u0dp1v1y">
        {({ open }) => {
          const onClick = (
            e: React.MouseEvent<HTMLButtonElement, MouseEvent>
          ) => {
            e.preventDefault()
            open()
          }
          if (!open) {
            return <div>Cargando...</div>
          }
          return (
            <Button
              type="button"
              disabled={disabled}
              variant="secondary"
              onClick={onClick}
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              Cargar una imagen
            </Button>
          )
        }}
      </CldUploadWidget>
    </div>
  )
}
