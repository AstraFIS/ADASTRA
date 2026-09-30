import { api } from '@/lib/api';
import type { AuthUser, UserAccess, UserRole } from '@/types/auth';

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  access: UserAccess;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
  access?: UserAccess;
}

export const usersApi = {
  list: () => api.get<{ users: AuthUser[] }>('/users').then((r) => r.users),
  create: (input: CreateUserInput) => api.post<{ user: AuthUser }>('/users', input).then((r) => r.user),
  update: (id: string, input: UpdateUserInput) =>
    api.patch<{ user: AuthUser }>(`/users/${encodeURIComponent(id)}`, input).then((r) => r.user),
  remove: (id: string) => api.delete<void>(`/users/${encodeURIComponent(id)}`),
};
