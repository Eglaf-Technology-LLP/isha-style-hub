import { useCustomerShipping } from "@/hooks/useCustomerShipping";
import { Truck, RotateCcw, Shield, HeadphonesIcon } from "lucide-react";
import { hoursText, usePolicyHours } from "@/hooks/usePolicyHours";

const features = [
  {
    icon: Truck,
    title: "Free Shipping",
    description: "On orders above ₹999",
    // Replaced below while the admin's shipping switch is archived.
  },
  {
    icon: RotateCcw,
    title: "Easy Returns",
    description: "Within 24 hours of delivery",
    // Replaced below with the admin's return window.
  },
  {
    icon: Shield,
    title: "Secure Payment",
    description: "100% secure checkout",
  },
  {
    icon: HeadphonesIcon,
    title: "24/7 Support",
    description: "Dedicated support team",
  },
];

export function FeaturesSection() {
  const { shippingCharged } = useCustomerShipping();
  const { returnHours } = usePolicyHours();
  return (
    <section className="py-12 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y divide-border lg:divide-y-0 lg:divide-x">
          {features
            .map((f) => (f.title === "Free Shipping" && !shippingCharged ? { ...f, description: "On all orders" } : f))
            .map((f) => (f.title === "Easy Returns" ? { ...f, description: `Within ${hoursText(returnHours)} of delivery` } : f))
            .map((feature) => (
            <div
              key={feature.title}
              className="group flex flex-col items-center text-center p-6"
            >
              <div className="w-14 h-14 rounded-full bg-primary/10 shadow-sm flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground">
                <feature.icon className="h-6 w-6 text-primary transition-colors group-hover:text-primary-foreground" />
              </div>
              <h3 className="font-semibold mb-1">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
