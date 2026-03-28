import { RegisterForm } from '@/components/auth/RegisterForm';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 mb-8 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <span className="text-2xl font-bold">SciVid AI</span>
        </Link>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <RegisterForm />
      </div>
    </div>
  );
}
