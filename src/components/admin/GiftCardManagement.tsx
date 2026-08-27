import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Gift,
  Plus,
  Loader2,
  Edit,
  Trash2,
  Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface GiftCard {
  id: string;
  code: string;
  initial_balance: number;
  current_balance: number;
  purchaser_user_id: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  message: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GiftCardFormData {
  code: string;
  initial_balance: number;
  current_balance: number;
  recipient_email: string;
  recipient_name: string;
  message: string;
  is_active: boolean;
  expires_at: string | null;
}

const generateGiftCardCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export function GiftCardManagement() {
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingGiftCard, setIsAddingGiftCard] = useState(false);
  const [editingGiftCard, setEditingGiftCard] = useState<GiftCard | null>(null);
  const [giftCardForm, setGiftCardForm] = useState<GiftCardFormData>({
    code: "",
    initial_balance: 500,
    current_balance: 500,
    recipient_email: "",
    recipient_name: "",
    message: "",
    is_active: true,
    expires_at: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchGiftCards();
  }, []);

  const fetchGiftCards = async () => {
    try {
      const { data, error } = await supabase
        .from('gift_cards')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGiftCards(data || []);
    } catch (error) {
      console.error('Error fetching gift cards:', error);
      toast.error('Failed to load gift cards');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setGiftCardForm({
      code: generateGiftCardCode(),
      initial_balance: 500,
      current_balance: 500,
      recipient_email: "",
      recipient_name: "",
      message: "",
      is_active: true,
      expires_at: null,
    });
    setEditingGiftCard(null);
  };

  const handleAddGiftCard = async () => {
    if (!giftCardForm.code || giftCardForm.initial_balance <= 0) {
      toast.error("Please fill in required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('gift_cards')
        .insert({
          code: giftCardForm.code,
          initial_balance: giftCardForm.initial_balance,
          current_balance: giftCardForm.initial_balance,
          recipient_email: giftCardForm.recipient_email || null,
          recipient_name: giftCardForm.recipient_name || null,
          message: giftCardForm.message || null,
          is_active: giftCardForm.is_active,
          expires_at: giftCardForm.expires_at,
        });

      if (error) throw error;

      toast.success('Gift card created!');
      resetForm();
      setIsAddingGiftCard(false);
      fetchGiftCards();
    } catch (error: any) {
      console.error('Error creating gift card:', error);
      toast.error(error.message || 'Failed to create gift card');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditGiftCard = async () => {
    if (!editingGiftCard) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('gift_cards')
        .update({
          current_balance: giftCardForm.current_balance,
          recipient_email: giftCardForm.recipient_email || null,
          recipient_name: giftCardForm.recipient_name || null,
          message: giftCardForm.message || null,
          is_active: giftCardForm.is_active,
          expires_at: giftCardForm.expires_at,
        })
        .eq('id', editingGiftCard.id);

      if (error) throw error;

      toast.success('Gift card updated!');
      resetForm();
      setEditingGiftCard(null);
      fetchGiftCards();
    } catch (error) {
      console.error('Error updating gift card:', error);
      toast.error('Failed to update gift card');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGiftCard = async (id: string) => {
    try {
      const { error } = await supabase
        .from('gift_cards')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Gift card deleted');
      fetchGiftCards();
    } catch (error) {
      console.error('Error deleting gift card:', error);
      toast.error('Failed to delete gift card');
    }
  };

  const openEditDialog = (card: GiftCard) => {
    setEditingGiftCard(card);
    setGiftCardForm({
      code: card.code,
      initial_balance: card.initial_balance,
      current_balance: card.current_balance,
      recipient_email: card.recipient_email || "",
      recipient_name: card.recipient_name || "",
      message: card.message || "",
      is_active: card.is_active,
      expires_at: card.expires_at,
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied to clipboard");
  };

  const getGiftCardStatus = (card: GiftCard) => {
    if (!card.is_active) return { label: "Inactive", variant: "secondary" as const };
    if (card.expires_at && new Date(card.expires_at) < new Date()) {
      return { label: "Expired", variant: "destructive" as const };
    }
    if (card.current_balance <= 0) {
      return { label: "Used", variant: "secondary" as const };
    }
    return { label: "Active", variant: "default" as const };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // A plain function returning JSX, called directly - not a JSX component.
  // As `const GiftCardFormContent = (...) => (...)` used via
  // `<GiftCardFormContent />`, this got a brand-new function identity every
  // render (any keystroke in the form re-renders the parent), which made
  // React treat it as a different component type each time and remount the
  // whole subtree - every input lost focus after a single character.
  const renderGiftCardFormContent = ({ isEdit = false }: { isEdit?: boolean } = {}) => (
    <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="space-y-2">
        <Label>Gift Card Code</Label>
        <div className="flex gap-2">
          <Input
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={giftCardForm.code}
            onChange={(e) =>
              setGiftCardForm({ ...giftCardForm, code: e.target.value.toUpperCase() })
            }
            disabled={isEdit}
          />
          {!isEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setGiftCardForm({ ...giftCardForm, code: generateGiftCardCode() })
              }
            >
              Generate
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{isEdit ? "Current Balance (₹)" : "Initial Balance (₹)"}</Label>
          <Input
            type="number"
            min="0"
            step="100"
            placeholder="500"
            value={isEdit ? giftCardForm.current_balance : giftCardForm.initial_balance}
            onChange={(e) =>
              setGiftCardForm({
                ...giftCardForm,
                [isEdit ? "current_balance" : "initial_balance"]: parseFloat(e.target.value) || 0,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Expires On (optional)</Label>
          <Input
            type="date"
            value={
              giftCardForm.expires_at
                ? format(new Date(giftCardForm.expires_at), "yyyy-MM-dd")
                : ""
            }
            onChange={(e) =>
              setGiftCardForm({
                ...giftCardForm,
                expires_at: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Recipient Name</Label>
          <Input
            placeholder="John Doe"
            value={giftCardForm.recipient_name}
            onChange={(e) =>
              setGiftCardForm({ ...giftCardForm, recipient_name: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Recipient Email</Label>
          <Input
            type="email"
            placeholder="john@example.com"
            value={giftCardForm.recipient_email}
            onChange={(e) =>
              setGiftCardForm({ ...giftCardForm, recipient_email: e.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          placeholder="Personal message for the recipient..."
          value={giftCardForm.message}
          onChange={(e) =>
            setGiftCardForm({ ...giftCardForm, message: e.target.value })
          }
          rows={2}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Active</Label>
        <Switch
          checked={giftCardForm.is_active}
          onCheckedChange={(checked) =>
            setGiftCardForm({ ...giftCardForm, is_active: checked })
          }
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-background">
        <Button
          variant="outline"
          onClick={() => {
            resetForm();
            isEdit ? setEditingGiftCard(null) : setIsAddingGiftCard(false);
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={isEdit ? handleEditGiftCard : handleAddGiftCard}
          disabled={isSubmitting || !giftCardForm.code}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Update Gift Card" : "Create Gift Card"}
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Gift Cards</CardTitle>
          <p className="text-sm text-muted-foreground">
            Create and manage gift cards
          </p>
        </div>
        <Dialog open={isAddingGiftCard} onOpenChange={setIsAddingGiftCard}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" />
              Create Gift Card
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Gift Card</DialogTitle>
              <DialogDescription>
                Create a new gift card with a unique code
              </DialogDescription>
            </DialogHeader>
            {renderGiftCardFormContent()}
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {giftCards.length === 0 ? (
          <div className="text-center py-12">
            <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No gift cards yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first gift card
            </p>
            <Button onClick={() => setIsAddingGiftCard(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Gift Card
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {giftCards.map((card) => {
              const status = getGiftCardStatus(card);
              return (
                <div
                  key={card.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Gift className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyCode(card.code)}
                          className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs font-mono hover:bg-muted/80"
                        >
                          {card.code}
                          <Copy className="h-3 w-3" />
                        </button>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Balance: ₹{card.current_balance} / ₹{card.initial_balance}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {card.recipient_name && `To: ${card.recipient_name}`}
                        {card.expires_at &&
                          ` • Expires: ${format(new Date(card.expires_at), "MMM d, yyyy")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={card.is_active}
                      onCheckedChange={async (checked) => {
                        await supabase
                          .from('gift_cards')
                          .update({ is_active: checked })
                          .eq('id', card.id);
                        fetchGiftCards();
                      }}
                    />
                    <Dialog
                      open={editingGiftCard?.id === card.id}
                      onOpenChange={(open) => {
                        if (!open) resetForm();
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(card)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Edit Gift Card</DialogTitle>
                          <DialogDescription>
                            Update gift card details
                          </DialogDescription>
                        </DialogHeader>
                        {renderGiftCardFormContent({ isEdit: true })}
                      </DialogContent>
                    </Dialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Gift Card?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this gift card. This action
                            cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteGiftCard(card.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
