import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const endpoint = isLogin ? '/auth/login' : '/auth/register';
        const body = isLogin ? { email, password } : { email, password, name };

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

            login(data.token, data.user);
            navigate('/');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="flex justify-center mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-accent-primary rounded-xl shadow-lg flex items-center justify-center">
                            <span className="text-white font-bold text-xl tracking-tighter">20</span>
                        </div>
                        <span className="text-3xl font-bold text-text-primary tracking-tight">Bids</span>
                    </div>
                </div>

                <div className="bg-bg-secondary/50 backdrop-blur-sm border border-border-primary/50  rounded-2xl p-8 shadow-xl">
                    <h2 className="text-2xl font-bold text-text-primary mb-2">
                        {isLogin ? 'Welcome back' : 'Create an account'}
                    </h2>
                    <p className="text-text-secondary mb-8 text-sm">
                        {isLogin
                            ? 'Enter your credentials to access your dashboard'
                            : 'Join 20Bids to start tracking your portfolio'}
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!isLogin && (
                            <div>
                                <label className="block text-xs font-medium text-text-secondary mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-bg-primary border border-border-primary/50 rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all text-sm"
                                    placeholder="John Doe"
                                    required={!isLogin}
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-bg-primary border border-border-primary/50 rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all text-sm"
                                placeholder="name@example.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-bg-primary border border-border-primary/50 rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all text-sm"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && (
                            <div className="text-rose-500 text-sm font-medium bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-accent-primary hover:bg-accent-primary/90 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-accent-primary/20 flex items-center justify-center gap-2 group"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    {isLogin ? 'Sign In' : 'Sign Up'}
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-sm text-text-secondary hover:text-accent-primary transition-colors font-medium"
                        >
                            {isLogin
                                ? "Don't have an account? Sign up"
                                : "Already have an account? Sign in"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
