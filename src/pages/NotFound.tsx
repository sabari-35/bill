import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md rounded-3xl bg-card p-10 text-center shadow-neu-outer flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-danger shadow-neu-inner">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-3xl font-bold font-display text-text-main">
          Page Not Found
        </h2>
        <p className="text-sm text-text-secondary">
          The page or bill session you are looking for does not exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-2 flex items-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-bold text-white shadow-neu-sm transition-all hover:bg-primary-hover hover:shadow-neu-inner-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Home</span>
        </Link>
      </div>
    </div>
  );
}
