import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <SignUp
      path="/crear-cuenta"
      routing="path"
      signInUrl="/iniciar-sesion"
    />
  );
}
