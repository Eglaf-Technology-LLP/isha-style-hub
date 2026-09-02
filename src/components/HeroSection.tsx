import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import heroImage from "@/assets/hero-fashion.jpg";

export function HeroSection() {
  return (
    <section className="relative h-[70vh] lg:h-[85vh] overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="AllBoutiqs - Elegant Fashion"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/60 via-foreground/30 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative container mx-auto px-4 h-full flex items-center">
        <div className="max-w-xl text-card">
          <span className="inline-block px-4 py-2 bg-primary/20 text-primary-foreground rounded-full text-sm font-medium mb-6 backdrop-blur-sm">
            New Collection 2024
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold leading-tight mb-6">
            Discover Your
            <span className="block text-primary-foreground">Perfect Style</span>
          </h1>
          <p className="text-lg text-card/90 mb-8 max-w-md">
            Explore our curated collection of elegant dresses, trendy shirts, and comfortable pants. 
            Fashion that speaks to you.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link to="/category/all">
              <Button size="lg" className="group">
                Shop New Arrivals
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link to="/category/all">
              <Button size="lg" variant="outline" className="bg-card/10 border-card/30 text-card hover:bg-card/20">
                Explore Collection
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
