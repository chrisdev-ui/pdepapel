import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, UserCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "./command";

interface UserOption {
  value: string;
  label: string;
  image?: string;
  phone?: string;
  documentId?: string;
}

interface UserComboboxProps {
  options: UserOption[];
  value?: string;
  onChange: (value: string, user?: UserOption) => void;
  disabled?: boolean;
}

export const UserCombobox: React.FC<UserComboboxProps> = ({
  options,
  value,
  onChange,
  disabled,
}) => {
  const [open, setOpen] = useState(false);

  const selectedUser = useMemo(
    () => options.find((user) => user.value === value),
    [options, value],
  );

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            {selectedUser ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={selectedUser.image} />
                  <AvatarFallback>
                    <UserCircle2 className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                {selectedUser.label}
              </div>
            ) : (
              "Seleccionar usuario..."
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder="Buscar usuario..." />
            <CommandEmpty>No se encontraron usuarios.</CommandEmpty>
            <CommandGroup>
              {options.map((user) => (
                <CommandItem
                  key={user.value}
                  value={user.value}
                  onSelect={() => {
                    const selectedUser = options.find(
                      (u) => u.value === user.value,
                    );
                    const newValue = value === user.value ? "" : user.value;
                    onChange(
                      newValue,
                      value === user.value ? undefined : selectedUser,
                    );
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user.image} />
                      <AvatarFallback>
                        <UserCircle2 className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    {user.label}
                  </div>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === user.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
