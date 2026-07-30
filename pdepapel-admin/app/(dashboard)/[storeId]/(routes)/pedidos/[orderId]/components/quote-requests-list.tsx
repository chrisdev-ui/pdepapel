import { QuoteRequest } from "@prisma/client";
import { format } from "date-fns";
import { AlertCircle, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface QuoteRequestsListProps {
  requests: QuoteRequest[];
}

export const QuoteRequestsList: React.FC<QuoteRequestsListProps> = ({
  requests,
}) => {
  if (!requests || requests.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-orange-600">
        <MessageSquare className="h-5 w-5" />
        Solicitudes de Cambio ({requests.length})
      </h3>

      <div className="space-y-4">
        {requests.map((request) => (
          <Card key={request.id} className="border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">
                    Solicitud del{" "}
                    {format(new Date(request.createdAt), "dd/MM/yyyy HH:mm")}
                  </CardTitle>
                  <CardDescription>
                    {request.customerName} - {request.customerPhone}
                  </CardDescription>
                </div>
                <Badge
                  variant={
                    request.status === "PENDING" ? "destructive" : "secondary"
                  }
                >
                  {request.status === "PENDING" ? "Pendiente" : request.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-white p-3 text-sm shadow-sm">
                {request.message}
              </div>
              {request.status === "PENDING" && (
                <div className="mt-2 flex items-center gap-2 text-xs text-orange-700">
                  <AlertCircle className="h-3 w-3" />
                  <span>
                    Revisa esta solicitud y actualiza la cotización si es
                    necesario.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Separator />
    </div>
  );
};
