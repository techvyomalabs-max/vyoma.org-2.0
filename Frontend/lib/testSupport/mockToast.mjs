// Test double for '@/components/admin/ui/Toast', substituted in via
// moduleAliasLoader.mjs for the same reason as mockAdminAuth.mjs: the real
// Toast.jsx is a .jsx file plain Node can't parse, and its real
// implementation renders actual DOM toast elements, which these hook tests
// have no need to assert on -- only whether success()/error() was called,
// and with what message.
let calls = [];

export function getToastCalls() {
  return calls;
}

export function resetToastMock() {
  calls = [];
}

const stableToast = {
  success: (message) => calls.push({ type: 'success', message }),
  error: (message) => calls.push({ type: 'error', message }),
};

export function useToast() {
  return stableToast;
}
