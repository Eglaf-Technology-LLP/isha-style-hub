import { useNavigate } from "react-router-dom";
import { useVendor } from "@/hooks/useVendor";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Clock, XCircle, Mail, Store, ArrowLeft } from "lucide-react";

export default function VendorPending() {
  const { vendor, loading } = useVendor();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex justify-center items-center py-40">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <Footer />
      </div>
    );
  }

  // No vendor record → send to application
  if (!vendor) {
    navigate("/sell-with-us", { replace: true });
    return null;
  }

  // Already approved → to the dashboard
  if (vendor.status === "approved") {
    navigate("/vendor", { replace: true });
    return null;
  }

  const isRejected = vendor.status === "rejected";
  const isSuspended = vendor.status === "suspended";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-16">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            {isRejected || isSuspended ? (
              <XCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
            ) : (
              <Clock className="h-16 w-16 mx-auto text-primary mb-4" />
            )}
            <CardTitle className="text-2xl font-serif">
              {isRejected
                ? "Application not approved"
                : isSuspended
                ? "Store suspended"
                : "Application under review"}
            </CardTitle>
            <CardDescription>
              {isRejected
                ? "Unfortunately your store application wasn't approved at this time. Please review your details and reach out to us."
                : isSuspended
                ? "Your store has been suspended by the marketplace admin. Contact support to resolve this."
                : `Thank you for applying, ${vendor.name}. Our team is reviewing your application.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-border p-4 bg-muted/30 space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <Store className="h-4 w-4 text-primary" /> {vendor.name}
              </div>
              <p className="text-sm text-muted-foreground">
                Status: <span className="font-medium capitalize">{vendor.status}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Submitted: {new Date(vendor.created_at).toLocaleDateString()}
              </p>
              {vendor.contact_email && (
                <p className="text-sm text-muted-foreground">
                  Contact: {vendor.contact_email}
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 mt-0.5 text-primary" />
              <p>
                We'll email you at your contact address once a decision is made. For
                questions, reply to hello@allboutiqs.com.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to store
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
