import { requireOptionalNativeModule } from 'expo-modules-core';
export default requireOptionalNativeModule<{ setProxy(cfg: Record<string, unknown>): boolean }>('RecidivistProxy');
