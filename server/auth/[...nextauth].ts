import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";

const diditProvider = {
  id: "didit",
  name: "Didit",
  type: "oauth",
  authorization: {
    url: import.meta.env.VITE_NODE_ENV === "production"
      ? "https://auth.didit.me"
      : "https://auth.staging.didit.me",
    params: { scope: "openid names document_detail" },
  },
  token: {
    url: import.meta.env.VITE_NODE_ENV === "production"
      ? "https://apx.didit.me/auth/v2/token"
      : "https://apx.staging.didit.me/auth/v2/token",
  },
  userinfo: {
    url: import.meta.env.VITE_NODE_ENV === "production"
      ? "https://apx.didit.me/auth/v2/users/retrieve/"
      : "https://apx.staging.didit.me/auth/v2/users/retrieve/",
  },
  issuer: import.meta.env.VITE_NODE_ENV === "production"
    ? "https://auth.didit.me/"
    : "https://auth.staging.didit.me/",
  clientId: import.meta.env.VITE_DIDIT_CLIENT_ID,
  clientSecret: import.meta.env.VITE_DIDIT_CLIENT_SECRET,
  checks: ["state", "pkce"],
  profile(profile) {
    return {
      user_data: profile,
      id: profile.user_id,
      name: profile.names?.full_name,
      email: profile.email?.email,
      image: profile.picture,
      kycStatus: profile.document_detail?.status || "pending",
    };
  },
  style: {
    logo: "/didit.png",
  },
};

export const authOptions: NextAuthOptions = {
  providers: [diditProvider],
  secret: import.meta.env.VITE_REPL_ID,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.id = profile.user_id;
        token.kycStatus = profile.document_detail?.status || "pending";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.kycStatus = token.kycStatus;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);