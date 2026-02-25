// src/features/auth/index.ts

// Export hook names
export { useLocalUsers, useSyncUsers, useUsers } from './hooks/useUsers';

// Export User type from repository
export type { User } from '@/src/infrastructure/db/users.repository';
