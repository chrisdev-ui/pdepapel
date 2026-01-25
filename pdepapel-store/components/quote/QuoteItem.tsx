import { Badge } from "@/components/ui/badge";
import { currencyFormatter } from "@/lib/utils";
import { motion } from "framer-motion";
import { ExternalLink, Package, Sparkles } from "lucide-react";
import Image from "next/image";

interface QuoteItemProps {
  item: {
    id: string;
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    imageUrl?: string;
    isExternal?: boolean;
    productId?: string;
    size?: string;
    color?: string;
    design?: string;
  };
  index: number;
}

const QuoteItem = ({ item, index }: QuoteItemProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1, type: "spring", stiffness: 300 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="group relative flex gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md"
    >
      {/* ... (keep image rendering same) ... */}
      <motion.div
        className="absolute inset-0 rounded-2xl bg-gradient-to-r from-pink-50/50 via-purple-50/50 to-blue-50/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        initial={false}
      />

      {/* Image */}
      <div className="relative h-20 w-20 flex-shrink-0 md:h-24 md:w-24">
        <motion.div
          className="h-full w-full overflow-hidden rounded-2xl bg-gray-50"
          whileHover={{ rotate: [-1, 1, -1, 0] }}
          transition={{ duration: 0.3 }}
        >
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-pink-50">
              <Package className="h-8 w-8 text-pink-300" />
            </div>
          )}
        </motion.div>

        <motion.div
          className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs shadow-sm"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Sparkles className="h-3 w-3 text-yellow-400" />
        </motion.div>
      </div>

      {/* Content */}
      <div className="relative flex flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <h4 className="font-bold leading-tight text-gray-900">
              {item.name}
            </h4>
            {item.isExternal && (
              <Badge
                variant="outline"
                className="shrink-0 border-orange-200 bg-orange-50 text-xs text-orange-600"
              >
                <ExternalLink className="mr-1 h-3 w-3" />
                Manual
              </Badge>
            )}
          </div>

          {/* Variants Display instead of Description */}
          <div className="mt-1 flex flex-wrap gap-2">
            {item.size && (
              <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                Talla: {item.size}
              </span>
            )}
            {item.color && (
              <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                Color: {item.color}
              </span>
            )}
            {item.design && (
              <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                Diseño: {item.design}
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
              <Package className="h-3 w-3" />
              <span className="font-serif font-medium">x{item.quantity}</span>
            </span>
            {item.quantity > 1 && (
              <span className="font-serif text-gray-500">
                {currencyFormatter.format(item.unitPrice)} c/u
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <motion.div
          className="text-right md:text-left"
          whileHover={{ scale: 1.05 }}
        >
          <p className="font-serif text-lg font-bold text-blue-900 md:text-xl">
            {currencyFormatter.format(item.unitPrice * item.quantity)}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default QuoteItem;
