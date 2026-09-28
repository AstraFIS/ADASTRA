import { api } from '@/lib/api';
import type { AuthUser, UserRole } from '@/types/auth';

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
}

export const usersApi = {
  list: () => api.get<{ users: AuthUser[] }>('/users').then((r) => r.users),
  create: (input: CreateUserInput) => api.post<{ user: AuthUser }>('/users', input).then((r) => r.user),
  update: (id: string, input: UpdateUserInput) =>
    api.patch<{ user: AuthUser }>(`/users/${encodeURIComponent(id)}`, input).then((r) => r.user),
  remove: (id: string) => api.delete<void>(`/users/${encodeURIComponent(id)}`),
};
