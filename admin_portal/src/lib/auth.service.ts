import { Session } from 'next-auth';
import { signIn, signOut } from 'next-auth/react';

export interface AuthUser {
    id: string;
    name: string;
    email: string;
    initials: string;
    role: string;
    portal: string;
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

export const AuthService = {
    // No state/portal param needed — this is admin portal only
    async loginWithGoogle(): Promise<void> {
        await signIn('google', {
            callbackUrl: '/dashboard',
        });
    },

    mapSession(session: Session): AuthUser | null {
        if (!session?.user?.email) return null;

        const { id, name, email, image, role, portal } = session.user;

        // Hard block only if portal is explicitly set to something other than admin
        // undefined means still hydrating — allow through
        if (portal !== undefined && portal !== 'admin') {
            console.error(`[AdminPortal] Portal mismatch: expected 'admin', got '${portal}'`);
            return null;
        }

        // Hard block only if role is explicitly set to something other than Admin
        if (role !== undefined && role !== 'Admin') {
            console.error(`[AdminPortal] Role check failed: expected 'Admin', got '${role}'`);
            return null;
        }

        const resolvedName = name ?? email;

        return {
            id: id ?? `google_${email}`,
            name: resolvedName,
            email,
            initials: getInitials(resolvedName),
            role: role ?? 'Admin',
            portal: portal ?? 'admin',
            avatar: image ?? undefined,
        };
    },

    async logout(): Promise<void> {
        await signOut({ callbackUrl: '/login' });
    },
};