import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import Catalog from './pages/Catalog';
import InventoryAdmin from './pages/InventoryAdmin';
import ProductDetails from './pages/ProductDetails';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { AdminCartProvider } from './context/AdminCartContext';

function App() {
    return (
        <AuthProvider>
            <CartProvider>
                <AdminCartProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="/login" element={<Login />} />

                            <Route element={<ProtectedRoute />}>
                                <Route element={<Layout />}>
                                    {/* Ruta compartida para ver detalle de producto */}
                                    <Route path="/product/:code" element={<ProductDetails />} />

                                    {/* Rutas de Catálogo (Ventas, Logística, Supervisores) */}
                                    <Route element={<ProtectedRoute allowedRoles={['VENTAS', 'LOGISTICA', 'SUPERVISOR']} />}>
                                        <Route path="/catalogo" element={<Catalog />} />
                                    </Route>

                                    {/* Rutas exclusivas de BODEGA */}
                                    <Route element={<ProtectedRoute allowedRole="BODEGA" />}>
                                        <Route path="/admin" element={<InventoryAdmin />} />
                                    </Route>
                                </Route>
                            </Route>

                            {/* Redirect unknown routes */}
                            <Route path="*" element={<Navigate to="/login" replace />} />
                        </Routes>
                    </BrowserRouter>
                </AdminCartProvider>
            </CartProvider>
        </AuthProvider>
    );
}

export default App;
