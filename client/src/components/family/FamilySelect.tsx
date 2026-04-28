import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useFamilies } from "@/hooks/use-families";

type FamilyOption = {
  id: number;
  name: string;
  siblingCount?: number;
};

type FamilySelectProps = {
  value?: number | null;
  onChange: (familyId: number | null, family?: FamilyOption) => void;
  onCreateNew?: (searchTerm: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export function FamilySelect({
  value,
  onChange,
  onCreateNew,
  disabled,
  placeholder = "Select family…",
  className,
}: FamilySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useFamilies();

  const families = useMemo<FamilyOption[]>(() => {
    return ((data ?? []) as Array<{ id: number; name: string; siblingCount?: number }>).map(
      (f) => ({ id: f.id, name: f.name, siblingCount: f.siblingCount }),
    );
  }, [data]);

  const selected = useMemo(
    () => families.find((f) => f.id === value) ?? null,
    [families, value],
  );

  const handleSelect = (id: number) => {
    const family = families.find((f) => f.id === id);
    onChange(id, family);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between text-sm font-normal",
            !selected && "text-slate-400",
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">
              {selected?.name ?? placeholder}
              {selected && (
                <span className="ml-1 text-xs text-slate-400">
                  #{selected.id}
                </span>
              )}
            </span>
          </span>
          <span className="flex items-center gap-1">
            {selected ? (
              <span
                role="button"
                tabIndex={-1}
                onClick={handleClear}
                className="rounded px-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-rose-600"
              >
                clear
              </span>
            ) : null}
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="Search families…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-xs text-slate-400">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Loading families…
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="px-3 py-4 text-center text-xs text-slate-500">
                    No families match "{search}".
                  </div>
                </CommandEmpty>
                <CommandGroup heading="Families">
                  {families.map((family) => (
                    <CommandItem
                      key={family.id}
                      value={`${family.name} ${family.id}`}
                      onSelect={() => handleSelect(family.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5",
                          value === family.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{family.name}</span>
                      {typeof family.siblingCount === "number" ? (
                        <span className="ml-auto text-[10px] text-slate-400">
                          {family.siblingCount} sibling{family.siblingCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {onCreateNew ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={`__create__${search}`}
                    onSelect={() => {
                      onCreateNew(search.trim());
                      setOpen(false);
                    }}
                    className="text-indigo-600"
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Create new family{search.trim() ? ` "${search.trim()}"` : ""}
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
