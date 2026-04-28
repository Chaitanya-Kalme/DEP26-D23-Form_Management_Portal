import { prisma } from "@/lib/prisma";
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {

    async signIn({ user }) {
      try {
        if (!user.email) return false;

        const isVerifier = await prisma.verifier.findUnique({
          where: { email: user.email },
          select: { id: true },
        });

        if (isVerifier) return true;

        await prisma.user.upsert({
          where: { email: user.email },
          update: { userName: user.name ?? "Unknown" },
          create: {
            userName: user.name ?? "Unknown",
            email: user.email,
          },
        });

        return true;

      } catch (error) {
        console.error("[NextAuth signIn]", error);
        return false;
      }
    },

    // ── jwt ───────────────────────────────────────────────────────────
    async jwt({ token, user: oauthUser }) {
      const email = oauthUser?.email ?? token.email;

      if (email && !token.id) {
        // Check verifier table first
        const verifier = await prisma.verifier.findUnique({
          where: { email },
          select: { id: true, role: true },
        });

        if (verifier) {
          token.id = verifier.id;
          token.role = verifier.role;
          token.portal = verifier.role === "Admin" ? "admin" : "verifier";
        } else {
          // Regular user
          const dbUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
          });

          if (!dbUser) {
            const created = await prisma.user.create({
              data: {
                userName: (oauthUser?.name ?? token.name ?? "Unknown") as string,
                email,
              },
              select: { id: true },
            });
            token.id = created.id;
          } else {
            token.id = dbUser.id;
          }

          token.role = "User";
          token.portal = "user";
        }
      }

      return token;
    },

    // ── session ───────────────────────────────────────────────────────
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.portal = token.portal as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.includes("/api/auth")) return baseUrl;

      // fallback handled client-side instead
      return url.startsWith("/") ? baseUrl + url : url;
    }
  },

  pages: {
    signIn: "/auth/signin",
  },

  session: {
    strategy: "jwt",
  },

};