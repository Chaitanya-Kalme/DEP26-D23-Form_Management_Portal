import { Session } from 'next-auth';
import { signIn, signOut } from 'next-auth/react';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: string;   // "HOD" | "Dean" | "Caretaker" etc.
  portal: string;   // always "verifier"
  department?: string;
  avatar?: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Roles that must never reach the verifier dashboard
const BLOCKED_ROLES = ['user', 'admin'];
export const VERIFIER_ROLES = ['HOD', 'Caretaker', 'Dean', 'Faculty', 'Assistant_Registrar', 'Mess_Manager'] as const;
export type VerifierRole = typeof VERIFIER_ROLES[number];

export const AuthService = {

  async loginWithGoogle(): Promise<void> {
    await signIn('google', { callbackUrl: '/dashboard' });
  },

  mapSession(session: Session): AuthUser | null {
    if (!session?.user?.email) return null;

    const { id, name, email, image, role, portal } = session.user as any;

    // Hard block if portal is explicitly set to something other than verifier
    // undefined means still hydrating — allow through
    if (portal !== undefined && portal !== 'verifier') {
      console.error(`[VerifierPortal] Portal mismatch: expected 'verifier', got '${portal}'`);
      return null;
    }

    // Hard block if role is explicitly a blocked role (User / Admin)
    // undefined means still hydrating — allow through
    if (role !== undefined && BLOCKED_ROLES.includes(role.toLowerCase())) {
      console.error(`[VerifierPortal] Role check failed: blocked role '${role}'`);
      return null;
    }

    const resolvedName = name ?? email;

    return {
      id: id ?? `google_${email}`,
      name: resolvedName,
      email,
      initials: getInitials(resolvedName),
      role: role ?? '',
      portal: portal ?? 'verifier',
      avatar: image ?? undefined,
    };
  },

  async logout(): Promise<void> {
    await signOut({ callbackUrl: '/login' });
  },
};