import { useState, useEffect } from 'react';
import { Camera, Plus, Save, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { Product } from '../types';
import { inventoryService } from '../services/inventoryService';

export default function InventoryAdmin() {
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [successMsg, setSuccessMsg] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);

    // Example form state (you'd use react-hook-form in production)
    const [formData, setFormData] = useState<Partial<Product>>({
        name: '', code: '', description: '', stock: 0, details: ''
    });

    const loadProducts = async () => {
        try {
            setIsLoading(true);
            const data = await inventoryService.fetchProducts();
            setProducts(data);
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

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await inventoryService.addProduct(formData, imageFile || undefined);
            setSuccessMsg(`Material ${formData.code} agregado correctamente.`);
            setTimeout(() => {
                setSuccessMsg('');
                setIsAdding(false);
                setFormData({ name: '', code: '', description: '', stock: 0, details: '' });
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

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Gestión de Bodega</h1>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="bg-coca-red text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm"
                    >
                        <Plus size={20} />
                        <span>Nuevo Ingreso</span>
                    </button>
                )}
            </div>

            {isAdding ? (
                <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
                    <h2 className="text-xl font-semibold mb-6 border-b pb-4">Registrar Nuevo Material</h2>

                    {successMsg && (
                        <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-2 border border-green-200">
                            <CheckCircle2 size={20} />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    <form onSubmit={handleSave} className="space-y-5">
                        {/* Camera Upload Area */}
                        <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer group
                            ${imageFile ? 'bg-red-50 border-coca-red' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}>
                            <Camera className={`mx-auto h-12 w-12 transition-colors ${imageFile ? 'text-coca-red' : 'text-gray-400 group-hover:text-coca-red'}`} />
                            <div className="mt-4 flex flex-col items-center text-sm leading-6 justify-center">
                                <label className="relative cursor-pointer rounded-md font-semibold text-coca-red focus-within:outline-none focus-within:ring-2 focus-within:ring-coca-red focus-within:ring-offset-2 hover:text-red-700">
                                    <span>{imageFile ? 'Cambiar Foto' : 'Tomar Foto o Subir'}</span>
                                    <input type="file" className="sr-only" accept="image/*" capture="environment" onChange={handleImageChange} />
                                </label>
                                {imageFile && <span className="text-sm font-medium text-gray-700 mt-2">{imageFile.name}</span>}
                            </div>
                            {!imageFile && <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF hasta 10MB</p>}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                                <input required type="text" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none"
                                    value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Código Identificador</label>
                                <input required type="text" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none"
                                    value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                            <textarea className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none" rows={3}
                                value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Actual</label>
                                <input required type="number" min="0" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none"
                                    value={formData.stock || ''} onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Detalles de Ubicación</label>
                                <input type="text" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-coca-red outline-none"
                                    value={formData.details} onChange={e => setFormData({ ...formData, details: e.target.value })} />
                            </div>
                        </div>

                        <div className="pt-6 flex justify-end gap-3 border-t">
                            <button disabled={isSaving} type="button" onClick={() => setIsAdding(false)} className="px-5 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors">
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
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
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
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={async () => {
                                                    if (window.confirm('¿Seguro que deseas eliminar este material?')) {
                                                        try {
                                                            setIsLoading(true);
                                                            await inventoryService.deleteProduct(p.id);
                                                            await loadProducts();
                                                        } catch (e) {
                                                            console.error(e);
                                                            alert("Error al eliminar.");
                                                            setIsLoading(false);
                                                        }
                                                    }
                                                }}
                                                className="text-red-500 hover:text-red-800 transition-colors p-2 rounded-full hover:bg-red-50"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
