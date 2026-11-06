// react-native-razorpay ships JS without type declarations; these follow its
// own src/types.ts (PaymentSuccessData / PaymentErrorData).
declare module 'react-native-razorpay' {
  export interface RazorpayCheckoutOptions {
    key: string;
    amount: number;
    currency: string;
    order_id: string;
    name?: string;
    description?: string;
    prefill?: { name?: string; email?: string; contact?: string };
    theme?: { color?: string };
    [extra: string]: unknown;
  }
  export interface PaymentSuccessData {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }
  export interface PaymentErrorData {
    code: number;
    description: string;
  }
  const RazorpayCheckout: {
    open(options: RazorpayCheckoutOptions): Promise<PaymentSuccessData>;
  };
  export default RazorpayCheckout;
}
