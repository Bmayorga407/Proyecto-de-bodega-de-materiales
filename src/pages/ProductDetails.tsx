import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Save, Trash2, Edit2, Loader2, ArrowLeft, User, Send, X, CheckCircle2, AlertTriangle, ShoppingCart, Eye } from 'lucide-react';
import { Product } from '../types';
import { inventoryService } from '../services/inventoryService';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useAdminCart } from '../context/AdminCartContext';

const getLocalDateString = () => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return new Date(Date.now() - tzoffset).toISOString().split('T')[0];
};

const formatDisplayName = (emailStr: string | undefined): string => {
    if (!emailStr) return 'Bodega (Anterior)';
    const str = String(emailStr);
    if (str === 'Bodega Desconocida') return str;
    if (str.includes(' ')) return str; // Ya está formateado

    const namePart = str.split('@')[0];
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

const extractLocationString = (detailsString: any): string => {
    const str = detailsString != null ? String(detailsString).trim() : '';
    if (!str) return 'Sin ubicación';
    const match = str.match(/^\[(.*?)\]/);
    if (match) return match[1].trim();
    if (str.toLowerCase().includes('salida manual a:')) return 'Sin ubicación';
    return str;
};

const getCleanLocation = (details: any): string => {
    const str = String(details || '').trim();
    if (!str) return '';
    // Extraer solo lo que está entre el primer par de corchetes, o devolver todo si no hay
    const match = str.match(/\[(.*?)\]/);
    if (match) return match[1].trim();
    return str;
};

const extractLocationAndDetail = (detailsString: any) => {
    const rawStr = detailsString != null ? String(detailsString).trim() : '';
    if (!rawStr) return { location: <span className="text-gray-300 italic">Sin ubicación</span>, detail: '-', requestId: null };

    // Extraer ID de vinculación oculto si existe (con trim para evitar espacios extras)
    const parts = rawStr.split(' ||REQ:');
    const str = parts[0];
    const requestId: string | null = parts.length > 1 ? parts[1].trim() : null;

    // Log de depuración (solo en desarrollo)
    if (parts.length > 1) {
        console.log('[REQ_LINK] details raw:', rawStr, '| requestId extraido:', requestId);
    }

    // Detectar formato [Ubicación] Detalle
    const match = str.match(/^\[+(.*)\]\s*(.*)$/);
    if (match) {
        let locText = match[1].split(']')[0].trim();
        let detailText = (match[2] || '').trim();

        // Limpiar prefijo "Receptor:" y formatear visualmente
        detailText = detailText.replace(/^Receptor:\s*/i, '').trim();

        if (detailText) {
            const isBaja = detailText.toUpperCase().includes('BAJA');
            return {
                location: locText,
                detail: <span className="flex items-center gap-1">
                    {!isBaja && <span className="font-bold text-gray-400 text-[10px] uppercase">Entrega a:</span>}
                    <span className={`font-medium ${isBaja ? 'text-coca-red' : 'text-gray-700'}`}>{detailText}</span>
                </span>,
                requestId
            };
        }

        return { location: locText, detail: '-', requestId };
    }

    // Legacy fallback: Salida manual antigua sin corchetes
    if (str.toLowerCase().includes('salida manual a:')) {
        const legacyName = str.toLowerCase().replace('salida manual a:', '').trim();
        const isBaja = legacyName.toUpperCase().includes('BAJA');
        return {
            location: <span className="text-gray-300 italic">Sin ubicación</span>,
            detail: <span className="flex items-center gap-1">
                {!isBaja && <span className="font-bold text-gray-400 text-[10px] uppercase">Entrega a:</span>}
                <span className={`font-medium ${isBaja ? 'text-coca-red' : 'text-gray-700'}`}>{legacyName}</span>
            </span>,
            requestId
        };
    }

    const isSimpleBaja = str.toUpperCase().includes('BAJA');
    if (isSimpleBaja) {
        return {
            location: <span className="text-gray-300 italic">Sin ubicación</span>,
            detail: <span className="font-medium text-coca-red">{str}</span>,
            requestId
        };
    }

    return { location: str, detail: '-', requestId };
};

export default function ProductDetails() {
    const { code } = useParams();
    const [searchParams] = useSearchParams();
    const reqIdParam = searchParams.get('reqId');
    const navigate = useNavigate();
    const { role, currentUser } = useAuth();
    const { addToCart } = useCart();
    const { addToAdminCart } = useAdminCart();
    const [modalStep, setModalStep] = useState(1); // 1: Qty/Choice, 2: Names (only for Direct)
    const [isBajaPromptOpen, setIsBajaPromptOpen] = useState(false);
    const [bajaReason, setBajaReason] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [pendingRequestsStock, setPendingRequestsStock] = useState(0);

    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

    // Auto-scroll to highlighted movement
    useEffect(() => {
        if (reqIdParam) {
            setTimeout(() => {
                const element = document.getElementById(`req-${reqIdParam}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 800);
        }
    }, [reqIdParam, isLoading]);
    const [requestName, setRequestName] = useState('');
    const [receptorName, setReceptorName] = useState('');
    const [requestQty, setRequestQty] = useState(1);

    // New Sort/Filter State
    const [sortDesc, setSortDesc] = useState(true);
    const [filterReceptor, setFilterReceptor] = useState('');
    const [isManualMode, setIsManualMode] = useState(false);

    const [isRequesting, setIsRequesting] = useState(false);
    const [requestSuccess, setRequestSuccess] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [productToDelete, setProductToDelete] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '', code: '', description: '', stock: 0, details: '', imageUrl: '', entryDate: getLocalDateString()
    });
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    const [definingLocationFor, setDefiningLocationFor] = useState<string | null>(null);
    const [newLocationName, setNewLocationName] = useState('');

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
                .filter(r => r.status === 'PENDIENTE' && String(r.productCode).toLowerCase() === code.toLowerCase())
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
            const filteredProducts = data.filter(p => String(p.code).toLowerCase() === code?.toLowerCase());
            setProducts(filteredProducts);

            // Calcular solicitudes pendientes de otros/este usuario para advertencia de stock
            const pendingQty = requestsData
                .filter(r => r.status === 'PENDIENTE' && String(r.productCode).toLowerCase() === code?.toLowerCase())
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

    const handleDefineLocation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLocationName.trim() || !definingLocationFor) return;

        setIsSaving(true);
        try {
            // Find all history rows (positive stock) that have this exact `details`
            const rowsToUpdate = products.filter(p =>
                p.stock > 0 &&
                (p.details || '').trim() === definingLocationFor
            );

            for (const row of rowsToUpdate) {
                if (row.id) {
                    await inventoryService.updateProduct(row.id, {
                        ...row,
                        details: `[${newLocationName.trim()}] Asignado en bodega`
                    });
                    await new Promise(res => setTimeout(res, 300));
                }
            }

            showSuccess('Ubicación definida correctamente.');
            setDefiningLocationFor(null);
            setNewLocationName('');
            await loadProducts();
        } catch (error) {
            console.error(error);
            showError('Hubo un error al definir la ubicación.');
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!productToDelete) return;
        try {
            setIsLoading(true);

            // Buscar si esta fila tiene una solicitud vinculada
            const rowToDelete = products.find(p => p.id === productToDelete);
            console.log('[DELETE_ROW] Fila a borrar:', rowToDelete?.id, '| details:', rowToDelete?.details);

            if (rowToDelete?.details && rowToDelete.details.includes(' ||REQ:')) {
                const reqId = rowToDelete.details.split(' ||REQ:')[1]?.trim();
                console.log('[DELETE_ROW] REQ_ID encontrado:', reqId);
                if (reqId) {
                    try {
                        await inventoryService.deleteRequest(reqId);
                        console.log('[DELETE_ROW] Solicitud vinculada eliminada:', reqId);
                    } catch (e) {
                        console.warn('[DELETE_ROW] No se pudo eliminar la solicitud (quizás ya no existe):', e);
                    }
                }
            } else {
                console.log('[DELETE_ROW] No hay REQ_ID vinculado - borrado simple');
            }

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
            result = result.filter(p => p.details && String(p.details).toLowerCase().includes(filterReceptor.toLowerCase()));
        }
        if (sortDesc) {
            result.reverse();
        }
        return result;
    }, [products, sortDesc, filterReceptor]);

    const { totalStock, stockByLocation } = useMemo(() => {
        let total = 0;
        const byLoc: Record<string, number> = {};
        let unallocatedNegative = 0;

        products.forEach(p => {
            const qty = Number(p.stock) || 0;
            total += qty;
            if (qty > 0) {
                const loc = extractLocationString(p.details);
                byLoc[loc] = (byLoc[loc] || 0) + qty;
            } else {
                const loc = extractLocationString(p.details);
                // Si la deducción tiene ubicación asignable explícita
                if (loc !== 'Sin ubicación' && String(p.details).includes('[')) {
                    byLoc[loc] = (byLoc[loc] || 0) + qty;
                } else {
                    unallocatedNegative += qty;
                }
            }
        });

        // Restar también las reservas pendientes o aprobadas que no se hayan descontado de bodega
        total -= pendingRequestsStock;
        unallocatedNegative -= pendingRequestsStock;

        if (unallocatedNegative < 0) {
            for (const loc of Object.keys(byLoc)) {
                if (unallocatedNegative >= 0) break;
                if (byLoc[loc] > 0) {
                    const available = byLoc[loc];
                    const deduction = Math.min(available, Math.abs(unallocatedNegative));
                    byLoc[loc] -= deduction;
                    unallocatedNegative += deduction;
                }
            }
        }

        console.log(`[stockByLocation Debug] Total: ${total}, UnallocatedNeg Left: ${unallocatedNegative}`);
        console.log(`[stockByLocation Debug] Final ByLoc:`, byLoc);

        return { totalStock: total, stockByLocation: byLoc };
    }, [products, pendingRequestsStock]);

    const locationSuggestions = useMemo(() => {
        const existing = Object.keys(stockByLocation).filter(loc => !loc.toLowerCase().includes('por definir') && stockByLocation[loc] > 0);
        if (existing.length > 0) return existing;

        for (let i = products.length - 1; i >= 0; i--) {
            const p = products[i];
            if (p && p.details != null) {
                const detailsStr = String(p.details);
                const match = detailsStr.match(/^\[(.*?)\]/);
                if (match) {
                    const loc = match[1].trim();
                    if (!loc.toLowerCase().includes('por definir')) {
                        return [loc];
                    }
                } else {
                    const raw = detailsStr.trim();
                    if (raw && !raw.toLowerCase().includes('salida manual') && !raw.toLowerCase().includes('por definir')) {
                        return [raw];
                    }
                }
            }
        }
        return [];
    }, [products, stockByLocation]);

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

    const handleCreateRequest = async (e?: React.FormEvent, forceStatus?: 'APROBADA' | 'ENTREGADA' | 'BAJA') => {
        if (e) e.preventDefault();
        if (requestQty < 1 || requestQty > totalStock) {
            showError('Cantidad inválida o superior al stock disponible.');
            return;
        }

        const isBaja = forceStatus === 'BAJA';

        const nameParts = requestName.trim().split(/\s+/);
        if (!isBaja && nameParts.length < 2) {
            showError('RECHAZADO: Debes ingresar tu nombre Y tu apellido para solicitar.');
            return;
        }

        const receptorParts = receptorName.trim().split(/\s+/);
        if (!isBaja && receptorParts.length < 2 && !isManualMode) {
            showError('RECHAZADO: Debes ingresar el nombre Y apellido de quién recibe.');
            return;
        }

        setIsRequesting(true);
        try {
            const isManualReserva = forceStatus === 'APROBADA';
            const isManualEntrega = forceStatus === 'ENTREGADA';

            let reqId: string | undefined = undefined;

            if (!isBaja) {
                const createdReq = await inventoryService.createRequest({
                    productCode: baseProduct.code,
                    productName: baseProduct.name,
                    quantity: requestQty,
                    requestedBy: requestName.trim(),
                    receptorName: receptorName.trim() || requestName.trim(),
                    requesterEmail: currentUser?.email || '',
                    status: forceStatus || 'PENDIENTE',
                    approvedAt: (isManualReserva || isManualEntrega) ? new Date().toISOString() : undefined,
                    logisticConfirmedAt: ''
                });
                reqId = createdReq?.id;
            }

            if (isManualReserva || isManualEntrega || isBaja) {
                // Lógica de deducción automática por ubicaciones
                let remainingToDeduct = requestQty;

                // Ordenar ubicaciones para descontar
                const locationsWithStock = products
                    .filter(p => p.stock > 0 && p.details)
                    .sort((a, b) => a.stock - b.stock);

                for (const locProduct of locationsWithStock) {
                    if (remainingToDeduct <= 0) break;

                    const deductFromThisLoc = Math.min(locProduct.stock, remainingToDeduct);

                    const locClean = getCleanLocation(locProduct.details);
                    let finalDetails = '';
                    if (isBaja) {
                        finalDetails = `[${locClean}] BAJA - Motivo: ${receptorName.trim() || 'No especificado'}`;
                    } else {
                        finalDetails = `[${locClean}] Receptor: ${receptorName.trim() || requestName.trim()}${reqId ? ` ||REQ:${reqId}` : ''}`;
                    }

                    await inventoryService.addProduct({
                        code: baseProduct.code,
                        name: baseProduct.name,
                        stock: -deductFromThisLoc,
                        details: finalDetails,
                        channel: locProduct.channel,
                        entryDate: getLocalDateString(),
                        registeredBy: currentUser?.email || 'Bodega'
                    });

                    remainingToDeduct -= deductFromThisLoc;
                }

                // Si por alguna razón queda algo por descontar (ej: el stock total era inconsistente), 
                // hacemos un último descuento genérico o error (opcional)
                if (remainingToDeduct > 0) {
                    console.warn(`No se pudo descontar el total de ${requestQty}. Quedaron ${remainingToDeduct} sin ubicación.`);
                }
            }

            setRequestSuccess(
                isBaja ? 'Baja registrada en el inventario con éxito.' :
                    isManualReserva ? 'Reserva guardada en "Por Retirar".' :
                        isManualEntrega ? 'Salida manual registrada con éxito.' :
                            'Solicitud enviada a bodega con éxito.'
            );

            setTimeout(() => {
                setIsRequestModalOpen(false);
                setIsManualMode(false);
                setRequestSuccess('');
                setRequestQty(1);
                setRequestName('');
                setReceptorName('');
                loadProducts();
            }, 2500);
        } catch (err) {
            console.error(err);
            showError('Error al procesar la solicitud.');
            setModalStep(1);
            showError('Error al crear la solicitud. Por favor intenta de nuevo.');
        } finally {
            setIsRequesting(false);
        }
    };

    const handleAddToCart = () => {
        if (!baseProduct) return;
        if (requestQty < 1 || requestQty > totalStock) {
            showError('Cantidad inválida o superior al stock disponible.');
            return;
        }

        if (isManualMode) {
            addToAdminCart({
                productCode: baseProduct.code,
                name: baseProduct.name,
                quantity: requestQty,
                maxStock: totalStock,
                imageUrl: baseProduct.imageUrl,
                channel: baseProduct.channel,
                location: locationSuggestions.length === 1 ? locationSuggestions[0] : (locationSuggestions.length > 1 ? 'Varias ubicaciones' : undefined)
            });
            showSuccess(`${baseProduct.name} añadido a Lista Masiva.`);
        } else {
            // Pasar el producto con el stock total neto (sumado de todas las ubicaciones)
            addToCart({ ...baseProduct, stock: totalStock }, requestQty);
            showSuccess(`${baseProduct.name} añadido al carrito.`);
        }
        setIsRequestModalOpen(false);
        setRequestQty(1);
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
                        <div className="mb-8 flex items-end gap-3 flex-wrap">
                            <div>
                                <span className="inline-block px-3 py-1 bg-red-50 text-coca-red rounded-full text-[10px] font-bold tracking-widest uppercase mb-3 border border-red-100 shadow-sm">
                                    Código del Producto
                                </span>
                                <h1 className="text-5xl md:text-6xl font-black text-coca-red tracking-tight break-all uppercase leading-none">
                                    {baseProduct.code}
                                </h1>
                            </div>

                            {baseProduct.channel && (
                                <div className="transition-all animate-in fade-in slide-in-from-left-4 duration-500 delay-200">
                                    <span className="inline-block px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold tracking-widest uppercase mb-3 border border-gray-200 shadow-sm">
                                        {baseProduct.channel}
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
                                        .map(([loc, qty]) => {
                                            const locStr = loc != null ? String(loc) : '';
                                            const isPorDefinir = locStr.toLowerCase().includes('por definir');
                                            return (
                                                <div key={locStr} className={`flex justify-between items-center px-3 py-2 rounded-xl border ${isPorDefinir ? 'bg-orange-50 border-orange-200/60 shadow-inner' : 'bg-white/40 border-red-100/50'} text-red-900`}>
                                                    <span className="truncate pr-3 font-medium flex items-center gap-2">
                                                        {isPorDefinir ? (
                                                            <span className="flex items-center gap-1.5 text-orange-800 font-bold">
                                                                <AlertTriangle size={14} className="text-orange-500 shrink-0" />
                                                                <span className="truncate">{locStr}</span>
                                                            </span>
                                                        ) : (
                                                            locStr
                                                        )}
                                                        {role === 'BODEGA' && isPorDefinir && (
                                                            <button
                                                                onClick={() => setDefiningLocationFor(locStr)}
                                                                className="ml-1 text-[10px] text-white bg-orange-500 hover:bg-orange-600 px-2.5 py-1 rounded-full shadow-sm transition-all hover:scale-105 active:scale-95 uppercase tracking-wider font-bold shrink-0"
                                                            >
                                                                Asignar
                                                            </button>
                                                        )}
                                                    </span>
                                                    <span className={`font-bold px-2.5 py-1 rounded-lg shadow-sm border whitespace-nowrap ${isPorDefinir ? 'bg-white text-orange-800 border-orange-200/50' : 'bg-white text-coca-red border-red-100/30'}`}>
                                                        {qty} UN
                                                    </span>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                        {(role === 'VENTAS' || (role === 'LOGISTICA' && (baseProduct?.channel || '').replace(/\s+/g, '').toLowerCase() === 'ventahogar')) && (
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => { setIsManualMode(false); setIsRequestModalOpen(true); }}
                                    className="w-full bg-coca-black text-white px-6 py-4 rounded-xl hover:bg-gray-800 transition-all hover:scale-[1.02] shadow-md hover:shadow-xl font-bold active:scale-95 text-lg flex items-center justify-center gap-2"
                                >
                                    <Send size={20} />
                                    Gestionar Solicitud
                                </button>
                            </div>
                        )}
                        {role === 'BODEGA' && (
                            <button
                                onClick={() => { setIsManualMode(true); setIsRequestModalOpen(true); }}
                                className="w-full sm:w-auto bg-red-600 text-white px-6 py-4 rounded-xl hover:bg-red-700 transition-all hover:scale-[1.02] shadow-md hover:shadow-xl font-bold active:scale-95 text-lg flex items-center justify-center gap-2"
                            >
                                <Send size={20} />
                                Salida Manual
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal para Definir Ubicación Rápida */}
            {definingLocationFor && (
                <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 flex items-start justify-between border-b bg-gray-50 border-gray-100">
                            <h3 className="text-xl font-bold text-gray-900">Definir Ubicación</h3>
                            <button onClick={() => setDefiningLocationFor(null)} className="text-gray-400 hover:text-gray-600 outline-none">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleDefineLocation} className="p-5 space-y-4">
                            <p className="text-sm text-gray-600">
                                Asigna una ubicación en estantería/bodega para el stock actualmente en: <br />
                                <strong className="text-gray-900">"{definingLocationFor}"</strong>.
                            </p>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Nueva Ubicación</label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    placeholder="Ej. Contenedor 2, Pasillo A..."
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-coca-red focus:border-coca-red outline-none text-sm transition-all"
                                    value={newLocationName}
                                    onChange={(e) => setNewLocationName(e.target.value)}
                                />
                                {locationSuggestions.length > 0 && (
                                    <div className="mt-2.5 flex items-start flex-col gap-1.5 border-t border-gray-100 pt-3">
                                        <span className="text-xs text-gray-500 font-medium">Sugerencias:</span>
                                        <div className="flex flex-wrap gap-2">
                                            {locationSuggestions.map(sug => (
                                                <button
                                                    key={sug}
                                                    type="button"
                                                    onClick={() => setNewLocationName(sug)}
                                                    className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 rounded-lg font-medium transition-colors border border-gray-200 shadow-sm"
                                                >
                                                    {sug}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setDefiningLocationFor(null)}
                                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl font-bold transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newLocationName.trim() || isSaving}
                                    className={`flex-1 px-4 py-2 text-white rounded-xl font-bold flex justify-center items-center transition-all ${(!newLocationName.trim() || isSaving) ? 'bg-gray-400 cursor-not-allowed' : 'bg-coca-black hover:bg-gray-800 shadow-md'
                                        }`}
                                >
                                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
                                    <option value="Venta Hogar">Venta Hogar</option>
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
                                {processedMovements.map((p: Product) => {
                                    const { location, detail, requestId } = extractLocationAndDetail(p.details);
                                    const isHighlighted = reqIdParam && requestId === reqIdParam;

                                    return (
                                        <tr
                                            key={p.id}
                                            id={requestId ? `req-${requestId}` : undefined}
                                            className={`${isHighlighted ? 'bg-blue-50 ring-2 ring-blue-200 ring-inset shadow-inner animate-pulse duration-[2000ms]' : ''} ${editingProduct?.id === p.id ? 'bg-red-50/50' : 'hover:bg-gray-50'} transition-all`}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-l-2 border-transparent">
                                                {p.entryDate ? new Date(p.entryDate).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <div className={`font-bold flex items-center gap-1 px-2 py-1 rounded w-fit ${p.stock > 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                                                    {p.stock > 0 ? `+${p.stock}` : p.stock}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">
                                                <div className="flex items-center gap-2">
                                                    {isHighlighted && <Send size={14} className="text-blue-500 animate-bounce" />}
                                                    {location}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {detail}
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
                                                {p.stock > 0 && (
                                                    <button onClick={() => handleEditClick(p)} className="text-blue-500 hover:text-blue-700 transition-colors p-1.5 rounded-full hover:bg-blue-50">
                                                        <Edit2 size={16} />
                                                    </button>
                                                )}
                                                {requestId ? (
                                                    <button
                                                        onClick={() => navigate(`/admin?tab=solicitudes&highlightReqId=${requestId}`)}
                                                        title="Ver la solicitud original de este movimiento"
                                                        className="text-blue-500 hover:text-blue-700 transition-colors p-1.5 rounded-full hover:bg-blue-50"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                ) : (
                                                    <button onClick={() => setProductToDelete(p.id)} className="text-red-400 hover:text-red-700 transition-colors p-1.5 rounded-full hover:bg-red-50">
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
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
                            <h2 className="text-xl font-bold text-gray-900">{isManualMode ? 'Salida Manual' : 'Solicitar Material'}</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                {isManualMode
                                    ? `Registra una salida directa o reserva de ${baseProduct.name}.`
                                    : `Ingresa la cantidad que necesitas de ${baseProduct.name}.`}
                            </p>

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
                        ) : modalStep === 1 ? (
                            <div className="space-y-6">
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

                                <div className="flex flex-col gap-3">
                                    <button
                                        type="button"
                                        onClick={handleAddToCart}
                                        className="w-full py-4 rounded-xl font-bold bg-white text-coca-black border-2 border-coca-black flex justify-center items-center gap-2 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
                                    >
                                        <ShoppingCart size={20} />
                                        {isManualMode ? 'Añadir a Lista Masiva' : 'Añadir al Carrito'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModalStep(2)}
                                        className="w-full py-4 rounded-xl font-bold text-white bg-coca-red hover:bg-red-700 flex justify-center items-center gap-2 transition-all shadow-md active:scale-95"
                                    >
                                        <Send size={20} />
                                        {isManualMode ? 'Gestión Directa' : 'Pedir Ahora'}
                                    </button>
                                    {isManualMode && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBajaReason('');
                                                setIsBajaPromptOpen(true);
                                            }}
                                            disabled={isRequesting || requestQty > totalStock}
                                            className="w-full py-2 mt-2 text-sm font-semibold text-amber-700 hover:text-amber-800 flex justify-center items-center gap-1.5 transition-colors"
                                        >
                                            {isRequesting ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
                                            Dar de Baja Rápida (Merma/Dañado)
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleCreateRequest} className="space-y-5">
                                <button
                                    type="button"
                                    onClick={() => setModalStep(1)}
                                    className="text-xs font-bold text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-2"
                                >
                                    <ArrowLeft size={12} /> Volver a cantidad
                                </button>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre y Apellido de quien solicita</label>
                                    <div className="flex bg-gray-50 rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-coca-red focus-within:border-transparent transition-all">
                                        <div className="pl-3 py-3 flex items-center justify-center text-gray-400">
                                            <User size={18} />
                                        </div>
                                        {role === 'LOGISTICA' ? (
                                            <select
                                                required
                                                className="flex-1 bg-transparent border-none focus:ring-0 px-3 py-3 text-sm text-gray-900 outline-none w-full appearance-none"
                                                value={requestName}
                                                onChange={(e) => setRequestName(e.target.value)}
                                            >
                                                <option value="" disabled>Seleccione Supervisor...</option>
                                                {['Randolf Mejia', 'Klinsman Gomez', 'Hector Riffo', 'Alvaro Toledo', 'Nicolas Avarzua', 'Jorge Opazo', 'Victor Parra'].map(sup => (
                                                    <option key={sup} value={sup}>{sup}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                required
                                                placeholder="Ej. Juan Pérez"
                                                className="flex-1 bg-transparent border-none focus:ring-0 px-3 py-3 text-sm text-gray-900 outline-none w-full"
                                                value={requestName}
                                                onChange={(e) => setRequestName(e.target.value)}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">{isManualMode ? 'Nombre de receptor o Motivo de Baja' : 'Nombre y Apellido de quien recibe'}</label>
                                    <div className="flex bg-gray-50 rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-coca-red focus-within:border-transparent transition-all">
                                        <div className="pl-3 py-3 flex items-center justify-center text-gray-400">
                                            <User size={18} />
                                        </div>
                                        <input
                                            type="text"
                                            required
                                            placeholder={isManualMode ? "Ej. Dañado, Merma, Juan Pérez..." : "Ej. María Gómez"}
                                            className="flex-1 bg-transparent border-none focus:ring-0 px-3 py-3 text-sm text-gray-900 outline-none w-full"
                                            value={receptorName}
                                            onChange={(e) => setReceptorName(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {isManualMode ? (
                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="button"
                                            onClick={(e) => handleCreateRequest(e, 'ENTREGADA')}
                                            disabled={isRequesting || requestQty > totalStock || !requestName.trim()}
                                            className={`w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 transition-all shadow-md
                                                ${isRequesting || requestQty > totalStock || !requestName.trim() ? 'bg-gray-400 cursor-not-allowed' : 'bg-coca-black hover:bg-black hover:shadow-lg'}`}
                                        >
                                            {isRequesting ? <Loader2 size={20} className="animate-spin" /> : <X size={20} />}
                                            {isRequesting ? 'Procesando...' : 'Salida Directa (Descontar ya)'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => handleCreateRequest(e, 'APROBADA')}
                                            disabled={isRequesting || requestQty > totalStock || !requestName.trim()}
                                            className={`w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 transition-all shadow-md
                                                ${isRequesting || requestQty > totalStock || !requestName.trim() ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 hover:shadow-lg'}`}
                                        >
                                            {isRequesting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                            {isRequesting ? 'Procesando...' : 'Reservar (Dejar Por Retirar)'}
                                        </button>
                                        <div className="relative flex py-2 items-center">
                                            <div className="flex-grow border-t border-gray-200"></div>
                                            <span className="flex-shrink-0 mx-4 text-gray-400 font-medium text-xs uppercase tracking-widest">Otras Opciones</span>
                                            <div className="flex-grow border-t border-gray-200"></div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => handleCreateRequest(e, 'BAJA')}
                                            disabled={isRequesting || requestQty > totalStock || !requestName.trim()}
                                            className={`w-full py-3.5 rounded-xl font-bold text-amber-900 flex justify-center items-center gap-2 transition-all shadow-sm border border-amber-200
                                                ${isRequesting || requestQty > totalStock || !requestName.trim() ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 'bg-amber-100 hover:bg-amber-200'}`}
                                        >
                                            {isRequesting ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
                                            {isRequesting ? 'Procesando...' : 'Dar de Baja (Dañado/Merma)'}
                                        </button>
                                    </div>
                                ) : (
                                    <button type="submit" disabled={isRequesting || requestQty > totalStock || !requestName.trim()} className={`w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 transition-all shadow-md
                                        ${isRequesting || requestQty > totalStock || !requestName.trim() ? 'bg-gray-400 cursor-not-allowed text-gray-100' : 'bg-coca-red hover:bg-red-700 hover:shadow-lg'}`}>
                                        {isRequesting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                        {isRequesting ? 'Enviando a Bodega...' : 'Confirmar Petición Directa'}
                                    </button>
                                )}
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
            {/* Modal para Motivo de Baja Rápida */}
            {isBajaPromptOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="p-5 flex items-start gap-4 border-b bg-amber-50/50 border-amber-100">
                            <div className="p-2 rounded-full bg-amber-100 text-amber-600">
                                <AlertTriangle size={24} />
                            </div>
                            <div className="flex-1 mt-1">
                                <h3 className="text-xl font-bold text-gray-900">
                                    Motivo de Baja
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Estás a punto de descontar <strong>{requestQty} UN</strong> del inventario.
                                </p>
                            </div>
                            <button onClick={() => setIsBajaPromptOpen(false)} className="text-gray-400 hover:text-gray-600 outline-none">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Especifica el motivo</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Dañado, Producto vencido, Merma..."
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                                    value={bajaReason}
                                    onChange={(e) => setBajaReason(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsBajaPromptOpen(false)}
                                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        setIsBajaPromptOpen(false);
                                        setReceptorName(bajaReason.trim() || 'No especificado');
                                        handleCreateRequest(e, 'BAJA');
                                    }}
                                    disabled={isRequesting}
                                    className="flex-1 cursor-pointer px-4 py-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-xl font-bold transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isRequesting ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Baja'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
