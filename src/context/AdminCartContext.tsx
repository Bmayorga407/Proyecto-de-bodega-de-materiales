import React, { createContext, useContext, useState, useEffect } from 'react';

interface AdminCartItem {
    productCode: string;
    name: string;
    quantity: number;
    maxStock: number;
    imageUrl?: string;
    channel?: string;
    location?: string;
}

interface AdminCartContextType {
    adminCart: AdminCartItem[];
    addToAdminCart: (product: AdminCartItem) => void;
    removeFromAdminCart: (productCode: string, location?: string) => void;
    updateAdminQuantity: (productCode: string, quantity: number, location?: string) => void;
    clearAdminCart: () => void;
    totalAdminItems: number;
}

const AdminCartContext = createContext<AdminCartContextType | undefined>(undefined);

export const AdminCartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [adminCart, setAdminCart] = useState<AdminCartItem[]>([]);

    // Load from localStorage on mount
    useEffect(() => {
        const savedCart = localStorage.getItem('warehouse_admin_cart');
        if (savedCart) {
            try {
                setAdminCart(JSON.parse(savedCart));
            } catch (e) {
                console.error('Error parsing admin cart:', e);
            }
        }
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        localStorage.setItem('warehouse_admin_cart', JSON.stringify(adminCart));
    }, [adminCart]);

    const addToAdminCart = (item: AdminCartItem) => {
        setAdminCart(prev => {
            const existingIndex = prev.findIndex(i => i.productCode === item.productCode && i.location === item.location);
            if (existingIndex > -1) {
                const newCart = [...prev];
                const newQty = Math.min(newCart[existingIndex].quantity + item.quantity, item.maxStock);
                newCart[existingIndex] = { ...newCart[existingIndex], quantity: newQty };
                return newCart;
            }
            return [...prev, item];
        });
    };

    const removeFromAdminCart = (productCode: string, location?: string) => {
        setAdminCart(prev => prev.filter(i => !(i.productCode === productCode && i.location === location)));
    };

    const updateAdminQuantity = (productCode: string, quantity: number, location?: string) => {
        setAdminCart(prev => prev.map(i =>
            (i.productCode === productCode && i.location === location)
                ? { ...i, quantity: Math.min(Math.max(1, quantity), i.maxStock) }
                : i
        ));
    };

    const clearAdminCart = () => setAdminCart([]);

    const totalAdminItems = adminCart.length;

    return (
        <AdminCartContext.Provider value={{
            adminCart,
            addToAdminCart,
            removeFromAdminCart,
            updateAdminQuantity,
            clearAdminCart,
            totalAdminItems
        }}>
            {children}
        </AdminCartContext.Provider>
    );
};

export const useAdminCart = () => {
    const context = useContext(AdminCartContext);
    if (context === undefined) {
        throw new Error('useAdminCart must be used within an AdminCartProvider');
    }
    return context;
};
