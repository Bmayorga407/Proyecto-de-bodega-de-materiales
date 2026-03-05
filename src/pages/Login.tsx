import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const { login, currentUser, role } = useAuth();

    // Redirect if already logged in
    useEffect(() => {
        if (currentUser) {
            if (role === 'BODEGA') {
                navigate('/admin');
            } else {
                navigate('/catalogo');
            }
        }
    }, [currentUser, role, navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');
        try {
            await login(email, password);
            // Navigation happens automatically via useEffect
        } catch (err: any) {
            console.error(err);
            setError('Credenciales incorrectas o usuario no encontrado.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-zinc-900">
            {/* Background Image & Overlay */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
                style={{
                    backgroundImage: `url('/assets/coke-bg.jpg')`,
                    filter: 'brightness(0.6) contrast(1.2)'
                }}
            />
            {/* Red accent gradient */}
            <div className="absolute inset-0 z-0 bg-gradient-to-tr from-coca-red/40 via-transparent to-black/60 mix-blend-multiply" />

            <div className="relative z-10 w-full max-w-md p-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="backdrop-blur-xl bg-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-[2rem] overflow-hidden border border-white/20">

                    {/* Header Section */}
                    <div className="relative pt-10 pb-8 px-8 text-center text-white overflow-hidden bg-gradient-to-b from-coca-red to-[#cc0000]">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay"></div>
                        <div className="relative z-10 flex flex-col items-center justify-center pb-2">
                            <h2 className="text-white/90 text-sm font-bold tracking-[0.3em] uppercase mb-4 drop-shadow-md">Bodega</h2>
                            <img
                                src="https://upload.wikimedia.org/wikipedia/commons/c/ce/Coca-Cola_logo.svg"
                                alt="Coca-Cola"
                                className="h-16 w-auto mx-auto mb-6 object-contain drop-shadow-lg hover:scale-105 transition-transform duration-500"
                                style={{ filter: 'brightness(0) invert(1)' }}
                            />
                            <p className="text-white/90 text-xs font-black tracking-[0.2em] uppercase bg-black/20 px-5 py-2 rounded-full backdrop-blur-md border border-white/20 shadow-inner">Sistema de Inventario</p>
                        </div>
                    </div>

                    {/* Form Section */}
                    <form onSubmit={handleLogin} className="p-8 space-y-6">
                        {error && (
                            <div className="bg-red-50 text-coca-red p-4 rounded-xl flex items-center gap-3 text-sm border border-red-100 shadow-sm animate-in zoom-in-95 duration-200">
                                <div className="bg-red-100 p-1 rounded-full"><AlertCircle size={16} /></div>
                                <span className="font-medium">{error}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                                    Correo Institucional
                                </label>
                                <input
                                    type="email"
                                    required
                                    className="w-full px-5 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-red-500/10 focus:border-coca-red outline-none transition-all duration-300 font-medium text-gray-800 placeholder:text-gray-400"
                                    placeholder="usuario@coca-cola.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                                    Contraseña
                                </label>
                                <input
                                    type="password"
                                    required
                                    className="w-full px-5 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-red-500/10 focus:border-coca-red outline-none transition-all duration-300 font-medium text-gray-800 placeholder:text-gray-400"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`relative w-full overflow-hidden group bg-coca-black text-white py-4 px-6 rounded-xl font-bold tracking-wide transition-all duration-300 
                                ${isSubmitting ? 'opacity-70 cursor-not-allowed scale-[0.98]' : 'hover:bg-gray-900 hover:shadow-[0_8px_20px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 active:scale-[0.98]'}`}
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {isSubmitting ? 'VERIFICANDO...' : 'INGRESAR AL SISTEMA'}
                            </span>
                            {!isSubmitting && (
                                <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[150%] skew-x-[-20deg] group-hover:animate-[shine_1.5s_ease-out_infinite]" />
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
