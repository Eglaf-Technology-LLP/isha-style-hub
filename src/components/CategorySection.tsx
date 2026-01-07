import { Link } from "react-router-dom";

const categories = [
  {
    name: "Dresses",
    description: "Elegant & Trendy",
    href: "/category/dresses",
    gradient: "from-chart-1 to-chart-2",
  },
  {
    name: "Shirts",
    description: "Casual & Formal",
    href: "/category/shirts",
    gradient: "from-chart-3 to-chart-4",
  },
  {
    name: "Pants",
    description: "Comfort & Style",
    href: "/category/pants",
    gradient: "from-chart-2 to-chart-3",
  },
  {
    name: "Ethnic Wear",
    description: "Traditional Beauty",
    href: "/category/ethnic",
    gradient: "from-chart-4 to-chart-1",
  },
];

export function CategorySection() {
  return (
    <section className="py-16 bg-card">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-4">
            Shop by Category
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Explore our curated collections designed for every occasion
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {categories.map((category) => (
            <Link
              key={category.name}
              to={category.href}
              className="group relative overflow-hidden rounded-2xl aspect-square"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-80 group-hover:opacity-90 transition-opacity`} />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-card p-4">
                <h3 className="text-xl md:text-2xl font-serif font-bold mb-1 text-center">
                  {category.name}
                </h3>
                <p className="text-sm text-card/80 text-center">
                  {category.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
