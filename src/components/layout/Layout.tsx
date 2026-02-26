import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Package, UserCircle, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Layout = () => {
    const navigate = useNavigate();
    const { logout, currentUser, role, isTestUser } = useAuth();
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleConfirmLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <header className="bg-coca-red text-white shadow-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-2">
                            <Package size={24} />
                            <span className="font-bold text-xl tracking-wide hidden sm:inline">Bodega <span className="text-black ml-1">Coca-Cola Concepción</span></span>
                            <span className="font-bold text-xl tracking-wide sm:hidden">Bodega</span>
                            {isTestUser && (
                                <span className="ml-2 px-2 py-0.5 mt-0.5 bg-yellow-400 text-black text-[10px] font-black tracking-widest uppercase rounded rounded-tl-none rounded-br-none shadow animate-pulse border-white border">
                                    Testing
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            {currentUser && (
                                <div className="hidden sm:flex items-center gap-2 text-sm bg-red-700 px-3 py-1 rounded-full shadow-inner">
                                    <UserCircle size={18} />
                                    <span>{currentUser.email}</span>
                                    <span className="font-bold border-l border-red-500 pl-2 ml-1 opacity-90">{role}</span>
                                </div>
                            )}
                            <button
                                onClick={() => setIsLoggingOut(true)}
                                className="p-2 rounded-full hover:bg-red-700 transition-colors flex items-center justify-center bg-transparent"
                                title="Cerrar sesión"
                            >
                                <LogOut size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <Outlet />
            </main>

            {/* Modal de Confirmación de Cierre de Sesión */}
            {isLoggingOut && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center gap-4 text-red-600 mb-4">
                                <div className="p-3 bg-red-100 rounded-full">
                                    <LogOut size={28} />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900">¿Cerrar sesión?</h3>
                            </div>
                            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
                                Estás a punto de salir de tu cuenta de Bodega. Tendrás que volver a ingresar tus credenciales para continuar operando.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsLoggingOut(false)}
                                    className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors flex justify-center items-center gap-2"
                                >
                                    <X size={18} /> Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmLogout}
                                    className="flex-1 px-4 py-2.5 bg-coca-red hover:bg-red-700 text-white rounded-lg font-semibold shadow-md shadow-red-500/30 transition-all active:scale-[0.98] flex justify-center items-center gap-2"
                                >
                                    Salir Ahora
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
