import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, Save, Trash2, Edit2, Loader2, ArrowLeft, User, Send, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Product } from '../types';
import { inventoryService } from '../services/inventoryService';
import { useAuth } from '../context/AuthContext';

const getLocalDateString = () => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return new Date(Date.now() - tzoffset).toISOString().split('T')[0];
};

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

const extractLocationAndDetail = (detailsString: string | undefined) => {
    if (!detailsString) return { location: <span className="text-gray-300 italic">Sin ubicación</span>, detail: '-' };

    // Check for [Location] Detail format
    const match = detailsString.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
        return { location: match[1], detail: match[2] };
    }

    // Legacy fallback: Check if it looks like a manual exit without brackets
    if (detailsString.toLowerCase().includes('salida manual a:')) {
        return { location: <span className="text-gray-300 italic">Sin ubicación</span>, detail: detailsString };
    }

    // Otherwise, assume it's just a raw location (like during Ingresos)
    return { location: detailsString, detail: '-' };
};

export default function ProductDetails() {
    const { code } = useParams();
    const navigate = useNavigate();
    const { role, currentUser } = useAuth();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [pendingRequestsStock, setPendingRequestsStock] = useState(0);

    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [requestName, setRequestName] = useState('');
    const [receptorName, setReceptorName] = useState('');
    const [requestQty, setRequestQty] = useState(1);

    // New Sort/Filter State
    const [sortDesc, setSortDesc] = useState(true);
    const [filterReceptor, setFilterReceptor] = useState('');

    const [isRequesting, setIsRequesting] = useState(false);
    const [requestSuccess, setRequestSuccess] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [productToDelete, setProductToDelete] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '', code: '', description: '', stock: 0, details: '', imageUrl: '', entryDate: getLocalDateString()
    });
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    const showError = (msg: string) => {
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(''), 4500);
    };

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 4500);
    };

    const fetchPendingRequestsBackground = async () => {
        if (!code) return;
        try {
            const requestsData = await inventoryService.fetchRequests();
            const pendingQty = requestsData
                .filter(r => r.status === 'PENDIENTE' && r.productCode.toLowerCase() === code.toLowerCase())
                .reduce((sum, r) => sum + r.quantity, 0);
            setPendingRequestsStock(pendingQty);
        } catch (e) {
            console.error('Error fetching background requests:', e);
        }
    };

    const loadProducts = async () => {
        try {
            setIsLoading(true);
            const [data, requestsData] = await Promise.all([
                inventoryService.fetchProducts(),
                inventoryService.fetchRequests()
            ]);

            // Filtrar solo los movimientos que coincidan con el código de la URL
            const filteredProducts = data.filter(p => p.code.toLowerCase() === code?.toLowerCase());
            setProducts(filteredProducts);

            // Calcular solicitudes pendientes de otros/este usuario para advertencia de stock
            const pendingQty = requestsData
                .filter(r => r.status === 'PENDIENTE' && r.productCode.toLowerCase() === code?.toLowerCase())
                .reduce((sum, r) => sum + r.quantity, 0);
            setPendingRequestsStock(pendingQty);

        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadProducts();
    }, [code]);

    // Polling background effect for the active modal
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isRequestModalOpen) {
            // Fetch immediately upon opening, then every 3.5 seconds
            fetchPendingRequestsBackground();
            interval = setInterval(fetchPendingRequestsBackground, 3500);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isRequestModalOpen, code]);

    const handleEditClick = (product: Product) => {
        setEditingProduct(product);
        setFormData({ ...product });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProduct?.id) return;

        setIsSaving(true);
        try {
            await inventoryService.updateProduct(editingProduct.id, {
                ...formData,
                editedBy: currentUser?.email || undefined
            });
            setEditingProduct(null);
            setFormData({ name: '', code: '', description: '', stock: 0, details: '', channel: '', imageUrl: '', entryDate: '' });
            showSuccess('Registro actualizado correctamente.');
            loadProducts();
        } catch (err) {
            console.error(err);
            showError("Hubo un error al actualizar el registro.");
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!productToDelete) return;
        try {
            setIsLoading(true);
            await inventoryService.deleteProduct(productToDelete);
            setProductToDelete(null);
            showSuccess('Registro eliminado correctamente.');
            await loadProducts();
        } catch (e) {
            console.error(e);
            showError("Error al eliminar el registro.");
            setIsLoading(false);
        }
    };

    const processedMovements = useMemo(() => {
        let result = [...products];
        if (filterReceptor) {
            result = result.filter(p => p.details && p.details.toLowerCase().includes(filterReceptor.toLowerCase()));
        }
        if (sortDesc) {
            result.reverse();
        }
        return result;
    }, [products, sortDesc, filterReceptor]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="animate-spin text-coca-red w-12 h-12 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">Cargando detalles...</h3>
            </div>
        );
    }

    if (products.length === 0) {
        return (
            <div className="max-w-4xl mx-auto space-y-6 text-center py-20">
                <p className="text-gray-500 mb-4">No se encontraron registros para el código: {code}</p>
                <button onClick={() => navigate(-1)} className="text-coca-red hover:underline inline-flex items-center gap-2">
                    <ArrowLeft size={16} /> Volver
                </button>
            </div>
        );
    }

    // Usar el primer producto para los datos de cabecera (suponiendo que nombre e imagen base son iguales)
    const baseProduct = products[0];
    const totalStock = products.reduce((sum, p) => sum + p.stock, 0);

    const stockByLocation: Record<string, number> = {};
    let unallocatedNegative = 0;

    // Fase 1: Asignar stock positivo a sus ubicaciones y stock negativo etiquetado
    products.forEach(p => {
        if (p.stock > 0) {
            const loc = (p.details || 'Sin ubicación').trim();
            stockByLocation[loc] = (stockByLocation[loc] || 0) + p.stock;
        } else {
            // Es una salida. Buscar etiqueta [Ubicación] insertada por el nuevo sistema
            const match = p.details?.match(/^\[(.*?)\]/);
            if (match) {
                const loc = match[1].trim();
                stockByLocation[loc] = (stockByLocation[loc] || 0) + p.stock;
            } else {
                // Salidas del sistema antiguo sin etiqueta de ubicación
                unallocatedNegative += p.stock; // esto es un número negativo
            }
        }
    });

    // Fase 2: Distribuir las salidas antiguas (negativas) entre las ubicaciones con saldo positivo
    if (unallocatedNegative < 0) {
        for (const loc of Object.keys(stockByLocation)) {
            if (unallocatedNegative >= 0) break;

            if (stockByLocation[loc] > 0) {
                // Cuánto podemos descontar de esta ubicación
                const available = stockByLocation[loc];
                const deduction = Math.min(available, Math.abs(unallocatedNegative));

                stockByLocation[loc] -= deduction;
                unallocatedNegative += deduction; // Se acerca a 0
            }
        }
    }

    const handleCreateRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (requestQty < 1 || requestQty > totalStock) {
            showError('Cantidad inválida o superior al stock disponible.');
            return;
        }

        const nameParts = requestName.trim().split(/\s+/);
        if (nameParts.length < 2) {
            showError('RECHAZADO: Debes ingresar tu nombre Y tu apellido para solicitar.');
            return;
        }

        const receptorParts = receptorName.trim().split(/\s+/);
        if (receptorParts.length < 2) {
            showError('RECHAZADO: Debes ingresar el nombre Y apellido de quién recibe.');
            return;
        }

        setIsRequesting(true);
        try {
            await inventoryService.createRequest({
                productCode: baseProduct.code,
                productName: baseProduct.name,
                quantity: requestQty,
                requestedBy: requestName.trim(),
                receptorName: receptorName.trim(),
                requesterEmail: currentUser?.email || ''
            });
            setRequestSuccess('Solicitud enviada a bodega con éxito.');
            setTimeout(() => {
                setIsRequestModalOpen(false);
                setRequestSuccess('');
                setRequestQty(1);
                setRequestName('');
                setReceptorName('');
            }, 2500);
        } catch (err) {
            console.error(err);
            showError('Error al enviar la solicitud.');
        } finally {
            setIsRequesting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-12">
            {/* Success Notification */}
            {successMsg && (
                <div className="fixed top-4 right-4 bg-green-50 text-green-800 border-l-4 border-green-500 p-4 rounded shadow-lg z-[200] flex items-center gap-3 animate-in slide-in-from-top-2">
                    <CheckCircle2 size={20} className="text-green-500" />
                    <p className="font-medium text-sm">{successMsg}</p>
                </div>
            )}

            {/* Error Notification */}
            {errorMsg && (
                <div className="fixed top-4 right-4 bg-red-50 text-red-800 border-l-4 border-red-500 p-4 rounded shadow-lg z-[200] flex items-center gap-3 animate-in slide-in-from-top-2 max-w-sm">
                    <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
                    <p className="font-medium text-sm">{errorMsg}</p>
                    <button onClick={() => setErrorMsg('')} className="ml-auto text-red-400 hover:text-red-600"><X size={16} /></button>
                </div>
            )}

            {/* Cabecera / Foto Fotorealista que se desvanece */}
            <div className="relative w-auto h-56 md:h-80 -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 border-b border-gray-100/50 mb-8 cursor-pointer group overflow-hidden bg-white" onClick={() => setIsImageModalOpen(true)}>

                {/* Botón Volver flotante */}
                <button onClick={(e) => { e.stopPropagation(); navigate(-1); }} className="absolute top-6 left-6 z-20 p-2.5 bg-white/80 hover:bg-white backdrop-blur-md rounded-full shadow-md hover:shadow-lg transition-all border border-gray-100/50 hover:scale-105">
                    <ArrowLeft size={20} className="text-gray-800" />
                </button>

                {baseProduct.imageUrl ? (
                    <>
                        {/* Fondo borroso para rellenar espacios y mimetizar color */}
                        <img src={baseProduct.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-40 scale-125 saturate-200" />

                        {/* Imagen Hero proporcional */}
                        <div className="relative z-10 w-full h-full flex items-center justify-center p-8 pb-16">
                            <img src={baseProduct.imageUrl} alt={baseProduct.name} className="max-w-full max-h-full object-contain filter drop-shadow-2xl group-hover:scale-105 transition-transform duration-700" />
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full bg-gray-50 flex items-center justify-center relative z-10">
                        <Camera size={48} className="text-gray-300" />
                    </div>
                )}
                {/* Gradiente de desvanecimiento hacia el fondo grys-50 */}
                <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-gray-50 via-gray-50/80 to-transparent pointer-events-none z-10"></div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none flex items-center justify-center z-20">
                    <div className="opacity-0 group-hover:opacity-100 bg-black/60 text-white px-5 py-2.5 rounded-full text-sm font-medium backdrop-blur-md transition-all transform translate-y-4 group-hover:translate-y-0 shadow-xl">
                        Ver pantalla completa
                    </div>
                </div>
            </div>

            {/* Modal de Imagen Pantalla Completa */}
            {isImageModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsImageModalOpen(false)}>
                    <button className="absolute top-6 right-6 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors" onClick={() => setIsImageModalOpen(false)}>
                        <X size={32} />
                    </button>
                    {baseProduct.imageUrl && (
                        <img src={baseProduct.imageUrl} alt={baseProduct.name} className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
                    )}
                </div>
            )}

            {/* Datos del Producto */}
            <div className="relative z-10 bg-white rounded-3xl shadow-sm p-6 sm:p-8 border border-gray-100 -mt-20">
                <div className="flex flex-col md:flex-row gap-8 items-start justify-between">
                    <div className="flex-1 flex flex-col justify-between">
                        <div className="mb-8">
                            <span className="inline-block px-3 py-1 bg-red-50 text-coca-red rounded-full text-[10px] font-bold tracking-widest uppercase mb-3 border border-red-100 shadow-sm">
                                Código del Producto
                            </span>
                            <h1 className="text-5xl md:text-6xl font-black text-coca-red tracking-tight break-all uppercase leading-none">
                                {baseProduct.code}
                            </h1>
                            {role === 'BODEGA' && baseProduct.channel && (
                                <div className="mt-4 flex items-center gap-2">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest border border-gray-200 px-3 py-1 rounded-full bg-white shadow-sm">
                                        Canal: <span className="text-coca-red ml-1">{baseProduct.channel}</span>
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-gray-50/50 p-5 rounded-2xl border border-gray-100/50 w-full">
                            <div>
                                <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Descripción</span>
                                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">{baseProduct.name}</h2>
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Más Detalles</span>
                                <p className="text-gray-600 text-sm leading-relaxed uppercase font-medium">{baseProduct.description}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 min-w-[280px] w-full md:w-auto mt-6 md:mt-0">
                        <div className="bg-red-50 border border-red-100/50 p-6 rounded-2xl text-center shadow-inner">
                            <p className="text-sm text-red-600 font-bold uppercase tracking-widest mb-1">Stock Disponible</p>
                            <p className="text-5xl font-black text-coca-red drop-shadow-sm">{totalStock}</p>

                            {/* Stock por ubicación */}
                            {Object.entries(stockByLocation).filter(([_, qty]) => qty > 0).length > 0 && (
                                <div className="mt-5 pt-4 border-t border-red-200/60 flex flex-col gap-2 text-sm">
                                    <p className="text-xs text-red-800/60 font-medium uppercase tracking-wider mb-1">Por Ubicación</p>
                                    {Object.entries(stockByLocation)
                                        .filter(([_, qty]) => qty > 0)
                                        .map(([loc, qty]) => (
                                            <div key={loc} className="flex justify-between items-center text-red-900 bg-white/40 px-3 py-1.5 rounded-lg border border-red-100/50">
                                                <span className="truncate pr-3 font-medium">{loc}</span>
                                                <span className="font-bold bg-white px-2.5 py-1 rounded-md text-coca-red shadow-sm border border-red-100/30 whitespace-nowrap">{qty} UN</span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                        {role === 'VENTAS' && (
                            <button
                                onClick={() => setIsRequestModalOpen(true)}
                                className="w-full sm:w-auto bg-coca-black text-white px-6 py-4 rounded-xl hover:bg-gray-800 transition-all hover:scale-[1.02] shadow-md hover:shadow-xl font-bold active:scale-95 text-lg flex items-center justify-center gap-2"
                            >
                                <Send size={20} />
                                Solicitar Material
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal de Edición En Línea */}
            {editingProduct && (
                <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 border-l-4 border-l-coca-red">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-900">Modificando Registro Específico</h2>
                        <button onClick={() => setEditingProduct(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cerrar</button>
                    </div>

                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                            <div className="md:col-span-1">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Stock</label>
                                <input required type="number" min="0" className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-coca-red outline-none text-sm"
                                    value={formData.stock || ''} onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div className="md:col-span-1">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha de Ingreso</label>
                                <input required type="date" className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-coca-red outline-none text-sm"
                                    value={formData.entryDate || ''} onChange={e => setFormData({ ...formData, entryDate: e.target.value })} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Detalles de Ubicación</label>
                                <input type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-coca-red outline-none text-sm"
                                    value={formData.details || ''} onChange={e => setFormData({ ...formData, details: e.target.value })} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Canal</label>
                                <select className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-coca-red outline-none text-sm appearance-none bg-white"
                                    value={formData.channel || ''} onChange={e => setFormData({ ...formData, channel: e.target.value })}>
                                    <option value="" disabled>Sin canal</option>
                                    <option value="Venta hogar">Venta hogar</option>
                                    <option value="Publicidad">Publicidad</option>
                                    <option value="Tradicional">Tradicional</option>
                                    <option value="Moderno">Moderno</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex border-t pt-4 justify-end gap-2">
                            <button disabled={isSaving} type="button" onClick={() => setEditingProduct(null)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg font-medium">
                                Cancelar
                            </button>
                            <button disabled={isSaving} type="submit" className={`px-4 py-2 text-sm text-white rounded-lg font-medium flex items-center gap-2
                                ${isSaving ? 'bg-gray-400' : 'bg-coca-black hover:bg-gray-800'}`}>
                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Actualizar Fila
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Tabla de Movimientos de Bodega */}
            {role === 'BODEGA' && (
                <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h2 className="font-semibold text-gray-800">Historial de Ingresos / Asignaciones</h2>
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                            <input
                                type="text"
                                placeholder="Filtrar por receptor..."
                                value={filterReceptor}
                                onChange={(e) => setFilterReceptor(e.target.value)}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-coca-red outline-none w-full sm:w-64 shadow-sm"
                            />
                            <button
                                onClick={() => setSortDesc(!sortDesc)}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-100 focus:ring-1 focus:ring-coca-red flex items-center justify-center gap-2 whitespace-nowrap bg-white text-gray-700 shadow-sm transition-colors cursor-pointer"
                            >
                                {sortDesc ? '↑ Más recientes primero' : '↓ Más antiguos primero'}
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-white">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalle</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {processedMovements.map((p: Product) => (
                                    <tr key={p.id} className={editingProduct?.id === p.id ? 'bg-red-50/50' : 'hover:bg-gray-50 transition-colors'}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-l-2 border-transparent">
                                            {p.entryDate ? new Date(p.entryDate).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div className={`font-bold flex items-center gap-1 px-2 py-1 rounded w-fit ${p.stock > 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                                                {p.stock > 0 ? `+${p.stock}` : p.stock}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">
                                            {extractLocationAndDetail(p.details).location}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {extractLocationAndDetail(p.details).detail}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 rounded-full w-fit">
                                                    <User size={14} className="text-gray-400" />
                                                    <span className="text-xs text-gray-600 font-medium whitespace-break-spaces break-all">
                                                        {formatDisplayName(p.registeredBy)}
                                                    </span>
                                                </div>
                                                {p.editedBy && (
                                                    <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 border border-blue-100 rounded-full w-fit">
                                                        <Edit2 size={12} className="text-blue-400" />
                                                        <span className="text-[10px] uppercase tracking-wider text-blue-600 font-bold whitespace-break-spaces break-all">
                                                            {formatDisplayName(p.editedBy)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-1">
                                            <button onClick={() => handleEditClick(p)} className="text-blue-500 hover:text-blue-700 transition-colors p-1.5 rounded-full hover:bg-blue-50">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => setProductToDelete(p.id)} className="text-red-400 hover:text-red-700 transition-colors p-1.5 rounded-full hover:bg-red-50">
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación de Eliminación */}
            {productToDelete && (
                <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 flex items-start gap-4 border-b bg-red-50 border-red-100">
                            <div className="p-2 rounded-full bg-red-100 text-red-600">
                                <AlertTriangle size={24} />
                            </div>
                            <div className="flex-1 mt-1">
                                <h3 className="text-xl font-bold text-gray-900">
                                    Eliminar Registro
                                </h3>
                            </div>
                            <button onClick={() => setProductToDelete(null)} className="text-gray-400 hover:text-gray-600 outline-none">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-gray-600">
                                ¿Estás seguro de que deseas eliminar este registro específico del historial de bodega? Esta acción alterará permanentemente la cantidad de stock disponible.
                            </p>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setProductToDelete(null)}
                                    className="flex-1 px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => confirmDelete()}
                                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                                >
                                    Eliminar Fila
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Solicitud de Venta */}
            {isRequestModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden p-6 relative animate-in fade-in zoom-in-95">
                        <button onClick={() => setIsRequestModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 bg-gray-100 p-2 rounded-full transition-colors">
                            <X size={20} />
                        </button>

                        <div className="mb-6">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-coca-red">
                                <Send size={24} />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Solicitar Material</h2>
                            <p className="text-sm text-gray-500 mt-1">Ingresa la cantidad que necesitas de {baseProduct.name}.</p>

                            {pendingRequestsStock > 0 && (totalStock - pendingRequestsStock < requestQty) && (
                                <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3 flex gap-3 text-orange-800 text-sm animate-in fade-in">
                                    <AlertTriangle size={18} className="shrink-0 mt-0.5 text-orange-500" />
                                    <div>
                                        Ya hay <strong>{pendingRequestsStock} UN</strong> en lista de espera (pendientes de aprobación). Solo quedan <strong>{Math.max(0, totalStock - pendingRequestsStock)} UN vacantes</strong>. Puedes pedirlo igual, pero bodega podría entregarte solo una fracción o cancelar si se agotan.
                                    </div>
                                </div>
                            )}
                        </div>

                        {requestSuccess ? (
                            <div className="bg-green-50 text-green-700 p-4 rounded-xl font-medium flex items-center justify-center gap-2">
                                <CheckCircle2 size={20} />
                                {requestSuccess}
                            </div>
                        ) : (
                            <form onSubmit={handleCreateRequest} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre y Apellido de quien solicita</label>
                                    <div className="flex bg-gray-50 rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-coca-red focus-within:border-transparent transition-all">
                                        <div className="pl-3 py-3 flex items-center justify-center text-gray-400">
                                            <User size={18} />
                                        </div>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Ej. Juan Pérez"
                                            className="flex-1 bg-transparent border-none focus:ring-0 px-3 py-3 text-sm text-gray-900 outline-none w-full"
                                            value={requestName}
                                            onChange={(e) => setRequestName(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre y Apellido de quien recibe</label>
                                    <div className="flex bg-gray-50 rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-coca-red focus-within:border-transparent transition-all">
                                        <div className="pl-3 py-3 flex items-center justify-center text-gray-400">
                                            <User size={18} />
                                        </div>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Ej. María Gómez"
                                            className="flex-1 bg-transparent border-none focus:ring-0 px-3 py-3 text-sm text-gray-900 outline-none w-full"
                                            value={receptorName}
                                            onChange={(e) => setReceptorName(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Cantidad a Retirar</label>
                                    <div className="flex bg-gray-50 rounded-xl border border-gray-200 p-1">
                                        <button type="button" onClick={() => setRequestQty(Math.max(1, requestQty - 1))} className="w-12 h-12 flex items-center justify-center bg-white rounded-lg shadow-sm font-bold text-lg hover:bg-gray-100 text-coca-red">-</button>
                                        <input type="number" inputMode="numeric" pattern="[0-9]*" min="1" max={totalStock} className="flex-1 text-center bg-transparent border-none focus:ring-0 text-xl font-bold text-gray-900 outline-none" value={requestQty} onChange={(e) => setRequestQty(parseInt(e.target.value) || 1)} />
                                        <button type="button" onClick={() => setRequestQty(Math.min(totalStock, requestQty + 1))} className="w-12 h-12 flex items-center justify-center bg-coca-red text-white rounded-lg shadow-sm font-bold text-lg hover:bg-red-700">+</button>
                                    </div>
                                    <div className="flex justify-between mt-2 text-xs font-semibold px-1">
                                        <span className="text-gray-500">Mínimo: 1</span>
                                        <span className="text-gray-500">Máximo: {totalStock} disp.</span>
                                    </div>
                                </div>
                                <button type="submit" disabled={isRequesting || requestQty > totalStock || !requestName.trim()} className={`w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 transition-all shadow-md
                                    ${isRequesting || requestQty > totalStock || !requestName.trim() ? 'bg-gray-400 cursor-not-allowed text-gray-100' : 'bg-coca-red hover:bg-red-700 hover:shadow-lg'}`}>
                                    {isRequesting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                    {isRequesting ? 'Enviando a Bodega...' : 'Confirmar Solicitud'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
            <div className="md:hidden mt-8 text-center pt-8 border-t">
                <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-coca-black inline-flex items-center gap-2 font-medium">
                    <ArrowLeft size={18} /> Volver
                </button>
            </div>
        </div>
    );
}
