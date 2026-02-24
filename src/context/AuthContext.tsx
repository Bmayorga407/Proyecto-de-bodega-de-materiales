import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    User
} from 'firebase/auth';
import { auth } from '../config/firebase';

type Role = 'BODEGA' | 'VENTAS' | null;

interface AuthContextType {
    currentUser: User | null;
    role: Role;
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

// Simple role determination logic:
// If email contains "bodeg", role is BODEGA
// If email contains "ventas", role is VENTAS
// Otherwise, default to VENTAS (read-only)
const determineRole = (email: string | null): Role => {
    if (!email) return null;
    const lowerEmail = email.toLowerCase();
    if (lowerEmail.includes('bodeg')) return 'BODEGA';
    if (lowerEmail.includes('ventas')) return 'VENTAS';
    return 'VENTAS'; // fallback
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [role, setRole] = useState<Role>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setRole(determineRole(user?.email || null));
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const login = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass).then();

    const logout = () => signOut(auth);

    const value = {
        currentUser,
        role,
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
