'use client'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { useEffect, useState } from 'react'

interface ProductListProps {
  products: string[]
}

export const ProductList: React.FC<ProductListProps> = ({ products }) => {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) return null

  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="outline">Ver productos</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col space-y-2">
          {products.map((product) => (
            <div key={product}>{product}</div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
