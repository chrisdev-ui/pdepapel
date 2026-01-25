import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import axios from "axios";
import { Check, ChevronsUpDown, Loader2, UserCircle2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

interface UserOption {
  value: string;
  label: string;
  image?: string;
  phone?: string;
  email?: string;
  documentId?: string;
}

interface UserComboboxProps {
  options: UserOption[]; // Initial options
  value?: string;
  onChange: (value: string, user?: UserOption) => void;
  disabled?: boolean;
}

export const UserCombobox: React.FC<UserComboboxProps> = ({
  options: initialOptions,
  value,
  onChange,
  disabled,
}) => {
  const params = useParams();
  const [open, setOpen] = useState(false);

  // State for data
  const [users, setUsers] = useState<UserOption[]>(() =>
    Array.from(new Map(initialOptions.map((u) => [u.value, u])).values()),
  );
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  // Pagination State
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback(
    (node: HTMLDivElement) => {
      if (isLoading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setPage((prev) => prev + 1);
        }
      });
      if (node) observer.current.observe(node);
    },
    [isLoading, hasMore],
  );

  // Selected User (Sync with value)
  const selectedUser = useMemo(() => {
    if (!value) return undefined;

    // Helper to check match (Exact or Suffix for sanitized IDs)
    const isMatch = (optionValue: string) => {
      if (optionValue === value) return true;
      // If value is "123", it should match "clerk_123"
      if (optionValue.endsWith(`_${value}`)) return true;
      // If value is "guest_123", exact match handles it.
      return false;
    };

    // Check if user is in current list
    const inList = users.find((user) => isMatch(user.value));
    if (inList) return inList;

    // If not in list, try initial options
    return initialOptions.find((user) => isMatch(user.value));
  }, [users, value, initialOptions]);

  // Fetch Logic
  useEffect(() => {
    let active = true;

    const fetchUsers = async () => {
      // Optimization: If query is empty and page is 1, use initial options (Instant Reset)
      if (!debouncedQuery && page === 1) {
        if (active) {
          // Normalize initialOptions to ensure uniqueness if needed, but usually safe
          setUsers(initialOptions);
          setHasMore(true);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      try {
        const url = `/api/${params.storeId}/customers/search`;
        const res = await axios.get(url, {
          params: {
            query: debouncedQuery,
            page: page,
            limit: 20,
          },
        });

        if (!active) return;

        const newUsers = res.data;

        if (page === 1) {
          setUsers(newUsers);
        } else {
          // Append unique users (Upsert strategy)
          setUsers((prev) => {
            const userMap = new Map(prev.map((u) => [u.value, u]));
            newUsers.forEach((u: UserOption) => {
              userMap.set(u.value, u);
            });
            return Array.from(userMap.values());
          });
        }

        setHasMore(newUsers.length === 20); // If full batch, assume more exists
      } catch (error) {
        console.error("Error fetching users", error);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    fetchUsers();

    return () => {
      active = false;
    };
  }, [debouncedQuery, page, params.storeId, initialOptions]);

  // Reset page on query change
  useEffect(() => {
    setPage(1);
    setHasMore(true);
  }, [debouncedQuery]);

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
              <div className="flex items-center gap-2 overflow-hidden">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={selectedUser.image} />
                  <AvatarFallback>
                    <UserCircle2 className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{selectedUser.label}</span>
              </div>
            ) : (
              "Seleccionar usuario..."
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            {/* We disable local filtering because we do server-side search */}
            <CommandInput
              placeholder="Buscar por nombre, teléfono o email..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="h-72 max-h-[unset]">
              <CommandEmpty>
                {isLoading ? "Buscando..." : "No se encontraron usuarios."}
              </CommandEmpty>
              <CommandGroup>
                {users.map((user, index) => {
                  const isLast = index === users.length - 1;
                  return (
                    <div
                      key={`${user.value}-${index}`}
                      ref={isLast ? lastElementRef : null}
                    >
                      <CommandItem
                        value={`${user.value}__${index}`} // Force unique UI key
                        keywords={
                          [
                            user.label,
                            user.email,
                            user.phone,
                            user.documentId,
                          ].filter(Boolean) as string[]
                        }
                        onSelect={() => {
                          // Pass selected user directly - no toggle logic to avoid unselecting by mistake
                          onChange(user.value, user);
                          setOpen(false);
                        }}
                      >
                        <div className="flex w-full items-center gap-2 overflow-hidden">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarImage src={user.image} />
                            <AvatarFallback>
                              <UserCircle2 className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col truncate">
                            <span className="truncate text-sm font-medium">
                              {user.label}
                            </span>
                            {(user.email || user.phone) && (
                              <span className="truncate text-xs text-muted-foreground">
                                {[user.email, user.phone, user.documentId]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </span>
                            )}
                          </div>
                        </div>
                        <Check
                          className={cn(
                            "ml-auto h-4 w-4 shrink-0",
                            value === user.value ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                    </div>
                  );
                })}
                {isLoading && page > 1 && (
                  <div className="flex justify-center p-2 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cargando más...
                  </div>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
