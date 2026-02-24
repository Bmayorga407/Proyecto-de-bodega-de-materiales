import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
    allowedRole?: 'BODEGA' | 'VENTAS';
}

export const ProtectedRoute = ({ allowedRole }: ProtectedRouteProps) => {
    const { currentUser, role } = useAuth();

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRole && role !== allowedRole) {
        // If they are logged in but don't have the right role, send them to their default route
        return <Navigate to={role === 'BODEGA' ? '/admin' : '/catalogo'} replace />;
    }

    return <Outlet />;
};
