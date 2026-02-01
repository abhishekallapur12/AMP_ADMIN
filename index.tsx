import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

import CustomerForm from './components/CustomerForm';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';

import { supabase, sheetBestUrl } from './lib/supabase';
import { WarningIcon } from './components/Icons';
import type { Appointment, AppointmentStatus } from './types';

const App = () => {
    const [page, setPage] = useState<'customer' | 'adminLogin' | 'adminDashboard'>('customer');
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

    const handleAppointmentSubmit = async (name: string, phone: string, imageFiles: File[]) => {
        if (!supabase) {
            throw new Error("Supabase client not initialized.");
        }
        
        const uploadPromises = imageFiles.map(file => {
            const fileExt = file.name.split('.').pop();
            const fileName = `${crypto.randomUUID()}.${fileExt}`;
            const filePath = `${fileName}`;
            return supabase.storage.from('wheel-images').upload(filePath, file);
        });

        const uploadResults = await Promise.all(uploadPromises);

        const urls: string[] = [];
        for (const result of uploadResults) {
            if (result.error) {
                throw new Error(`Image upload failed: ${result.error.message}`);
            }
            const { data } = supabase.storage.from('wheel-images').getPublicUrl(result.data.path);
            if (!data?.publicUrl) {
                throw new Error(`Could not get public URL for path ${result.data.path}`);
            }
            urls.push(data.publicUrl);
        }

        const { data: newAppointment, error: insertError } = await supabase
            .from('appointments')
            .insert({
                customer_name: name,
                customer_phone: phone,
                image_urls: urls,
                status: 'Pending',
                admin_notes: '',
            })
            .select()
            .single();

        if (insertError) {
            throw new Error(`Database insert failed: ${insertError.message}`);
        }

        // Sync to Google Sheet if configured
        if (sheetBestUrl && newAppointment) {
            try {
                await fetch(sheetBestUrl, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        ...newAppointment,
                        image_urls: Array.isArray(newAppointment.image_urls) ? newAppointment.image_urls.join(', ') : '',
                    }),
                });
            } catch (sheetError) {
                console.warn("Failed to sync new appointment to Google Sheet:", sheetError);
            }
        }
        
        if (page === 'adminDashboard') {
            await fetchAppointments();
        }
    };

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
        setPage('customer');
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
    const navigateToCustomerView = () => setPage('customer');
    
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
            case 'customer':
            default:
                return <CustomerForm onAppointmentSubmit={handleAppointmentSubmit} />;
        }
    };
    
    const getTitle = () => {
        switch (page) {
            case 'adminLogin': return { main: 'Admin Login', sub: 'Access the appointments dashboard' };
            case 'adminDashboard': return { main: '', sub: '' };
            case 'customer': default: return { main: 'WheelCheck', sub: 'Book Your Wheel & Rim Appointment' };
        }
    };

    const { main, sub } = getTitle();

    return (
        <div className="bg-gray-100 text-gray-800 min-h-screen flex flex-col items-center p-4 font-sans">
            <header className="w-full max-w-7xl mx-auto flex justify-end py-2">
                {page === 'customer' && <button onClick={navigateToAdminLogin} className="text-sm text-gray-600 hover:text-blue-600">Admin Panel</button>}
                {page === 'adminLogin' && <button onClick={navigateToCustomerView} className="text-sm text-gray-600 hover:text-blue-600">Customer View</button>}
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
