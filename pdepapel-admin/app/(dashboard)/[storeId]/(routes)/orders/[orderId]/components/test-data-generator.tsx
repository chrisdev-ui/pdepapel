import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  OrderStatus,
  OrderType,
  PaymentMethod,
  ShippingProvider,
  ShippingStatus,
} from "@prisma/client";
import { Beaker, Bug, FileText, Truck, Wand2 } from "lucide-react";
import { type UseFormReturn } from "react-hook-form";
import { type ProductOption } from "../server/get-order";

interface TestDataGeneratorProps {
  form: UseFormReturn<any>;
  products: ProductOption[];
}

export const TestDataGenerator: React.FC<TestDataGeneratorProps> = ({
  form,
  products,
}) => {
  const fillForm = (data: any) => {
    // Reset form to default values first to clear previous state if needed
    // or just setValue for specific fields. setValue is safer to keep touched state usually,
    // but for "Fill" we might want a clean slate.
    // Let's use setValue for granular control and to trigger validation if needed.

    Object.entries(data).forEach(([key, value]) => {
      form.setValue(key, value, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
    });
  };

  const getRandomProduct = () => {
    if (products.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * products.length);
    const p = products[randomIndex];
    return {
      productId: p.value,
      quantity: 1,
      name: p.name,
      price: p.price,
      sku: p.sku,
      imageUrl: p.image,
      stock: p.stock,
      isCustom: false,
    };
  };

  const presets = {
    standardFull: () => {
      const product = getRandomProduct();
      return {
        type: OrderType.STANDARD,
        status: OrderStatus.CREATED,
        fullName: "Test Standard User",
        email: "test.standard@example.com",
        phone: "+573001234567",
        address: "Calle 10 # 40-50",
        city: "Medellín",
        department: "Antioquia",
        daneCode: "05001000",
        payment: {
          method: PaymentMethod.CASH,
        },
        shippingProvider: ShippingProvider.NONE,
        orderItems: product ? [product] : [],
      };
    },
    standardInvalid: () => {
      const product = getRandomProduct();
      return {
        type: OrderType.STANDARD,
        status: OrderStatus.CREATED,
        fullName: "Test Invalid User",
        email: "",
        phone: "",
        address: "",
        orderItems: product ? [product] : [],
      };
    },
    anonymousQuote: () => {
      // Get up to 3 random real products
      const realItems = [];
      for (let i = 0; i < 3; i++) {
        const p = getRandomProduct();
        if (p) {
          // Add some randomness to quantity
          realItems.push({
            ...p,
            quantity: Math.floor(Math.random() * 3) + 1,
          });
        }
      }

      return {
        type: OrderType.QUOTATION,
        status: OrderStatus.DRAFT,
        fullName: "Test Anonymous Prospect",
        email: "",
        phone: "",
        address: "",
        city: "",
        department: "",
        daneCode: "",
        orderItems: [
          ...realItems,
          {
            productId: null,
            quantity: 1,
            name: "Caja Sorpresa Manual",
            price: 50000,
            isCustom: true,
          },
          {
            productId: null,
            quantity: 2,
            name: "Servicio de Empaque Especial",
            price: 15000,
            isCustom: true,
          },
        ],
      };
    },
    activationGateTrap: () => ({
      type: OrderType.QUOTATION,
      status: OrderStatus.PENDING, // Trap: Pending requires contact info
      fullName: "Test Activation Trap",
      email: "",
      phone: "",
      orderItems: [
        {
          productId: null,
          quantity: 1,
          name: "Manual Item",
          price: 10000,
          isCustom: true,
        },
      ],
    }),
    manualConversionReady: () => ({
      type: OrderType.QUOTATION,
      status: OrderStatus.DRAFT,
      fullName: "Test For Conversion",
      orderItems: [
        {
          productId: null,
          quantity: 5,
          name: "Producto Para Convertir",
          price: 25000,
          isCustom: true,
          imageUrl: "https://via.placeholder.com/150",
        },
      ],
    }),
    envioClickReady: () => {
      const product = getRandomProduct();
      return {
        type: OrderType.STANDARD,
        status: OrderStatus.DRAFT,
        fullName: "Test Shipping User",
        email: "shipping@test.com",
        phone: "+573009876543",
        address: "Carrera 43A # 1-50",
        city: "Medellín",
        department: "Antioquia",
        daneCode: "05001000",
        orderItems: product ? [product] : [],
      };
    },
    stockOverdraft: () => {
      const product = getRandomProduct();
      const crazyQuantity = (product?.stock || 0) + 100;
      return {
        type: OrderType.STANDARD,
        status: OrderStatus.DRAFT,
        fullName: "Test Stock Hoarder",
        orderItems: product ? [{ ...product, quantity: crazyQuantity }] : [],
      };
    },
    envioClickInvalid: () => {
      const product = getRandomProduct();
      return {
        type: OrderType.STANDARD,
        status: OrderStatus.DRAFT,
        fullName: "Test Invalid Shipping",
        shippingProvider: ShippingProvider.ENVIOCLICK, // Requires City/Dept/Dane
        address: "Nowhere St", // But we leave city/dane empty
        city: "",
        department: "",
        daneCode: "",
        orderItems: product ? [product] : [],
      };
    },
    sentStatusCheck: () => {
      const product = getRandomProduct();
      return {
        type: OrderType.STANDARD,
        status: OrderStatus.SENT, // Trap: Sent requires tracking code usually
        fullName: "Test Sent Status",
        email: "sent@test.com",
        phone: "+573001112233",
        address: "Calle Real 123",
        shipping: {
          status: ShippingStatus.Shipped,
          trackingCode: "", // Empty to trigger validation
        },
        orderItems: product ? [product] : [],
      };
    },
    negotiationReady: () => {
      // Get 5 random real products (can be duplicates, just for volume)
      const realItems = [];
      for (let i = 0; i < 5; i++) {
        const p = getRandomProduct();
        if (p) {
          realItems.push({
            ...p,
            quantity: Math.floor(Math.random() * 3) + 1,
          });
        }
      }

      return {
        type: OrderType.QUOTATION,
        status: OrderStatus.QUOTATION,
        fullName: "Sonia Giraldo (Test Pivot)",
        email: "sonia.giraldo@example.com",
        phone: "+573001234567",
        address: "Calle 10 # 40-50, El Poblado",
        city: "Medellín",
        department: "Antioquia",
        daneCode: "05001000",
        adminNotes: `<h2>Propuesta Comercial</h2>
<p>Hola Sonia, gracias por tu inter&eacute;s en nuestros productos.</p>
<p>A continuaci&oacute;n detallamos la cotizaci&oacute;n solicitada:</p>
<ul>
<li>Incluye personalizaci&oacute;n de logotipo.</li>
<li>Empaque de regalo incluido.</li>
</ul>
<p><strong>T&eacute;rminos:</strong> V&aacute;lido por 5 d&iacute;as.</p>`,
        internalNotes: "Cliente muy interesado. Seguimiento prioritario.",
        orderItems: [
          ...realItems,
          {
            productId: null,
            quantity: 1,
            name: "Servicio de Diseño Personalizado",
            price: 50000,
            isCustom: true,
          },
          {
            productId: null,
            quantity: 10,
            name: "Cajas de Regalo (Manual)",
            price: 12000,
            isCustom: true,
          },
          {
            productId: null,
            quantity: 1,
            name: "Envío Especializado",
            price: 25000,
            isCustom: true,
          },
        ],
      };
    },
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
        >
          <Beaker className="mr-2 h-4 w-4" />
          Test Data
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Test Scenarios</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="my-1 text-xs font-normal text-muted-foreground">
            Happy Paths
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => fillForm(presets.standardFull())}>
            <FileText className="mr-2 h-4 w-4 text-green-600" />
            Standard Full (Strict)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fillForm(presets.anonymousQuote())}>
            <FileText className="mr-2 h-4 w-4 text-blue-600" />
            Anonymous Quote
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => fillForm(presets.negotiationReady())}
          >
            <FileText className="mr-2 h-4 w-4 text-purple-600" />
            Negotiation Ready (Rich Text)
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="my-1 text-xs font-normal text-muted-foreground">
            Features
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => fillForm(presets.manualConversionReady())}
          >
            <Wand2 className="mr-2 h-4 w-4 text-purple-600" />
            Manual Conversion Ready
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fillForm(presets.envioClickReady())}>
            <Truck className="mr-2 h-4 w-4 text-indigo-600" />
            EnvioClick Quote Ready
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="my-1 text-xs font-normal text-muted-foreground">
            Validation Traps
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => fillForm(presets.standardInvalid())}>
            <Bug className="mr-2 h-4 w-4 text-red-500" />
            Standard (Invalid) - No Contact
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => fillForm(presets.envioClickInvalid())}
          >
            <Bug className="mr-2 h-4 w-4 text-red-500" />
            EnvioClick Missing Data
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fillForm(presets.stockOverdraft())}>
            <Bug className="mr-2 h-4 w-4 text-red-500" />
            Stock Overdraft
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => fillForm(presets.activationGateTrap())}
          >
            <Bug className="mr-2 h-4 w-4 text-red-500" />
            Activation Gate Trap
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fillForm(presets.sentStatusCheck())}>
            <Bug className="mr-2 h-4 w-4 text-red-500" />
            Sent Status Check
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
