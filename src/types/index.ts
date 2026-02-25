// src/types/index.ts
export interface Product {
    id: string; // From sheets or local generated
    code: string;
    name: string;
    description: string;
    stock: number;
    imageUrl: string;
    details: string;
    entryDate?: string;
    registeredBy?: string;
    editedBy?: string;
}

export interface UserContextType {
    isAuthenticated: boolean;
    role: 'BODEGA' | 'VENTAS' | null;
    login: (email: string) => void;
    logout: () => void;
}

export type RequestStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'ENTREGADA' | 'CANCELADA';

export interface OrderRequest {
    id: string;
    productCode: string;
    productName: string;
    quantity: number;
    requestedBy: string; // The human name they typed
    status: RequestStatus;
    dateRequested: string;
    processedBy?: string; // Email of the Bodega user who approved/rejected/delivered
    requesterEmail?: string; // Email of the Ventas user who created it
}
