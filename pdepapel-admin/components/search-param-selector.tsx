"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface SearchParamSelectorProps {
  paramKey: string;
  options: string[];
  placeholder: string;
  defaultValue: string;
}

export const SearchParamSelector: React.FC<SearchParamSelectorProps> = ({
  paramKey,
  options,
  placeholder,
  defaultValue,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedValue, setSelectedValue] =
    useState<typeof defaultValue>(defaultValue);

  useEffect(() => {
    const paramValue = searchParams.get(paramKey);
    if (paramValue) {
      setSelectedValue(paramValue);
    } else {
      setSelectedValue(defaultValue);
    }
  }, [searchParams, paramKey, defaultValue]);

  const onValueChange = (value: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));

    if (!value) {
      current.delete(paramKey);
    } else {
      current.set(paramKey, value);
    }

    const search = current.toString();
    const query = search ? `?${search}` : "";

    router.push(`${pathname}${query}`);
    setSelectedValue(value);
  };

  return (
    <Select onValueChange={onValueChange} value={selectedValue}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
