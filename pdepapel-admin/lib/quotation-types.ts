import { QuotationType } from "@prisma/client";
import {
  Building2,
  Cake,
  Calendar,
  FileText,
  GraduationCap,
  Heart,
  Package,
  Sun,
  LucideIcon,
} from "lucide-react";

export const QUOTATION_TYPE_LABELS: Record<QuotationType, string> = {
  GENERAL: "General",
  SCHOOL_LIST: "Lista Escolar",
  WEDDING: "Boda",
  EVENT: "Evento",
  WHOLESALE: "Mayorista",
  CORPORATE: "Corporativo",
  BIRTHDAY: "Cumpleaños",
  SEASONAL: "Temporada",
};

export const QUOTATION_TYPE_ICONS: Record<QuotationType, LucideIcon> = {
  GENERAL: FileText,
  SCHOOL_LIST: GraduationCap,
  WEDDING: Heart,
  EVENT: Calendar,
  WHOLESALE: Package,
  CORPORATE: Building2,
  BIRTHDAY: Cake,
  SEASONAL: Sun,
};

export const QUOTATION_TYPE_COLORS: Record<QuotationType, string> = {
  GENERAL: "bg-gray-500",
  SCHOOL_LIST: "bg-blue-500",
  WEDDING: "bg-rose-500",
  EVENT: "bg-orange-500",
  WHOLESALE: "bg-emerald-500",
  CORPORATE: "bg-indigo-600",
  BIRTHDAY: "bg-pink-500",
  SEASONAL: "bg-yellow-500",
};
