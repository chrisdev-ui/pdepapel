"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, MessageSquare, Package, Sparkles } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuotation } from "@/hooks/use-quotation";
import { useToast } from "@/hooks/use-toast";

import QuoteHeader from "@/components/quote/QuoteHeader";
import QuoteItem from "@/components/quote/QuoteItem";
import QuoteStatusMessage from "@/components/quote/QuoteStatusMessage";
import QuoteSummary from "@/components/quote/QuoteSummary";
import { RichTextDisplay } from "@/components/ui/rich-text-display";

export default function QuotePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const { toast } = useToast();

  const {
    data: quotation,
    isLoading,
    isError,
    markAsViewed,
    acceptQuote,
    requestChange,
    refresh,
  } = useQuotation(token);

  const [isAccepting, setIsAccepting] = useState(false);

  // Mark as VIEWED on load
  useEffect(() => {
    if (quotation && quotation.status === "QUOTATION") {
      markAsViewed();
    }
  }, [quotation, markAsViewed]);

  const handleAccept = async () => {
    if (!quotation) return;
    setIsAccepting(true);
    try {
      await acceptQuote();

      const hasManualItems = quotation.items.some(
        (item) => !item.productId || item.isExternal,
      );

      if (hasManualItems) {
        toast({
          title: "Cotización aceptada 💝",
          description: "Un asesor procesará tu orden manualmente pronto.",
          variant: "success",
        });
        // No reload needed, state change triggers UI update
      } else {
        router.push(`/checkout?customOrderToken=${token}`);
      }
    } catch (error) {
      toast({
        title: "Error 😿",
        description: "No se pudo aceptar la cotización. Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsAccepting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleGoHome = () => {
    router.push("/");
  };

  const handleProceedToPayment = () => {
    router.push(`/checkout?customOrderToken=${token}`);
  };

  // Loading state
  if (isLoading) {
    return <QuoteStatusMessage type="loading" />;
  }

  // Error state
  if (isError || !quotation) {
    return <QuoteStatusMessage type="not-found" onGoHome={handleGoHome} />;
  }

  // Expired state logic
  const validUntilDate = quotation.validUntil
    ? new Date(quotation.validUntil)
    : null;
  const isExpired =
    validUntilDate &&
    validUntilDate < new Date() &&
    ["SENT", "QUOTATION", "VIEWED"].includes(quotation.status);

  if (isExpired || quotation.status === "EXPIRED") {
    return <QuoteStatusMessage type="expired" onGoHome={handleGoHome} />;
  }

  if (quotation.status === "CANCELLED") {
    return <QuoteStatusMessage type="cancelled" onGoHome={handleGoHome} />;
  }

  // Processed state
  if (["PAID", "SENT", "CONVERTED"].includes(quotation.status)) {
    return (
      <QuoteStatusMessage
        type="processed"
        orderNumber={quotation.orderNumber}
        onGoHome={handleGoHome}
      />
    );
  }

  const hasManualItems = quotation.items.some(
    (item) => !item.productId || item.isExternal,
  );

  return (
    <div className="min-h-screen bg-gray-50/30 pb-10 font-sans">
      {/* Decorative background with subtle circles */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full opacity-10"
            style={{
              width: `${100 + i * 50}px`,
              height: `${100 + i * 50}px`,
              background: i % 3 === 0 ? "pink" : "lightblue",
              left: `${(i * 15) % 100}%`,
              top: `${(i * 20) % 100}%`,
            }}
            animate={{
              y: [0, -20, 0],
              scale: [1, 1.1, 1],
              opacity: [0.1, 0.15, 0.1],
            }}
            transition={{
              duration: 5 + i,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <QuoteHeader
              orderNumber={quotation.orderNumber}
              orderId={quotation.id}
              status={quotation.status}
              customerName={quotation.customerName}
            />
          </div>
        </div>

        {/* Accepted Manual Items Alert */}
        <AnimatePresence>
          {quotation.status === "ACCEPTED" && hasManualItems && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 px-4 md:px-6 lg:px-8"
            >
              <div className="mx-auto max-w-6xl">
                <div className="flex items-start gap-3 rounded-3xl border border-purple-100 bg-purple-50 p-4 shadow-sm">
                  <motion.span
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <ClipboardList className="h-8 w-8 text-purple-400" />
                  </motion.span>
                  <div>
                    <h4 className="mb-1 font-bold text-gray-900">
                      Orden en proceso manual{" "}
                      <Sparkles className="inline h-4 w-4 text-yellow-400" />
                    </h4>
                    <p className="text-sm text-gray-600">
                      Has aceptado esta cotización. Un asesor revisará los
                      detalles y te contactará para finalizar el pago y envío~
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="px-4 pb-12 md:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Products Section */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-4 lg:col-span-2"
              >
                {/* Products Card */}
                <Card className="overflow-hidden rounded-3xl border-none bg-white/80 shadow-sm backdrop-blur-sm">
                  <CardHeader className="bg-gradient-to-r from-pink-50/50 to-purple-50/50 pb-4">
                    <CardTitle className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-froly to-purple-500 shadow-lg shadow-pink-froly/20">
                        <Package className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-slate-900">
                          Productos
                        </h2>
                        <p className="text-sm text-slate-500">
                          {quotation.items.length}{" "}
                          {quotation.items.length === 1
                            ? "artículo"
                            : "artículos"}{" "}
                          en esta cotización
                        </p>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4">
                    {quotation.items.map((item, index) => (
                      <QuoteItem key={item.id} item={item} index={index} />
                    ))}
                  </CardContent>
                </Card>

                {/* Notes Card */}
                {quotation?.description && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <Card className="rounded-3xl border-none bg-gradient-to-r from-blue-50/30 to-purple-50/30 shadow-sm">
                      <CardContent className="p-6">
                        <div className="flex items-start gap-3">
                          <motion.span
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            <MessageSquare className="h-8 w-8 text-blue-300" />
                          </motion.span>
                          <RichTextDisplay
                            content={quotation.description}
                            className="text-sm leading-relaxed text-gray-600"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </motion.div>

              {/* Summary Section */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="lg:col-span-1"
              >
                <QuoteSummary
                  subtotal={quotation.subtotal}
                  shippingCost={quotation.shippingCost}
                  discount={quotation.discount}
                  total={quotation.total}
                  validUntil={quotation.validUntil}
                  status={quotation.status}
                  hasManualItems={hasManualItems}
                  isAccepting={isAccepting}
                  onAccept={handleAccept}
                  onProceedToPayment={handleProceedToPayment}
                  onPrint={handlePrint}
                  onRequestChange={requestChange}
                />
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
