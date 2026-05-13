import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Props {
  pendingMonths: number;
}

export function PaymentDueBanner({ pendingMonths }: Props) {
  if (pendingMonths === 0) return null;

  return (
    <Alert variant="destructive" className="mb-6 border-amber-500 bg-amber-50 text-amber-800">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-900 font-semibold">
        Payment Due – Action Required
      </AlertTitle>
      <AlertDescription>
        Your payment is overdue. You have{" "}
        <strong>{pendingMonths} month(s)</strong> of pending payments. Please
        settle your outstanding dues immediately to continue using the system.
      </AlertDescription>
    </Alert>
  );
}
