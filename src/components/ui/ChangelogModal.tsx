import { X, CheckCircle2, Package, Layers, MousePointer2, AlertCircle } from 'lucide-react';

interface ChangelogModalProps {
    onClose: () => void;
}

export const ChangelogModal = ({ onClose }: ChangelogModalProps) => {
    const improvements = [
        {
            title: "Soporte Multicanal",
            description: "Ahora los productos pueden pertenecer a múltiples canales (Tradicional, Moderno, etc.) simultáneamente.",
            icon: <Layers className="text-blue-500" size={20} />
        },
        {
            title: "Stock Unificado",
            description: "El inventario muestra el stock total sumado de todos sus canales para una gestión global simplificada.",
            icon: <Package className="text-green-500" size={20} />
        },
        {
            title: "Ingreso Flexible",
            description: "Al registrar stock, es posible elegir o cambiar el canal del bulto actual, incluso para productos existentes.",
            icon: <MousePointer2 className="text-purple-500" size={20} />
        },
        {
            title: "Etiquetado Dinámico",
            description: "Nueva etiqueta 'MULTICANAL' en el catálogo y visualización de todos los canales en el detalle del producto.",
            icon: <CheckCircle2 className="text-coca-red" size={20} />
        },
        {
            title: "Mejoras de Estabilidad",
            description: "Corrección de errores en la vista de detalles y optimización de filtros de canal.",
            icon: <AlertCircle className="text-orange-500" size={20} />
        }
    ];

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100">
                {/* Header */}
                <div className="bg-coca-red p-6 text-white relative">
                    <button 
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-0.5 bg-white/20 rounded text-[10px] font-bold tracking-widest uppercase border border-white/30 backdrop-blur-sm">
                            Nuevo
                        </span>
                        <h2 className="text-2xl font-black tracking-tight">Version 1.1.1</h2>
                    </div>
                    <p className="text-white/80 text-sm font-medium">
                        Hemos actualizado el sistema para mejorar la gestión de inventario multicanal.
                    </p>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[60vh] overflow-y-auto bg-gray-50/30">
                    <div className="space-y-6">
                        {improvements.map((item, index) => (
                            <div key={index} className="flex gap-4 group">
                                <div className="p-2.5 bg-white rounded-xl shadow-sm border border-gray-100 group-hover:scale-110 transition-transform flex-shrink-0 flex items-center justify-center h-11 w-11">
                                    {item.icon}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-base mb-1">{item.title}</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t bg-white flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-coca-black text-white rounded-xl font-black text-sm hover:bg-gray-800 transition-all active:scale-95 shadow-lg shadow-black/10"
                    >
                        ¡Entendido!
                    </button>
                </div>
            </div>
        </div>
    );
};
