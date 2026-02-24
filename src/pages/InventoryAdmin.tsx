import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Plus, Save, Loader2, CheckCircle2, Eye, AlertTriangle, X, ArrowUpRight } from 'lucide-react';
import { Product } from '../types';
import { inventoryService } from '../services/inventoryService';

export default function InventoryAdmin() {
    const navigate = useNavigate();
    const [formMode, setFormMode] = useState<'none' | 'ingreso' | 'salida'>('none');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [successMsg, setSuccessMsg] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);

    // Form state
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '', code: '', description: '', stock: 0, details: '', imageUrl: '', entryDate: new Date().toISOString().split('T')[0]
    });
    const [conflictData, setConflictData] = useState<{ existing: Product, submitted: Partial<Product> } | null>(null);

    const loadProducts = async () => {
        try {
            setIsLoading(true);
            const data = await inventoryService.fetchProducts();

            // Agrupar productos con el mismo código y sumar su stock
            const aggregatedMap = new Map<string, Product>();

            data.forEach((p) => {
                const codeKey = p.code.trim().toLowerCase();
                if (!codeKey) return;

                if (aggregatedMap.has(codeKey)) {
                    const existing = aggregatedMap.get(codeKey)!;
                    existing.stock += p.stock;
                    if (!existing.imageUrl && p.imageUrl) {
                        existing.imageUrl = p.imageUrl;
                    }
                } else {
                    aggregatedMap.set(codeKey, { ...p });
                }
            });

            setProducts(Array.from(aggregatedMap.values()));
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadProducts();
    }, []);

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
        // Validation for SALIDA
        if (formMode === 'salida') {
            const existing = products.find(p => p.code.toLowerCase() === dataToSave.code?.toLowerCase());
            const requestedStock = dataToSave.stock || 0;

            if (!existing) {
                alert("Error: El código ingresado no existe en el inventario.");
                return;
            }
            if (existing.stock < requestedStock) {
                alert(`Error: Stock insuficiente. Solo hay ${existing.stock} unidades disponibles de ${existing.name}.`);
                return;
            }

            // Format data for Salida (Negative stock, prepended details, reuse image)
            dataToSave = {
                ...dataToSave,
                stock: -Math.abs(requestedStock),
                details: `Entregado a / Salida: ${dataToSave.details || 'No especificado'}`,
                imageUrl: existing.imageUrl // Heredar imagen
            };
        }

        setIsSaving(true);
        try {
            await inventoryService.addProduct(dataToSave, formMode === 'ingreso' ? (imageFile || undefined) : undefined);
            setSuccessMsg(`Registro de ${formMode === 'ingreso' ? 'ingreso' : 'salida'} para ${dataToSave.code} completado.`);

            setTimeout(() => {
                setSuccessMsg('');
                setFormMode('none');
                setFormData({ name: '', code: '', description: '', stock: 0, details: '', imageUrl: '', entryDate: new Date().toISOString().split('T')[0] });
                setImageFile(null);
                loadProducts(); // refresh the table
            }, 2500);
        } catch (err) {
            console.error(err);
            alert("Hubo un error al guardar el producto. Revisa la consola.");
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

                    {successMsg && (
                        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-2 border border-green-200">
                            <CheckCircle2 size={20} />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    <form onSubmit={handleSave} className="space-y-5">
                        {/* Solo mostrar foto obligatoria si es ingreso */}
                        {formMode === 'ingreso' && (
                            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer group
                                ${imageFile || formData.imageUrl ? 'bg-red-50 border-coca-red' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>

                                {imageFile || formData.imageUrl ? (
                                    <img src={imageFile ? URL.createObjectURL(imageFile) : formData.imageUrl} alt="Preview" className="mx-auto h-24 w-24 object-cover rounded-md mb-2 shadow-sm border border-red-200" />
                                ) : (
                                    <Camera className="mx-auto h-12 w-12 transition-colors text-gray-400 group-hover:text-coca-red" />
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre {formMode === 'salida' && '(Automático)'}</label>
                                <input required type="text" className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none ${formMode === 'salida' ? 'bg-gray-100 text-gray-600' : ''}`}
                                    value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} disabled={formMode === 'salida'} />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción {formMode === 'salida' && '(Automático)'}</label>
                            <textarea className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none ${formMode === 'salida' ? 'bg-gray-100 text-gray-600' : ''}`} rows={3}
                                value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} disabled={formMode === 'salida'} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{formMode === 'ingreso' ? 'Stock a Ingresar' : 'Cantidad a Retirar'}</label>
                                <input required type="number" min="1" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none"
                                    value={formData.stock || ''} onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha ({formMode === 'ingreso' ? 'Llegada' : 'Entrega'})</label>
                                <input required type="date" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none cursor-pointer"
                                    value={formData.entryDate || ''} onChange={e => setFormData({ ...formData, entryDate: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{formMode === 'ingreso' ? 'Ubicación / Detalles' : 'Entregado a / Motivo'}</label>
                                <input required={formMode === 'salida'} type="text" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none" placeholder={formMode === 'salida' ? 'Ej. Juan Pérez - Cuadrilla 3' : ''}
                                    value={formData.details} onChange={e => setFormData({ ...formData, details: e.target.value })} />
                            </div>
                        </div>

                        <div className="pt-6 flex justify-end gap-3 border-t">
                            <button disabled={isSaving} type="button" onClick={() => { setFormMode('none'); setFormData({ name: '', code: '', description: '', stock: 0, details: '', imageUrl: '', entryDate: new Date().toISOString().split('T')[0] }); }} className="px-5 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                                Cancelar
                            </button>
                            <button disabled={isSaving} type="submit" className={`px-5 py-2 text-white rounded-lg font-medium flex items-center gap-2 transition-all 
                                ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-coca-black hover:bg-gray-800'}`}>
                                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                {isSaving ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
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
                                ) : products.map(p => (
                                    <tr key={p.id || p.code}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center gap-3">
                                            {p.imageUrl ? <img src={p.imageUrl} className="w-10 h-10 object-cover rounded-md border" /> : <div className="w-10 h-10 bg-gray-100 rounded-md border flex items-center justify-center"><Camera size={16} className="text-gray-400" /></div>}
                                            {p.name}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">{p.code}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-bold rounded-full border ${p.stock > 10 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
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
                            </tbody>
                        </table>
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
        </div>
    );
}
