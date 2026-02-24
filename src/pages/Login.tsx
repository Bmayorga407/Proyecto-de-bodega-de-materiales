import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, AlertCircle } from 'lucide-react';
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
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-coca-red p-6 text-center text-white">
                    <Package className="mx-auto w-12 h-12 mb-2" />
                    <h1 className="text-2xl font-bold">Bodega Coca-Cola</h1>
                    <p className="text-red-100 text-sm opacity-90">Sistema de Inventario</p>
                </div>

                <form onSubmit={handleLogin} className="p-8 space-y-6">
                    {error && (
                        <div className="bg-red-50 text-coca-red p-3 rounded-lg flex items-center gap-2 text-sm border border-red-100">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Correo Institucional
                        </label>
                        <input
                            type="email"
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-coca-red focus:border-coca-red outline-none transition-all"
                            placeholder="usuario@coca-cola.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Contraseña
                        </label>
                        <input
                            type="password"
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-coca-red focus:border-coca-red outline-none transition-all"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full bg-coca-black text-white py-3 px-4 rounded-xl transition-all shadow-md font-semibold
                            ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-gray-800'}`}
                    >
                        {isSubmitting ? 'Verificando...' : 'Ingresar al Sistema'}
                    </button>
                </form>
            </div>
        </div>
    );
}
