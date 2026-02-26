import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package, Loader2, History, X, Clock, CheckCircle2, XCircle, User, ArrowUpDown } from 'lucide-react';
import { Product, OrderRequest } from '../types';
import { inventoryService } from '../services/inventoryService';
import { useAuth } from '../context/AuthContext';

const formatDisplayName = (emailStr: string | undefined): string => {
    if (!emailStr) return 'Bodega (Anterior)';
    if (emailStr === 'Bodega Desconocida') return emailStr;
    if (emailStr.includes(' ')) return emailStr; // Ya está formateado

    const namePart = emailStr.split('@')[0];
    const parts = namePart.split(/[._-]/);

    if (parts.length > 1) {
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }

    const withSpaces = namePart.replace(/([A-Z])/g, ' $1').trim();
    if (withSpaces !== namePart && withSpaces.length > 0) {
        return withSpaces.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }

    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
};

export default function Catalog() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortNewestFirst, setSortNewestFirst] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [myRequests, setMyRequests] = useState<OrderRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [requestConfirmCancel, setRequestConfirmCancel] = useState<OrderRequest | null>(null);
    const [modifyQuantity, setModifyQuantity] = useState<number>(1);

    const handleOpenModifyModal = (req: OrderRequest) => {
        setRequestConfirmCancel(req);
        setModifyQuantity(req.quantity);
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                const [productData, requestData] = await Promise.all([
                    inventoryService.fetchProducts(),
                    inventoryService.fetchRequests()
                ]);

                // Agrupar productos con el mismo código y sumar su stock
                const aggregatedMap = new Map<string, Product>();

                productData.forEach((p) => {
                    const codeKey = p.code.trim().toLowerCase();
                    if (!codeKey) return; // Saltamos productos sin código válido

                    if (aggregatedMap.has(codeKey)) {
                        const existing = aggregatedMap.get(codeKey)!;
                        existing.stock += p.stock;

                        // Si el antiguo no tenía foto y este sí, actualizamos
                        if (!existing.imageUrl && p.imageUrl) {
                            existing.imageUrl = p.imageUrl;
                        }
                    } else {
                        aggregatedMap.set(codeKey, { ...p });
                    }
                });

                setProducts(Array.from(aggregatedMap.values()));

                // Filter requests for this user, sorted by newest first
                if (currentUser) {
                    const userReqs = requestData
                        .filter((r: OrderRequest) => r.requesterEmail === currentUser.email || r.requestedBy === currentUser.email)
                        .sort((a: OrderRequest, b: OrderRequest) => new Date(b.dateRequested).getTime() - new Date(a.dateRequested).getTime());
                    setMyRequests(userReqs);
                }

            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [currentUser]);

    const handleCancelRequest = async (req: OrderRequest) => {
        try {
            await inventoryService.updateRequest(req.id, {
                ...req,
                status: 'CANCELADA',
                processedBy: currentUser?.email || 'Cancelado por el usuario'
            });
            // Update local state smoothly
            setMyRequests(prev => prev.map(r =>
                r.id === req.id
                    ? { ...r, status: 'CANCELADA', processedBy: currentUser?.email || 'Cancelado por el usuario' }
                    : r
            ));
            setRequestConfirmCancel(null);
        } catch (e) {
            console.error('Error canceling request:', e);
            alert('Hubo un error al cancelar la solicitud. Intenta de nuevo.');
        }
    };

    const handleModifyRequest = async (req: OrderRequest) => {
        if (modifyQuantity === req.quantity) {
            setRequestConfirmCancel(null);
            return;
        }

        const currentProduct = products.find(p => p.code === req.productCode);
        if (currentProduct && modifyQuantity > currentProduct.stock) {
            alert(`Atención: Hay poco stock disponible. Podrías recibir una entrega parcial o ser rechazado.`);
        }

        try {
            await inventoryService.updateRequest(req.id, {
                ...req,
                quantity: modifyQuantity
            });
            // Update local state smoothly
            setMyRequests(prev => prev.map(r =>
                r.id === req.id
                    ? { ...r, quantity: modifyQuantity }
                    : r
            ));
            setRequestConfirmCancel(null);
        } catch (e) {
            console.error('Error modifying request:', e);
            alert('Hubo un error al modificar la cantidad solicitada. Intenta de nuevo.');
        }
    };

    // Real-time search filtering
    const filteredProducts = useMemo(() => {
        const term = searchTerm.toLowerCase();
        let filtered = products.filter(p =>
            p.name.toLowerCase().includes(term) ||
            p.code.toLowerCase().includes(term)
        );
        if (sortNewestFirst) {
            filtered = [...filtered].reverse();
        }
        return filtered;
    }, [searchTerm, products, sortNewestFirst]);

    const activeProducts = useMemo(() => filteredProducts.filter(p => p.stock > 0), [filteredProducts]);
    const archivedProducts = useMemo(() => filteredProducts.filter(p => p.stock <= 0), [filteredProducts]);

    const getStatusBadge = (status: OrderRequest['status']) => {
        switch (status) {
            case 'PENDIENTE':
                return <span className="bg-yellow-100 text-yellow-800 border border-yellow-200 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5"><Clock size={14} /> PENDIENTE</span>;
            case 'APROBADA':
            case 'ENTREGADA':
                return <span className="bg-green-100 text-green-800 border border-green-200 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5"><CheckCircle2 size={14} /> {status}</span>;
            case 'RECHAZADA':
                return <span className="bg-red-100 text-red-800 border border-red-200 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5"><XCircle size={14} /> RECHAZADA</span>;
            case 'CANCELADA':
                return <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1.5"><XCircle size={14} /> CANCELADA</span>;
        }
    };

    return (
        <div className="space-y-6 relative">
            {showHistory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
                        <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <History className="text-coca-red" /> Mis Solicitudes
                            </h2>
                            <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto bg-gray-50 flex-1">
                            {myRequests.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <History className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                    <p>Aún no has realizado ninguna solicitud de material.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {myRequests.map((req) => (
                                        <div key={req.id} className="bg-white border rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{req.productCode}</span>
                                                    <span className="text-xs text-gray-400">{new Date(req.dateRequested).toLocaleString()}</span>
                                                </div>
                                                <h3 className="font-bold text-gray-900 line-clamp-1">{req.productName}</h3>
                                                <div className="text-sm font-medium text-gray-600 mt-1">
                                                    Cantidad solicitada: <span className="text-black font-bold">{req.quantity}</span> UN
                                                </div>
                                                <div className="text-sm font-medium text-gray-400 mt-0.5">
                                                    Solicitado por: <span className="text-gray-600 font-semibold">{req.requestedBy}</span>
                                                </div>
                                                {req.receptorName && req.receptorName.trim() !== '' && (
                                                    <div className="text-sm font-medium text-gray-400 mt-0.5">
                                                        Recibe: <span className="text-gray-600 font-semibold">{req.receptorName}</span>
                                                    </div>
                                                )}
                                                {req.status !== 'PENDIENTE' && req.processedBy && (
                                                    <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100 inline-flex">
                                                        <User size={14} className="text-gray-400" />
                                                        Procesado por: <span className="font-semibold text-gray-700">{formatDisplayName(req.processedBy)}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-col items-start md:items-end justify-center gap-2">
                                                {getStatusBadge(req.status)}
                                                {req.status === 'PENDIENTE' && (
                                                    <button
                                                        onClick={() => handleOpenModifyModal(req)}
                                                        className="text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg border border-gray-200 transition-colors shadow-sm"
                                                    >
                                                        Modificar o Cancelar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* In-App Custom Modify/Cancel Dialog */}
            {requestConfirmCancel && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in zoom-in-95">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6 relative">
                        <h3 className="text-xl font-bold flex items-center justify-center gap-2 text-gray-900 mb-2">
                            Gestionar Solicitud
                        </h3>
                        <p className="text-sm text-center text-gray-500 mb-4">
                            Modifica la cantidad o cancela tu solicitud de <strong>{requestConfirmCancel.productName}</strong>.
                        </p>

                        <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <label className="block text-sm font-medium text-gray-700 text-center mb-3">Nueva Cantidad a Solicitar</label>
                            <div className="flex items-center justify-center gap-4">
                                <button type="button" onClick={() => setModifyQuantity(Math.max(1, modifyQuantity - 1))} className="w-12 h-12 rounded-xl flex items-center justify-center border bg-white text-coca-red hover:bg-red-50 font-bold hover:scale-105 active:scale-95 transition-all shadow-sm">-</button>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    min="1"
                                    value={modifyQuantity}
                                    onChange={(e) => setModifyQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-20 h-12 text-center font-black text-2xl bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-coca-red focus:border-coca-red shadow-inner hide-arrows"
                                    style={{ WebkitAppearance: 'none', margin: 0, MozAppearance: 'textfield' }}
                                />
                                <button type="button" onClick={() => setModifyQuantity(modifyQuantity + 1)} className="w-12 h-12 rounded-xl flex items-center justify-center bg-coca-red text-white hover:bg-red-700 font-bold hover:scale-105 active:scale-95 transition-all shadow-md">+</button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => handleModifyRequest(requestConfirmCancel)}
                                disabled={modifyQuantity === requestConfirmCancel.quantity}
                                className={`w-full py-3 rounded-xl font-bold transition-all ${modifyQuantity === requestConfirmCancel.quantity ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-coca-black text-white hover:bg-gray-800 shadow-md hover:shadow-lg active:scale-95'}`}
                            >
                                {modifyQuantity === requestConfirmCancel.quantity ? 'Modifica la cantidad para guardar' : 'Guardar Nueva Cantidad'}
                            </button>

                            <div className="grid grid-cols-2 gap-3 mt-1">
                                <button
                                    onClick={() => setRequestConfirmCancel(null)}
                                    className="w-full py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 font-medium transition-colors"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={() => handleCancelRequest(requestConfirmCancel)}
                                    className="w-full py-2.5 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-xl font-medium transition-colors"
                                >
                                    Cancelar Petición
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-coca-red to-red-600">
                    Catálogo Digital
                </h1>

                <div className="flex w-full md:w-auto gap-3">
                    <button
                        onClick={() => setShowHistory(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm text-sm font-semibold text-gray-700 whitespace-nowrap"
                    >
                        <History size={18} className="text-coca-red" />
                        <span className="hidden sm:inline">Mis Solicitudes</span>
                        {myRequests.filter(r => r.status === 'PENDIENTE').length > 0 && (
                            <span className="bg-red-100 text-coca-red py-0.5 px-2 rounded-full text-xs font-bold">
                                {myRequests.filter(r => r.status === 'PENDIENTE').length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setSortNewestFirst(!sortNewestFirst)}
                        className={`flex items-center justify-center gap-2 p-2 px-3 rounded-xl border transition-colors shadow-sm ${sortNewestFirst ? 'bg-red-50 text-coca-red border-red-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                        title={sortNewestFirst ? "Orden: Más recientes primero" : "Orden: Más antiguos primero"}
                    >
                        <ArrowUpDown size={18} />
                        <span className="text-sm font-semibold hidden sm:inline">
                            {sortNewestFirst ? 'Más Recientes' : 'Más Antiguos'}
                        </span>
                    </button>
                    <div className="relative w-full md:w-80">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coca-red focus:border-coca-red sm:text-sm transition-shadow shadow-sm"
                            placeholder="Buscar producto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {isLoading ? (
                    // Loading State
                    <div className="col-span-full py-12 text-center">
                        <Loader2 className="animate-spin mx-auto h-12 w-12 text-coca-red mb-4" />
                        <h3 className="text-lg font-medium text-gray-900">Cargando catálogo...</h3>
                        <p className="text-gray-500 mt-1">Obteniendo datos desde Google Sheets</p>
                    </div>
                ) : activeProducts.length > 0 ? (
                    activeProducts.map((product) => (
                        <div key={product.id || product.code} onClick={() => navigate(`/product/${product.code}`)} className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-xl transition-shadow border border-gray-100 group cursor-pointer hover:border-coca-red/30">
                            <div className="h-48 bg-gray-50 relative border-b border-gray-100 flex justify-center items-center">
                                {product.imageUrl ? (
                                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                    <Package size={48} className="text-gray-300 group-hover:scale-110 transition-transform duration-300" />
                                )}
                                {/* Stock Badge */}
                                <div className={`absolute top-2 right-2 px-3 py-1 rounded-full text-xs font-bold shadow-sm ${product.stock > 0 ? 'bg-white text-coca-red' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                                    Stock: {product.stock}
                                </div>
                            </div>

                            <div className="p-5">
                                <div className="text-xs text-gray-500 font-mono mb-1">{product.code}</div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight">{product.name}</h3>
                                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{product.description}</p>

                                <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                                    <span className="text-xs text-gray-500">{product.details}</span>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full py-12 text-center text-gray-500">
                        No se encontraron productos en stock.
                    </div>
                )}
            </div>

            {archivedProducts.length > 0 && (
                <div className="mt-8 space-y-6">
                    <button
                        onClick={() => setShowArchived(!showArchived)}
                        className="w-full py-4 flex items-center justify-center gap-3 text-sm font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-2xl border border-gray-200 border-dashed transition-colors"
                    >
                        {showArchived ? 'Ocultar' : 'Ver'} {archivedProducts.length} productos sin stock (Archivados)
                    </button>

                    {showArchived && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 opacity-75 grayscale-[0.3]">
                            {archivedProducts.map((product) => (
                                <div key={product.id || product.code} onClick={() => navigate(`/product/${product.code}`)} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200 group cursor-pointer hover:border-gray-400 transition-colors">
                                    <div className="h-48 bg-gray-100 relative border-b border-gray-200 flex justify-center items-center">
                                        {product.imageUrl ? (
                                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover opacity-80" />
                                        ) : (
                                            <Package size={48} className="text-gray-300" />
                                        )}
                                        <div className="absolute top-2 right-2 px-3 py-1 rounded-full text-xs font-bold shadow-sm bg-gray-200 text-gray-600 border border-gray-300">
                                            Agotado (Stock: {product.stock})
                                        </div>
                                    </div>

                                    <div className="p-5">
                                        <div className="text-xs text-gray-400 font-mono mb-1">{product.code}</div>
                                        <h3 className="text-lg font-bold text-gray-600 mb-2 leading-tight">{product.name}</h3>
                                        <p className="text-sm text-gray-500 mb-4 line-clamp-2">{product.description}</p>

                                        <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                                            <span className="text-xs text-gray-400">{product.details}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
