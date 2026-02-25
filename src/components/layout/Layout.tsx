import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Package, UserCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Layout = () => {
    const navigate = useNavigate();
    const { logout, currentUser, role, isTestUser } = useAuth();

    const handleLogout = async () => {
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
                                onClick={handleLogout}
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
        </div>
    );
};
