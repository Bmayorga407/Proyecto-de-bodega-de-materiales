import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Save, Trash2, Edit2, Loader2, ArrowLeft, User, Send, X, CheckCircle2, AlertTriangle, ShoppingCart, Eye, SlidersHorizontal, ArrowRightLeft, ClipboardList } from 'lucide-react';
import { Product } from '../types';
import { inventoryService } from '../services/inventoryService';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useAdminCart } from '../context/AdminCartContext';
import { createPortal } from 'react-dom';

const ALL_CHANNELS = ['Tradicional', 'Moderno', 'Venta Hogar', 'Publicidad'];

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

const getCleanLocation = (details: any): string => {
    const str = String(details || '').trim();
    if (!str) return '';
    // Extraer solo lo que está entre el primer par de corchetes, o devolver todo si no hay
    const match = str.match(/\[(.*?)\]/);
    if (match) return match[1].trim();
    return str;
};

const extractLocationString = (detailsString: any): string => {
    const cleaned = getCleanLocation(detailsString);
    if (!cleaned || cleaned.toLowerCase().includes('salida manual a:')) return 'Sin ubicación';
    return cleaned;
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
    const [requestQty, setRequestQty] = useState<number | "">(1);

    // New Sort/Filter State
    const [sortDesc, setSortDesc] = useState(true);
    const [filterReceptor, setFilterReceptor] = useState('');
    const [isManualMode, setIsManualMode] = useState(false);
    const [manualLocations, setManualLocations] = useState<{ location: string; quantity: number; channel: string }[]>([]);

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

    // --- Adjust Modal State ---
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [adjustMode, setAdjustMode] = useState<'transfer' | 'count'>('transfer');
    const [adjustIsProcessing, setAdjustIsProcessing] = useState(false);
    // Transfer mode
    const [transferFromChannel, setTransferFromChannel] = useState('');
    const [transferToChannel, setTransferToChannel] = useState('');
    const [transferQty, setTransferQty] = useState<number | ''>(1);
    // Count mode
    const [countChannel, setCountChannel] = useState('');
    const [countRealQty, setCountRealQty] = useState<number | ''>('');

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

    const handleAdjust = async () => {
        if (!baseProduct) return;
        setAdjustIsProcessing(true);
        const today = getLocalDateString();
        const userEmail = currentUser?.email || 'Bodega';
        // Determine location to use: first named location or 'Sin ubicación'
        const loc = locationSuggestions[0] || 'Sin ubicación';

        try {
            if (adjustMode === 'transfer') {
                if (!transferFromChannel || !transferToChannel) {
                    showError('Selecciona el canal origen y destino.');
                    setAdjustIsProcessing(false);
                    return;
                }
                if (transferFromChannel === transferToChannel) {
                    showError('El canal origen y destino no pueden ser iguales.');
                    setAdjustIsProcessing(false);
                    return;
                }
                const qty = Number(transferQty);
                if (!qty || qty < 1) {
                    showError('Ingresa una cantidad válida mayor a 0.');
                    setAdjustIsProcessing(false);
                    return;
                }
                const fromStock = stockByChannel[transferFromChannel] || 0;
                if (qty > fromStock) {
                    showError(`Solo hay ${fromStock} UN disponibles en ${transferFromChannel}.`);
                    setAdjustIsProcessing(false);
                    return;
                }

                // Movement 1: deduction from origin channel
                await inventoryService.addProduct({
                    code: baseProduct.code,
                    name: baseProduct.name,
                    description: baseProduct.description || baseProduct.name,
                    stock: -qty,
                    details: `[${loc}] Ajuste: Traspaso a ${transferToChannel}`,
                    channel: transferFromChannel,
                    imageUrl: baseProduct.imageUrl || '',
                    entryDate: today,
                    registeredBy: userEmail,
                });
                await new Promise(r => setTimeout(r, 400));

                // Movement 2: addition to destination channel
                await inventoryService.addProduct({
                    code: baseProduct.code,
                    name: baseProduct.name,
                    description: baseProduct.description || baseProduct.name,
                    stock: qty,
                    details: `[${loc}] Ajuste: Traspaso desde ${transferFromChannel}`,
                    channel: transferToChannel,
                    imageUrl: baseProduct.imageUrl || '',
                    entryDate: today,
                    registeredBy: userEmail,
                });

                showSuccess(`✓ Traspaso de ${qty} UN de ${transferFromChannel} → ${transferToChannel} registrado.`);
            } else {
                // Count mode
                if (!countChannel) {
                    showError('Selecciona el canal a ajustar.');
                    setAdjustIsProcessing(false);
                    return;
                }
                if (countRealQty === '' || Number(countRealQty) < 0) {
                    showError('Ingresa la cantidad real contada (mínimo 0).');
                    setAdjustIsProcessing(false);
                    return;
                }
                const registered = stockByChannel[countChannel] || 0;
                const real = Number(countRealQty);
                const diff = real - registered;

                if (diff === 0) {
                    showError('La cantidad ingresada es igual al saldo registrado. No hay nada que ajustar.');
                    setAdjustIsProcessing(false);
                    return;
                }

                await inventoryService.addProduct({
                    code: baseProduct.code,
                    name: baseProduct.name,
                    description: baseProduct.description || baseProduct.name,
                    stock: diff, // positive or negative
                    details: `[${loc}] Ajuste de inventario`,
                    channel: countChannel,
                    imageUrl: baseProduct.imageUrl || '',
                    entryDate: today,
                    registeredBy: userEmail,
                });

                const sign = diff > 0 ? '+' : '';
                showSuccess(`✓ Ajuste de inventario aplicado: ${sign}${diff} UN en canal ${countChannel}.`);
            }

            await loadProducts();
            setIsAdjustModalOpen(false);
            // Reset
            setTransferFromChannel('');
            setTransferToChannel('');
            setTransferQty(1);
            setCountChannel('');
            setCountRealQty('');
        } catch (err) {
            console.error(err);
            showError('Hubo un error al registrar el ajuste.');
        } finally {
            setAdjustIsProcessing(false);
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

    const { totalStock, stockByLocation, stockByChannel } = useMemo(() => {
        let total = 0;
        const byLoc: Record<string, number> = {};
        const byChannel: Record<string, number> = {};
        // Separate unallocated buckets for location and channel balancing
        let unallocatedNegLoc = 0;      // for balancing byLoc (pending requests, old records)
        let unallocatedNegChannel = 0;  // for balancing byChannel when channel is unknown

        products.forEach(p => {
            const qty = Number(p.stock) || 0;
            total += qty;

            const chan = (p.channel || '').trim();
            // Si tiene comas, es multicanal "viejo"
            const finalChan = chan.includes(',') ? 'Multicanal' : (chan || 'Por Definir');

            if (qty > 0) {
                const loc = extractLocationString(p.details);
                byLoc[loc] = (byLoc[loc] || 0) + qty;
                byChannel[finalChan] = (byChannel[finalChan] || 0) + qty;
            } else {
                const loc = extractLocationString(p.details);

                // --- Location tracking ---
                // Si la deducción tiene corchetes en los detalles, la ubicación es conocida
                if (String(p.details).includes('[')) {
                    byLoc[loc] = (byLoc[loc] || 0) + qty;
                } else {
                    unallocatedNegLoc += qty;
                }

                // --- Channel tracking ---
                // CLAVE: si el canal de la fila de deducción es conocido, descontamos
                // directamente de ese canal. No lo mezclamos con "no asignados".
                // Esto garantiza que al aprobar desde MODERNO, MODERNO se descuente.
                if (finalChan !== 'Por Definir') {
                    byChannel[finalChan] = (byChannel[finalChan] || 0) + qty;
                } else {
                    // Canal desconocido (registros viejos sin canal)
                    unallocatedNegChannel += qty;
                }
            }
        });

        // Restar reservas PENDIENTES (no tienen canal asignado aún)
        total -= pendingRequestsStock;
        unallocatedNegLoc -= pendingRequestsStock;
        unallocatedNegChannel -= pendingRequestsStock;

        // Balancear negativos sin ubicación asignable contra las ubicaciones positivas
        if (unallocatedNegLoc < 0) {
            let negLeft = unallocatedNegLoc;
            for (const loc of Object.keys(byLoc)) {
                if (negLeft >= 0) break;
                if (byLoc[loc] > 0) {
                    const deduction = Math.min(byLoc[loc], Math.abs(negLeft));
                    byLoc[loc] -= deduction;
                    negLeft += deduction;
                }
            }
        }

        // Balancear negativos sin canal conocido contra los canales positivos
        if (unallocatedNegChannel < 0) {
            let negLeft = unallocatedNegChannel;
            for (const ch of Object.keys(byChannel)) {
                if (negLeft >= 0) break;
                if (byChannel[ch] > 0) {
                    const deduction = Math.min(byChannel[ch], Math.abs(negLeft));
                    byChannel[ch] -= deduction;
                    negLeft += deduction;
                }
            }
        }

        return { totalStock: total, stockByLocation: byLoc, stockByChannel: byChannel };
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

    // Calcular todos los canales únicos en el historial
    const allChannels = useMemo(() => {
        const channels = new Set<string>();
        products.forEach(p => {
            if (p.channel) {
                p.channel.split(',').forEach(c => {
                    const trimmed = c.trim();
                    if (trimmed) channels.add(trimmed);
                });
            }
        });
        return Array.from(channels);
    }, [products]);

    // Ubicaciones disponibles para salida manual (agrupadas por canal+ubicación)
    // Incluye todos los registros con stock positivo aunque no tengan ubicación definida
    const availableLocationsForSalida = useMemo(() => {
        const locs = new Set<string>();
        products.forEach(p => {
            if (Number(p.stock) > 0) {
                // Determinar la ubicación: extraer del details o usar 'Sin ubicación'
                const rawLoc = p.details ? getCleanLocation(p.details) : '';
                const isBadLoc = !rawLoc
                    || rawLoc.toLowerCase().includes('por definir')
                    || rawLoc.toLowerCase().includes('baja')
                    || rawLoc.toLowerCase().includes('entrega')
                    || rawLoc.toLowerCase().includes('receptor');
                const loc = isBadLoc ? 'Sin ubicación' : rawLoc;
                const channel = (p.channel || '').trim();
                locs.add(`${channel}|||${loc}`);
            }
        });
        return Array.from(locs);
    }, [products]);

    // Stock disponible en una ubicación+canal (respeta la misma normalización que availableLocationsForSalida)
    const getStockInLocationAndChannel = (loc: string, channel: string): number => {
        return products
            .filter(p => {
                const rawLoc = p.details ? getCleanLocation(p.details) : '';
                const isBadLoc = !rawLoc
                    || rawLoc.toLowerCase().includes('por definir')
                    || rawLoc.toLowerCase().includes('baja')
                    || rawLoc.toLowerCase().includes('entrega')
                    || rawLoc.toLowerCase().includes('receptor');
                const pLoc = isBadLoc ? 'Sin ubicación' : rawLoc;
                const pChannel = (p.channel || '').trim();
                return pLoc === loc && pChannel === channel;
            })
            .reduce((sum, p) => sum + Number(p.stock), 0);
    };

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

    const handleCreateRequest = async (e?: React.FormEvent, forceStatus?: 'APROBADA' | 'ENTREGADA' | 'BAJA', manualReason?: string) => {
        if (e) e.preventDefault();
        if (Number(requestQty) < 1 || Number(requestQty) > totalStock) {
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
                    quantity: Number(requestQty),
                    requestedBy: requestName.trim(),
                    receptorName: receptorName.trim() || requestName.trim(),
                    requesterEmail: currentUser?.email || '',
                    status: forceStatus || 'PENDIENTE',
                    approvedAt: (isManualReserva || isManualEntrega) ? new Date().toISOString() : undefined,
                    logisticConfirmedAt: ''
                });
                reqId = createdReq?.id;
            }

            // SOLO descontar del inventario "físico" (agregar fila negativa) si es manual o baja.
            // Las solicitudes normales de Ventas (PENDIENTE) NO descuentan stock hasta ser aprobadas.
            if ((isManualReserva || isManualEntrega || isBaja) && forceStatus) {
                // Si hay ubicaciones seleccionadas manualmente, usarlas; si no (baja rápida), modo automático
                if (manualLocations.length > 0) {
                    // Descontar desde cada ubicación+canal seleccionada por el usuario
                    for (const sel of manualLocations) {
                        if (sel.quantity <= 0) continue;

                        let finalDetails = '';
                        if (isBaja) {
                            const effectiveReason = manualReason || receptorName.trim() || 'No especificado';
                            finalDetails = `[${sel.location}] BAJA - Motivo: ${effectiveReason}`;
                        } else {
                            finalDetails = `[${sel.location}] Receptor: ${receptorName.trim() || requestName.trim()}${reqId ? ` ||REQ:${reqId}` : ''}`;
                        }

                        await inventoryService.addProduct({
                            code: baseProduct.code,
                            name: baseProduct.name,
                            stock: -sel.quantity,
                            details: finalDetails,
                            channel: sel.channel,
                            entryDate: getLocalDateString(),
                            registeredBy: currentUser?.email || 'Bodega'
                        });
                        await new Promise(r => setTimeout(r, 350));
                    }
                } else {
                    // Modo automático (usado solo en bajas rápidas sin selección)
                    let remainingToDeduct = Number(requestQty);

                    const locationsWithStock = products
                        .filter(p => p.stock > 0)
                        .sort((a, b) => a.stock - b.stock);

                    for (const locProduct of locationsWithStock) {
                        if (remainingToDeduct <= 0) break;

                        const deductFromThisLoc = Math.min(locProduct.stock, remainingToDeduct);

                        let locName = getCleanLocation(locProduct.details);
                        if (locName.toUpperCase().includes('BAJA') || locName.toUpperCase().includes('ENTREGA') || locName.toUpperCase().includes('RECEPTOR')) {
                            locName = 'Sin ubicación';
                        }

                        let finalDetails = '';
                        if (isBaja) {
                            const effectiveReason = manualReason || receptorName.trim() || 'No especificado';
                            finalDetails = `[${locName}] BAJA - Motivo: ${effectiveReason}`;
                        } else {
                            finalDetails = `[${locName}] Receptor: ${receptorName.trim() || requestName.trim()}${reqId ? ` ||REQ:${reqId}` : ''}`;
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

                    if (remainingToDeduct > 0) {
                        const finalReason = manualReason || receptorName.trim() || 'No especificado';
                        await inventoryService.addProduct({
                            code: baseProduct.code,
                            name: baseProduct.name,
                            stock: -remainingToDeduct,
                            details: isBaja ? `BAJA - Motivo: ${finalReason}` : `ENTREGA - Receptor: ${receptorName.trim() || requestName.trim()}${reqId ? ` ||REQ:${reqId}` : ''}`,
                            channel: baseProduct.channel || '',
                            entryDate: getLocalDateString(),
                            registeredBy: currentUser?.email || 'Bodega'
                        });
                    }
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
                setManualLocations([]);
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
        if (Number(requestQty) < 1 || Number(requestQty) > totalStock) {
            showError('Cantidad inválida o superior al stock disponible.');
            return;
        }

        if (isManualMode) {
            addToAdminCart({
                productCode: baseProduct.code,
                name: baseProduct.name,
                quantity: Number(requestQty),
                maxStock: totalStock,
                imageUrl: baseProduct.imageUrl,
                channel: baseProduct.channel,
                location: locationSuggestions.length === 1 ? locationSuggestions[0] : (locationSuggestions.length > 1 ? 'Varias ubicaciones' : undefined)
            });
            showSuccess(`${baseProduct.name} añadido a Lista Masiva.`);
        } else {
            // Pasar el producto con el stock total neto (sumado de todas las ubicaciones)
            addToCart({ ...baseProduct, stock: totalStock }, Number(requestQty));
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
            {isImageModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsImageModalOpen(false)}>
                    <button className="absolute top-6 right-6 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors" onClick={() => setIsImageModalOpen(false)}>
                        <X size={32} />
                    </button>
                    {baseProduct.imageUrl && (
                        <img src={baseProduct.imageUrl} alt={baseProduct.name} className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
                    )}
                </div>,
                document.body
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

                            {allChannels.length > 0 && (
                                <div className="flex flex-wrap gap-2 transition-all animate-in fade-in slide-in-from-left-4 duration-500 delay-200">
                                    {allChannels.map(ch => (
                                        <span key={ch} className="inline-block px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold tracking-widest uppercase mb-3 border border-gray-200 shadow-sm">
                                            {ch}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 bg-gray-50/50 p-5 rounded-2xl border border-gray-100/50 w-full mb-2">
                            <div className="flex flex-col">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                                    Descripción
                                </span>
                                <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight leading-tight">{baseProduct.name}</h2>
                            </div>
                            <div className="flex flex-col">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                                    Más Detalles
                                </span>
                                <p className="text-gray-600 text-[13px] leading-relaxed uppercase font-medium line-clamp-2">{baseProduct.description || 'Sin descripción'}</p>
                            </div>
                            <div className="flex flex-col">
                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                                    Ubicaciones
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.keys(stockByLocation).filter(l => l !== 'Sin ubicación' && stockByLocation[l] > 0).length > 0 ? (
                                        Object.keys(stockByLocation)
                                            .filter(l => l !== 'Sin ubicación' && stockByLocation[l] > 0)
                                            .map(loc => (
                                                <span key={loc} className="px-2 py-0.5 bg-white border border-gray-200 text-gray-500 rounded text-[10px] font-bold uppercase shadow-sm">
                                                    {loc}
                                                </span>
                                            ))
                                    ) : (
                                        <span className="text-[11px] text-gray-400 italic">Por definir</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 min-w-[280px] w-full md:w-auto mt-6 md:mt-0">
                        <div className="bg-red-50 border border-red-100/50 p-6 rounded-2xl text-center shadow-inner">
                            <p className="text-[10px] text-red-600 font-bold uppercase tracking-widest mb-1 opacity-70">Disponible para Venta</p>
                            <p className="text-5xl font-black text-coca-red drop-shadow-sm">{totalStock}</p>
                            {pendingRequestsStock > 0 && (
                                <p className="text-[10px] text-red-800/60 font-medium mt-1 italic">
                                    ({pendingRequestsStock} UN reservadas en solicitudes)
                                </p>
                            )}

                            {/* Saldo por Canal */}
                            {Object.entries(stockByChannel).filter(([_, qty]) => qty > 0).length > 0 && (
                                <div className="mt-5 pt-4 border-t border-red-200/60 flex flex-col gap-2 text-sm">
                                    <p className="text-xs text-red-800/60 font-medium uppercase tracking-wider mb-2">Saldo por Canal</p>
                                    <div className="space-y-2">
                                        {Object.entries(stockByChannel)
                                            .filter(([_, qty]) => qty > 0)
                                            .sort((a,b) => b[1] - a[1])
                                            .map(([chan, qty]) => {
                                                const isModerno = chan.toLowerCase().includes('moderno');
                                                const isTradicional = chan.toLowerCase().includes('tradicional');
                                                const isMulticanal = chan.toLowerCase().includes('multicanal');
                                                
                                                let bgColor = 'bg-white/40 border-red-100/50 text-red-900';
                                                let badgeColor = 'bg-white text-coca-red border-red-100/30';
                                                
                                                if (isModerno) {
                                                    bgColor = 'bg-blue-50 border-blue-100 text-blue-900';
                                                    badgeColor = 'bg-white text-blue-600 border-blue-200/50';
                                                } else if (isTradicional || isMulticanal) {
                                                    bgColor = 'bg-amber-50 border-amber-100 text-amber-900';
                                                    badgeColor = 'bg-white text-amber-600 border-amber-200/50';
                                                }

                                                return (
                                                    <div key={chan} className={`flex justify-between items-center px-3 py-2 rounded-xl border ${bgColor} shadow-sm`}>
                                                        <span className="truncate pr-3 font-bold text-[11px] uppercase tracking-wider flex items-center gap-2">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${isModerno ? 'bg-blue-400' : 'bg-amber-400'}`}></div>
                                                            {chan}
                                                        </span>
                                                        <span className={`font-black text-[13px] px-2.5 py-1 rounded-lg shadow-sm border whitespace-nowrap ${badgeColor}`}>
                                                            {qty} UN
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                    </div>
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
                        {role === 'BODEGA' && (
                            <button
                                onClick={() => {
                                    setAdjustMode('transfer');
                                    setTransferFromChannel('');
                                    setTransferToChannel('');
                                    setTransferQty(1);
                                    setCountChannel('');
                                    setCountRealQty('');
                                    setIsAdjustModalOpen(true);
                                }}
                                className="w-full sm:w-auto bg-indigo-600 text-white px-6 py-4 rounded-xl hover:bg-indigo-700 transition-all hover:scale-[1.02] shadow-md hover:shadow-xl font-bold active:scale-95 text-lg flex items-center justify-center gap-2"
                            >
                                <SlidersHorizontal size={20} />
                                Ajuste
                            </button>
                        )}
                    </div>
                </div>
            </div>


            {/* ===== ADJUST MODAL ===== */}
            {isAdjustModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 border border-gray-100">
                        {/* Header */}
                        <div className="bg-indigo-600 px-6 py-5 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-white">Ajuste de Inventario</h2>
                                <p className="text-indigo-200 text-xs mt-0.5">{baseProduct?.name} · Cód. {baseProduct?.code}</p>
                            </div>
                            <button onClick={() => setIsAdjustModalOpen(false)} className="text-indigo-200 hover:text-white p-1.5 hover:bg-indigo-500 rounded-full transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Mode Tabs */}
                        <div className="flex border-b border-gray-100">
                            <button
                                onClick={() => setAdjustMode('transfer')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-colors ${
                                    adjustMode === 'transfer'
                                        ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                                        : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                <ArrowRightLeft size={16} /> Traspaso de Canal
                            </button>
                            <button
                                onClick={() => setAdjustMode('count')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-colors ${
                                    adjustMode === 'count'
                                        ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                                        : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                <ClipboardList size={16} /> Ajuste por Inventario
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {adjustMode === 'transfer' ? (
                                <>
                                    {/* Transfer Mode */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Canal Origen</label>
                                            <select
                                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                                value={transferFromChannel}
                                                onChange={e => setTransferFromChannel(e.target.value)}
                                            >
                                                <option value="">Seleccionar...</option>
                                                {ALL_CHANNELS.map(ch => (
                                                    <option key={ch} value={ch} disabled={(stockByChannel[ch] || 0) <= 0}>
                                                        {ch} ({stockByChannel[ch] || 0} UN)
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Canal Destino</label>
                                            <select
                                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                                value={transferToChannel}
                                                onChange={e => setTransferToChannel(e.target.value)}
                                            >
                                                <option value="">Seleccionar...</option>
                                                {ALL_CHANNELS.filter(ch => ch !== transferFromChannel).map(ch => (
                                                    <option key={ch} value={ch}>{ch}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Cantidad a Traspasar</label>
                                        <div className="flex items-center gap-3">
                                            <button type="button" onClick={() => setTransferQty(q => Math.max(1, Number(q) - 1))} className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-indigo-50 flex items-center justify-center font-bold text-lg text-gray-700 transition-colors">-</button>
                                            <input
                                                type="number"
                                                min="1"
                                                max={stockByChannel[transferFromChannel] || 9999}
                                                value={transferQty}
                                                onChange={e => {
                                                    const v = e.target.value;
                                                    setTransferQty(v === '' ? '' : Math.max(1, Number(v)));
                                                }}
                                                onFocus={e => e.target.select()}
                                                className="flex-1 text-center px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-lg font-black text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                            <button type="button" onClick={() => setTransferQty(q => Math.min(stockByChannel[transferFromChannel] || 9999, Number(q) + 1))} className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-indigo-50 flex items-center justify-center font-bold text-lg text-gray-700 transition-colors">+</button>
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    {transferFromChannel && transferToChannel && Number(transferQty) > 0 && (
                                        <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
                                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Vista previa del resultado</p>
                                            <div className="space-y-2">
                                                {[
                                                    { ch: transferFromChannel, before: stockByChannel[transferFromChannel] || 0, after: (stockByChannel[transferFromChannel] || 0) - Number(transferQty) },
                                                    { ch: transferToChannel, before: stockByChannel[transferToChannel] || 0, after: (stockByChannel[transferToChannel] || 0) + Number(transferQty) }
                                                ].map(({ ch, before, after }) => (
                                                    <div key={ch} className="flex items-center gap-2 text-sm">
                                                        <span className="font-bold text-indigo-700 w-28 truncate text-xs uppercase">{ch}</span>
                                                        <span className="text-gray-400">{before} UN</span>
                                                        <span className="text-gray-300">→</span>
                                                        <span className={`font-black ${after < 0 ? 'text-red-600' : after > before ? 'text-green-600' : 'text-indigo-700'}`}>{after} UN</span>
                                                        {after < 0 && <span className="text-red-500 text-[10px] font-bold">⚠ Sin stock suficiente</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    {/* Count Mode */}
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Canal a Ajustar</label>
                                        <select
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                            value={countChannel}
                                            onChange={e => { setCountChannel(e.target.value); setCountRealQty(''); }}
                                        >
                                            <option value="">Seleccionar...</option>
                                            {ALL_CHANNELS.map(ch => (
                                                <option key={ch} value={ch}>
                                                    {ch} — registrado: {stockByChannel[ch] || 0} UN
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {countChannel && (
                                        <>
                                            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
                                                <span className="text-sm text-gray-500">Stock registrado en sistema</span>
                                                <span className="text-xl font-black text-gray-900">{stockByChannel[countChannel] || 0} UN</span>
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Cantidad Real Contada Hoy</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    placeholder="Ej: 2"
                                                    value={countRealQty}
                                                    onChange={e => setCountRealQty(e.target.value === '' ? '' : Number(e.target.value))}
                                                    onFocus={e => e.target.select()}
                                                    className="w-full text-center px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-2xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                />
                                            </div>

                                            {countRealQty !== '' && countRealQty !== (stockByChannel[countChannel] || 0) && (
                                                <div className={`rounded-2xl p-4 border flex items-start gap-3 ${
                                                    Number(countRealQty) < (stockByChannel[countChannel] || 0)
                                                        ? 'bg-red-50 border-red-100'
                                                        : 'bg-green-50 border-green-100'
                                                }`}>
                                                    <div className={`p-2 rounded-full ${
                                                        Number(countRealQty) < (stockByChannel[countChannel] || 0)
                                                            ? 'bg-red-100 text-red-600'
                                                            : 'bg-green-100 text-green-600'
                                                    }`}>
                                                        {Number(countRealQty) < (stockByChannel[countChannel] || 0)
                                                            ? <AlertTriangle size={16} />
                                                            : <CheckCircle2 size={16} />}
                                                    </div>
                                                    <div>
                                                        <p className={`text-sm font-black ${
                                                            Number(countRealQty) < (stockByChannel[countChannel] || 0) ? 'text-red-700' : 'text-green-700'
                                                        }`}>
                                                            Diferencia: {Number(countRealQty) > (stockByChannel[countChannel] || 0) ? '+' : ''}{Number(countRealQty) - (stockByChannel[countChannel] || 0)} UN
                                                        </p>
                                                        <p className="text-xs text-gray-500 mt-0.5">
                                                            Se registrará un movimiento de "Ajuste de inventario" por esa diferencia.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 pb-6 flex gap-3">
                            <button
                                onClick={() => setIsAdjustModalOpen(false)}
                                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAdjust}
                                disabled={adjustIsProcessing}
                                className="flex-2 flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-md shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {adjustIsProcessing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                {adjustIsProcessing ? 'Procesando...' : adjustMode === 'transfer' ? 'Confirmar Traspaso' : 'Aplicar Ajuste'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal para Definir Ubicación Rápida */}
            {definingLocationFor && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
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
                </div>,
                document.body
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
                                <div className="flex flex-wrap gap-1.5">
                                    {['Tradicional', 'Moderno', 'Venta Hogar', 'Publicidad'].map(ch => {
                                        const isSelected = (formData.channel || '').split(',').map(c => c.trim()).includes(ch);
                                        return (
                                            <button
                                                key={ch}
                                                type="button"
                                                onClick={() => {
                                                    let current = (formData.channel || '').split(',').map(c => c.trim()).filter(Boolean);
                                                    if (current.includes(ch)) current = current.filter(c => c !== ch);
                                                    else current.push(ch);
                                                    setFormData({ ...formData, channel: current.join(', ') });
                                                }}
                                                className={`text-[11px] px-2.5 py-1.5 rounded-md border font-bold transition-colors ${isSelected ? 'bg-red-50 text-coca-red border-coca-red ring-1 ring-red-500/20' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                {ch}
                                            </button>
                                        );
                                    })}
                                </div>
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
            {productToDelete && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
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
                </div>,
                document.body
            )}
            {/* Modal de Solicitud de Venta */}
            {isRequestModalOpen && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className={`bg-white rounded-3xl shadow-xl w-full overflow-y-auto max-h-[92vh] ${isManualMode && modalStep === 2 ? 'max-w-lg' : 'max-w-sm'} p-6 relative animate-in fade-in zoom-in-95`}>
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

                            {pendingRequestsStock > 0 && (totalStock - pendingRequestsStock < Number(requestQty)) && (
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
                                        <button type="button" onClick={() => setRequestQty(Math.max(1, (Number(requestQty) || 0) - 1))} className="w-12 h-12 flex items-center justify-center bg-white rounded-lg shadow-sm font-bold text-lg hover:bg-gray-100 text-coca-red">-</button>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            min="1"
                                            max={totalStock}
                                            className="flex-1 text-center bg-transparent border-none focus:ring-0 text-xl font-bold text-gray-900 outline-none"
                                            value={requestQty}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === '') {
                                                    setRequestQty('');
                                                } else {
                                                    const parsed = parseInt(val);
                                                    if (!isNaN(parsed)) setRequestQty(Math.min(parsed, totalStock));
                                                }
                                            }}
                                            onBlur={() => {
                                                if (requestQty === '' || Number(requestQty) < 1) setRequestQty(1);
                                            }}
                                        />
                                        <button type="button" onClick={() => setRequestQty(Math.min(totalStock, (Number(requestQty) || 0) + 1))} className="w-12 h-12 flex items-center justify-center bg-coca-red text-white rounded-lg shadow-sm font-bold text-lg hover:bg-red-700">+</button>
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
                                        onClick={() => { setModalStep(2); setManualLocations([]); }}
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
                                            disabled={isRequesting || Number(requestQty) > totalStock}
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

                                {/* Selector de Canal/Ubicación para salida manual del bodeguero */}
                                {isManualMode && availableLocationsForSalida.length > 0 && (
                                    <div className="bg-red-50/40 p-4 rounded-xl border border-red-100 mb-2">
                                        <div className="flex justify-between items-center mb-3">
                                            <label className="text-sm font-bold text-red-800">Extraer desde:</label>
                                            <span className="text-xs font-semibold px-2 py-1 bg-white border border-red-200 rounded-md text-red-700 shadow-sm">
                                                Selec: <span className="font-bold">{manualLocations.reduce((a, c) => a + c.quantity, 0)}</span> / {Number(requestQty)}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {availableLocationsForSalida.map(locKey => {
                                                const [ch, loc] = locKey.split('|||');
                                                const maxAvailable = getStockInLocationAndChannel(loc, ch);
                                                const currentQty = manualLocations.find(m => m.location === loc && m.channel === ch)?.quantity || 0;
                                                const totalSelected = manualLocations.reduce((a, c) => a + c.quantity, 0);
                                                const canAdd = currentQty < maxAvailable && totalSelected < Number(requestQty);
                                                return (
                                                    <div key={locKey} className={`bg-white border rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors ${currentQty > 0 ? 'border-red-400 ring-1 ring-red-400/20' : 'border-red-200'}`}>
                                                        <div className="flex-1 min-w-0 pr-3">
                                                            <div className="text-[10px] font-black uppercase text-coca-red tracking-widest bg-red-50 inline-block px-1.5 py-0.5 rounded mb-1 border border-red-100">{ch || 'Sin Canal'}</div>
                                                            <div className="text-sm font-bold text-gray-800 truncate" title={loc}>{loc}</div>
                                                            <div className="text-xs text-gray-500 mt-0.5">Stock: <span className="font-bold text-gray-700">{maxAvailable}</span></div>
                                                        </div>
                                                        <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-100 shrink-0">
                                                            <button type="button" disabled={currentQty === 0} onClick={() => {
                                                                const newArr = [...manualLocations];
                                                                const idx = newArr.findIndex(m => m.location === loc && m.channel === ch);
                                                                if (idx >= 0) {
                                                                    if (newArr[idx].quantity > 1) { newArr[idx].quantity -= 1; } else { newArr.splice(idx, 1); }
                                                                    setManualLocations(newArr);
                                                                }
                                                            }} className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300 disabled:opacity-40 transition-colors shadow-sm cursor-pointer">
                                                                <span className="text-lg font-bold leading-none select-none">-</span>
                                                            </button>
                                                            <span className="font-bold text-gray-900 w-8 text-center select-none">{currentQty}</span>
                                                            <button type="button" disabled={!canAdd} onClick={() => {
                                                                const newArr = [...manualLocations];
                                                                const idx = newArr.findIndex(m => m.location === loc && m.channel === ch);
                                                                if (idx >= 0) { newArr[idx].quantity += 1; } else { newArr.push({ location: loc, quantity: 1, channel: ch }); }
                                                                setManualLocations(newArr);
                                                            }} className="w-8 h-8 flex items-center justify-center rounded-md bg-coca-red text-white hover:bg-coca-black disabled:opacity-40 transition-colors shadow-sm cursor-pointer">
                                                                <span className="text-lg font-bold leading-none select-none">+</span>
                                                            </button>
                                                            <button type="button" disabled={!canAdd} onClick={() => {
                                                                const currentTotal = manualLocations.reduce((s, i) => s + i.quantity, 0);
                                                                const currentInLoc = manualLocations.find(m => m.location === loc && m.channel === ch)?.quantity || 0;
                                                                const needed = Number(requestQty) - currentTotal;
                                                                const availableInLoc = maxAvailable - currentInLoc;
                                                                const toAdd = Math.min(needed, availableInLoc);
                                                                if (toAdd > 0) {
                                                                    const newArr = [...manualLocations];
                                                                    const idx = newArr.findIndex(m => m.location === loc && m.channel === ch);
                                                                    if (idx >= 0) { newArr[idx].quantity += toAdd; } else { newArr.push({ location: loc, quantity: toAdd, channel: ch }); }
                                                                    setManualLocations(newArr);
                                                                }
                                                            }} className="ml-2 px-2 h-8 flex items-center justify-center rounded-md bg-red-100 text-red-700 font-black text-[10px] uppercase tracking-tighter hover:bg-red-200 disabled:opacity-40 transition-all border border-red-200">
                                                                MAX
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {manualLocations.reduce((a, c) => a + c.quantity, 0) !== Number(requestQty) && (
                                            <p className="text-xs text-red-600 font-semibold mt-2 text-center">
                                                ⚠ Debes seleccionar exactamente {Number(requestQty)} unidades en total
                                            </p>
                                        )}
                                    </div>
                                )}

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
                                        {(() => {
                                            const locationAllocated = availableLocationsForSalida.length === 0 || manualLocations.reduce((a, c) => a + c.quantity, 0) === Number(requestQty);
                                            return (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleCreateRequest(e, 'ENTREGADA')}
                                                        disabled={isRequesting || Number(requestQty) > totalStock || !requestName.trim() || !locationAllocated}
                                                        className={`w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 transition-all shadow-md
                                                            ${isRequesting || Number(requestQty) > totalStock || !requestName.trim() || !locationAllocated ? 'bg-gray-400 cursor-not-allowed' : 'bg-coca-black hover:bg-black hover:shadow-lg'}`}
                                                    >
                                                        {isRequesting ? <Loader2 size={20} className="animate-spin" /> : <X size={20} />}
                                                        {isRequesting ? 'Procesando...' : 'Salida Directa (Descontar ya)'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleCreateRequest(e, 'APROBADA')}
                                                        disabled={isRequesting || Number(requestQty) > totalStock || !requestName.trim() || !locationAllocated}
                                                        className={`w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 transition-all shadow-md
                                                            ${isRequesting || Number(requestQty) > totalStock || !requestName.trim() || !locationAllocated ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 hover:shadow-lg'}`}
                                                    >
                                                        {isRequesting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                                        {isRequesting ? 'Procesando...' : 'Reservar (Dejar Por Retirar)'}
                                                    </button>
                                                </>
                                            );
                                        })()}
                                        <div className="relative flex py-2 items-center">
                                            <div className="flex-grow border-t border-gray-200"></div>
                                            <span className="flex-shrink-0 mx-4 text-gray-400 font-medium text-xs uppercase tracking-widest">Otras Opciones</span>
                                            <div className="flex-grow border-t border-gray-200"></div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBajaReason(receptorName); // Pre-cargar si escribió algo en el campo receptor
                                                setIsBajaPromptOpen(true);
                                            }}
                                            disabled={isRequesting || Number(requestQty) > totalStock}
                                            className={`w-full py-3.5 rounded-xl font-bold text-amber-900 flex justify-center items-center gap-2 transition-all shadow-sm border border-amber-200
                                                ${isRequesting || Number(requestQty) > totalStock ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 'bg-amber-100 hover:bg-amber-200'}`}
                                        >
                                            {isRequesting ? <Loader2 size={18} className="animate-spin" /> : <AlertTriangle size={18} />}
                                            {isRequesting ? 'Procesando...' : 'Dar de Baja (Dañado/Merma)'}
                                        </button>
                                    </div>
                                ) : (
                                    <button type="submit" disabled={isRequesting || Number(requestQty) > totalStock || !requestName.trim()} className={`w-full py-4 rounded-xl font-bold text-white flex justify-center items-center gap-2 transition-all shadow-md
                                        ${isRequesting || Number(requestQty) > totalStock || !requestName.trim() ? 'bg-gray-400 cursor-not-allowed text-gray-100' : 'bg-coca-red hover:bg-red-700 hover:shadow-lg'}`}>
                                        {isRequesting ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                        {isRequesting ? 'Enviando a Bodega...' : 'Confirmar Petición Directa'}
                                    </button>
                                )}
                            </form>
                        )}
                    </div>
                </div>,
                document.body
            )}
            <div className="md:hidden mt-8 text-center pt-8 border-t">
                <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-coca-black inline-flex items-center gap-2 font-medium">
                    <ArrowLeft size={18} /> Volver
                </button>
            </div>
            {/* Modal para Motivo de Baja Rápida */}
            {isBajaPromptOpen && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
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
                                    Estás a punto de descontar <strong>{Number(requestQty)} UN</strong> del inventario.
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
                                        const reason = bajaReason.trim() || 'No especificado';
                                        setReceptorName(reason);
                                        handleCreateRequest(e, 'BAJA', reason);
                                    }}
                                    disabled={isRequesting}
                                    className="flex-1 cursor-pointer px-4 py-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-xl font-bold transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isRequesting ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Baja'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
