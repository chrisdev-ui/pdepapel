import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MessageSquarePlus, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const MAX_CHARS = 500;

const formSchema = z.object({
  message: z
    .string()
    .min(1, "El mensaje es requerido")
    .max(MAX_CHARS, `El mensaje no puede exceder ${MAX_CHARS} caracteres`),
});

interface QuoteChangeRequestDialogProps {
  onRequestChange: (message: string) => Promise<void>;
  trigger?: React.ReactNode;
}

export function QuoteChangeRequestDialog({
  onRequestChange,
  trigger,
}: QuoteChangeRequestDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      message: "",
    },
  });

  const messageValue = form.watch("message");
  const charCount = messageValue?.length || 0;
  const charPercentage = (charCount / MAX_CHARS) * 100;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setLoading(true);
      await onRequestChange(values.message);
      setSubmitted(true);

      setTimeout(() => {
        toast({
          title: "Solicitud enviada 📨",
          description: "El equipo ha recibido tu solicitud de cambios.",
        });
        setOpen(false);
        setSubmitted(false);
        form.reset();
      }, 1500);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo enviar la solicitud. Intenta nuevamente.",
        variant: "destructive",
      });
      setLoading(false);
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!loading) {
      setOpen(newOpen);
      if (!newOpen) {
        setSubmitted(false);
        form.reset();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            className="w-full gap-2 border-2 border-kawaii-lavender/50 transition-all duration-300 hover:border-kawaii-lavender hover:bg-kawaii-lavender/10"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Solicitar Cambios
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="overflow-hidden border-2 border-kawaii-pink/30 bg-gradient-to-br from-background via-background to-kawaii-pink/5 sm:max-w-md">
        {/* Decorative elements */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-kawaii-pink/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-kawaii-lavender/10 blur-3xl" />

        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center justify-center gap-4 py-12"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 10,
                  delay: 0.1,
                }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-kawaii-mint to-kawaii-mint/50"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 10,
                    delay: 0.3,
                  }}
                >
                  <Sparkles className="h-10 w-10 text-white" />
                </motion.div>
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-lg font-semibold text-foreground"
              >
                ¡Solicitud Enviada! ✨
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-center text-sm text-muted-foreground"
              >
                Te contactaremos pronto
              </motion.p>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-kawaii-lavender to-kawaii-pink">
                    <MessageSquarePlus className="h-5 w-5 text-white" />
                  </div>
                  <DialogTitle className="text-xl">
                    Solicitar Cambios
                  </DialogTitle>
                </div>
                <DialogDescription className="text-muted-foreground">
                  Cuéntanos qué te gustaría modificar. Un asesor revisará tu
                  solicitud y te contactará pronto. 💬
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="mt-6 space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Tu mensaje
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Textarea
                              placeholder="Ej: Me gustaría cambiar la cantidad del producto X, o agregar el producto Y..."
                              className="min-h-[140px] resize-none border-2 border-muted pb-8 pr-4 transition-colors duration-300 focus:border-kawaii-lavender"
                              disabled={loading}
                              {...field}
                            />
                            {/* Character counter */}
                            <div className="absolute bottom-2 right-3 flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                <motion.div
                                  className={`h-full rounded-full transition-colors duration-300 ${
                                    charPercentage > 90
                                      ? "bg-red-400"
                                      : charPercentage > 70
                                      ? "bg-kawaii-peach"
                                      : "bg-kawaii-mint"
                                  }`}
                                  initial={{ width: 0 }}
                                  animate={{
                                    width: `${Math.min(charPercentage, 100)}%`,
                                  }}
                                  transition={{ duration: 0.2 }}
                                />
                              </div>
                              <span
                                className={`text-xs transition-colors duration-300 ${
                                  charPercentage > 90
                                    ? "text-red-400"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {charCount}/{MAX_CHARS}
                              </span>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  {/* Quick suggestions */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Sugerencias rápidas:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "Cambiar cantidad",
                        "Agregar producto",
                        "Quitar producto",
                        "Consultar disponibilidad",
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            const currentValue = form.getValues("message");
                            const newValue = currentValue
                              ? `${currentValue} ${suggestion.toLowerCase()}`
                              : suggestion;
                            form.setValue("message", newValue, {
                              shouldValidate: true,
                            });
                          }}
                          disabled={loading}
                          className="rounded-full border border-kawaii-lavender/30 bg-kawaii-lavender/10 px-3 py-1.5 text-xs text-kawaii-lavender transition-all duration-200 hover:scale-105 hover:bg-kawaii-lavender/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={loading || charCount === 0}
                      className="h-12 w-full gap-2 bg-gradient-to-r from-kawaii-lavender to-kawaii-pink font-medium text-white transition-all duration-300 hover:opacity-90"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Enviar Solicitud
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
