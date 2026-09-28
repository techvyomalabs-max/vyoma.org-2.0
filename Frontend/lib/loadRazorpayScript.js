// Razorpay Checkout has no npm package — it's a runtime <script> tag
// (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/build-integration/).
// Loaded once and cached; safe to call repeatedly.
let loadingPromise = null;

export function loadRazorpayScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Razorpay Checkout can only load in the browser.'));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error('Razorpay Checkout script loaded but window.Razorpay is unavailable.'));
    };
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error('Failed to load the Razorpay Checkout script. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
}
