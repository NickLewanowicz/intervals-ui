/// <reference types="expo/types" />

// EXPO_PUBLIC_* vars are inlined by Metro at build time. Declared here so
// `tsc --noEmit` understands `process.env` without pulling in @types/node.
declare const process: {
  env: {
    EXPO_PUBLIC_PB_URL?: string;
    EXPO_PUBLIC_WORKER_URL?: string;
    EXPO_PUBLIC_MOCK_CHAT?: string;
    [key: string]: string | undefined;
  };
};
