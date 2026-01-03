import { useState } from 'react';
import { X, Camera, Save, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { user, token, updateUser } = useAuth();
    const [name, setName] = useState(user?.name || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess(false);

        try {
            const res = await fetch(`${API_URL}/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, avatarUrl, password: password || undefined })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            updateUser(data);
            setSuccess(true);
            setPassword(''); // Clear password field

            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-bg-primary border border-border-primary/50 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border-primary/50 bg-bg-secondary/30">
                    <h2 className="text-xl font-bold text-text-primary">Profile Settings</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Avatar Section */}
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border-primary/50 shadow-sm">
                                <img
                                    src={avatarUrl || `https://ui-avatars.com/api/?name=${name}&background=random`}
                                    alt="Profile"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <label className="absolute bottom-0 right-0 p-2 bg-accent-primary text-white rounded-full shadow-lg cursor-pointer hover:bg-accent-primary/90 transition-all">
                                <Camera className="w-4 h-4" />
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        console.log('Uploading file:', file.name, 'Token:', token?.substring(0, 20));

                                        const formData = new FormData();
                                        formData.append('avatar', file);

                                        try {
                                            const res = await fetch(`${API_URL}/auth/avatar`, {
                                                method: 'POST',
                                                headers: { 'Authorization': `Bearer ${token}` },
                                                body: formData
                                            });
                                            console.log('Response status:', res.status);
                                            const data = await res.json();
                                            console.log('Response data:', data);
                                            if (res.ok && data.avatarUrl) {
                                                setAvatarUrl(data.avatarUrl);
                                                setSuccess(true);
                                                setTimeout(() => setSuccess(false), 3000);
                                            } else {
                                                setError(data.error || 'Upload failed');
                                            }
                                        } catch (err: any) {
                                            console.error('Upload failed', err);
                                            setError(err.message || 'Network error');
                                        }
                                    }}
                                />
                            </label>
                        </div>
                    </div>

                    {/* Form Fields */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-text-secondary mb-1 block">Display Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-medium text-text-secondary mb-1 block">Change Password (Optional)</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-bg-secondary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    {/* Messages */}
                    {error && <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm rounded-lg">{error}</div>}
                    {success && <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm rounded-lg">Profile updated successfully!</div>}

                    {/* Footer */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 rounded-xl border border-border-primary text-text-secondary font-medium hover:bg-bg-secondary transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 rounded-xl bg-accent-primary text-white font-bold hover:bg-accent-primary/90 transition-colors flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Changes</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
