import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product } from '../types';

export interface CartItem {
    product: Product;
    quantity: number;
}

interface CartContextType {
    cart: CartItem[];
    addToCart: (product: Product, quantity: number) => void;
    removeFromCart: (productCode: string) => void;
    updateQuantity: (productCode: string, quantity: number) => void;
    clearCart: () => void;
    totalItems: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [cart, setCart] = useState<CartItem[]>(() => {
        const savedCart = localStorage.getItem('bodega_cart');
        return savedCart ? JSON.parse(savedCart) : [];
    });

    useEffect(() => {
        localStorage.setItem('bodega_cart', JSON.stringify(cart));
    }, [cart]);

    const addToCart = (product: Product, quantity: number) => {
        setCart(prev => {
            const existingItem = prev.find(item => item.product.code === product.code);
            if (existingItem) {
                const newQty = Math.min(existingItem.quantity + quantity, product.stock);
                return prev.map(item =>
                    item.product.code === product.code
                        ? { ...item, quantity: newQty, product }
                        : item
                );
            }
            return [...prev, { product, quantity: Math.min(quantity, product.stock) }];
        });
    };

    const removeFromCart = (productCode: string) => {
        setCart(prev => prev.filter(item => item.product.code !== productCode));
    };

    const updateQuantity = (productCode: string, quantity: number) => {
        setCart(prev =>
            prev.map(item =>
                item.product.code === productCode ? { ...item, quantity } : item
            )
        );
    };

    const clearCart = () => setCart([]);

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, totalItems }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
};
