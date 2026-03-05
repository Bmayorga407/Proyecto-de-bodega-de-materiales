import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, UserCircle, X, ShoppingCart, Trash2, Send, Loader2, Package, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { inventoryService } from '../../services/inventoryService';

export const Layout = () => {
    const navigate = useNavigate();
    const { logout, currentUser, role, isTestUser } = useAuth();
    const { cart, totalItems, updateQuantity, removeFromCart, clearCart } = useCart();

    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isSendingCart, setIsSendingCart] = useState(false);
    const [cartSuccess, setCartSuccess] = useState(false);

    // Form states for multi-request
    const [requesterName, setRequesterName] = useState('');
    const [receptorName, setReceptorName] = useState('');

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
                        <div
                            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity select-none group"
                            onClick={() => navigate('/')}
                            title="Volver a Inicio"
                        >
                            <img
                                src="https://upload.wikimedia.org/wikipedia/commons/c/ce/Coca-Cola_logo.svg"
                                alt="Coca-Cola Logo"
                                className="h-6 sm:h-8 object-contain transition-transform group-active:scale-95"
                                style={{ filter: 'brightness(0) invert(1)' }}
                            />
                            <div className="ml-2 border-l border-white/30 pl-3 flex flex-col justify-center">
                                <span className="font-black text-white text-xs sm:text-sm leading-tight tracking-wider uppercase tracking-widest">Bodega de Materiales</span>
                                <span className="text-[9px] sm:text-[10px] text-white/80 uppercase font-bold tracking-widest leading-none hidden sm:block">Concepción</span>
                            </div>
                            {role && (
                                <div className="ml-2 flex items-center hidden sm:flex">
                                    <span className="px-2 py-1 bg-red-900 text-red-50 text-[10px] font-black tracking-widest uppercase rounded-md shadow-inner border border-red-800/80">
                                        {role}
                                    </span>
                                </div>
                            )}
                            {isTestUser && (
                                <span className="ml-2 px-2 py-0.5 bg-yellow-400 text-black text-[10px] font-black tracking-widest uppercase rounded rounded-tl-none rounded-br-none shadow animate-pulse border-white border">
                                    Testing
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            {currentUser && (
                                <div className="hidden md:flex items-center gap-2 text-sm bg-red-700 px-3 py-1 rounded-full shadow-inner">
                                    <UserCircle size={18} />
                                    <span>{currentUser.email}</span>
                                </div>
                            )}

                            {/* Botón del Carrito */}
                            {role !== 'BODEGA' && (
                                <button
                                    onClick={() => setIsCartOpen(true)}
                                    className="relative p-2 rounded-full hover:bg-red-700 transition-colors flex items-center justify-center bg-transparent group"
                                    title="Ver mi carrito de pedidos"
                                >
                                    <ShoppingCart size={22} className="group-hover:scale-110 transition-transform" />
                                    {totalItems > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 bg-white text-coca-red text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-md animate-in zoom-in ring-2 ring-coca-red">
                                            {totalItems}
                                        </span>
                                    )}
                                </button>
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
            {/* Cart Modal */}
            {isCartOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                        <div className="p-5 border-b flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                <ShoppingCart className="text-coca-red" />
                                Mi Carrito de Solicitudes
                            </h2>
                            <button
                                onClick={() => { setIsCartOpen(false); setCartSuccess(false); }}
                                className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 bg-gray-50/30">
                            {cartSuccess ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-white rounded-2xl border border-green-100 shadow-inner animate-in slide-in-from-bottom-4">
                                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600">
                                        <CheckCircle2 size={32} />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">¡Solicitud Exitosa!</h3>
                                    <p className="text-gray-600 text-sm">
                                        Tus {cart.length} pedidos han sido enviados satisfactoriamente a bodega. Puedes ver el estado en tu historial.
                                    </p>
                                    <button
                                        onClick={() => { setIsCartOpen(false); setCartSuccess(false); }}
                                        className="mt-6 px-6 py-2 bg-coca-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-md active:scale-95"
                                    >
                                        Cerrar Carrito
                                    </button>
                                </div>
                            ) : cart.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center py-10">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-300">
                                        <Package size={32} />
                                    </div>
                                    <p className="text-gray-500 font-medium">Tu carrito está vacío.</p>
                                    <p className="text-gray-400 text-xs mt-1">Navega por el catálogo para añadir productos.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {cart.map((item) => (
                                        <div key={item.product.code} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 group">
                                            <div className="w-16 h-16 bg-gray-50 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100">
                                                {item.product.imageUrl ? (
                                                    <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-contain" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                        <Package size={20} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-black text-gray-900 truncate leading-tight uppercase">{item.product.name}</h4>
                                                <p className="text-xs text-gray-400 font-mono mt-0.5">{item.product.code}</p>

                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className="flex items-center bg-gray-100 rounded-lg p-0.5 border border-gray-200 shadow-inner">
                                                        <button
                                                            onClick={() => updateQuantity(item.product.code, Math.max(1, item.quantity - 1))}
                                                            className="w-6 h-6 flex items-center justify-center hover:bg-white rounded shadow-sm text-gray-600 transition-colors"
                                                        >
                                                            -
                                                        </button>
                                                        <span className="w-8 text-center text-xs font-black text-gray-900">{item.quantity}</span>
                                                        <button
                                                            onClick={() => updateQuantity(item.product.code, Math.min(item.product.stock, item.quantity + 1))}
                                                            className="w-6 h-6 flex items-center justify-center hover:bg-white rounded shadow-sm text-gray-600 transition-colors"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeFromCart(item.product.code)}
                                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {cart.length > 0 && !cartSuccess && (
                            <div className="p-6 border-t bg-gray-50/80 space-y-4">
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Quién Solicita</label>
                                        <div className="relative">
                                            <UserCircle size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            {role === 'LOGISTICA' ? (
                                                <select
                                                    required
                                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:ring-2 focus:ring-coca-red focus:border-transparent outline-none shadow-sm appearance-none"
                                                    value={requesterName}
                                                    onChange={(e) => setRequesterName(e.target.value)}
                                                >
                                                    <option value="" disabled>Seleccione Supervisor...</option>
                                                    {['Randolf Mejia', 'Klinsman Gomez', 'Hector Riffo', 'Alvaro Toledo', 'Nicolas Avarzua', 'Jorge Opazo', 'Victor Parra'].map(sup => (
                                                        <option key={sup} value={sup}>{sup}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type="text"
                                                    placeholder="Ej. Juan Pérez"
                                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:ring-2 focus:ring-coca-red focus:border-transparent outline-none shadow-sm"
                                                    value={requesterName}
                                                    onChange={(e) => setRequesterName(e.target.value)}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Quién Recibe</label>
                                        <div className="relative">
                                            <UserCircle size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="Ej. María Gómez"
                                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:ring-2 focus:ring-coca-red focus:border-transparent outline-none shadow-sm"
                                                value={receptorName}
                                                onChange={(e) => setReceptorName(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={async () => {
                                        if (!requesterName.trim() || !receptorName.trim()) {
                                            alert('Debes completar los nombres de solicitante y receptor.');
                                            return;
                                        }
                                        setIsSendingCart(true);
                                        try {
                                            // Create requests in sequence to avoid sheet race conditions
                                            for (const item of cart) {
                                                await inventoryService.createRequest({
                                                    productCode: item.product.code,
                                                    productName: item.product.name,
                                                    quantity: item.quantity,
                                                    requestedBy: requesterName.trim(),
                                                    receptorName: receptorName.trim(),
                                                    requesterEmail: currentUser?.email || '',
                                                    status: 'PENDIENTE',
                                                    logisticConfirmedAt: ''
                                                });
                                                // Small delay to ensure Google Sheets API processes each row
                                                await new Promise(r => setTimeout(r, 600));
                                            }
                                            setCartSuccess(true);
                                            clearCart();
                                            setRequesterName('');
                                            setReceptorName('');
                                        } catch (err) {
                                            console.error('Error sending batch requests:', err);
                                            alert('Hubo un error al enviar el carrito. Revisa tu conexión.');
                                        } finally {
                                            setIsSendingCart(false);
                                        }
                                    }}
                                    disabled={isSendingCart || cart.length === 0 || !requesterName.trim()}
                                    className={`w-full py-4 rounded-2xl font-black text-white flex items-center justify-center gap-3 transition-all shadow-lg active:scale-95 text-lg
                                        ${isSendingCart || cart.length === 0 || !requesterName.trim() ? 'bg-gray-400 cursor-not-allowed shadow-none' : 'bg-coca-red hover:bg-red-700 shadow-red-500/20'}`}
                                >
                                    {isSendingCart ? <Loader2 className="animate-spin" /> : <Send size={22} />}
                                    {isSendingCart ? 'Enviando Pedidos...' : `Solicitar ${totalItems} Materiales`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
