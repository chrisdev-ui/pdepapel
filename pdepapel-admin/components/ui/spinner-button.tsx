import { Loader2 } from 'lucide-react'

export const SpinnerButton = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full gap-y-8">
      <Loader2 className="h-24 w-24 animate-spin bg-background" />
    </div>
  )
}
