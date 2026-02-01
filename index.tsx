import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';

import { supabase, sheetBestUrl } from './lib/supabase';
import { WarningIcon } from './components/Icons';
import type { Appointment, AppointmentStatus } from './types';

const App = () => {
    const [page, setPage] = useState<'adminLogin' | 'adminDashboard'>('adminLogin');
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAppointments = useCallback(async () => {
        if (!supabase) return;
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase.from('appointments').select('*');
            if (error) throw error;
            setAppointments(data || []);
        } catch (err: any) {
            setError(err.message);
            console.error("Error fetching appointments:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (page === 'adminDashboard') {
            fetchAppointments();
        }
    }, [page, fetchAppointments]);

    // Persisted admin auth: keep admin logged in across refresh until they logout
    const ADMIN_AUTH_KEY = 'amptech_admin_authenticated';
    useEffect(() => {
        try {
            const v = localStorage.getItem(ADMIN_AUTH_KEY);
            if (v === 'true') {
                setPage('adminDashboard');
            }
        } catch (e) {
            console.warn('Failed to read admin auth from storage', e);
        }
    }, []);


    const handleUpdateAppointment = async (id: string, newStatus: AppointmentStatus) => {
         if (!supabase) return;
         const { error } = await supabase
            .from('appointments')
            .update({ status: newStatus })
            .eq('id', id);
        if (error) {
            console.error("Error updating appointment:", error);
            setError("Failed to update appointment. Please try again.");
        } else {
            setAppointments(prev => prev.map(app => app.id === id ? { ...app, status: newStatus } : app));
             // Sync update to Google Sheet if configured
            if (sheetBestUrl) {
                try {
                    // Sheet.best uses PATCH on the /id/:id endpoint for updates
                    await fetch(`${sheetBestUrl}/id/${id}`, {
                        method: 'PATCH',
                        mode: 'cors',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus }),
                    });
                } catch (sheetError) {
                    console.warn(`Failed to sync appointment update for ID ${id} to Google Sheet:`, sheetError);
                }
            }
        }
    };

    const handleLoginSuccess = () => {
        try {
            localStorage.setItem('amptech_admin_authenticated', 'true');
        } catch (e) {
            console.warn('Could not persist admin auth to localStorage', e);
        }
        setPage('adminDashboard');
    };
    const handleLogout = () => {
        try {
            localStorage.removeItem('amptech_admin_authenticated');
        } catch (e) {
            console.warn('Could not clear admin auth from localStorage', e);
        }
        setPage('adminLogin');
    };
    const navigateToAdminLogin = () => {
        try {
            const v = localStorage.getItem('amptech_admin_authenticated');
            if (v === 'true') {
                setPage('adminDashboard');
                return;
            }
        } catch (e) {
            console.warn('Could not read admin auth state', e);
        }
        setPage('adminLogin');
    };
    
    const renderPage = () => {
        if (!supabase) {
            return (
                 <div className="text-center text-yellow-500">
                    <WarningIcon />
                    <h2 className="text-xl font-bold mt-4">Configuration Missing</h2>
                    <p className="mt-2 text-gray-600">Supabase URL or Anon Key is not configured.</p>
                    <p className="text-sm text-gray-500 mt-1">Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.</p>
                </div>
            )
        }
        switch (page) {
            case 'adminLogin':
                return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
            case 'adminDashboard':
                return <AdminDashboard appointments={appointments} onUpdateAppointment={handleUpdateAppointment} loading={loading} onRefresh={fetchAppointments} />;
            default:
                return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
        }
    };
    
    const getTitle = () => {
        switch (page) {
            case 'adminLogin': return { main: 'Admin Login', sub: 'Access the appointments dashboard' };
            case 'adminDashboard': return { main: '', sub: '' };
            default: return { main: '', sub: '' };
        }
    };

    const { main, sub } = getTitle();

    return (
        <div className="bg-gray-100 text-gray-800 min-h-screen flex flex-col items-center p-4 font-sans">
            <header className="w-full max-w-7xl mx-auto flex justify-end py-2">
                {page === 'adminDashboard' && <button onClick={handleLogout} className="text-sm text-gray-600 hover:text-blue-600">Logout</button>}
            </header>
             <main className="w-full transition-all duration-300" style={{ maxWidth: page === 'adminDashboard' ? '64rem' : '32rem' }}>
                {(main || sub) && (
                    <div className="text-center mb-6">
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">{main}</h1>
                        <p className="text-gray-600">{sub}</p>
                    </div>
                )}
                <div className={`bg-white border border-gray-200 rounded-xl shadow-md p-6 sm:p-8 ${page !== 'adminDashboard' ? 'max-w-md mx-auto' : ''}`}>
                    {error && <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50" role="alert"><span className="font-medium">Error:</span> {error}</div>}
                    {renderPage()}
                </div>
            </main>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
