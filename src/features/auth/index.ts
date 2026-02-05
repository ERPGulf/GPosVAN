// src/features/auth/index.ts

export { AuthProvider, useAuth } from './auth.context';

// Export hook names
export { useLocalUsers, useSyncUsers, useUsers } from './hooks/useUsers';

// Export User type from repository
export type { User } from '@/src/infrastructure/db/users.repository';
