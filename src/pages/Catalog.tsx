import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package, Loader2 } from 'lucide-react';
import { Product } from '../types';
import { inventoryService } from '../services/inventoryService';

export default function Catalog() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await inventoryService.fetchProducts();

                // Agrupar productos con el mismo código y sumar su stock
                const aggregatedMap = new Map<string, Product>();

                data.forEach((p) => {
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

                // Convertir el Map de vuelta a un array para el estado
                setProducts(Array.from(aggregatedMap.values()));
            } catch (err) {
                console.error(err);
                // Optionally set an error state here
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    // Real-time search filtering
    const filteredProducts = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return products.filter(p =>
            p.name.toLowerCase().includes(term) ||
            p.code.toLowerCase().includes(term)
        );
    }, [searchTerm, products]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-coca-red to-red-600">
                    Catálogo Digital
                </h1>

                <div className="relative w-full md:w-96">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coca-red focus:border-coca-red sm:text-sm transition-shadow shadow-sm"
                        placeholder="Buscar por nombre o código..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
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
                ) : filteredProducts.length > 0 ? (
                    filteredProducts.map((product) => (
                        <div key={product.id || product.code} onClick={() => navigate(`/product/${product.code}`)} className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-xl transition-shadow border border-gray-100 group cursor-pointer hover:border-coca-red/30">
                            <div className="h-48 bg-gray-50 relative border-b border-gray-100 flex justify-center items-center">
                                {product.imageUrl ? (
                                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                    <Package size={48} className="text-gray-300 group-hover:scale-110 transition-transform duration-300" />
                                )}
                                {/* Stock Badge */}
                                <div className="absolute top-2 right-2 px-3 py-1 rounded-full text-xs font-bold shadow-sm bg-white text-coca-red">
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
                        No se encontraron productos que coincidan con la búsqueda.
                    </div>
                )}
            </div>
        </div>
    );
}
