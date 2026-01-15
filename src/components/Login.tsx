import { useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type LoginProps = {
  onToggleSignup: () => void;
};

export default function Login({ onToggleSignup }: LoginProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-black dark:via-slate-950 dark:to-black flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
          <div className="text-center">
            <img
              src="/Real Star Security copy.jpg"
              alt="Real Star Security"
              className="w-32 sm:w-48 h-auto mx-auto mb-4 sm:mb-6"
            />
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Welcome Back</h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-2">Sign in to access the E-Guarding system</p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all pr-10 sm:pr-12"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1"
                >
                  {showPassword ? <EyeOff size={18} className="sm:w-5 sm:h-5" /> : <Eye size={18} className="sm:w-5 sm:h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2.5 sm:py-3 text-sm sm:text-base rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <LogIn size={18} className="sm:w-5 sm:h-5" />
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="text-center pt-4 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
              Don't have an account?{' '}
              <button
                onClick={onToggleSignup}
                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-semibold"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
