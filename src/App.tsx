import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import Login from './pages/Login';

import Catalog from './pages/Catalog';
import InventoryAdmin from './pages/InventoryAdmin';
import ProductDetails from './pages/ProductDetails';
import { AuthProvider } from './context/AuthContext';

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />

                    <Route element={<ProtectedRoute />}>
                        <Route element={<Layout />}>
                            {/* Ruta compartida para ver detalle de producto */}
                            <Route path="/product/:code" element={<ProductDetails />} />

                            {/* Rutas de VENTAS */}
                            <Route element={<ProtectedRoute allowedRole="VENTAS" />}>
                                <Route path="/catalogo" element={<Catalog />} />
                            </Route>

                            {/* Rutas exclusivas de BODEGA */}
                            <Route element={<ProtectedRoute allowedRole="BODEGA" />}>
                                <Route path="/admin" element={<InventoryAdmin />} />
                            </Route>

                            {/* Redirect unknown routes */}
                            <Route path="*" element={<Navigate to="/login" replace />} />
                        </Route>
                    </Route>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
