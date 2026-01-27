import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Product } from "@/types";

interface KitContentsProps {
  components: NonNullable<Product["kitComponents"]>;
}

export const KitContents: React.FC<KitContentsProps> = ({ components }) => {
  if (!components || components.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="mb-4 font-serif text-xl font-bold">Este Kit Incluye:</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {components.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Link href={`/product/${item.component.id}`} className="block">
              <Card className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-lg">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border bg-gray-50">
                    {item.component.images?.[0]?.url ? (
                      <Image
                        src={item.component.images[0].url}
                        alt={item.component.name}
                        fill
                        className="object-cover transition-transform duration-300 hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-xs text-gray-400">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="font-serif font-semibold text-blue-yankees group-hover:text-blue-baby">
                      {item.component.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-full bg-blue-baby/50 px-2 py-0.5 font-serif text-xs font-medium text-blue-yankees">
                        x{item.quantity}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
