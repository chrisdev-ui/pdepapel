"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import axios from "axios";
import {
  AlertCircle,
  Database,
  Loader2,
  MapPin,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface CacheStats {
  totalQuotes: number;
  totalHits: number;
  expired: number;
  topRoutes: Array<{
    originDaneCode: string;
    destDaneCode: string;
    hitCount: number;
    createdAt: Date;
  }>;
}

export function CacheManagement() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingType, setDeletingType] = useState<
    "expired" | "unused" | "all" | null
  >(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/${params.storeId}/shipment/cache`);
      setStats(response.data);
    } catch (error) {
      toast({
        title: "Error al cargar estadísticas",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (type: "expired" | "unused" | "all") => {
    if (type === "all") {
      // Show confirmation for "all"
      setDeletingType(type);
      setShowConfirmDialog(true);
      return;
    }

    // Execute immediately for expired/unused
    await executeDelete(type);
  };

  const executeDelete = async (type: "expired" | "unused" | "all") => {
    try {
      setLoading(true);
      const response = await axios.delete(
        `/api/${params.storeId}/shipment/cache?type=${type}`,
      );

      toast({
        title: "Limpieza exitosa",
        description: response.data.message,
        variant: "success",
      });

      // Refresh stats and page
      await fetchStats();
      router.refresh();
    } catch (error) {
      toast({
        title: "Error al limpiar caché",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setShowConfirmDialog(false);
      setDeletingType(null);
    }
  };

  if (loading && !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Gestión de Caché de Cotizaciones
          </CardTitle>
          <CardDescription>
            Administra las cotizaciones guardadas en caché
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Gestión de Caché de Cotizaciones
              </CardTitle>
              <CardDescription className="mt-1">
                Las cotizaciones se guardan por 2 horas para mejorar el
                rendimiento
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStats}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Statistics */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Database className="h-4 w-4" />
                Total de Cotizaciones
              </div>
              <p className="mt-2 text-2xl font-bold">
                {stats?.totalQuotes || 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats?.totalHits || 0} usos totales
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                Cotizaciones Expiradas
              </div>
              <p className="mt-2 text-2xl font-bold text-orange-600">
                {stats?.expired || 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Más de 2 horas de antigüedad
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                Rutas Más Usadas
              </div>
              <p className="mt-2 text-2xl font-bold">
                {stats?.topRoutes?.length || 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Top 10 rutas</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Acciones de Limpieza</h4>
            <div className="grid gap-3 md:grid-cols-3">
              <Button
                variant="outline"
                onClick={() => handleDelete("expired")}
                disabled={loading || !stats?.expired}
                className="justify-start"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Limpiar Expiradas ({stats?.expired || 0})
              </Button>

              <Button
                variant="outline"
                onClick={() => handleDelete("unused")}
                disabled={loading}
                className="justify-start"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Limpiar Sin Uso (7+ días)
              </Button>

              <Button
                variant="destructive"
                onClick={() => handleDelete("all")}
                disabled={loading || !stats?.totalQuotes}
                className="justify-start"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Limpiar Todo ({stats?.totalQuotes || 0})
              </Button>
            </div>
          </div>

          {/* Top Routes (Optional) */}
          {stats?.topRoutes && stats.topRoutes.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Rutas Más Cotizadas</h4>
              <div className="space-y-2">
                {stats.topRoutes.slice(0, 5).map((route, index) => (
                  <div
                    key={`${route.originDaneCode}-${route.destDaneCode}`}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {index + 1}
                      </span>
                      <span className="font-mono text-xs">
                        {route.originDaneCode} → {route.destDaneCode}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {route.hitCount} usos
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás completamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará <strong>TODAS</strong> las cotizaciones
              guardadas en caché ({stats?.totalQuotes || 0} cotizaciones). Esto
              no se puede deshacer y los clientes deberán solicitar nuevas
              cotizaciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingType && executeDelete(deletingType)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, eliminar todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
