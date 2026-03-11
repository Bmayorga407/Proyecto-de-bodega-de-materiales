import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Plus, Minus, Save, Loader2, CheckCircle2, Eye, AlertTriangle, X, ArrowUpRight, Check, PackageCheck, Clock, Archive, User, ArrowUpDown, RotateCcw, Filter, ChevronDown, Truck, Search, CalendarDays, Trash2, Package, UserCircle } from 'lucide-react';
import { OrderRequest, Product } from '../types';
import { inventoryService } from '../services/inventoryService';
import { useAuth } from '../context/AuthContext';
import { useAdminCart } from '../context/AdminCartContext';

const getLocalDateString = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
};

const getCleanLocation = (details: any): string => {
    const str = String(details || '').trim();
    if (!str) return '';
    // Extraer solo lo que está entre el primer par de corchetes, o devolver todo si no hay
    const match = str.match(/\[(.*?)\]/);
    if (match) return match[1].trim();
    return str;
};

const ALL_CHANNELS = ['Tradicional', 'Moderno', 'Venta Hogar', 'Publicidad'];

export default function InventoryAdmin() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { adminCart, addToAdminCart, removeFromAdminCart, updateAdminQuantity, totalAdminItems, clearAdminCart } = useAdminCart();
    const [formMode, setFormMode] = useState<'none' | 'ingreso' | 'salida'>('none');

    // Auto-focus code input when opening form
    useEffect(() => {
        if (formMode !== 'none') {
            setTimeout(() => {
                const input = document.getElementById('main-code-input');
                if (input) input.focus();
            }, 350); // duration of the slide-in animation
        }
    }, [formMode]);

    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = (searchParams.get('tab') as any) || 'inventario';
    const highlightReqId = searchParams.get('highlightReqId');

    const setActiveTab = (tab: 'inventario' | 'solicitudes' | 'por_retirar') => {
        setSearchParams({ tab });
    };
    const [adminSearchTerm, setAdminSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingRequest, setIsProcessingRequest] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [requests, setRequests] = useState<OrderRequest[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [showArchivedAdmin, setShowArchivedAdmin] = useState(false);
    const [sortNewestFirst, setSortNewestFirst] = useState(true);
    const [channelWarning, setChannelWarning] = useState('');
    const [lastActionIds, setLastActionIds] = useState<string[]>([]);
    const [isUndoing, setIsUndoing] = useState(false);
    const [selectedChannels, setSelectedChannels] = useState<string[]>(ALL_CHANNELS);
    const [showChannelFilter, setShowChannelFilter] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<OrderRequest | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [returnStockOnDelete] = useState(true);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkType, setBulkType] = useState<'ENTREGA' | 'BAJA' | null>(null);
    const [bulkReceptor, setBulkReceptor] = useState('');
    const [bulkReason, setBulkReason] = useState('');

    const handleBulkProcess = async () => {
        if (!bulkType || adminCart.length === 0) return;

        setIsProcessingRequest(true);
        setErrorMsg('');

        try {
            for (const item of adminCart) {
                if (bulkType === 'BAJA') {
                    // Buscar todas las instancias de este producto (por código y canal) para ver ubicaciones con stock
                    const targetCode = String(item.productCode).trim().toUpperCase();
                    const targetChannel = (item.channel || '').trim().toUpperCase();

                    const locationsWithStock = allProducts.filter(p => {
                        const pCode = String(p.code || '').trim().toUpperCase();
                        const pChannel = (p.channel || '').trim().toUpperCase();
                        // Filtrar por código y canal exacto, con stock positivo
                        return pCode === targetCode &&
                            (!targetChannel || pChannel === targetChannel) &&
                            Number(p.stock) > 0;
                    }).sort((a, b) => Number(a.stock) - Number(b.stock)); // FIFO aproximado (o menor stock primero)

                    let remainingToDeduct = item.quantity;

                    if (locationsWithStock.length > 0) {
                        for (const locProd of locationsWithStock) {
                            if (remainingToDeduct <= 0) break;
                            const currentStock = Number(locProd.stock);
                            const canDeduct = Math.min(currentStock, remainingToDeduct);

                            let locName = getCleanLocation(locProd.details);
                            // Si la ubicación extraída parece un movimiento previo, fallback a genérico
                            if (locName.toUpperCase().includes('BAJA') || locName.toUpperCase().includes('ENTREGA') || locName.toUpperCase().includes('RECEPTOR')) {
                                locName = 'Sin ubicación';
                            }

                            await inventoryService.addProduct({
                                code: item.productCode,
                                name: item.name,
                                stock: -canDeduct,
                                details: `[${locName}] BAJA - Motivo: ${bulkReason || 'No especificado'}`,
                                channel: item.channel || '',
                                registeredBy: currentUser?.email || 'admin'
                            });

                            remainingToDeduct -= canDeduct;
                            if (adminCart.length > 1 || locationsWithStock.length > 1) await new Promise(res => setTimeout(res, 400));
                        }
                    }

                    // Si todavía sobra algo por descontar (o no había stock positivo detectado)
                    if (remainingToDeduct > 0) {
                        await inventoryService.addProduct({
                            code: item.productCode,
                            name: item.name,
                            stock: -remainingToDeduct,
                            details: `BAJA - Motivo: ${bulkReason || 'No especificado'}`,
                            channel: item.channel || '',
                            registeredBy: currentUser?.email || 'admin'
                        });
                        if (adminCart.length > 1) await new Promise(res => setTimeout(res, 400));
                    }
                } else {
                    // Proceso normal de ENTREGA
                    const locTag = item.location && item.location !== 'Varias ubicaciones' ? `[${item.location.trim()}] ` : '';
                    const detail = `${locTag}ENTREGA - Receptor: ${bulkReceptor}`;

                    await inventoryService.addProduct({
                        code: item.productCode,
                        name: item.name,
                        stock: -Math.abs(item.quantity),
                        details: detail,
                        channel: item.channel || '',
                        registeredBy: currentUser?.email || 'admin'
                    });

                    if (adminCart.length > 1) await new Promise(res => setTimeout(res, 500));
                }
            }

            await loadData();
            setSuccessMsg(`Se han procesado ${adminCart.length} salidas con éxito.`);
            clearAdminCart();
            setShowBulkModal(false);
            setBulkReceptor('');
            setBulkReason('');
        } catch (err) {
            console.error('Error in bulk process:', err);
            setErrorMsg('Hubo un error al procesar algunas salidas.');
        } finally {
            setIsProcessingRequest(false);
            setTimeout(() => setSuccessMsg(''), 5000);
        }
    };

    const filteredProducts = useMemo(() => {
        // Si todos están seleccionados, mostrar todo (incluso sin canal)
        if (selectedChannels.length === ALL_CHANNELS.length) return products;
        // Si hay un filtro activo, solo mostrar coincidencias exactas y ocultar los vacíos
        return products.filter(p => p.channel && selectedChannels.includes(p.channel));
    }, [products, selectedChannels]);

    const activeProducts = useMemo(() => {
        let list = filteredProducts.filter(p => p.stock > 0);
        if (sortNewestFirst) list = [...list].reverse();
        return list;
    }, [filteredProducts, sortNewestFirst]);

    const archivedProducts = useMemo(() => {
        let list = filteredProducts.filter(p => p.stock <= 0);
        if (sortNewestFirst) list = [...list].reverse();
        return list;
    }, [filteredProducts, sortNewestFirst]);

    // Form state
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '', code: '', description: '', stock: 0, details: '', channel: '', imageUrl: '', entryDate: getLocalDateString()
    });
    const [conflictData, setConflictData] = useState<{ existing: Product, submitted: Partial<Product> } | null>(null);
    const [requestConfirm, setRequestConfirm] = useState<{ req: OrderRequest, status: OrderRequest['status'] } | null>(null);
    const [requestLocations, setRequestLocations] = useState<{ location: string, quantity: number }[]>([]);
    const [bulkApprovalQueue, setBulkApprovalQueue] = useState<OrderRequest[]>([]);
    const [manualLocations, setManualLocations] = useState<{ location: string, quantity: number }[]>([]);

    const showError = (msg: string) => {
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(''), 4500); // Auto-hide after 4.5s
    };

    const loadData = async () => {
        try {
            console.log('Starting loadData...');
            setIsLoading(true);
            const [productsData, requestsData] = await Promise.all([
                inventoryService.fetchProducts(),
                inventoryService.fetchRequests()
            ]);
            console.log('API responded', { productsData, requestsData });
            setAllProducts(productsData);

            // Group products by code + channel
            const aggregatedMap = new Map<string, Product>();
            productsData.forEach((p) => {
                if (!p.code) {
                    console.warn('Product missing code:', p);
                    return;
                }
                const channel = (p.channel || '').trim();
                const codeKey = `${p.code.trim().toLowerCase()}|${channel.toLowerCase()}`;

                if (!codeKey) return;
                if (aggregatedMap.has(codeKey)) {
                    const existing = aggregatedMap.get(codeKey)!;
                    existing.stock += p.stock;
                    if (!existing.imageUrl && p.imageUrl) existing.imageUrl = p.imageUrl;
                } else {
                    aggregatedMap.set(codeKey, { ...p });
                }
            });

            console.log('Aggregation done. Total distinct products:', aggregatedMap.size);
            setProducts(Array.from(aggregatedMap.values()));

            // Set Requests (sort pending first, then by date descending)
            const sortedRequests = requestsData.sort((a, b) => {
                if (a.status === 'PENDIENTE' && b.status !== 'PENDIENTE') return -1;
                if (b.status === 'PENDIENTE' && a.status !== 'PENDIENTE') return 1;
                return new Date(b.dateRequested).getTime() - new Date(a.dateRequested).getTime();
            });
            setRequests(sortedRequests);
            console.log('loadData fully completed');
        } catch (e) {
            console.error('CRITICAL ERROR IN loadData:', e);
        } finally {
            console.log('Setting isLoading to false');
            setIsLoading(false);
        }
    };

    const handleBulkRequestStatus = async (group: OrderRequest[], newStatus: string) => {
        if (isProcessingRequest) return;
        // Para APROBADA, usar la cola secuencial con modal de ubicación
        if (newStatus === 'APROBADA') {
            setBulkApprovalQueue(group.slice(1));
            setRequestLocations([]);
            setRequestConfirm({ req: group[0], status: 'APROBADA' });
            return;
        }
        // Para RECHAZADA, procesar masivamente (no requiere stock ni ubicación)
        setIsProcessingRequest(true);
        try {
            const now = new Date().toISOString();
            for (const req of group) {
                await inventoryService.updateRequest(req.id, {
                    ...req,
                    status: newStatus,
                    processedBy: currentUser?.email || 'Bodega Desconocida',
                    approvedAt: newStatus === 'APROBADA' ? now : (req.approvedAt || '')
                });
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            setErrorMsg('');
            loadData();
        } catch (error) {
            console.error('Error in bulk request:', error);
            showError('Ocurrió un error al procesar el lote');
        } finally {
            setIsProcessingRequest(false);
        }
    };

    const advanceBulkApprovalQueue = () => {
        if (bulkApprovalQueue.length > 0) {
            const next = bulkApprovalQueue[0];
            setBulkApprovalQueue(prev => prev.slice(1));
            setRequestLocations([]);
            setRequestConfirm({ req: next, status: 'APROBADA' });
        } else {
            setBulkApprovalQueue([]);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Efecto para expandir y resaltar la solicitud que viene desde movimientos
    useEffect(() => {
        if (!highlightReqId || requests.length === 0) return;

        const req = requests.find(r => r.id === highlightReqId);
        if (!req) return;

        const isWaitingForLogistics = (r: OrderRequest) => r.status === 'ENTREGADA' && !r.logisticConfirmedAt && !!r.requesterEmail?.toLowerCase().includes('logistica');
        const isPending = req.status === 'PENDIENTE' || req.status === 'APROBADA' || isWaitingForLogistics(req);

        // Agrupar usando la misma lógica del render (margen de 5 mins)
        const date = new Date(req.dateRequested);
        const timeKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${Math.floor(date.getMinutes() / 5)}`;
        const groupKey = `${req.requestedBy}-${req.receptorName || ''}-${timeKey}`;

        // Abrir los acordeones que contienen la solicitud
        if (isPending) {
            setExpandedGroups(prev => ({ ...prev, [groupKey]: true }));
        } else {
            setExpandedGroups(prev => ({ ...prev, '__processed__': true, [`proc-${groupKey}`]: true }));
        }

        // Hacer scroll hasta el contenedor
        setTimeout(() => {
            const el = document.getElementById(`req-${highlightReqId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 300);

    }, [highlightReqId, requests]);

    const getAvailableStockInLocation = (code: string, location: string, excludeRequestId?: string): number => {
        const locationStock: Record<string, number> = {};
        let unallocatedNeg = 0;

        const productHistory = allProducts.filter(p => (p.code || '').toLowerCase() === code.toLowerCase());

        let pendingRequestsStock = 0;
        requests.forEach(r => {
            if (r.status === 'PENDIENTE' && (r.productCode || '').toLowerCase() === code.toLowerCase() && r.id !== excludeRequestId) {
                pendingRequestsStock += Number(r.quantity) || 0;
            }
        });

        productHistory.forEach(p => {
            const qty = Number(p.stock) || 0;
            const loc = getCleanLocation(p.details) || 'Sin ubicación';
            
            if (qty > 0) {
                locationStock[loc] = (locationStock[loc] || 0) + qty;
            } else {
                // Si es negativo y tiene ubicación explícita en los brackets
                if (String(p.details || '').includes('[')) {
                    locationStock[loc] = (locationStock[loc] || 0) + qty;
                } else {
                    unallocatedNeg += qty;
                }
            }
        });

        unallocatedNeg -= pendingRequestsStock;

        if (unallocatedNeg < 0) {
            for (const loc of Object.keys(locationStock)) {
                if (unallocatedNeg >= 0) break;
                if (locationStock[loc] > 0) {
                    const available = locationStock[loc];
                    const deduction = Math.min(available, Math.abs(unallocatedNeg));
                    locationStock[loc] -= deduction;
                    unallocatedNeg += deduction;
                }
            }
        }

        return locationStock[location] || 0;
    };

    const handleUpdateReqStatus = async (req: OrderRequest, status: OrderRequest['status'], locations?: { location: string, quantity: number }[]) => {
        let finalQuantity = req.quantity;

        // Validation for APROBADA: check stock availability before reserving
        if (status === 'APROBADA' && locations && locations.length > 0) {
            const totalQty = locations.reduce((sum, item) => sum + item.quantity, 0);
            if (totalQty === 0) {
                showError('Debes seleccionar al menos 1 unidad para reservar.');
                return;
            }
            if (totalQty > req.quantity) {
                showError(`Error: Has seleccionado (${totalQty}) pero solo pidió (${req.quantity}).`);
                return;
            }
            finalQuantity = totalQty;

            for (const item of locations) {
                const availableInLocation = getAvailableStockInLocation(req.productCode, item.location, req.id);
                if (availableInLocation < item.quantity) {
                    showError(`Error: No puedes reservar ${item.quantity} UN. La ubicación "${item.location}" solo cuenta con ${availableInLocation} UN.`);
                    return;
                }
            }
        }

        setIsProcessingRequest(true);
        try {
            const now = new Date().toISOString();
            await inventoryService.updateRequest(req.id, {
                ...req,
                quantity: finalQuantity,
                status,
                processedBy: currentUser?.email || 'Bodega Desconocida',
                approvedAt: status === 'APROBADA' ? now : (req.approvedAt || '')
            });

            // When APPROVING: register exit (negative stock row) to maintain history
            if (status === 'APROBADA') {
                if (locations && locations.length > 0) {
                    for (const item of locations) {
                        // Find any product entry that matches the cleaned location
                        const originalProduct = allProducts.find(p =>
                            p.code.toLowerCase() === req.productCode.toLowerCase() &&
                            getCleanLocation(p.details) === item.location &&
                            p.stock > 0
                        );
                        await inventoryService.addProduct({
                            code: req.productCode,
                            name: req.productName,
                            description: req.productName,
                            stock: -Math.abs(item.quantity),
                            details: `[${item.location}] Receptor: ${req.receptorName || req.requestedBy.split('@')[0]} ||REQ:${req.id}`,
                            channel: originalProduct?.channel || '',
                            imageUrl: originalProduct?.imageUrl || '',
                            entryDate: new Date().toISOString().split('T')[0],
                            registeredBy: `Solicitud aprobada para: ${req.requestedBy.split('@')[0]}`
                        });
                        await new Promise(res => setTimeout(res, 400));
                    }
                } else {
                    // No specific locations — find any product with this code to get channel
                    const originalProduct = allProducts.find(p =>
                        p.code.toLowerCase() === req.productCode.toLowerCase() && p.stock > 0
                    );
                    await inventoryService.addProduct({
                        code: req.productCode,
                        name: req.productName,
                        description: req.productName,
                        stock: -Math.abs(finalQuantity),
                        details: originalProduct?.details ? `[${getCleanLocation(originalProduct.details)}] Receptor: ${req.receptorName || req.requestedBy.split('@')[0]} ||REQ:${req.id}` : `Receptor: ${req.receptorName || req.requestedBy.split('@')[0]} ||REQ:${req.id}`,
                        channel: originalProduct?.channel || '',
                        imageUrl: originalProduct?.imageUrl || '',
                        entryDate: new Date().toISOString().split('T')[0],
                        registeredBy: `Solicitud aprobada para: ${req.requestedBy.split('@')[0]}`
                    });
                }
            }
            // When DELIVERED (Confirmar Retiro): update the history row text to say 'Entregada'
            if (status === 'ENTREGADA') {
                const historyRows = allProducts.filter(p =>
                    p.code.toLowerCase() === req.productCode.toLowerCase() &&
                    p.stock < 0 &&
                    p.registeredBy &&
                    p.registeredBy.includes(`aprobada para: ${req.requestedBy.split('@')[0]}`)
                );

                for (const row of historyRows) {
                    if (row.id) {
                        await inventoryService.updateProduct(row.id, {
                            ...row,
                            registeredBy: `Entregado a: ${req.requestedBy.split('@')[0]}`
                        });
                        await new Promise(res => setTimeout(res, 300));
                    }
                }
            }

            await loadData(); // Reload both lists
        } catch (error) {
            console.error(error);
            showError('Hubo un error al actualizar la solicitud.');
        } finally {
            setIsProcessingRequest(false);
        }
    };

    const handleDeleteRequest = (req: OrderRequest) => {
        setDeleteConfirm(req);
    };

    const executeDeleteRequest = async () => {
        if (!deleteConfirm) return;

        const req = deleteConfirm;
        const isApprovedOrDelivered = req.status === 'APROBADA' || req.status === 'ENTREGADA';

        setDeleteConfirm(null);
        setIsProcessingRequest(true);
        try {
            // STEP 1: Fetch ALL product rows fresh to find linked movements
            const allMovements = await inventoryService.fetchProducts();
            const linkedMovements = allMovements.filter((p: any) =>
                p.details && p.details.includes(` ||REQ:${req.id}`)
            );

            // STEP 2: Delete linked movements (stock naturally returns by removing the negative row)
            if (linkedMovements.length > 0) {
                console.log(`Eliminando ${linkedMovements.length} movimientos vinculados a solicitud ${req.id}...`);
                for (const m of linkedMovements) {
                    if (m.id) await inventoryService.deleteProduct(m.id);
                }
            }

            // STEP 3: Delete the request
            await inventoryService.deleteRequest(req.id);
            await new Promise(res => setTimeout(res, 500));

            // STEP 4: Only do manual stock return for OLD requests that predate the linking system
            // (no linked movement found = legacy request without ||REQ:ID)
            if (isApprovedOrDelivered && returnStockOnDelete && linkedMovements.length === 0) {
                const originalProduct = allProducts.find((p: any) => p.code.toLowerCase() === req.productCode.toLowerCase());
                await inventoryService.addProduct({
                    code: req.productCode,
                    name: req.productName,
                    description: `Devolución (Manual) por anulación: ${req.requestedBy.split('@')[0]}`,
                    stock: req.quantity,
                    details: 'Por definir (Anulación)',
                    channel: originalProduct?.channel || '',
                    imageUrl: originalProduct?.imageUrl || '',
                    entryDate: new Date().toISOString().split('T')[0],
                    registeredBy: currentUser?.email || 'Bodega Desconocida'
                });
            }

            await loadData();
        } catch (error) {
            console.error('Error deleting request:', error);
            showError('Hubo un error al eliminar la solicitud. Asegúrate de que el servidor se haya reiniciado para cargar los cambios de la API.');
        } finally {
            setIsProcessingRequest(false);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
        }
    };

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newCode = e.target.value;
        const matched = products.find(p => p.code.toLowerCase() === newCode.toLowerCase());

        if (matched) {
            const pastEntries = allProducts.filter(p => p.code.toLowerCase() === newCode.toLowerCase() && p.stock > 0 && p.details);
            const lastLocation = pastEntries.length > 0 ? [...pastEntries].sort((a, b) => new Date(a.entryDate || 0).getTime() - new Date(b.entryDate || 0).getTime()).pop()?.details : '';

            setFormData(prev => ({
                ...prev,
                code: newCode,
                name: matched.name,
                description: matched.description,
                channel: matched.channel || prev.channel,
                imageUrl: matched.imageUrl || prev.imageUrl,
                details: formMode === 'ingreso' ? (lastLocation || prev.details) : prev.details
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                code: newCode,
                name: '',
                description: '',
                channel: '',
                imageUrl: ''
            }));
        }
        setChannelWarning('');
    };

    const confirmCode = () => {
        // En focos al presionar ENTER, saltamos al stock si el código es válido
        const matched = products.some(p => p.code.toLowerCase() === formData.code?.toLowerCase());
        if (matched) {
            const stockInput = document.getElementById('fast-entry-stock');
            if (stockInput) stockInput.focus();
        }
    };

    const handleUndo = async () => {
        if (lastActionIds.length === 0 || isUndoing) return;
        setIsUndoing(true);
        try {
            await Promise.all(lastActionIds.map(id => inventoryService.deleteProduct(id)));
            setSuccessMsg('Registro deshecho correctamente.');
            setLastActionIds([]);
            loadData();
        } catch (error) {
            console.error('Error undoing:', error);
            setErrorMsg('No se pudo deshacer el registro.');
        } finally {
            setIsUndoing(false);
            setTimeout(() => setSuccessMsg(''), 3000);
        }
    };

    const handleChannelChange = (val: string) => {
        setFormData(prev => ({ ...prev, channel: val }));
        const existingProduct = products.find(p => p.code.toLowerCase() === formData.code?.toLowerCase());
        if (existingProduct && existingProduct.channel && existingProduct.channel !== val) {
            setChannelWarning(`Nota: Este código está asociado al canal "${existingProduct.channel}".`);
        } else {
            setChannelWarning('');
        }
    };

    const executeSave = async (dataToSave: Partial<Product>, forceStatus?: 'APROBADA' | 'ENTREGADA') => {
        let itemsToSave: Partial<Product>[] = [];

        // Validation for SALIDA
        if (formMode === 'salida') {
            const existing = products.find(p => p.code.toLowerCase() === dataToSave.code?.toLowerCase());
            const requestedStock = dataToSave.stock || 0;

            if (!existing) {
                showError("Error: El código ingresado no existe en el inventario.");
                return;
            }
            if (existing.stock < requestedStock) {
                showError(`Error: Stock insuficiente. Solo hay ${existing.stock} UN de ${existing.name}.`);
                return;
            }

            // Validar stock específico de TODAS las ubicaciones seleccionadas
            const hasAvailableLocs = allProducts.some(p => p.code.toLowerCase() === dataToSave.code?.toLowerCase() && p.details && p.details.trim() !== '' && p.stock > 0);

            if (hasAvailableLocs && manualLocations.length === 0) {
                showError("Error: Usa los botones de '+' para extraer las unidades desde las ubicaciones disponibles antes de guardar.");
                return;
            }

            if (manualLocations.length > 0) {
                const totalManualQty = manualLocations.reduce((sum, item) => sum + item.quantity, 0);
                if (totalManualQty !== requestedStock) {
                    showError(`Error: La suma de ubicaciones (${totalManualQty}) no coincide con la cantidad a retirar (${requestedStock}).`);
                    return;
                }

                for (const item of manualLocations) {
                    const availableInLocation = getAvailableStockInLocation(existing.code, item.location);
                    if (availableInLocation < item.quantity) {
                        showError(`Error: La ubicación "${item.location}" solo cuenta con ${availableInLocation} UN.`);
                        return;
                    }
                }

                // Generar un registro por cada ubicación
                itemsToSave = manualLocations.map(item => {
                    const locData = allProducts.find(p => p.code.toLowerCase() === existing.code.toLowerCase() && p.details?.trim() === item.location.trim() && p.stock > 0);
                    return {
                        ...dataToSave,
                        stock: -Math.abs(item.quantity),
                        details: `[${getCleanLocation(item.location)}] Receptor: ${dataToSave.details || 'No especificado'}`,
                        channel: locData?.channel || dataToSave.channel || existing.channel,
                        imageUrl: locData?.imageUrl || existing.imageUrl
                    };
                });
            } else {
                // Sin ubicaciones especificas (comportamiento legacy)
                itemsToSave = [{
                    ...dataToSave,
                    stock: -Math.abs(requestedStock),
                    details: `Receptor: ${dataToSave.details || 'No especificado'}`,
                    channel: dataToSave.channel || existing.channel,
                    imageUrl: existing.imageUrl
                }];
            }
        } else {
            // Ingreso
            itemsToSave = [dataToSave];
        }

        setIsSaving(true);
        const createdIds: string[] = [];
        try {
            for (const item of itemsToSave) {
                const res = await inventoryService.addProduct({
                    ...item,
                    registeredBy: currentUser?.email || 'Bodega Desconocida'
                } as Product, formMode === 'ingreso' ? (imageFile || undefined) : undefined);

                if (res && res.id) createdIds.push(res.id);

                // Retraso de seguridad para que Sheets pueda insertar la fila correctamente sin colisiones
                if (itemsToSave.length > 1) await new Promise(res => setTimeout(res, 500));
            }
            setLastActionIds(createdIds);

            // Si es salida y hay status forzado (Reserva o Salida Directa), crear registro en Solicitudes
            if (formMode === 'salida' && forceStatus) {
                try {
                    await inventoryService.createRequest({
                        productCode: dataToSave.code || '',
                        productName: dataToSave.name || '',
                        quantity: dataToSave.stock || 0,
                        requestedBy: currentUser?.email?.split('@')[0] || 'Bodega',
                        receptorName: dataToSave.details || 'No especificado',
                        requesterEmail: currentUser?.email || '',
                        status: forceStatus,
                        approvedAt: new Date().toISOString()
                    });
                } catch (requestErr) {
                    console.error("Error creating linked request:", requestErr);
                    // No detenemos el flujo porque el stock ya se guardó
                }
            }

            setSuccessMsg(`Registro de ${formMode === 'ingreso' ? 'ingreso' : 'salida'} para ${dataToSave.code} completado.`);

            // Clear form IMMEDIATELY to prevent confusion and double entry
            setFormData({ name: '', code: '', description: '', stock: 0, details: '', channel: '', imageUrl: '', entryDate: getLocalDateString() });
            setChannelWarning('');
            setImageFile(null);
            setManualLocations([]);
            loadData(); // refresh the table

            // Keep success message for 8s (for Undo), then hide
            setTimeout(() => {
                setSuccessMsg('');
                setLastActionIds([]);
            }, 10000); // 10 seconds total visibility
        } catch (err) {
            console.error(err);
            showError("Hubo un error al guardar el producto. Revisa la consola.");
        } finally {
            setIsSaving(false);
            setFormMode('none');
        }
    };

    const handleSave = async (e: any, forceStatus?: 'APROBADA' | 'ENTREGADA') => {
        if (e) e.preventDefault();
        if (isSaving || !!successMsg) return; // STRICT BLOCK for double entries

        // Basic validation for Salida
        if (formMode === 'salida') {
            const requestedStock = formData.stock || 0;
            if (requestedStock <= 0) {
                showError("Error: La cantidad a retirar debe ser mayor a 0.");
                return;
            }
            if (!formData.details?.trim()) {
                showError("Error: Debes ingresar a quién se entrega o el motivo.");
                return;
            }
        }

        // Validation: Code Description Mismatch
        if (formData.code) {
            const existingProduct = products.find(p => p.code.toLowerCase() === formData.code?.toLowerCase());
            if (existingProduct) {
                // Check if name or description differs significantly
                if (existingProduct.name.trim().toLowerCase() !== (formData.name || '').trim().toLowerCase() ||
                    existingProduct.description.trim().toLowerCase() !== (formData.description || '').trim().toLowerCase()) {

                    setConflictData({ existing: existingProduct, submitted: formData });
                    return; // Detener flujo para mostrar modal
                }
            }
        }

        executeSave(formData, forceStatus);
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-8">
            {/* Success Notification */}
            {successMsg && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-green-600 text-white p-4 rounded-2xl shadow-2xl z-50 animate-in slide-in-from-top-8 duration-500 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-1.5 rounded-full">
                            <Check size={24} className="text-white" />
                        </div>
                        <p className="font-bold text-sm sm:text-base leading-tight">{successMsg}</p>
                    </div>
                    {lastActionIds.length > 0 && !successMsg.includes('deshecho') && (
                        <div className="w-full pt-1 animate-in fade-in zoom-in-95 duration-700 delay-300">
                            <button
                                onClick={(e) => { e.preventDefault(); handleUndo(); }}
                                disabled={isUndoing}
                                className="w-full flex items-center justify-center gap-2 bg-white text-green-700 py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] shadow-lg hover:bg-green-50 active:scale-[0.98] transition-all"
                            >
                                {isUndoing ? (
                                    <div className="w-4 h-4 border-2 border-green-700/30 border-t-green-700 rounded-full animate-spin"></div>
                                ) : (
                                    <RotateCcw size={16} />
                                )}
                                Deshacer Registro
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Error Notification */}
            {errorMsg && (
                <div className="fixed top-4 right-4 bg-red-50 text-red-800 border-l-4 border-red-500 p-4 rounded shadow-lg z-50 flex items-center gap-3 animate-in slide-in-from-top-2 max-w-sm">
                    <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
                    <p className="font-medium text-sm">{errorMsg}</p>
                    <button onClick={() => setErrorMsg('')} className="ml-auto text-red-400 hover:text-red-600"><X size={16} /></button>
                </div>
            )}

            {/* Saving Overlay */}
            {isSaving && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center animate-in fade-in duration-200">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-gray-100 rounded-full"></div>
                            <div className="w-16 h-16 border-4 border-coca-red border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                        </div>
                        <p className="font-black text-gray-900 uppercase tracking-widest text-sm">Procesando Registro...</p>
                    </div>
                </div>
            )}

            {/* Mobile Header */}
            <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-900">Gestión de Bodega</h1>
                    {formMode === 'none' && (
                        <div className="flex gap-2 sm:gap-3">
                            <button onClick={() => setFormMode('salida')} className="bg-gray-900 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2 shadow-sm">
                                <ArrowUpRight size={18} />
                                <span className="hidden sm:inline">Registrar Salida</span>
                                <span className="sm:hidden">Salida</span>
                            </button>
                            <button onClick={() => setFormMode('ingreso')} className="bg-coca-red text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm">
                                <Plus size={20} />
                                <span className="hidden sm:inline">Nuevo Ingreso</span>
                                <span className="sm:hidden">Ingreso</span>
                            </button>
                        </div>
                    )}
                </div>

                {formMode !== 'none' ? (
                    <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h2 className="text-xl font-semibold flex items-center gap-2">
                                {formMode === 'ingreso' ? 'Registrar Nuevo Entrada de Material' : 'Registrar Salida de Material'}
                            </h2>
                            <button
                                onClick={() => {
                                    setFormMode('none');
                                    setFormData({ name: '', code: '', description: '', stock: 0, details: '', channel: '', imageUrl: '', entryDate: getLocalDateString() });
                                    setChannelWarning('');
                                    setImageFile(null);
                                }}
                                className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                                title="Cancelar"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {(() => {
                            let pastLocations: string[] = [];
                            let availableLocationsForSalida: string[] = [];

                            if (formData.code) {
                                const locs = new Set<string>();
                                const exitLocs = new Set<string>();
                                allProducts.forEach(p => {
                                    if (p.code.toLowerCase() === formData.code?.toLowerCase() && p.details && p.details.trim() !== '' && p.stock > 0) {
                                        locs.add(p.details.trim());
                                        exitLocs.add(p.details.trim());
                                    }
                                });
                                pastLocations = Array.from(locs);
                                availableLocationsForSalida = Array.from(exitLocs);
                            }

                            const isNewLocation = formData.details && pastLocations.length > 0 && !pastLocations.some(l => l.toLowerCase() === formData.details?.trim().toLowerCase());

                            return (
                                <form onSubmit={(e) => handleSave(e, formMode === 'salida' ? 'ENTREGADA' : undefined)} className="space-y-5">
                                    {/* Solo mostrar foto obligatoria si es ingreso */}
                                    {formMode === 'ingreso' && (
                                        <div className={`border-2 border-dashed rounded-xl p-4 md:p-8 text-center transition-colors cursor-pointer group
                                ${imageFile || formData.imageUrl ? 'bg-red-50 border-coca-red' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>

                                            {imageFile || formData.imageUrl ? (
                                                <img src={imageFile ? URL.createObjectURL(imageFile) : formData.imageUrl} alt="Preview" className="mx-auto h-16 w-16 md:h-24 md:w-24 object-cover rounded-md mb-2 shadow-sm border border-red-200" />
                                            ) : (
                                                <Camera className="mx-auto h-8 w-8 md:h-12 md:w-12 transition-colors text-gray-400 group-hover:text-coca-red" />
                                            )}

                                            <div className="mt-4 flex flex-col items-center text-sm leading-6 justify-center">
                                                <label className="relative cursor-pointer rounded-md font-semibold text-coca-red focus-within:outline-none focus-within:ring-2 focus-within:ring-coca-red focus-within:ring-offset-2 hover:text-red-700">
                                                    <span>{imageFile || formData.imageUrl ? 'Cambiar Foto' : 'Tomar Foto o Subir'}</span>
                                                    <input type="file" className="sr-only" accept="image/*" capture="environment" onChange={handleImageChange} />
                                                </label>
                                                {imageFile && <span className="text-sm font-medium text-gray-700 mt-2">{imageFile.name}</span>}
                                            </div>
                                            {!imageFile && !formData.imageUrl && <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF hasta 10MB</p>}
                                        </div>
                                    )}

                                    {(() => {
                                        const isMatch = !!formData.code && products.some(p => p.code.toLowerCase() === formData.code?.toLowerCase());

                                        return (
                                            <div className="space-y-4">
                                                {/* Header persistent with dynamic layout */}
                                                <div className={`flex flex-col sm:flex-row gap-4 items-start transition-all duration-300 ${isMatch ? 'sm:items-end' : ''}`}>
                                                    <div className={`w-full transition-all duration-300 ${isMatch ? 'sm:w-1/3' : 'sm:w-full'}`}>
                                                        <label className={`block font-bold text-gray-500 uppercase tracking-widest mb-1 transition-all ${isMatch ? 'text-[10px]' : 'text-xs'}`}>
                                                            Código Identificador {formMode === 'salida' && !isMatch && '(Obligatorio)'}
                                                        </label>
                                                        <input required type="text" inputMode="numeric" pattern="[0-9]*" id="main-code-input"
                                                            className={`w-full px-4 border-2 rounded-xl font-black outline-none transition-all duration-300 ${isMatch
                                                                ? 'bg-green-50 text-green-800 border-green-500 text-xl py-3 text-center sm:text-left cursor-pointer focus:ring-4 focus:ring-green-500/20'
                                                                : 'bg-white border-gray-200 text-base py-3 focus:border-coca-red focus:ring-4 focus:ring-red-500/10'
                                                                }`}
                                                            value={formData.code}
                                                            autoFocus
                                                            onFocus={(e) => { e.currentTarget.select(); }}
                                                            onChange={handleCodeChange}
                                                            onKeyDown={(e) => { if (e.key === 'Enter') confirmCode(); }}
                                                            placeholder={isMatch ? "" : "Escribe el código..."}
                                                        />
                                                    </div>

                                                    {isMatch && (
                                                        <div className="w-full sm:w-2/3 animate-in zoom-in-95 fade-in duration-300">
                                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                                                                {formMode === 'ingreso' ? 'Stock a Ingresar' : 'Cantidad a Retirar'}
                                                            </label>
                                                            <input required type="number" inputMode="numeric" pattern="[0-9]*" min="1" id="fast-entry-stock"
                                                                className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-coca-red focus:ring-4 focus:ring-red-500/10 outline-none text-xl font-black text-center sm:text-left transition-all"
                                                                value={formData.stock || ''}
                                                                onFocus={(e) => { e.currentTarget.select(); }}
                                                                onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        const detailsInput = document.getElementById('details-input') as HTMLInputElement;
                                                                        if (detailsInput) detailsInput.focus();
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                {isMatch ? (
                                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm relative overflow-hidden">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500"></div>
                                                            <div className="pl-2">
                                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                                    <CheckCircle2 size={14} className="text-green-600" />
                                                                    <p className="text-[10px] text-green-700 uppercase tracking-widest font-black">Producto Reconocido</p>
                                                                </div>
                                                                <p className="font-bold text-gray-900 text-base leading-tight">{formData.name}</p>
                                                            </div>
                                                            <div className="pl-2 sm:pl-0 flex items-center gap-2">
                                                                {formData.channel && <span className="inline-block text-[10px] bg-white text-gray-600 px-2 py-0.5 rounded border border-gray-200 font-bold uppercase tracking-wider shadow-sm">{formData.channel}</span>}
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                                    <CalendarDays size={14} className="text-gray-400" />
                                                                    Fecha ({formMode === 'ingreso' ? 'Llegada' : 'Entrega'})
                                                                </label>
                                                                <input required type="date" tabIndex={-1} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-coca-red focus:ring-4 focus:ring-red-500/10 outline-none text-sm font-bold cursor-pointer shadow-sm transition-all"
                                                                    value={formData.entryDate || ''} onChange={e => setFormData({ ...formData, entryDate: e.target.value })} />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                                    <User size={14} className="text-gray-400" />
                                                                    {formMode === 'ingreso' ? 'Ubicación Física' : 'Entregado a / Motivo'}
                                                                </label>
                                                                <input required={formMode === 'salida'} type="text" id="details-input"
                                                                    className={`w-full px-4 py-3 border-2 rounded-xl outline-none text-sm font-bold shadow-sm transition-all ${formMode === 'ingreso' && isNewLocation ? 'border-orange-400 bg-orange-50/30 focus:border-orange-500' : 'border-gray-200 focus:border-coca-red focus:ring-4 focus:ring-red-500/10'}`}
                                                                    value={formData.details || ''}
                                                                    onFocus={(e) => { e.currentTarget.select(); }}
                                                                    onChange={e => setFormData({ ...formData, details: e.target.value })}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(e, formMode === 'salida' ? 'ENTREGADA' : undefined); } }}
                                                                    placeholder={formMode === 'salida' ? "Ej: Juan Pérez - Cuadrilla 3" : "Ej: Pasillo 3..."} />

                                                                {formMode === 'ingreso' && isNewLocation && (
                                                                    <p className="text-[10px] text-orange-600 mt-1 font-bold">⚠️ Ubicación nueva.</p>
                                                                )}
                                                                {formMode === 'ingreso' && pastLocations.length > 0 && (
                                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                                        {pastLocations.map(loc => (
                                                                            <button key={loc} type="button" onClick={() => setFormData({ ...formData, details: loc })}
                                                                                className="text-[10px] bg-white hover:bg-gray-100 text-gray-600 px-2 py-1.5 rounded border border-gray-200 font-bold shadow-sm transition-colors cursor-pointer active:scale-95">
                                                                                {loc}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                                    <Archive size={14} className="text-gray-400" />
                                                                    Descripción {formMode === 'salida' && '(Automático)'}
                                                                </label>
                                                                <input required type="text" className={`w-full px-4 py-3 border-2 rounded-xl focus:border-coca-red focus:ring-4 focus:ring-red-500/10 outline-none text-sm font-bold transition-all ${formMode === 'salida' ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-white border-gray-200'}`}
                                                                    value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} disabled={formMode === 'salida'} />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                                    <Filter size={14} className="text-gray-400" />
                                                                    Canal {formMode === 'salida' && '(Automático)'}
                                                                </label>
                                                                <div className="relative">
                                                                    <select
                                                                        className={`w-full px-4 py-3 border-2 rounded-xl focus:border-coca-red focus:ring-4 focus:ring-red-500/10 outline-none appearance-none text-sm font-bold transition-all ${formMode === 'salida' ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-white border-gray-200'}`}
                                                                        value={formData.channel || ''}
                                                                        onChange={e => handleChannelChange(e.target.value)}
                                                                        disabled={formMode === 'salida'}
                                                                        required={formMode === 'ingreso'}
                                                                    >
                                                                        <option value="" disabled>Seleccione un canal</option>
                                                                        <option value="Venta Hogar">Venta Hogar</option>
                                                                        <option value="Publicidad">Publicidad</option>
                                                                        <option value="Tradicional">Tradicional</option>
                                                                        <option value="Moderno">Moderno</option>
                                                                    </select>
                                                                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                                </div>
                                                                {channelWarning && <p className="text-xs text-orange-600 font-semibold mt-1">{channelWarning}</p>}
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                                <Archive size={14} className="text-gray-400" />
                                                                Detalles Adicionales {formMode === 'salida' && '(Automático)'}
                                                            </label>
                                                            <textarea className={`w-full px-4 py-3 border-2 rounded-xl focus:border-coca-red focus:ring-4 focus:ring-red-500/10 outline-none text-sm font-bold transition-all ${formMode === 'salida' ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-white border-gray-200 shadow-sm'}`} rows={2}
                                                                value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} disabled={formMode === 'salida'}
                                                                placeholder="Especificaciones, modelo, etc..." />
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                                    <Plus size={14} className="text-gray-400" />
                                                                    {formMode === 'ingreso' ? 'Piezas' : 'Cantidad'}
                                                                </label>
                                                                <input required type="number" inputMode="numeric" pattern="[0-9]*" min="1" className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-coca-red focus:ring-4 focus:ring-red-500/10 outline-none text-sm font-bold shadow-sm transition-all"
                                                                    value={formData.stock || ''}
                                                                    onFocus={(e) => { e.currentTarget.select(); }}
                                                                    onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            e.preventDefault();
                                                                            const detailsInput = document.getElementById('details-input-no-match') as HTMLInputElement;
                                                                            if (detailsInput) detailsInput.focus();
                                                                        }
                                                                    }} />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                                    <CalendarDays size={14} className="text-gray-400" />
                                                                    Fecha
                                                                </label>
                                                                <input required type="date" tabIndex={-1} className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-coca-red focus:ring-4 focus:ring-red-500/10 outline-none text-sm font-bold shadow-sm cursor-pointer transition-all"
                                                                    value={formData.entryDate || ''} onChange={e => setFormData({ ...formData, entryDate: e.target.value })} />
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                                <User size={14} className="text-gray-400" />
                                                                {formMode === 'ingreso' ? 'Ubicación / Detalles' : 'Entregado a / Motivo'}
                                                            </label>
                                                            <input required={formMode === 'salida'} type="text" id="details-input-no-match"
                                                                className={`w-full px-4 py-2 border rounded-lg focus:outline-none transition-colors shadow-sm ${formMode === 'ingreso' && isNewLocation
                                                                    ? 'border-orange-400 focus:ring-2 focus:ring-orange-400 bg-orange-50/30'
                                                                    : 'focus:ring-2 focus:ring-coca-red border-gray-200'
                                                                    }`}
                                                                placeholder={formMode === 'salida' ? 'Ej. Juan Pérez - Cuadrilla 3' : ''}
                                                                value={formData.details}
                                                                onFocus={(e) => { e.currentTarget.select(); }}
                                                                onChange={e => setFormData({ ...formData, details: e.target.value })}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(e, formMode === 'salida' ? 'ENTREGADA' : undefined); } }} />

                                                            {formMode === 'ingreso' && isNewLocation && (
                                                                <p className="text-xs text-orange-600 mt-1 font-medium flex items-center gap-1">
                                                                    ⚠️ Ubicación nueva (no coincide).
                                                                </p>
                                                            )}
                                                            {formMode === 'ingreso' && pastLocations.length > 0 && (
                                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                                    {pastLocations.map(loc => (
                                                                        <button key={loc} type="button" onClick={() => setFormData({ ...formData, details: loc })}
                                                                            className="text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded border border-gray-200 transition-colors">
                                                                            {loc}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {formMode === 'salida' && availableLocationsForSalida.length > 0 && (
                                        <div className="bg-red-50/40 p-4 rounded-xl border border-red-100 mt-2 mb-2">
                                            <div className="flex justify-between items-center mb-4">
                                                <label className="text-sm font-bold text-red-800">Extraer desde:</label>
                                                <span className="text-xs font-semibold px-2.5 py-1 bg-white border border-red-200 rounded-md text-red-700 shadow-sm flex items-center gap-1.5">
                                                    Seleccionado: <span className="font-bold text-sm bg-red-50 px-1.5 rounded">{manualLocations.reduce((acc, curr) => acc + curr.quantity, 0)}</span> / {formData.stock || 0}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                {availableLocationsForSalida.map(loc => {
                                                    const maxAvailable = getAvailableStockInLocation(formData.code || '', loc);
                                                    const currentQty = manualLocations.find(m => m.location === loc)?.quantity || 0;
                                                    const totalSelected = manualLocations.reduce((acc, curr) => acc + curr.quantity, 0);
                                                    const canAdd = currentQty < maxAvailable && totalSelected < (formData.stock || 0);

                                                    return (
                                                        <div key={loc} className={`bg-white border rounded-xl p-3 shadow-sm flex flex-col justify-between transition-colors ${currentQty > 0 ? 'border-red-400 ring-1 ring-red-400/20' : 'border-red-200'}`}>
                                                            <div className="mb-3">
                                                                <div className="text-sm font-bold text-gray-800 truncate" title={loc}>{loc}</div>
                                                                <div className="text-xs text-gray-500 font-medium mt-0.5">Stock local: <span className="text-gray-700 font-bold">{maxAvailable}</span></div>
                                                            </div>

                                                            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-1 border border-gray-100">
                                                                <button
                                                                    type="button"
                                                                    disabled={currentQty === 0}
                                                                    onClick={() => {
                                                                        const newArr = [...manualLocations];
                                                                        const idx = newArr.findIndex(m => m.location === loc);
                                                                        if (idx >= 0) {
                                                                            if (newArr[idx].quantity > 1) {
                                                                                newArr[idx].quantity -= 1;
                                                                            } else {
                                                                                newArr.splice(idx, 1);
                                                                            }
                                                                            setManualLocations(newArr);
                                                                        }
                                                                    }}
                                                                    className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-600 transition-colors shadow-sm cursor-pointer"
                                                                >
                                                                    <span className="text-lg font-bold leading-none select-none">-</span>
                                                                </button>

                                                                <span className="font-bold text-gray-900 w-8 text-center select-none">{currentQty}</span>

                                                                <button
                                                                    type="button"
                                                                    disabled={!canAdd}
                                                                    onClick={() => {
                                                                        const newArr = [...manualLocations];
                                                                        const idx = newArr.findIndex(m => m.location === loc);
                                                                        if (idx >= 0) {
                                                                            newArr[idx].quantity += 1;
                                                                        } else {
                                                                            newArr.push({ location: loc, quantity: 1 });
                                                                        }
                                                                        setManualLocations(newArr);
                                                                    }}
                                                                    className="w-8 h-8 flex items-center justify-center rounded-md bg-coca-red text-white hover:bg-coca-black disabled:opacity-40 disabled:hover:bg-coca-red transition-colors shadow-sm cursor-pointer"
                                                                >
                                                                    <span className="text-lg font-bold leading-none select-none">+</span>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const currentTotal = manualLocations.reduce((s, i) => s + i.quantity, 0);
                                                                        const currentInLoc = manualLocations.find(m => m.location === loc)?.quantity || 0;
                                                                        const needed = (formData.stock || 0) - currentTotal;
                                                                        const availableInLoc = maxAvailable - currentInLoc;
                                                                        const toAdd = Math.min(needed, availableInLoc);

                                                                        if (toAdd > 0) {
                                                                            const newArr = [...manualLocations];
                                                                            const idx = newArr.findIndex(m => m.location === loc);
                                                                            if (idx >= 0) {
                                                                                newArr[idx].quantity += toAdd;
                                                                            } else {
                                                                                newArr.push({ location: loc, quantity: toAdd });
                                                                            }
                                                                            setManualLocations(newArr);
                                                                        }
                                                                    }}
                                                                    disabled={!canAdd}
                                                                    className="ml-2 px-2 h-8 flex items-center justify-center rounded-md bg-red-100 text-red-700 font-black text-[10px] uppercase tracking-tighter hover:bg-red-200 disabled:opacity-40 transition-all border border-red-200"
                                                                >
                                                                    MAX
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-6 flex flex-col sm:flex-row justify-end gap-3 border-t">
                                        <button disabled={isSaving} type="button"
                                            onClick={() => {
                                                setFormMode('none');
                                                setManualLocations([]);
                                                setFormData({ name: '', code: '', description: '', stock: 0, details: '', channel: '', imageUrl: '', entryDate: getLocalDateString() });
                                                setChannelWarning('');
                                            }}
                                            className="px-6 py-3 text-gray-700 hover:bg-gray-100 rounded-xl font-bold transition-colors order-3 sm:order-1">
                                            Cancelar
                                        </button>

                                        {formMode === 'salida' ? (
                                            <>
                                                <button
                                                    disabled={isSaving}
                                                    type="button"
                                                    onClick={(e) => handleSave(e, 'APROBADA')}
                                                    className={`px-6 py-3 text-white rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 order-2
                                                    ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}>
                                                    <Clock size={20} />
                                                    Reservar (Por Retirar)
                                                </button>
                                                <button
                                                    disabled={isSaving}
                                                    type="button"
                                                    onClick={(e) => handleSave(e, 'ENTREGADA')}
                                                    className={`px-6 py-3 text-white rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 order-1
                                                    ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-black'}`}>
                                                    <PackageCheck size={20} />
                                                    {isSaving ? 'Guardando...' : 'Entrega Directa'}
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                disabled={isSaving}
                                                type="submit"
                                                className={`px-8 py-3 text-white rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95
                                                ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-coca-red hover:bg-red-700'}`}>
                                                {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                                                {isSaving ? 'Guardando...' : 'Guardar Ingreso'}
                                            </button>
                                        )}
                                    </div>
                                </form>
                            );
                        })()}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Tabs */}
                        <div className="flex justify-between items-end border-b border-gray-200">
                            <div className="flex gap-2 sm:gap-6 pt-1">
                                <button
                                    onClick={() => setActiveTab('inventario')}
                                    className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${activeTab === 'inventario' ? 'border-coca-red text-coca-red' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    Inventario Principal
                                </button>
                                <button
                                    onClick={() => setActiveTab('solicitudes')}
                                    className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'solicitudes' ? 'border-coca-red text-coca-red' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    Solicitudes Entrantes
                                    <div className="flex items-center gap-1.5 ml-1">
                                        {(() => {
                                            const pending = requests.filter(r => r.status === 'PENDIENTE');
                                            if (pending.length === 0) return null;

                                            // Lógica de agrupación idéntica a la del renderizado
                                            const groups = pending.reduce((acc, req) => {
                                                const date = new Date(req.dateRequested);
                                                const timeKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${Math.floor(date.getMinutes() / 5)}`;
                                                const groupKey = `${req.requestedBy}-${req.receptorName || ''}-${timeKey}`;
                                                acc[groupKey] = true;
                                                return acc;
                                            }, {} as Record<string, boolean>);

                                            const count = Object.keys(groups).length;

                                            return (
                                                <div className="relative flex items-center justify-center" title={`${count} Pedidos pendientes`}>
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-coca-red opacity-40"></span>
                                                    <span className="relative inline-flex items-center justify-center rounded-full text-[11px] font-black text-white bg-coca-red px-2 py-0.5 shadow-sm min-w-[22px] border border-red-700">
                                                        {count}
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </button>
                                <button
                                    onClick={() => setActiveTab('por_retirar')}
                                    className={`pb-3 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'por_retirar' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Truck size={15} />
                                    Por Retirar
                                    {requests.filter(r => r.status === 'APROBADA').length > 0 && (
                                        <div className="relative flex items-center justify-center" title="Esperando retiro">
                                            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-40"></span>
                                            <span className="relative inline-flex items-center justify-center rounded-full text-[11px] font-black text-white bg-amber-500 px-2 py-0.5 shadow-sm min-w-[22px] border border-amber-600">
                                                {requests.filter(r => r.status === 'APROBADA').length}
                                            </span>
                                        </div>
                                    )}
                                </button>
                            </div>

                            {activeTab === 'inventario' && (
                                <div className="flex gap-2 mb-2 items-center">
                                    {/* Channel Multi-select Filter */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowChannelFilter(!showChannelFilter)}
                                            className={`flex items-center gap-2 p-2 px-3 rounded-xl border transition-all shadow-sm ${selectedChannels.length < ALL_CHANNELS.length ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            <Filter size={18} />
                                            <span className="text-sm font-semibold hidden sm:inline">
                                                Canales {selectedChannels.length < ALL_CHANNELS.length && `(${selectedChannels.length})`}
                                            </span>
                                            <ChevronDown size={14} className={`transition-transform duration-300 ${showChannelFilter ? 'rotate-180' : ''}`} />
                                        </button>

                                        {showChannelFilter && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setShowChannelFilter(false)}></div>
                                                <div className="absolute left-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 z-20 py-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <div className="px-4 pb-2 mb-2 border-b border-gray-50 flex justify-between items-center gap-2">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Filtrar por Canal</span>
                                                        <div className="flex gap-1">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setSelectedChannels(ALL_CHANNELS); }}
                                                                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors border border-green-200"
                                                            >
                                                                Todos
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setSelectedChannels([]); }}
                                                                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-100"
                                                            >
                                                                Ninguno
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        {ALL_CHANNELS.map(channel => (
                                                            <label
                                                                key={channel}
                                                                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors group"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    className="hidden"
                                                                    checked={selectedChannels.includes(channel)}
                                                                    onChange={() => {
                                                                        if (selectedChannels.includes(channel)) {
                                                                            setSelectedChannels(selectedChannels.filter(c => c !== channel));
                                                                        } else {
                                                                            setSelectedChannels([...selectedChannels, channel]);
                                                                        }
                                                                    }}
                                                                />
                                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedChannels.includes(channel) ? 'bg-coca-red border-coca-red shadow-[0_2px_10px_rgba(244,0,9,0.2)]' : 'border-gray-200 group-hover:border-gray-300'}`}>
                                                                    {selectedChannels.includes(channel) && <Check size={14} className="text-white bg-coca-red" />}
                                                                </div>
                                                                <span className={`text-sm ${selectedChannels.includes(channel) ? 'text-gray-900 font-bold' : 'text-gray-600 font-medium'}`}>{channel}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

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
                                </div>
                            )}
                        </div>

                        <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                            {/* Search bar for Inventario tab */}
                            {activeTab === 'inventario' && (
                                <div className="px-4 py-3 border-b border-gray-100">
                                    <div className="relative">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-coca-red/20 focus:border-coca-red transition-all"
                                            placeholder="Buscar por código o nombre..."
                                            value={adminSearchTerm}
                                            onChange={e => setAdminSearchTerm(e.target.value)}
                                        />
                                        {adminSearchTerm && (
                                            <button onClick={() => setAdminSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="overflow-x-auto">
                                {activeTab === 'inventario' ? (() => {
                                    const term = adminSearchTerm.toLowerCase();
                                    const searchFiltered = adminSearchTerm
                                        ? activeProducts.filter(p => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term))
                                        : activeProducts;
                                    return (
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Canal</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">Selección</th>
                                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Historial</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {isLoading ? (
                                                    <tr><td colSpan={6} className="py-10 text-center text-gray-500"><Loader2 className="animate-spin mx-auto text-coca-red w-8 h-8 mb-2" />Cargando catálogo...</td></tr>
                                                ) : searchFiltered.length === 0 && archivedProducts.length === 0 ? (
                                                    <tr><td colSpan={6} className="py-10 text-center text-gray-500">{adminSearchTerm ? `Sin resultados para "${adminSearchTerm}"` : 'No hay productos registrados en la base de datos de Sheets.'}</td></tr>
                                                ) : (
                                                    <>
                                                        {searchFiltered.length === 0 && !adminSearchTerm && (
                                                            <tr><td colSpan={6} className="py-6 text-center text-gray-400">Todos los productos están agotados. Revisa los archivados abajo.</td></tr>
                                                        )}
                                                        {searchFiltered.length === 0 && adminSearchTerm && (
                                                            <tr><td colSpan={6} className="py-6 text-center text-gray-400">{`Sin resultados para "${adminSearchTerm}"`}</td></tr>
                                                        )}
                                                        {searchFiltered.map(p => {
                                                            const isInAdminCart = adminCart.some(item => item.productCode === p.code && item.location === p.location);
                                                            return (
                                                                <tr key={`${p.code}-${p.channel || 'none'}-${p.location || ''}`} className={isInAdminCart ? 'bg-blue-50/30' : ''}>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-3">
                                                                        {p.imageUrl ? <img src={p.imageUrl} className="w-10 h-10 object-cover rounded-md border" /> : <div className="w-10 h-10 bg-gray-100 rounded-md border flex items-center justify-center"><Camera size={16} className="text-gray-400" /></div>}
                                                                        <div className="flex flex-col">
                                                                            <span>{p.name}</span>
                                                                            {p.location && <span className="text-[10px] text-gray-400 font-mono">{p.location}</span>}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">{p.code}</td>
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.channel ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                                                            {p.channel || 'Sin Canal'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                        <span className="px-2 inline-flex text-xs leading-5 font-bold rounded-full border bg-green-50 text-green-700 border-green-200">
                                                                            {p.stock}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                        {p.stock > 0 ? (
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (isInAdminCart) {
                                                                                        removeFromAdminCart(p.code, p.location);
                                                                                    } else {
                                                                                        addToAdminCart({
                                                                                            productCode: p.code,
                                                                                            name: p.name,
                                                                                            quantity: 1,
                                                                                            maxStock: p.stock,
                                                                                            imageUrl: p.imageUrl,
                                                                                            channel: p.channel,
                                                                                            location: p.location
                                                                                        });
                                                                                    }
                                                                                }}
                                                                                className={`p-1.5 rounded-lg border transition-all ${isInAdminCart
                                                                                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                                                                    : 'bg-white border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50'}`}
                                                                                title={isInAdminCart ? "Quitar de la lista de salida" : "Añadir a la lista de salida"}
                                                                            >
                                                                                {isInAdminCart ? <Check size={18} /> : <Plus size={18} />}
                                                                            </button>
                                                                        ) : (
                                                                            <div className="p-1.5 text-gray-300">
                                                                                <X size={18} />
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-2">
                                                                        <button
                                                                            onClick={() => navigate(`/product/${p.code}`)}
                                                                            className="flex items-center gap-1.5 text-coca-red hover:text-red-700 font-bold transition-colors px-3 py-1.5 rounded-full hover:bg-red-50 border border-transparent hover:border-red-100"
                                                                        >
                                                                            <Eye size={16} /> Ver Movimientos
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                        {archivedProducts.length > 0 && (
                                                            <>
                                                                <tr>
                                                                    <td colSpan={6} className="px-0 py-0 border-t border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group" onClick={() => setShowArchivedAdmin(!showArchivedAdmin)}>
                                                                        <div className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors">
                                                                            <Archive size={16} />
                                                                            {showArchivedAdmin ? 'Ocultar' : 'Ver'} {archivedProducts.length} productos agotados (Archivados)
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {showArchivedAdmin && archivedProducts.map(p => (
                                                                    <tr key={`${p.code}-${p.channel || 'none'}-archived`} className="bg-gray-50/50 opacity-75 grayscale-[0.3]">
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-500 flex items-center gap-3">
                                                                            {p.imageUrl ? <img src={p.imageUrl} className="w-10 h-10 object-cover rounded-md border opacity-60" /> : <div className="w-10 h-10 bg-gray-200 rounded-md border flex items-center justify-center"><Camera size={16} className="text-gray-400" /></div>}
                                                                            <span className="line-through decoration-gray-300">{p.name}</span>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-400">{p.code}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200 opacity-60">
                                                                                {p.channel || 'Sin Canal'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                            <span className="px-2 inline-flex text-xs leading-5 font-bold rounded-full border bg-gray-200 text-gray-600 border-gray-300">
                                                                                Agotado ({p.stock})
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center opacity-40">
                                                                            <X size={16} className="mx-auto text-gray-300" />
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-2">
                                                                            <button
                                                                                onClick={() => navigate(`/product/${p.code}`)}
                                                                                className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 font-bold transition-colors px-3 py-1.5 rounded-full hover:bg-gray-200 border border-transparent"
                                                                            >
                                                                                <Eye size={16} /> Ver Movimientos
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </tbody>
                                        </table>
                                    );
                                })() : activeTab === 'por_retirar' ? (() => {
                                    const pendingPickup = requests.filter(r => r.status === 'APROBADA');
                                    const getDaysWaiting = (approvedAt: string) => {
                                        if (!approvedAt) return 0;
                                        const diff = Date.now() - new Date(approvedAt).getTime();
                                        return Math.floor(diff / (1000 * 60 * 60 * 24));
                                    };

                                    return (
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-amber-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-amber-700 uppercase tracking-wider">Producto</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-amber-700 uppercase tracking-wider">Solicitante</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-amber-700 uppercase tracking-wider">Cantidad</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-amber-700 uppercase tracking-wider">Tiempo Espera</th>
                                                    <th className="px-6 py-3 text-right text-xs font-medium text-amber-700 uppercase tracking-wider">Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {isLoading ? (
                                                    <tr><td colSpan={5} className="py-10 text-center text-gray-500"><Loader2 className="animate-spin mx-auto text-amber-500 w-8 h-8 mb-2" />Cargando...</td></tr>
                                                ) : pendingPickup.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="py-16 text-center">
                                                            <Truck size={40} className="mx-auto text-gray-200 mb-3" />
                                                            <p className="text-gray-400 font-medium">No hay productos esperando retiro</p>
                                                            <p className="text-gray-300 text-sm mt-1">Cuando se aprueben solicitudes, aparecerán aquí</p>
                                                        </td>
                                                    </tr>
                                                ) : pendingPickup.map(req => {
                                                    const days = getDaysWaiting(req.approvedAt || '');
                                                    return (
                                                        <tr key={req.id} className={`${days >= 7 ? 'bg-red-50/30' : days >= 3 ? 'bg-amber-50/30' : ''}`}>
                                                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold">{req.productName}</span>
                                                                    <span className="text-xs font-mono text-gray-400">{req.productCode}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                                <div className="flex flex-col gap-0.5">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <User size={13} className="text-gray-400" />
                                                                        <span className="font-semibold text-gray-700">{req.requestedBy.split('@')[0]}</span>
                                                                    </div>
                                                                    {req.receptorName && req.receptorName.trim() !== '' && (
                                                                        <span className="text-xs text-gray-400">Recibe: {req.receptorName}</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold inline-flex items-center gap-1">
                                                                    {req.quantity} UN
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                {days === 0 ? (
                                                                    <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded-lg font-semibold border border-green-100">Hoy</span>
                                                                ) : days < 3 ? (
                                                                    <span className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-lg font-semibold border border-gray-100 flex items-center gap-1">
                                                                        <CalendarDays size={12} /> {days}d
                                                                    </span>
                                                                ) : days < 7 ? (
                                                                    <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg font-bold border border-amber-200 flex items-center gap-1 animate-pulse">
                                                                        <Clock size={12} /> {days} días esperando
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded-lg font-bold border border-red-200 flex items-center gap-1">
                                                                        <AlertTriangle size={12} /> {days} días — Urgente
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                                {isProcessingRequest ? (
                                                                    <Loader2 size={18} className="animate-spin text-gray-400 ml-auto" />
                                                                ) : (
                                                                    <div className="flex justify-end gap-2 items-center">
                                                                        <button
                                                                            onClick={() => handleDeleteRequest(req)}
                                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                                                                            title="Eliminar y devolver stock"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setRequestConfirm({ req, status: 'ENTREGADA' })}
                                                                            className="px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors font-bold text-xs flex items-center gap-1.5"
                                                                        >
                                                                            <Truck size={14} /> Confirmar Retiro
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    );
                                })() : (() => {
                                    const isWaitingForLogistics = (r: OrderRequest) => r.status === 'ENTREGADA' && !r.logisticConfirmedAt && !!r.requesterEmail?.toLowerCase().includes('logistica');
                                    const pendingRequests = requests.filter(r => r.status === 'PENDIENTE' || r.status === 'APROBADA' || isWaitingForLogistics(r));

                                    // Agrupar por solicitante, receptor y tiempo (margen de 5 mins)
                                    const groupedPending = pendingRequests.reduce((acc, req) => {
                                        const date = new Date(req.dateRequested);
                                        // Redondeamos los minutos a bloques de 5 para detectar el mismo envío de carrito
                                        const timeKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${Math.floor(date.getMinutes() / 5)}`;
                                        const groupKey = `${req.requestedBy}-${req.receptorName || ''}-${timeKey}`;

                                        if (!acc[groupKey]) acc[groupKey] = [];
                                        acc[groupKey].push(req);
                                        return acc;
                                    }, {} as Record<string, OrderRequest[]>);

                                    const pendingSection = pendingRequests.length === 0 ? (
                                        <div className="py-16 text-center text-gray-500 bg-white rounded-3xl border border-dashed border-gray-200">No hay solicitudes pendientes por el momento.</div>
                                    ) : (() => {
                                        // Ordenar grupos por fecha descendente
                                        const sortedGroups = Object.entries(groupedPending).sort((a, b) => {
                                            const dateA = new Date(a[1][0].dateRequested).getTime();
                                            const dateB = new Date(b[1][0].dateRequested).getTime();
                                            return dateB - dateA;
                                        });

                                        return (
                                            <div className="space-y-6 pb-6">
                                                {sortedGroups.map(([key, group]) => {
                                                    const first = group[0];
                                                    const date = new Date(first.dateRequested);
                                                    const requesterName = first.requestedBy.split('@')[0];

                                                    return (
                                                        <div
                                                            key={key}
                                                            className={`bg-white border rounded-2xl overflow-hidden hover:shadow-md transition-all duration-500 ${group.some(r => r.id === highlightReqId)
                                                                ? 'border-blue-200 shadow-sm bg-blue-50/20 shadow-[inset_4px_0_0_0_#3b82f6]'
                                                                : 'border-gray-200 shadow-sm'
                                                                }`}
                                                        >
                                                            <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 hover:bg-gray-100/80 transition-colors">
                                                                <div
                                                                    className="flex items-center gap-4 flex-1 cursor-pointer"
                                                                    onClick={() => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }))}
                                                                >
                                                                    <div
                                                                        className="bg-white p-2.5 rounded-2xl border border-gray-200 shadow-sm text-coca-red transition-colors"
                                                                        title={expandedGroups[key] ? "Ocultar artículos" : "Ver artículos"}
                                                                    >
                                                                        <User size={20} className="mb-0.5" />
                                                                        <div className="flex justify-center mt-1">
                                                                            <svg className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${expandedGroups[key] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                                                                            </svg>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <h4 className="text-base font-bold text-gray-900 leading-tight truncate">Pedido de {requesterName}</h4>
                                                                            <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 uppercase tracking-tighter">
                                                                                {group.length} {group.length === 1 ? 'ARTÍCULO' : 'ARTÍCULOS'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                                                                            <CalendarDays size={12} />
                                                                            <span className="text-[11px] font-bold uppercase tracking-wide">
                                                                                {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    {first.status === 'PENDIENTE' ? (
                                                                        <>
                                                                            <button
                                                                                onClick={() => handleBulkRequestStatus(group, 'APROBADA')}
                                                                                disabled={isProcessingRequest}
                                                                                className="px-5 py-2.5 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-xs font-bold transition-all shadow-lg shadow-green-100 flex items-center gap-2 active:scale-95"
                                                                            >
                                                                                {isProcessingRequest ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                                                                                Aprobar Pedido
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleBulkRequestStatus(group, 'RECHAZADA')}
                                                                                disabled={isProcessingRequest}
                                                                                className="p-2.5 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 rounded-2xl transition-all shadow-sm active:scale-95"
                                                                                title="Rechazar Todo el Pedido"
                                                                            >
                                                                                <X size={20} />
                                                                            </button>
                                                                        </>
                                                                    ) : first.status === 'APROBADA' ? (
                                                                        <span className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl text-xs font-bold border border-blue-200 flex items-center gap-2">
                                                                            <Truck size={14} /> Listo para Entregar
                                                                        </span>
                                                                    ) : (
                                                                        <span className="bg-orange-50 text-orange-700 px-3 py-1.5 rounded-xl text-xs font-bold border border-orange-200 flex items-center gap-2 text-right">
                                                                            <Clock size={14} /> Esperando confirmación<br />de Logística
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className={`divide-y divide-gray-50 bg-white transition-all duration-300 ${expandedGroups[key] ? 'block' : 'hidden'}`}>
                                                                {group.map((req) => (
                                                                    <div
                                                                        key={req.id}
                                                                        id={`req-${req.id}`}
                                                                        className="px-6 py-4 flex items-center justify-between group/item transition-colors hover:bg-gray-50/30"
                                                                    >
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 border border-transparent group-hover/item:border-gray-200 group-hover/item:bg-white group-hover/item:text-coca-red transition-all">
                                                                                <Package size={20} />
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-sm font-bold text-gray-800">{req.productName}</p>
                                                                                <p className="text-[11px] text-gray-400 font-bold font-mono uppercase tracking-tight">{req.productCode}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 flex items-baseline gap-1 group-hover/item:bg-white transition-colors">
                                                                                <span className="text-base font-black text-coca-red">{req.quantity}</span>
                                                                                <span className="text-[10px] font-bold text-gray-400 uppercase">UN</span>
                                                                            </div>
                                                                            {req.status === 'APROBADA' ? (
                                                                                <button
                                                                                    onClick={() => setRequestConfirm({ req, status: 'ENTREGADA' })}
                                                                                    className="px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 whitespace-nowrap"
                                                                                >
                                                                                    <Truck size={14} /> Confirmar Retiro
                                                                                </button>
                                                                            ) : req.status === 'ENTREGADA' ? (
                                                                                <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 flex items-center gap-1 py-1 rounded-lg border border-orange-100 whitespace-nowrap">
                                                                                    <Clock size={12} /> Pendiente Logística
                                                                                </span>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => handleDeleteRequest(req)}
                                                                                    className="p-2 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover/item:opacity-100"
                                                                                    title="Eliminar este ítem"
                                                                                >
                                                                                    <Trash2 size={18} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {first.receptorName && first.receptorName.trim() !== '' && (
                                                                <div className="bg-amber-50/20 px-6 py-3 flex items-center gap-2 border-t border-amber-50/50">
                                                                    <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                                                                        <ArrowUpRight size={14} className="text-amber-600" />
                                                                    </div>
                                                                    <span className="text-[11px] font-black text-amber-700 uppercase tracking-widest">Responsable de retiro: {first.receptorName}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })();

                                    // Solicitudes procesadas (no pendientes ni esperando logística)
                                    const processedRequests = requests.filter(r => r.status !== 'PENDIENTE' && r.status !== 'APROBADA' && !isWaitingForLogistics(r));

                                    const groupedProcessed = processedRequests.reduce((acc, req) => {
                                        const date = new Date(req.dateRequested);
                                        const timeKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${Math.floor(date.getMinutes() / 5)}`;
                                        const groupKey = `${req.requestedBy}-${req.receptorName || ''}-${timeKey}`;
                                        if (!acc[groupKey]) acc[groupKey] = [];
                                        acc[groupKey].push(req);
                                        return acc;
                                    }, {} as Record<string, OrderRequest[]>);

                                    const sortedProcessed = Object.entries(groupedProcessed).sort((a, b) => {
                                        const dateA = new Date(a[1][0].dateRequested).getTime();
                                        const dateB = new Date(b[1][0].dateRequested).getTime();
                                        return dateB - dateA;
                                    });

                                    const getProcessedStatusBadge = (req: OrderRequest) => {
                                        switch (req.status) {
                                            case 'ENTREGADA':
                                                if (req.logisticConfirmedAt) return <span className="bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1"><CheckCircle2 size={11} /> RECIBIDA POR LOGÍSTICA</span>;
                                                return <span className="bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1"><CheckCircle2 size={11} /> ENTREGADA</span>;
                                            case 'RECHAZADA': return <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1"><X size={11} /> RECHAZADA</span>;
                                            case 'CANCELADA': return <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1"><X size={11} /> CANCELADA</span>;
                                            case 'APROBADA': return <span className="bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1"><Check size={11} /> APROBADA</span>;
                                            default: return <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md text-[10px] font-bold">{req.status}</span>;
                                        }
                                    };

                                    return (
                                        <div className="space-y-6">
                                            {pendingSection}

                                            {processedRequests.length > 0 && (
                                                <div className="space-y-3">
                                                    <button
                                                        onClick={() => setExpandedGroups(prev => ({ ...prev, '__processed__': !prev['__processed__'] }))}
                                                        className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-2xl border border-gray-200 border-dashed transition-colors"
                                                    >
                                                        <Archive size={16} />
                                                        {expandedGroups['__processed__'] ? 'Ocultar' : 'Ver'} {processedRequests.length} solicitudes procesadas
                                                        <ChevronDown size={16} className={`transition-transform duration-200 ${expandedGroups['__processed__'] ? 'rotate-180' : ''}`} />
                                                    </button>

                                                    {expandedGroups['__processed__'] && (
                                                        <div className="space-y-3">
                                                            {sortedProcessed.map(([key, group]) => {
                                                                const first = group[0];
                                                                const date = new Date(first.dateRequested);
                                                                const requesterName = first.requestedBy.split('@')[0];
                                                                return (
                                                                    <div
                                                                        key={`proc-${key}`}
                                                                        className={`rounded-2xl border overflow-hidden transition-all duration-500 ${group.some(r => r.id === highlightReqId)
                                                                            ? 'border-blue-200 shadow-sm bg-blue-50/20 shadow-[inset_4px_0_0_0_#3b82f6]'
                                                                            : 'bg-white border-gray-200 opacity-80'
                                                                            }`}
                                                                    >
                                                                        <div className={`px-5 py-3 flex items-center justify-between cursor-pointer transition-colors ${group.some(r => r.id === highlightReqId) ? 'hover:bg-blue-50/40' : 'hover:bg-gray-50/50'}`} onClick={() => setExpandedGroups(prev => ({ ...prev, [`proc-${key}`]: !prev[`proc-${key}`] }))}>
                                                                            <div className="flex items-center gap-3 min-w-0">
                                                                                <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center shrink-0"><User size={16} className="text-gray-400" /></div>
                                                                                <div className="min-w-0">
                                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                                        <span className="text-sm font-bold text-gray-700">{requesterName}</span>
                                                                                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-medium">{group.length} artículo{group.length > 1 ? 's' : ''}</span>
                                                                                        {getProcessedStatusBadge(first)}
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                                                                                        <CalendarDays size={11} />
                                                                                        <span className="text-[11px]">{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform duration-200 ${expandedGroups[`proc-${key}`] ? 'rotate-180' : ''}`} />
                                                                        </div>
                                                                        {expandedGroups[`proc-${key}`] && (
                                                                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                                                                                {group.map(req => (
                                                                                    <div
                                                                                        key={req.id}
                                                                                        id={`req-${req.id}`}
                                                                                        className="px-5 py-3 flex items-center justify-between gap-3 transition-colors hover:bg-gray-50/30"
                                                                                    >
                                                                                        <div className="min-w-0 flex-1">
                                                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                                                <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{req.productCode}</span>
                                                                                                {getProcessedStatusBadge(req)}
                                                                                            </div>
                                                                                            <h4 className="text-sm font-bold text-gray-700 truncate">{req.productName}</h4>
                                                                                            <span className="text-xs text-gray-500">Cantidad: <strong>{req.quantity}</strong> UN</span>
                                                                                        </div>
                                                                                        <div className="flex items-center gap-2 shrink-0">
                                                                                            <button onClick={() => navigate(`/product/${req.productCode}?reqId=${req.id}`)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200" title="Ver movimientos del producto"><Eye size={15} /></button>
                                                                                            <button onClick={() => handleDeleteRequest(req)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200" title="Eliminar registro"><Trash2 size={15} /></button>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}
                {/* Modal de Resolución de Conflictos */}
                {
                    conflictData && (
                        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="bg-amber-50 p-5 border-b border-amber-100 flex items-start gap-4">
                                    <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                                        <AlertTriangle size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold text-gray-900">Alerta de Inconsistencia</h3>
                                        <p className="text-sm text-amber-700 mt-1">
                                            El código <strong>{conflictData.submitted.code}</strong> ya existe en el sistema con diferente información. ¿Qué datos deseas asignar a este nuevo ingreso de stock?
                                        </p>
                                    </div>
                                    <button onClick={() => setConflictData(null)} className="text-gray-400 hover:text-gray-600 outline-none">
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="p-5 space-y-4 bg-gray-50/50">
                                    {/* Opción 1: Mantener anterior */}
                                    <button
                                        onClick={() => {
                                            setConflictData(null);
                                            executeSave({
                                                ...conflictData.submitted,
                                                name: conflictData.existing.name,
                                                description: conflictData.existing.description
                                            });
                                        }}
                                        className="w-full text-left bg-white border-2 border-transparent hover:border-coca-red p-4 rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-coca-red/50 group"
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-gray-900 group-hover:text-coca-red transition-colors">1. Mantener Nombre Original (Recomendado)</span>
                                        </div>
                                        <p className="text-sm text-gray-500 mb-2">Usarás los mismos datos que ya tenía el código en sistema.</p>
                                        <div className="bg-gray-50 p-3 rounded-lg text-sm border font-medium text-gray-700">
                                            <p>Nombre: {conflictData.existing.name}</p>
                                            <p className="line-clamp-1">Desc: {conflictData.existing.description}</p>
                                        </div>
                                    </button>

                                    {/* Opción 2: Usar nuevo */}
                                    <button
                                        onClick={() => {
                                            setConflictData(null);
                                            executeSave(conflictData.submitted);
                                        }}
                                        className="w-full text-left bg-white border-2 border-transparent hover:border-amber-500 p-4 rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50 group"
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-gray-900 group-hover:text-amber-600 transition-colors">2. Sobreescribir con mi Nuevo Nombre</span>
                                        </div>
                                        <p className="text-sm text-gray-500 mb-2">Guardarás el producto usando exactamente lo que tú escribiste.</p>
                                        <div className="bg-amber-50/50 p-3 rounded-lg text-sm border border-amber-100 font-medium text-amber-900">
                                            <p>Nombre: {conflictData.submitted.name}</p>
                                            <p className="line-clamp-1">Desc: {conflictData.submitted.description}</p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Banner de Salida Masiva (Admin Cart) */}
                {totalAdminItems > 0 && activeTab === 'inventario' && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 animate-in slide-in-from-bottom-10 duration-300">
                        <div className="bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-gray-100 p-4 flex items-center justify-between gap-4 backdrop-blur-md bg-white/90">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                                    <PackageCheck size={24} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 leading-tight">{totalAdminItems} productos seleccionados</h4>
                                    <p className="text-xs text-gray-500">¿Qué deseas hacer con estos artículos?</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={clearAdminCart}
                                    className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                    title="Limpiar selección"
                                >
                                    <Trash2 size={20} />
                                </button>
                                <button
                                    onClick={() => {
                                        setBulkType('ENTREGA');
                                        setShowBulkModal(true);
                                    }}
                                    className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center gap-2"
                                >
                                    <Truck size={18} /> Entrega Manual
                                </button>
                                <button
                                    onClick={() => {
                                        setBulkType('BAJA');
                                        setShowBulkModal(true);
                                    }}
                                    className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all flex items-center gap-2 opacity-80 hover:opacity-100"
                                >
                                    <AlertTriangle size={18} /> Baja
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal de Salida Masiva */}
                {showBulkModal && (
                    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className={`p-6 border-b flex items-center justify-between ${bulkType === 'BAJA' ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${bulkType === 'BAJA' ? 'bg-amber-500' : 'bg-green-600'}`}>
                                        {bulkType === 'BAJA' ? <AlertTriangle size={20} /> : <Truck size={20} />}
                                    </div>
                                    <div>
                                        <h3 className={`font-bold text-lg ${bulkType === 'BAJA' ? 'text-amber-900' : 'text-green-900'}`}>
                                            {bulkType === 'BAJA' ? 'Registrar Baja de Material' : 'Confirmar Entrega Manual'}
                                        </h3>
                                        <p className={`text-sm ${bulkType === 'BAJA' ? 'text-amber-700/70' : 'text-green-700/70'}`}>
                                            Procesando {totalAdminItems} productos
                                        </p>
                                    </div>
                                    <button onClick={() => setShowBulkModal(false)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                                        <X size={20} className="text-gray-400" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                <div className="space-y-3">
                                    {adminCart.map((item) => (
                                        <div key={`${item.productCode}-${item.location}`} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-md">
                                            <div className="flex items-center gap-4">
                                                {item.imageUrl ? (
                                                    <img src={item.imageUrl} className="w-12 h-12 object-cover rounded-xl shadow-sm" />
                                                ) : (
                                                    <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center"><Package size={20} className="text-gray-400" /></div>
                                                )}
                                                <div>
                                                    <p className="font-bold text-gray-900">{item.name}</p>
                                                    <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                                                        <span>{item.productCode}</span>
                                                        {item.location && <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-500">{item.location}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                                    <button
                                                        onClick={() => updateAdminQuantity(item.productCode, item.quantity - 1, item.location)}
                                                        className="p-1.5 hover:bg-gray-100 text-gray-700 transition-colors border-r border-gray-100"
                                                        title="Reducir"
                                                    >
                                                        <Minus size={14} strokeWidth={3} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateAdminQuantity(item.productCode, parseInt(e.target.value) || 1, item.location)}
                                                        className="w-10 text-center text-sm font-bold border-none focus:ring-0 p-0"
                                                    />
                                                    <button
                                                        onClick={() => updateAdminQuantity(item.productCode, item.quantity + 1, item.location)}
                                                        className="p-1.5 hover:bg-gray-100 text-gray-700 transition-colors border-l border-gray-100"
                                                        title="Aumentar"
                                                    >
                                                        <Plus size={14} strokeWidth={3} />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => removeFromAdminCart(item.productCode, item.location)}
                                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6 border-t bg-gray-50/50 space-y-4">
                                {bulkType === 'ENTREGA' ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">¿Quién retira?</label>
                                            <div className="relative">
                                                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Ej: Juan Perez"
                                                    value={bulkReceptor}
                                                    onChange={e => setBulkReceptor(e.target.value)}
                                                    className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none shadow-sm"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">¿Quién entrega? (Tú)</label>
                                            <div className="relative">
                                                <UserCircle size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    disabled
                                                    value={currentUser?.email?.split('@')[0] || 'Admin'}
                                                    className="w-full pl-11 pr-4 py-3 bg-gray-100 border border-gray-200 rounded-2xl text-sm text-gray-500 shadow-inner"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-gray-500 uppercase ml-1">Motivo de la Baja</label>
                                        <div className="relative">
                                            <AlertTriangle size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500/60" />
                                            <input
                                                type="text"
                                                placeholder="Ej: Material dañado en transporte / Vencimiento..."
                                                value={bulkReason}
                                                onChange={e => setBulkReason(e.target.value)}
                                                className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none shadow-sm"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowBulkModal(false)}
                                        className="flex-1 px-6 py-4 bg-white border border-gray-200 text-gray-600 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => handleBulkProcess()}
                                        disabled={isProcessingRequest || (bulkType === 'ENTREGA' && !bulkReceptor.trim()) || (bulkType === 'BAJA' && !bulkReason.trim())}
                                        className={`flex-1 py-4 text-white rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 active:scale-[0.95] ${isProcessingRequest
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                                            : bulkType === 'BAJA'
                                                ? 'bg-amber-600 shadow-amber-200/50 hover:bg-amber-700 hover:shadow-xl'
                                                : 'bg-green-600 shadow-green-200/50 hover:bg-green-700 hover:shadow-xl'
                                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {isProcessingRequest ? (
                                            <>
                                                <Loader2 size={20} className="animate-spin" /> Procesando...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={20} />
                                                {bulkType === 'BAJA' ? 'Confirmar Baja Masiva' : 'Confirmar Entrega Masiva'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}


                {/* Modal de Confirmación de Solicitudes */}
                {
                    requestConfirm && (
                        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className={`p-5 flex items-start gap-4 border-b ${requestConfirm.status === 'APROBADA' ? 'bg-blue-50 border-blue-100' :
                                    requestConfirm.status === 'RECHAZADA' ? 'bg-red-50 border-red-100' :
                                        'bg-green-50 border-green-100'
                                    }`}>
                                    <div className={`p-2 rounded-full ${requestConfirm.status === 'APROBADA' ? 'bg-blue-100 text-blue-600' :
                                        requestConfirm.status === 'RECHAZADA' ? 'bg-red-100 text-red-600' :
                                            'bg-green-100 text-green-600'
                                        }`}>
                                        {requestConfirm.status === 'ENTREGADA' ? <Truck size={24} /> :
                                            requestConfirm.status === 'APROBADA' ? <Check size={24} /> : <X size={24} />}
                                    </div>
                                    <div className="flex-1 mt-1">
                                        <h3 className="text-xl font-bold text-gray-900">
                                            {requestConfirm.status === 'APROBADA' && 'Aprobar y Reservar Stock'}
                                            {requestConfirm.status === 'RECHAZADA' && 'Rechazar Solicitud'}
                                            {requestConfirm.status === 'ENTREGADA' && 'Confirmar Retiro'}
                                        </h3>
                                        {bulkApprovalQueue.length > 0 && requestConfirm.status === 'APROBADA' && (
                                            <p className="text-[11px] text-blue-600 font-bold mt-0.5">
                                                📦 Quedan {bulkApprovalQueue.length} artículo{bulkApprovalQueue.length > 1 ? 's' : ''} más en este pedido
                                            </p>
                                        )}
                                    </div>
                                    <button onClick={() => { setRequestConfirm(null); setRequestLocations([]); setBulkApprovalQueue([]); }} className="text-gray-400 hover:text-gray-600 outline-none">
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="p-5 space-y-4">
                                    <p className="text-sm text-gray-600">
                                        {requestConfirm.status === 'APROBADA' && <>¿Aprobar y <strong>reservar stock</strong> para <strong>{requestConfirm.req.quantity}x {requestConfirm.req.productName}</strong> de {requestConfirm.req.requestedBy.split('@')[0]}? El stock se descontará ahora del inventario principal.</>}
                                        {requestConfirm.status === 'RECHAZADA' && <>¿Rechazar la solicitud de <strong>{requestConfirm.req.quantity}x {requestConfirm.req.productName}</strong> de {requestConfirm.req.requestedBy.split('@')[0]}?</>}
                                        {requestConfirm.status === 'ENTREGADA' && <>Confirmar que <strong>{requestConfirm.req.requestedBy.split('@')[0]}</strong> retiró <strong>{requestConfirm.req.quantity}x {requestConfirm.req.productName}</strong>. El stock ya fue descontado al aprobar.</>}
                                    </p>

                                    {requestConfirm.status === 'APROBADA' && (() => {
                                        const locs = new Set<string>();
                                        allProducts.forEach(p => {
                                            if ((p.code || '').toLowerCase() === requestConfirm.req.productCode.toLowerCase() && p.details && Number(p.stock) > 0) {
                                                locs.add(getCleanLocation(p.details));
                                            }
                                        });
                                        const availableLocs = Array.from(locs);

                                        if (availableLocs.length === 0) return null;

                                        return (
                                            <div className="mt-3 bg-blue-50/40 p-4 rounded-xl border border-blue-100 mb-2">
                                                <div className="flex justify-between items-center mb-4">
                                                    <label className="text-sm font-bold text-blue-800">Reservar desde:</label>
                                                    <span className="text-xs font-semibold px-2 py-1 bg-white border border-blue-200 rounded-md text-blue-700 shadow-sm flex items-center gap-1.5">
                                                        Seleccionado: <span className="font-bold text-sm bg-blue-50 px-1 rounded">{requestLocations.reduce((s, i) => s + i.quantity, 0)}</span> / {requestConfirm.req.quantity}
                                                    </span>
                                                </div>

                                                <div className="space-y-3">
                                                    {availableLocs.map(loc => {
                                                        const maxAvailable = getAvailableStockInLocation(requestConfirm.req.productCode, loc, requestConfirm.req.id);
                                                        const currentQty = requestLocations.find(m => m.location === loc)?.quantity || 0;
                                                        const totalSelected = requestLocations.reduce((s, i) => s + i.quantity, 0);
                                                        const canAdd = currentQty < maxAvailable && totalSelected < requestConfirm.req.quantity;

                                                        return (
                                                            <div key={loc} className={`bg-white border rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors ${currentQty > 0 ? 'border-blue-400 ring-1 ring-blue-400/20' : 'border-blue-200'}`}>
                                                                <div className="flex-1 min-w-0 pr-3">
                                                                    <div className="text-sm font-bold text-gray-800 line-clamp-1 truncate" title={loc}>{loc}</div>
                                                                    <div className="text-xs text-gray-500 font-medium mt-0.5">Stock local: <span className="text-gray-700 font-bold">{maxAvailable}</span></div>
                                                                </div>

                                                                <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-100 shrink-0">
                                                                    <button
                                                                        type="button"
                                                                        disabled={currentQty === 0}
                                                                        onClick={() => {
                                                                            const newArr = [...requestLocations];
                                                                            const idx = newArr.findIndex(m => m.location === loc);
                                                                            if (idx >= 0) {
                                                                                if (newArr[idx].quantity > 1) {
                                                                                    newArr[idx].quantity -= 1;
                                                                                } else {
                                                                                    newArr.splice(idx, 1);
                                                                                }
                                                                                setRequestLocations(newArr);
                                                                            }
                                                                        }}
                                                                        className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300 disabled:opacity-40 transition-colors shadow-sm cursor-pointer"
                                                                    >
                                                                        <span className="text-lg font-bold leading-none select-none">-</span>
                                                                    </button>

                                                                    <span className="font-bold text-gray-900 w-8 text-center select-none">{currentQty}</span>

                                                                    <button
                                                                        type="button"
                                                                        disabled={!canAdd}
                                                                        onClick={() => {
                                                                            const newArr = [...requestLocations];
                                                                            const idx = newArr.findIndex(m => m.location === loc);
                                                                            if (idx >= 0) {
                                                                                newArr[idx].quantity += 1;
                                                                            } else {
                                                                                newArr.push({ location: loc, quantity: 1 });
                                                                            }
                                                                            setRequestLocations(newArr);
                                                                        }}
                                                                        className="w-8 h-8 flex items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors shadow-sm cursor-pointer"
                                                                    >
                                                                        <span className="text-lg font-bold leading-none select-none">+</span>
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const currentTotal = requestLocations.reduce((s, i) => s + i.quantity, 0);
                                                                            const currentInLoc = requestLocations.find(m => m.location === loc)?.quantity || 0;
                                                                            const needed = requestConfirm.req.quantity - currentTotal;
                                                                            const availableInLoc = maxAvailable - currentInLoc;
                                                                            const toAdd = Math.min(needed, availableInLoc);
                                                                            if (toAdd > 0) {
                                                                                const newArr = [...requestLocations];
                                                                                const idx = newArr.findIndex(m => m.location === loc);
                                                                                if (idx >= 0) {
                                                                                    newArr[idx].quantity += toAdd;
                                                                                } else {
                                                                                    newArr.push({ location: loc, quantity: toAdd });
                                                                                }
                                                                                setRequestLocations(newArr);
                                                                            }
                                                                        }}
                                                                        disabled={!canAdd}
                                                                        className="ml-2 px-2 h-8 flex items-center justify-center rounded-md bg-blue-100 text-blue-700 font-black text-[10px] uppercase tracking-tighter hover:bg-blue-200 disabled:opacity-40 transition-all border border-blue-200"
                                                                    >
                                                                        MAX
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={() => {
                                                setRequestConfirm(null);
                                                setRequestLocations([]);
                                                setBulkApprovalQueue([]);
                                            }}
                                            className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            disabled={isProcessingRequest || (requestConfirm.status === 'APROBADA' && (() => {
                                                // Check if there are locations available
                                                const locsExist = allProducts.some(p =>
                                                    p.code.toLowerCase() === requestConfirm.req.productCode.toLowerCase() && p.details && p.stock > 0
                                                );
                                                // If locations exist, require selection; otherwise allow without
                                                return locsExist && requestLocations.reduce((s, i) => s + i.quantity, 0) === 0;
                                            })())}
                                            onClick={() => {
                                                if (isProcessingRequest) return;
                                                const { req, status } = requestConfirm;
                                                setRequestConfirm(null);
                                                handleUpdateReqStatus(req, status, requestLocations.length > 0 ? requestLocations : undefined).then(() => {
                                                    advanceBulkApprovalQueue();
                                                });
                                                setRequestLocations([]);
                                            }}
                                            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${requestConfirm.status === 'APROBADA' && allProducts.some(p => p.code.toLowerCase() === requestConfirm.req.productCode.toLowerCase() && p.details && p.stock > 0) && requestLocations.reduce((s, i) => s + i.quantity, 0) === 0
                                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                : requestConfirm.status === 'APROBADA' ? 'bg-blue-600 hover:bg-blue-700 text-white' :
                                                    requestConfirm.status === 'RECHAZADA' ? 'bg-red-600 hover:bg-red-700 text-white' :
                                                        'bg-green-600 hover:bg-green-700 text-white'
                                                }`}
                                        >
                                            {requestConfirm.status === 'APROBADA' && 'Aprobar y Reservar'}
                                            {requestConfirm.status === 'RECHAZADA' && 'Rechazar'}
                                            {requestConfirm.status === 'ENTREGADA' && 'Confirmar Retiro ✓'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Delete Confirmation Modal */}
                {
                    deleteConfirm && (
                        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100">
                                <div className="p-6">
                                    <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4 mx-auto">
                                        <Trash2 size={24} />
                                    </div>
                                    <h3 className="text-xl font-black text-gray-900 text-center mb-2">
                                        Eliminar Solicitud
                                    </h3>

                                    {(deleteConfirm.status === 'APROBADA' || deleteConfirm.status === 'ENTREGADA') ? (
                                        <div className="text-center">
                                            <p className="text-gray-600 text-sm mb-4">
                                                Esta solicitud ya descontó stock del producto <strong className="text-gray-900">"{deleteConfirm.productName}"</strong>.
                                            </p>
                                            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 mb-4 text-left">
                                                <p className="text-blue-800 text-xs font-bold uppercase tracking-wider mb-1">🔄 Automático</p>
                                                <p className="text-blue-700 text-xs">El movimiento vinculado en el historial del producto será eliminado automáticamente, devolviendo el stock.</p>
                                            </div>
                                            <p className="text-gray-900 font-bold text-sm">¿Estás seguro de continuar?</p>
                                        </div>
                                    ) : (
                                        <p className="text-gray-600 text-center text-sm mb-6">
                                            ¿Estás seguro de que quieres descartar esta solicitud {" "}
                                            {deleteConfirm.status === 'PENDIENTE' ? 'pendiente' : 'basura'} para el producto <strong className="text-gray-900">"{deleteConfirm.productName}"</strong>? Esta acción no se puede deshacer.
                                        </p>
                                    )}

                                    <div className="flex gap-3 mt-6">
                                        <button
                                            onClick={() => setDeleteConfirm(null)}
                                            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={executeDeleteRequest}
                                            className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm shadow-red-200 border border-red-700 flex justify-center items-center"
                                        >
                                            <Trash2 size={16} className="mr-2" /> Eliminar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

            </div >
        </div >
    );
}
