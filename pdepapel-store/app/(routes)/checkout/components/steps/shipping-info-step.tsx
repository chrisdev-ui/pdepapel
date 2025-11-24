import { AutocompleteLocation } from "@/components/ui/autocomplete-location";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ShippingRatesSelector } from "@/components/ui/shipping-rates-selector";
import { Textarea } from "@/components/ui/textarea";
import { ShippingStatus } from "@/constants";
import { useDebounce } from "@/hooks/use-debounce";
import { useLocations } from "@/hooks/use-locations";
import { useShippingQuote } from "@/hooks/use-shipping-quote";
import { Loader2, PackageSearch } from "lucide-react";
import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { CheckoutFormValue } from "../multi-step-checkout-form";

interface ShippingInfoStepProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
  cartItems: { id: string; quantity: number }[];
  orderTotal: number;
}

export const ShippingInfoStep = ({
  form,
  isLoading,
  cartItems,
  orderTotal,
}: ShippingInfoStepProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 300);

  const {
    data: { results: locations, count } = {},
    isLoading: isLoadingLocations,
  } = useLocations(debouncedQuery);

  // Watch form fields for shipping quote
  const selectedDaneCode = form.watch("daneCode");
  const address1 = form.watch("address1");
  const locationsDisabled = isLoading || isLoadingLocations;

  // Use mutation for manual quote fetching
  const {
    mutate: fetchQuotes,
    data: quoteData,
    isPending: isLoadingQuotes,
    error: quoteError,
    reset: resetQuotes,
  } = useShippingQuote();

  // Check if required fields are filled for button enable
  const canFetchQuotes =
    !!selectedDaneCode && !!address1 && cartItems.length > 0;

  // Handle quote fetch
  const handleFetchQuotes = () => {
    if (!canFetchQuotes) return;

    fetchQuotes({
      destination: {
        daneCode: selectedDaneCode,
        address: address1,
      },
      orderTotal,
      items: cartItems.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
    });
  };

  return (
    <div className="space-y-8 duration-500 animate-in fade-in-0 slide-in-from-right-4">
      <div className="space-y-2">
        <h2 className="bg-gradient-to-r from-primary to-accent bg-clip-text text-3xl font-bold text-transparent">
          Información de envío
        </h2>
        <p className="text-muted-foreground">¿A dónde enviamos tu pedido?</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="col-span-1 sm:col-span-2">
          <FormField
            control={form.control}
            name="daneCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground/90">
                  Busca tu ciudad y departamento
                </FormLabel>
                <FormControl>
                  <AutocompleteLocation
                    options={locations || []}
                    value={field.value || ""}
                    onSearch={setSearchQuery}
                    onChange={(value, location) => {
                      field.onChange(value);
                      if (location) {
                        form.setValue("city", location.city);
                        form.setValue("department", location.department);
                      }
                    }}
                    isLoading={isLoadingLocations}
                    disabled={isLoading}
                    placeholder="Escribe el nombre de tu ciudad o departamento..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">Ciudad *</FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="Ciudad"
                  readOnly={!!selectedDaneCode}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="department"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">
                Departamento *
              </FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="Departamento"
                  readOnly={!!selectedDaneCode}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address1"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">Dirección *</FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="ej: Calle 123 #45-67"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address2"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">
                Dirección adicional
              </FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="ej: Piso 3, Apartamento 123"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="neighborhood"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">Barrio</FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="ej: Barrio 123"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Tu barrio es opcional, si no lo conoces puedes dejarlo en
                blanco.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="company"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">Empresa</FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="ej: Empresa 123"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Sólo si la compra es a nombre de una empresa
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="addressReference"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">Referencia</FormLabel>
              <FormControl>
                <Textarea
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={locationsDisabled}
                  placeholder="ej: Frente al supermercado"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Datos adicionales que ayuden a localizar tu domicilio, esto es
                opcional.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Calculate Rates Button */}
        <div className="col-span-1 sm:col-span-2">
          {!quoteData && (
            <Button
              type="button"
              onClick={handleFetchQuotes}
              disabled={!canFetchQuotes || isLoadingQuotes}
              className="w-full bg-gradient-to-r from-blue-baby to-blue-baby/80 text-primary shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl"
            >
              {isLoadingQuotes ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Calculando tarifas...
                </>
              ) : (
                <>
                  <PackageSearch className="mr-2 h-5 w-5" />
                  Calcular tarifas de envío
                </>
              )}
            </Button>
          )}
          {!canFetchQuotes && !quoteData && (
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Completa la ubicación y dirección para calcular las tarifas
            </p>
          )}
          {quoteError && (
            <p className="mt-2 text-center text-sm text-destructive">
              Error: {quoteError.message ?? "Error desconocido"}
            </p>
          )}
        </div>

        {/* Shipping Rates - Show when quotes are available */}
        {quoteData && (
          <div className="col-span-1 sm:col-span-2">
            <FormField
              control={form.control}
              name="envioClickIdRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/90">
                    Selecciona una tarifa de envío *
                  </FormLabel>
                  <FormControl>
                    <ShippingRatesSelector
                      quotes={quoteData?.quotes || []}
                      selectedRate={field.value}
                      onSelect={(idRate) => {
                        field.onChange(idRate);

                        // Find selected quote and update shipping details
                        const selectedQuote = quoteData?.quotes.find(
                          (q) => q.idRate === idRate,
                        );

                        if (selectedQuote) {
                          form.setValue("shipping", {
                            carrierName: selectedQuote.carrier,
                            courier: selectedQuote.carrier,
                            productName: selectedQuote.product,
                            flete: selectedQuote.flete,
                            minimumInsurance: selectedQuote.minimumInsurance,
                            deliveryDays: Number(selectedQuote.deliveryDays),
                            isCOD: selectedQuote.isCOD,
                            cost: selectedQuote.totalCost,
                            status: ShippingStatus.Preparing,
                          });
                        }
                      }}
                      isLoading={isLoadingQuotes}
                    />
                  </FormControl>
                  <FormDescription>
                    Selecciona la tarifa de envío que deseas utilizar.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
};
