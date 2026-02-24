// src/types/index.ts
export interface Product {
    id: string; // From sheets or local generated
    code: string;
    name: string;
    description: string;
    stock: number;
    imageUrl: string;
    details: string;
}

export interface UserContextType {
    isAuthenticated: boolean;
    role: 'BODEGA' | 'VENTAS' | null;
    login: (email: string) => void;
    logout: () => void;
}
