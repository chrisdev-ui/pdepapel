"use client";

import { SignUp } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function Register() {
  const [isMounted, setIsMounted] = useState(false);
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <SignUp
      afterSignUpUrl={redirectUrl || "/"}
      afterSignInUrl={redirectUrl || "/"}
      appearance={{
        elements: {
          headerSubtitle: "hidden",
          logoBox: "flex items-center mx-auto w-32",
          headerTitle: "font-serif text-2xl font-bold text-blue-yankees",
          card: "bg-gradient-to-r from-pink-shell via-transparent to-pink-froly",
          formFieldLabel: "text-blue-yankees",
          formButtonPrimary:
            "bg-blue-yankees text-white font-semibold hover:opacity-75",
        },
      }}
    />
  );
}
