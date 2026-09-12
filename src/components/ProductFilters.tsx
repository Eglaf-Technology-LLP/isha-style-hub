import { useState, useMemo } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export interface FilterState {
  search: string;
  priceRange: [number, number];
  categories: string[];
  sizes: string[];
  colors: string[];
  brands: string[];
  inStock: boolean;
  sortBy: string;
}

interface ProductFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  categories: { id: string; name: string }[];
  availableSizes: string[];
  availableColors: string[];
  availableBrands: { id: string; name: string }[];
  maxPrice: number;
}

export function ProductFilters({
  filters,
  onFiltersChange,
  categories,
  availableSizes,
  availableColors,
  availableBrands,
  maxPrice,
}: ProductFiltersProps) {
  const [localPriceRange, setLocalPriceRange] = useState<[number, number]>(filters.priceRange);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.priceRange[0] > 0 || filters.priceRange[1] < maxPrice) count++;
    if (filters.categories.length > 0) count += filters.categories.length;
    if (filters.sizes.length > 0) count += filters.sizes.length;
    if (filters.colors.length > 0) count += filters.colors.length;
    if (filters.brands.length > 0) count += filters.brands.length;
    if (filters.inStock) count++;
    return count;
  }, [filters, maxPrice]);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (key: 'categories' | 'sizes' | 'colors' | 'brands', value: string) => {
    const current = filters[key];
    if (current.includes(value)) {
      updateFilter(key, current.filter(v => v !== value));
    } else {
      updateFilter(key, [...current, value]);
    }
  };

  const clearFilters = () => {
    onFiltersChange({
      search: "",
      priceRange: [0, maxPrice],
      categories: [],
      sizes: [],
      colors: [],
      brands: [],
      inStock: false,
      sortBy: "popular",
    });
    setLocalPriceRange([0, maxPrice]);
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="pl-10"
          />
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80 overflow-y-auto">
            <SheetHeader className="flex flex-row items-center justify-between">
              <SheetTitle>Filters</SheetTitle>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear All
                </Button>
              )}
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Price Range */}
              <div>
                <h3 className="font-medium mb-3">Price Range</h3>
                <Slider
                  value={localPriceRange}
                  onValueChange={(value) => setLocalPriceRange(value as [number, number])}
                  onValueCommit={(value) => updateFilter("priceRange", value as [number, number])}
                  max={maxPrice}
                  step={100}
                  className="mb-2"
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>₹{localPriceRange[0].toLocaleString()}</span>
                  <span>₹{localPriceRange[1].toLocaleString()}</span>
                </div>
              </div>

              <Separator />

              {/* Categories */}
              {categories.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Categories</h3>
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <div key={category.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`cat-${category.id}`}
                          checked={filters.categories.includes(category.id)}
                          onCheckedChange={() => toggleArrayFilter("categories", category.id)}
                        />
                        <Label htmlFor={`cat-${category.id}`} className="cursor-pointer">
                          {category.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Brands */}
              {availableBrands.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Brand</h3>
                  <div className="space-y-2">
                    {availableBrands.map((brand) => (
                      <div key={brand.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`brand-${brand.id}`}
                          checked={filters.brands.includes(brand.id)}
                          onCheckedChange={() => toggleArrayFilter("brands", brand.id)}
                        />
                        <Label htmlFor={`brand-${brand.id}`} className="cursor-pointer">
                          {brand.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Sizes */}
              {availableSizes.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Sizes</h3>
                  <div className="flex flex-wrap gap-2">
                    {availableSizes.map((size) => (
                      <Badge
                        key={size}
                        variant={filters.sizes.includes(size) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleArrayFilter("sizes", size)}
                      >
                        {size}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Colors */}
              {availableColors.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Colors</h3>
                  <div className="flex flex-wrap gap-2">
                    {availableColors.map((color) => (
                      <Badge
                        key={color}
                        variant={filters.colors.includes(color) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleArrayFilter("colors", color)}
                      >
                        {color}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* In Stock */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="in-stock"
                  checked={filters.inStock}
                  onCheckedChange={(checked) => updateFilter("inStock", !!checked)}
                />
                <Label htmlFor="in-stock" className="cursor-pointer">
                  In Stock Only
                </Label>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Sort */}
        <Select value={filters.sortBy} onValueChange={(value) => updateFilter("sortBy", value)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Best Selling</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="price-low">Price: Low to High</SelectItem>
            <SelectItem value="price-high">Price: High to Low</SelectItem>
            <SelectItem value="name">Name: A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active Filters */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: {filters.search}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => updateFilter("search", "")}
              />
            </Badge>
          )}
          {(filters.priceRange[0] > 0 || filters.priceRange[1] < maxPrice) && (
            <Badge variant="secondary" className="gap-1">
              ₹{filters.priceRange[0]} - ₹{filters.priceRange[1]}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  updateFilter("priceRange", [0, maxPrice]);
                  setLocalPriceRange([0, maxPrice]);
                }}
              />
            </Badge>
          )}
          {filters.categories.map((catId) => {
            const cat = categories.find(c => c.id === catId);
            return (
              <Badge key={catId} variant="secondary" className="gap-1">
                {cat?.name || catId}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => toggleArrayFilter("categories", catId)}
                />
              </Badge>
            );
          })}
          {filters.sizes.map((size) => (
            <Badge key={size} variant="secondary" className="gap-1">
              Size: {size}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter("sizes", size)}
              />
            </Badge>
          ))}
          {filters.colors.map((color) => (
            <Badge key={color} variant="secondary" className="gap-1">
              {color}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter("colors", color)}
              />
            </Badge>
          ))}
          {filters.brands.map((brandId) => {
            const brand = availableBrands.find(b => b.id === brandId);
            return (
              <Badge key={brandId} variant="secondary" className="gap-1">
                {brand?.name || brandId}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => toggleArrayFilter("brands", brandId)}
                />
              </Badge>
            );
          })}
          {filters.inStock && (
            <Badge variant="secondary" className="gap-1">
              In Stock
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => updateFilter("inStock", false)}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
