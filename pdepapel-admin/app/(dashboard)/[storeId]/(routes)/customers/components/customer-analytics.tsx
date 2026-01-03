"use client";

import { getCustomerAnalytics } from "@/actions/get-customer-analytics";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { currencyFormatter } from "@/lib/utils";
import {
  Award,
  CreditCard,
  Crown,
  Star,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

interface CustomerAnalyticsProps {
  storeId: string;
}

interface AnalyticsData {
  totalCustomers: number;
  newCustomersThisMonth: number;
  returningCustomers: number;
  customerRetentionRate: number;
  averageLifetimeValue: number;
  mostValuableCustomers: {
    month: {
      name: string;
      totalSpent: number;
      orders: number;
    } | null;
    sixMonths: {
      name: string;
      totalSpent: number;
      orders: number;
    } | null;
    year: {
      name: string;
      totalSpent: number;
      orders: number;
    } | null;
    allTime: {
      name: string;
      totalSpent: number;
      orders: number;
    } | null;
  };
}

export const CustomerAnalytics: React.FC<CustomerAnalyticsProps> = ({
  storeId,
}) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setIsLoading(true);
        const data = await getCustomerAnalytics(storeId);
        // Ensure mostValuableCustomers is present to satisfy AnalyticsData type
        setAnalytics({
          totalCustomers: data.totalCustomers,
          newCustomersThisMonth: data.newCustomersThisMonth,
          returningCustomers: data.returningCustomers,
          customerRetentionRate: data.customerRetentionRate,
          averageLifetimeValue: data.averageLifetimeValue,
          mostValuableCustomers: (data as any).mostValuableCustomers ?? {
            month: null,
            sixMonths: null,
            year: null,
            allTime: null,
          },
        });
      } catch (error) {
        console.error("Error loading customer analytics:", error);
      } finally {
        setIsLoading(false);
      }
    };

    // Load analytics in background after a small delay to prioritize table
    const timer = setTimeout(loadAnalytics, 100);
    return () => clearTimeout(timer);
  }, [storeId]);

  if (isLoading || !analytics) {
    return <AnalyticsSkeleton />;
  }

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.totalCustomers}</div>
          <p className="text-xs text-muted-foreground">
            Clientes únicos registrados
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Nuevos este mes</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {analytics.newCustomersThisMonth}
          </div>
          <p className="text-xs text-muted-foreground">
            Clientes que hicieron su primera orden
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Clientes recurrentes
          </CardTitle>
          <UserCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {analytics.returningCustomers}
          </div>
          <p className="text-xs text-muted-foreground">
            {analytics.customerRetentionRate.toFixed(1)}% tasa de retención
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Gasto promedio por cliente
          </CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {currencyFormatter(analytics.averageLifetimeValue)}
          </div>
          <p className="text-xs text-muted-foreground">
            Total gastado ÷ número de clientes
          </p>
        </CardContent>
      </Card>

      {/* Most Valuable Customers Cards */}
      <MostValuableCustomerCard
        title="Cliente VIP del mes"
        period="month"
        customer={analytics.mostValuableCustomers.month}
        icon={<Crown className="h-4 w-4 text-yellow-500" />}
        badgeColor="bg-yellow-100 text-yellow-800"
      />

      <MostValuableCustomerCard
        title="Cliente VIP (6 meses)"
        period="sixMonths"
        customer={analytics.mostValuableCustomers.sixMonths}
        icon={<Trophy className="h-4 w-4 text-orange-500" />}
        badgeColor="bg-orange-100 text-orange-800"
      />

      <MostValuableCustomerCard
        title="Cliente VIP del año"
        period="year"
        customer={analytics.mostValuableCustomers.year}
        icon={<Star className="h-4 w-4 text-purple-500" />}
        badgeColor="bg-purple-100 text-purple-800"
      />

      <MostValuableCustomerCard
        title="Cliente VIP histórico"
        period="allTime"
        customer={analytics.mostValuableCustomers.allTime}
        icon={<Award className="h-4 w-4 text-blue-500" />}
        badgeColor="bg-blue-100 text-blue-800"
      />
    </div>
  );
};

interface MostValuableCustomerCardProps {
  title: string;
  period: string;
  customer: {
    name: string;
    totalSpent: number;
    orders: number;
  } | null;
  icon: React.ReactNode;
  badgeColor: string;
}

const MostValuableCustomerCard: React.FC<MostValuableCustomerCardProps> = ({
  title,
  customer,
  icon,
  badgeColor,
}) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {customer ? (
          <>
            <div className="truncate text-lg font-bold" title={customer.name}>
              {customer.name}
            </div>
            <div className="text-xl font-bold text-green-600">
              {currencyFormatter(customer.totalSpent)}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {customer.orders} {customer.orders === 1 ? "orden" : "órdenes"}
              </p>
              <Badge className={badgeColor}>VIP</Badge>
            </div>
          </>
        ) : (
          <>
            <div className="text-lg font-bold text-muted-foreground">
              Sin datos
            </div>
            <p className="text-xs text-muted-foreground">
              No hay órdenes en este período
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const AnalyticsSkeleton = () => {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mb-2 h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
