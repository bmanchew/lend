import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { Redirect } from "wouter";

export default function AuthPage() {
  const { user, loginWithDidit } = useAuth();

  if (user) {
    return <Redirect to="/customer" />;
  }

  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white lg:flex dark:border-r">
        <div className="absolute inset-0 bg-cover" style={{ 
          backgroundImage: `url(https://images.unsplash.com/photo-1607863680198-23d4b2565df0)`,
          backgroundPosition: 'center',
          opacity: 0.5
        }} />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-2 h-6 w-6"
          >
            <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
          </svg>
          ShiFi Loans
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              Secure, transparent, and efficient loan origination for businesses and customers.
            </p>
          </blockquote>
        </div>
      </div>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <Card className="p-6">
            <div className="flex flex-col space-y-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">
                Welcome to ShiFi
              </h1>
              <p className="text-sm text-muted-foreground">
                Secure authentication powered by Didit
              </p>
            </div>

            <div className="mt-6">
              <Button 
                className="w-full flex items-center justify-center"
                onClick={loginWithDidit}
              >
                <Shield className="mr-2 h-4 w-4" />
                Continue with Didit
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}