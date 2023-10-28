import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'

interface ProductListProps {
  products: string[]
}

export const ProductList: React.FC<ProductListProps> = ({ products }) => {
  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="ghost">Ver productos</Button>
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
