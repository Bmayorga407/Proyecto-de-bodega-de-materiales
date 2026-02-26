import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Plus, Save, Loader2, CheckCircle2, Eye, AlertTriangle, X, ArrowUpRight, Check, PackageCheck, Clock, Archive } from 'lucide-react';
import { OrderRequest, Product } from '../types';
import { inventoryService } from '../services/inventoryService';
import { useAuth } from '../context/AuthContext';

export default function InventoryAdmin() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [formMode, setFormMode] = useState<'none' | 'ingreso' | 'salida'>('none');
    const [activeTab, setActiveTab] = useState<'inventario' | 'solicitudes'>('inventario');
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

    const activeProducts = useMemo(() => products.filter(p => p.stock > 0), [products]);
    const archivedProducts = useMemo(() => products.filter(p => p.stock <= 0), [products]);

    // Form state
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '', code: '', description: '', stock: 0, details: '', imageUrl: '', entryDate: new Date().toISOString().split('T')[0]
    });
    const [conflictData, setConflictData] = useState<{ existing: Product, submitted: Partial<Product> } | null>(null);
    const [requestConfirm, setRequestConfirm] = useState<{ req: OrderRequest, status: OrderRequest['status'] } | null>(null);
    const [requestLocations, setRequestLocations] = useState<{ location: string, quantity: number }[]>([]);
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

            // Group products by code
            const aggregatedMap = new Map<string, Product>();
            productsData.forEach((p) => {
                if (!p.code) {
                    console.warn('Product missing code:', p);
                    return;
                }
                const codeKey = p.code.trim().toLowerCase();
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

    useEffect(() => {
        loadData();
    }, []);

    const getAvailableStockInLocation = (code: string, location: string): number => {
        const locationStock: Record<string, number> = {};
        let unallocatedNeg = 0;

        const productHistory = allProducts.filter(p => p.code.toLowerCase() === code.toLowerCase());

        productHistory.forEach(p => {
            if (p.stock > 0) {
                const loc = (p.details || 'Sin ubicación').trim();
                locationStock[loc] = (locationStock[loc] || 0) + p.stock;
            } else {
                const match = p.details?.match(/^\[(.*?)\]/);
                if (match) {
                    const loc = match[1].trim();
                    locationStock[loc] = (locationStock[loc] || 0) + p.stock;
                } else {
                    unallocatedNeg += p.stock;
                }
            }
        });

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

        if (status === 'ENTREGADA' && locations && locations.length > 0) {
            const totalQty = locations.reduce((sum, item) => sum + item.quantity, 0);
            if (totalQty === 0) {
                showError('Debes seleccionar al menos 1 unidad para entregar.');
                return;
            }
            if (totalQty > req.quantity) {
                showError(`Error: Has seleccionado (${totalQty}) pero solo pidió (${req.quantity}).`);
                return;
            }
            finalQuantity = totalQty;

            for (const item of locations) {
                const availableInLocation = getAvailableStockInLocation(req.productCode, item.location);
                if (availableInLocation < item.quantity) {
                    showError(`Error: No puedes retirar ${item.quantity} UN. La ubicación "${item.location}" solo cuenta con ${availableInLocation} UN.`);
                    return;
                }
            }
        }

        setIsProcessingRequest(true);
        try {
            await inventoryService.updateRequest(req.id, {
                ...req,
                quantity: finalQuantity,
                status,
                processedBy: currentUser?.email || 'Bodega Desconocida'
            });
            if (status === 'ENTREGADA') {
                // Generar la salida automáticamente en Inventario
                const existingProduct = products.find(p => p.code.toLowerCase() === req.productCode.toLowerCase());

                if (locations && locations.length > 0) {
                    for (const item of locations) {
                        await inventoryService.addProduct({
                            code: req.productCode,
                            name: req.productName,
                            description: 'Despacho auto-generado por Solicitud de Ventas.',
                            stock: -Math.abs(item.quantity),
                            details: `[${item.location}] Solicitud de ventas entregada a: ${req.requestedBy}`,
                            imageUrl: existingProduct ? existingProduct.imageUrl : '',
                            entryDate: new Date().toISOString().split('T')[0],
                            registeredBy: currentUser?.email || 'Bodega Desconocida'
                        });
                        // Pequeño delay de 500ms opcional para asegurar que Sheets procese la fila
                        await new Promise(res => setTimeout(res, 500));
                    }
                } else {
                    await inventoryService.addProduct({
                        code: req.productCode,
                        name: req.productName,
                        description: 'Despacho auto-generado por Solicitud de Ventas.',
                        stock: -Math.abs(req.quantity),
                        details: `Solicitud de ventas entregada a: ${req.requestedBy}`,
                        imageUrl: existingProduct ? existingProduct.imageUrl : '',
                        entryDate: new Date().toISOString().split('T')[0],
                        registeredBy: currentUser?.email || 'Bodega Desconocida'
                    });
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

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
        }
    };

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newCode = e.target.value;
        const existingProduct = products.find(p => p.code.toLowerCase() === newCode.toLowerCase());

        if (existingProduct) {
            setFormData(prev => ({
                ...prev,
                code: newCode,
                name: prev.name || existingProduct.name, // Auto-completar solo si está vacío o pisar? Pisaremos para mayor rapidez.
                description: prev.description || existingProduct.description,
            }));

            // Si el nombre ya era igual se mantiene, si estaba vacío lo llena. 
            // Si el usuario borra todo y empieza a escribir, al poner el código se llenará todo.
            // Para forzar la sobreescritura (más útil): 
            setFormData(prev => ({
                ...prev,
                code: newCode,
                name: existingProduct.name,
                description: existingProduct.description,
                imageUrl: existingProduct.imageUrl || prev.imageUrl
            }));
        } else {
            setFormData(prev => ({ ...prev, code: newCode }));
        }
    };

    const executeSave = async (dataToSave: Partial<Product>) => {
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
                itemsToSave = manualLocations.map(item => ({
                    ...dataToSave,
                    stock: -Math.abs(item.quantity),
                    details: `[${item.location}] Salida manual a: ${dataToSave.details || 'No especificado'}`,
                    imageUrl: existing.imageUrl
                }));
            } else {
                // Sin ubicaciones especificas (comportamiento legacy)
                itemsToSave = [{
                    ...dataToSave,
                    stock: -Math.abs(requestedStock),
                    details: `Salida manual a: ${dataToSave.details || 'No especificado'}`,
                    imageUrl: existing.imageUrl
                }];
            }
        } else {
            // Ingreso
            itemsToSave = [dataToSave];
        }

        setIsSaving(true);
        try {
            for (const item of itemsToSave) {
                await inventoryService.addProduct({
                    ...item,
                    registeredBy: currentUser?.email || 'Bodega Desconocida'
                } as Product, formMode === 'ingreso' ? (imageFile || undefined) : undefined);
                // Retraso de seguridad para que Sheets pueda insertar la fila correctamente sin colisiones
                if (itemsToSave.length > 1) await new Promise(res => setTimeout(res, 500));
            }

            setSuccessMsg(`Registro de ${formMode === 'ingreso' ? 'ingreso' : 'salida'} para ${dataToSave.code} completado.`);

            setTimeout(() => {
                setSuccessMsg('');
                setFormMode('none');
                setFormData({ name: '', code: '', description: '', stock: 0, details: '', imageUrl: '', entryDate: new Date().toISOString().split('T')[0] });
                setImageFile(null);
                setManualLocations([]);
                loadData(); // refresh the table
            }, 2500);
        } catch (err) {
            console.error(err);
            showError("Hubo un error al guardar el producto. Revisa la consola.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

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

        executeSave(formData);
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-8">
            {/* Success Notification */}
            {successMsg && (
                <div className="fixed top-4 right-4 bg-green-50 text-green-800 border-l-4 border-green-500 p-4 rounded shadow-lg z-50 flex items-center gap-3 animate-in slide-in-from-top-2">
                    <CheckCircle2 size={20} className="text-green-500" />
                    <p className="font-medium text-sm">{successMsg}</p>
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
                        <h2 className="text-xl font-semibold mb-6 border-b pb-4 flex items-center gap-2">
                            {formMode === 'ingreso' ? 'Registrar Nuevo Entrada de Material' : 'Registrar Salida de Material'}
                        </h2>

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
                                <form onSubmit={handleSave} className="space-y-5">
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

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Código Identificador {formMode === 'salida' && '(Obligatorio)'}</label>
                                            <input required type="text" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none"
                                                value={formData.code} onChange={handleCodeChange} placeholder="Escribe el código para auto-rellenar..." />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del producto {formMode === 'salida' && '(Automático)'}</label>
                                            <input required type="text" className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none ${formMode === 'salida' ? 'bg-gray-100 text-gray-600' : ''}`}
                                                value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} disabled={formMode === 'salida'} />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción más detallada {formMode === 'salida' && '(Automático)'}</label>
                                        <textarea className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none ${formMode === 'salida' ? 'bg-gray-100 text-gray-600' : ''}`} rows={3}
                                            value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} disabled={formMode === 'salida'} />
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
                                        <div className="col-span-1">
                                            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{formMode === 'ingreso' ? 'Stock a Ingresar' : 'Cantidad a Retirar'}</label>
                                            <input required type="number" min="1" className="w-full px-3 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none text-sm md:text-base"
                                                value={formData.stock || ''} onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })} />
                                        </div>
                                        <div className="col-span-1">
                                            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">Fecha ({formMode === 'ingreso' ? 'Llegada' : 'Entrega'})</label>
                                            <input required type="date" className="w-full px-2 md:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none text-sm md:text-base cursor-pointer"
                                                value={formData.entryDate || ''} onChange={e => setFormData({ ...formData, entryDate: e.target.value })} />
                                        </div>

                                        {formMode === 'salida' && availableLocationsForSalida.length > 0 && (
                                            <div className="col-span-2 md:col-span-3 bg-red-50/40 p-4 rounded-xl border border-red-100 mt-2 mb-2">
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
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        <div className="col-span-2 md:col-span-3">
                                            <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">{formMode === 'ingreso' ? 'Ubicación / Detalles' : 'Entregado a / Motivo'}</label>
                                            <input required={formMode === 'salida'} type="text"
                                                className={`w-full px-3 md:px-4 py-2 border rounded-lg focus:outline-none text-sm md:text-base transition-colors ${formMode === 'ingreso' && isNewLocation
                                                    ? 'border-orange-400 focus:ring-2 focus:ring-orange-400 bg-orange-50/30'
                                                    : 'focus:ring-2 focus:ring-coca-red'
                                                    }`}
                                                placeholder={formMode === 'salida' ? 'Ej. Juan Pérez - Cuadrilla 3' : ''}
                                                value={formData.details} onChange={e => setFormData({ ...formData, details: e.target.value })} />

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

                                    <div className="pt-6 flex justify-end gap-3 border-t">
                                        <button disabled={isSaving} type="button" onClick={() => { setFormMode('none'); setManualLocations([]); setFormData({ name: '', code: '', description: '', stock: 0, details: '', imageUrl: '', entryDate: new Date().toISOString().split('T')[0] }); }} className="px-5 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                                            Cancelar
                                        </button>
                                        <button disabled={isSaving} type="submit" className={`px-5 py-2 text-white rounded-lg font-medium flex items-center gap-2 transition-all 
                                ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-coca-black hover:bg-gray-800'}`}>
                                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                            {isSaving ? 'Guardando...' : 'Guardar'}
                                        </button>
                                    </div>
                                </form>
                            );
                        })()}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Tabs */}
                        <div className="flex gap-2 sm:gap-6 border-b border-gray-200">
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
                                {requests.filter(r => r.status === 'PENDIENTE').length > 0 && (
                                    <span className="bg-red-100 text-coca-red py-0.5 px-2 rounded-full text-xs">
                                        {requests.filter(r => r.status === 'PENDIENTE').length}
                                    </span>
                                )}
                            </button>
                        </div>

                        <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                            <div className="overflow-x-auto">
                                {activeTab === 'inventario' ? (
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Agrupado</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Historial</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {isLoading ? (
                                                <tr><td colSpan={4} className="py-10 text-center text-gray-500"><Loader2 className="animate-spin mx-auto text-coca-red w-8 h-8 mb-2" />Cargando catálogo...</td></tr>
                                            ) : products.length === 0 ? (
                                                <tr><td colSpan={4} className="py-10 text-center text-gray-500">No hay productos registrados en la base de datos de Sheets.</td></tr>
                                            ) : (
                                                <>
                                                    {activeProducts.map(p => (
                                                        <tr key={p.id || p.code}>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-3">
                                                                {p.imageUrl ? <img src={p.imageUrl} className="w-10 h-10 object-cover rounded-md border" /> : <div className="w-10 h-10 bg-gray-100 rounded-md border flex items-center justify-center"><Camera size={16} className="text-gray-400" /></div>}
                                                                {p.name}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">{p.code}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                <span className="px-2 inline-flex text-xs leading-5 font-bold rounded-full border bg-green-50 text-green-700 border-green-200">
                                                                    {p.stock}
                                                                </span>
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
                                                    ))}
                                                    {archivedProducts.length > 0 && (
                                                        <>
                                                            <tr>
                                                                <td colSpan={4} className="px-0 py-0 border-t border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group" onClick={() => setShowArchivedAdmin(!showArchivedAdmin)}>
                                                                    <div className="w-full py-3 flex items-center justify-center gap-2 text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors">
                                                                        <Archive size={16} />
                                                                        {showArchivedAdmin ? 'Ocultar' : 'Ver'} {archivedProducts.length} productos agotados (Archivados)
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                            {showArchivedAdmin && archivedProducts.map(p => (
                                                                <tr key={p.id || p.code} className="bg-gray-50/50 opacity-75 grayscale-[0.3]">
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-500 flex items-center gap-3">
                                                                        {p.imageUrl ? <img src={p.imageUrl} className="w-10 h-10 object-cover rounded-md border opacity-60" /> : <div className="w-10 h-10 bg-gray-200 rounded-md border flex items-center justify-center"><Camera size={16} className="text-gray-400" /></div>}
                                                                        <span className="line-through decoration-gray-300">{p.name}</span>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-400">{p.code}</td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                        <span className="px-2 inline-flex text-xs leading-5 font-bold rounded-full border bg-gray-200 text-gray-600 border-gray-300">
                                                                            Agotado ({p.stock})
                                                                        </span>
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
                                ) : (
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Solicitud</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Solicitante</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {isLoading ? (
                                                <tr><td colSpan={4} className="py-10 text-center text-gray-500"><Loader2 className="animate-spin mx-auto text-coca-red w-8 h-8 mb-2" />Cargando solicitudes...</td></tr>
                                            ) : requests.length === 0 ? (
                                                <tr><td colSpan={4} className="py-10 text-center text-gray-500">No hay solicitudes registradas.</td></tr>
                                            ) : requests.map(req => (
                                                <tr key={req.id} className={req.status === 'PENDIENTE' ? 'bg-orange-50/30' : ''}>
                                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                                        <div className="flex flex-col">
                                                            <span>{req.productName} ({req.productCode})</span>
                                                            <span className="text-coca-red font-bold">{req.quantity} UN</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-500">
                                                        <div className="flex flex-col">
                                                            <span>{req.requestedBy.split('@')[0]}</span>
                                                            <span className="text-xs text-gray-400">{new Date(req.dateRequested).toLocaleDateString()}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                        {req.status === 'PENDIENTE' && <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-lg text-xs font-bold inline-flex items-center gap-1"><Clock size={12} /> Pendiente</span>}
                                                        {req.status === 'APROBADA' && <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold inline-flex items-center gap-1"><Check size={12} /> Aprobada</span>}
                                                        {req.status === 'ENTREGADA' && <span className="px-2 py-1 bg-green-100 text-green-800 rounded-lg text-xs font-bold inline-flex items-center gap-1"><PackageCheck size={12} /> Entregada</span>}
                                                        {req.status === 'RECHAZADA' && <span className="px-2 py-1 bg-red-100 text-red-800 rounded-lg text-xs font-bold inline-flex items-center gap-1"><X size={12} /> Rechazada</span>}
                                                        {req.status === 'CANCELADA' && <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-lg text-xs font-bold inline-flex items-center gap-1"><X size={12} /> Cancelada</span>}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                        <div className="flex justify-end gap-2">
                                                            {isProcessingRequest ? (
                                                                <Loader2 size={18} className="animate-spin text-gray-400" />
                                                            ) : (
                                                                <>
                                                                    {req.status === 'PENDIENTE' && (
                                                                        <>
                                                                            <button onClick={() => setRequestConfirm({ req, status: 'APROBADA' })} title="Aprobar Solicitud" className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"><Check size={18} /></button>
                                                                            <button onClick={() => setRequestConfirm({ req, status: 'RECHAZADA' })} title="Rechazar" className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"><X size={18} /></button>
                                                                        </>
                                                                    )}
                                                                    {req.status === 'APROBADA' && (
                                                                        <button onClick={() => setRequestConfirm({ req, status: 'ENTREGADA' })} className="px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors font-bold text-xs flex items-center gap-1">
                                                                            <PackageCheck size={16} /> Confirmar Entrega
                                                                        </button>
                                                                    )}
                                                                    {(req.status === 'ENTREGADA' || req.status === 'RECHAZADA') && (
                                                                        <span className="text-gray-400 inline-flex p-2"><Archive size={18} /></span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal de Resolución de Conflictos */}
                {conflictData && (
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
                )}

                {/* Modal de Confirmación de Solicitudes */}
                {requestConfirm && (
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
                                    {requestConfirm.status === 'ENTREGADA' ? <PackageCheck size={24} /> :
                                        requestConfirm.status === 'APROBADA' ? <Check size={24} /> : <X size={24} />}
                                </div>
                                <div className="flex-1 mt-1">
                                    <h3 className="text-xl font-bold text-gray-900">
                                        {requestConfirm.status === 'APROBADA' && 'Aprobar Solicitud'}
                                        {requestConfirm.status === 'RECHAZADA' && 'Rechazar Solicitud'}
                                        {requestConfirm.status === 'ENTREGADA' && 'Confirmar Entrega'}
                                    </h3>
                                </div>
                                <button onClick={() => setRequestConfirm(null)} className="text-gray-400 hover:text-gray-600 outline-none">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-5 space-y-4">
                                <p className="text-sm text-gray-600">
                                    ¿Estás seguro de <strong>{requestConfirm.status.toLowerCase()}</strong> la solicitud de <strong>{requestConfirm.req.quantity}x {requestConfirm.req.productName}</strong> para {requestConfirm.req.requestedBy.split('@')[0]}?
                                    {requestConfirm.status === 'ENTREGADA' && ' Esto generará automáticamente una salida y descontará el stock del inventario principal.'}
                                </p>

                                {requestConfirm.status === 'ENTREGADA' && (() => {
                                    const locs = new Set<string>();
                                    allProducts.forEach(p => {
                                        if (p.code.toLowerCase() === requestConfirm.req.productCode.toLowerCase() && p.details && p.stock > 0) {
                                            locs.add(p.details.trim());
                                        }
                                    });
                                    const availableLocs = Array.from(locs);

                                    if (availableLocs.length === 0) return null;

                                    return (
                                        <div className="mt-3 bg-red-50/40 p-4 rounded-xl border border-red-100 mb-2">
                                            <div className="flex justify-between items-center mb-4">
                                                <label className="text-sm font-bold text-red-800">Extraer desde:</label>
                                                <span className="text-xs font-semibold px-2 py-1 bg-white border border-red-200 rounded-md text-red-700 shadow-sm flex items-center gap-1.5">
                                                    Seleccionado: <span className="font-bold text-sm bg-red-50 px-1 rounded">{requestLocations.reduce((s, i) => s + i.quantity, 0)}</span> / {requestConfirm.req.quantity}
                                                </span>
                                            </div>

                                            <div className="space-y-3">
                                                {availableLocs.map(loc => {
                                                    const maxAvailable = getAvailableStockInLocation(requestConfirm.req.productCode, loc);
                                                    const currentQty = requestLocations.find(m => m.location === loc)?.quantity || 0;
                                                    const totalSelected = requestLocations.reduce((s, i) => s + i.quantity, 0);
                                                    const canAdd = currentQty < maxAvailable && totalSelected < requestConfirm.req.quantity;

                                                    return (
                                                        <div key={loc} className={`bg-white border rounded-xl p-3 shadow-sm flex items-center justify-between transition-colors ${currentQty > 0 ? 'border-red-400 ring-1 ring-red-400/20' : 'border-red-200'}`}>
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
                                                                    className="w-8 h-8 flex items-center justify-center rounded-md bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-600 transition-colors shadow-sm cursor-pointer"
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
                                                                    className="w-8 h-8 flex items-center justify-center rounded-md bg-coca-red text-white hover:bg-coca-black disabled:opacity-40 disabled:hover:bg-coca-red transition-colors shadow-sm cursor-pointer"
                                                                >
                                                                    <span className="text-lg font-bold leading-none select-none">+</span>
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
                                        }}
                                        className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                                    >
                                        Cancelar
                                    </button>
                                    {requestConfirm.status === 'ENTREGADA' && (
                                        <button
                                            onClick={() => {
                                                const { req } = requestConfirm;
                                                setRequestConfirm(null);
                                                handleUpdateReqStatus(req, 'RECHAZADA');
                                                setRequestLocations([]);
                                            }}
                                            className="px-4 py-2 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                                        >
                                            Rechazar (Sin Stock)
                                        </button>
                                    )}
                                    <button
                                        disabled={requestConfirm.status === 'ENTREGADA' && requestLocations.reduce((s, i) => s + i.quantity, 0) === 0}
                                        onClick={() => {
                                            const { req, status } = requestConfirm;
                                            setRequestConfirm(null);
                                            handleUpdateReqStatus(req, status, requestLocations);
                                            setRequestLocations([]);
                                        }}
                                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${requestConfirm.status === 'ENTREGADA' && requestLocations.reduce((s, i) => s + i.quantity, 0) === 0
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : requestConfirm.status === 'APROBADA' ? 'bg-blue-600 hover:bg-blue-700 text-white' :
                                                requestConfirm.status === 'RECHAZADA' ? 'bg-red-600 hover:bg-red-700 text-white' :
                                                    'bg-green-600 hover:bg-green-700 text-white'
                                            }`}
                                    >
                                        {requestConfirm.status === 'ENTREGADA' && requestLocations.reduce((s, i) => s + i.quantity, 0) > 0 && requestLocations.reduce((s, i) => s + i.quantity, 0) < requestConfirm.req.quantity
                                            ? 'Entrega Parcial' : 'Confirmar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
