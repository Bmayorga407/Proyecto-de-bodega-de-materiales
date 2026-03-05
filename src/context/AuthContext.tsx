import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    User
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { setInventoryUserEmail } from '../services/inventoryService';

type Role = 'BODEGA' | 'VENTAS' | 'SUPERVISOR' | 'LOGISTICA' | null;

interface AuthContextType {
    currentUser: User | null;
    role: Role;
    isTestUser: boolean;
    loading: boolean;
    login: (email: string, pass: string) => Promise<any>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};

// Correos exclusivos y cerrados para el rol de VENTAS
const VENTAS_EMAILS = [
    'ventas1@coca-cola.local',
    'ventas@coca-cola.local',
    // <-- Añadir aquí futuros correos de ventas
];

// Correos exclusivos para SUPERVISOR (próximamente)
const SUPERVISOR_EMAILS = [
    'supervisor@coca-cola.local'
];

// Correos exclusivos para logística
const LOGISTICA_EMAILS = [
    'logistica@coca-cola.local',
    'logistica1@coca-cola.local'
];

// Correos destinados al Testing Environment
const TEST_EMAILS = [
    'brian.mayorga@coca-cola.local',
    'ventas1@coca-cola.local',
    'logistica1@coca-cola.local'
];

const determineRole = (email: string | null): Role => {
    if (!email) return null;
    const lowerEmail = email.toLowerCase();

    // 1. Check if Supervisor
    if (SUPERVISOR_EMAILS.includes(lowerEmail)) {
        return 'SUPERVISOR';
    }

    // 2. Check if Ventas
    if (VENTAS_EMAILS.includes(lowerEmail)) {
        return 'VENTAS';
    }

    // 3. Check if Logistica
    if (LOGISTICA_EMAILS.includes(lowerEmail)) {
        return 'LOGISTICA';
    }

    // 3. Fallback: Everyone else defaults to Bodega
    return 'BODEGA';
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [role, setRole] = useState<Role>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setRole(determineRole(user?.email || null));
            setInventoryUserEmail(user?.email || null);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const login = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass).then();

    const logout = () => signOut(auth);

    const isTestUser = currentUser?.email ? TEST_EMAILS.includes(currentUser.email.toLowerCase()) : false;

    const value = {
        currentUser,
        role,
        isTestUser,
        loading,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
