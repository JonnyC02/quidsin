import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../lib/auth-context.js';
import { ApiError } from '../lib/api.js';

export function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-slate-500">
        Sign in with your Google account to continue.
      </p>
      <div className="flex justify-center">
        <GoogleLogin
          onSuccess={async (credentialResponse) => {
            setError(null);
            if (!credentialResponse.credential) {
              setError('Google sign-in failed. Please try again.');
              return;
            }
            try {
              await loginWithGoogle(credentialResponse.credential);
              navigate('/overview');
            } catch (err) {
              setError(
                err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
              );
            }
          }}
          onError={() => setError('Google sign-in failed. Please try again.')}
        />
      </div>
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
