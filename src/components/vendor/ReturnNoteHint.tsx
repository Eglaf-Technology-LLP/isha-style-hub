import { returnWindowSpan, useReturnWindowHours } from "@/hooks/useReturnWindowHours";

// Under a boutique's "Return note" box: the note is only something customers
// can read on the store page. Returns themselves always follow AllBoutiqs'
// one window (Admin > Returns > Return settings), whatever the note says.
export function ReturnNoteHint({ forAdmin = false }: { forAdmin?: boolean }) {
  const hours = useReturnWindowHours();
  return (
    <p className="text-xs text-muted-foreground">
      Optional - only for customers to read on {forAdmin ? "the boutique's" : "your"} store page. It doesn't change how
      returns work: every order follows AllBoutiqs' rule, within {returnWindowSpan(hours)} of delivery.
    </p>
  );
}
