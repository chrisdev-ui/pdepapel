import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
        {/* Gallery Skeleton */}
        <div className="flex flex-col-reverse">
          <div className="mx-auto mt-6 hidden w-full max-w-2xl sm:block lg:max-w-none">
            <div className="grid grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="relative flex h-24 cursor-pointer items-center justify-center rounded-md bg-white uppercase hover:bg-gray-50"
                >
                  <Skeleton className="h-full w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
          <div className="aspect-square w-full">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        </div>

        {/* Product Info Skeleton */}
        <div className="mt-10 px-4 sm:mt-16 sm:px-0 lg:mt-0">
          {/* Title */}
          <Skeleton className="h-8 w-3/4 rounded-md" />

          {/* Price */}
          <div className="mt-3 flex items-end justify-between">
            <Skeleton className="h-8 w-1/4" />
          </div>

          {/* Separator */}
          <div className="my-4 h-px w-full bg-gray-200" />

          {/* Variants */}
          <div className="flex flex-col gap-y-6">
            <div className="flex items-center gap-x-4">
              <Skeleton className="h-6 w-16" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </div>
            <div className="flex items-center gap-x-4">
              <Skeleton className="h-6 w-16" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-12 rounded-md" />
                <Skeleton className="h-8 w-12 rounded-md" />
              </div>
            </div>
          </div>

          {/* Add to Cart */}
          <div className="mt-10 flex items-center gap-x-3">
            <Skeleton className="h-12 w-full rounded-full" />
          </div>

          {/* Guarantee Badges Skeleton */}
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-gray-200 pt-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>

          {/* Accordion Description Skeleton */}
          <div className="mt-8 border-t border-gray-200 pt-6">
            <Skeleton className="h-6 w-full rounded-md" />
            <Skeleton className="mt-4 h-24 w-full rounded-md" />
          </div>
        </div>
      </div>
    </Container>
  );
}
