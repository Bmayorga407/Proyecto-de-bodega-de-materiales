import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
    allowedRoles?: ('BODEGA' | 'VENTAS' | 'SUPERVISOR' | 'LOGISTICA')[];
    allowedRole?: 'BODEGA' | 'VENTAS' | 'SUPERVISOR' | 'LOGISTICA';
}

export const ProtectedRoute = ({ allowedRole, allowedRoles }: ProtectedRouteProps) => {
    const { currentUser, role } = useAuth();

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRole && role !== allowedRole) {
        return <Navigate to={role === 'BODEGA' ? '/admin' : '/catalogo'} replace />;
    }

    if (allowedRoles && role && !allowedRoles.includes(role)) {
        return <Navigate to={role === 'BODEGA' ? '/admin' : '/catalogo'} replace />;
    }

    return <Outlet />;
};
