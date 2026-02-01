import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Appointment, AppointmentStatus } from '../types';
import {
  TotalRequestsIcon,
  PendingIcon,
  AcceptedIcon,
  RejectedIcon,
  DoneIcon,
  CameraIcon
} from './Icons';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const AdminDashboard = ({
  appointments,
  onUpdateAppointment,
  loading,
  onRefresh
}: {
  appointments: Appointment[];
  onUpdateAppointment: (id: string, newStatus: AppointmentStatus) => Promise<void>;
  loading: boolean;
  onRefresh: () => void;
}) => {
  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | 'All'>('All');
  const [monthFilter, setMonthFilter] = useState('all');
  const [quickDate, setQuickDate] = useState<'all' | 'today' | 'yesterday' | 'last_week' | 'last_month' | 'this_month'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  /* ================= FILTERED DATA ================= */
  const filteredAppointments = useMemo(() => {
    // Parse yyyy-mm-dd inputs as local dates to avoid timezone shifts
    const parseLocalDate = (dateStr: string, endOfDay = false): Date | null => {
      const parts = dateStr.split('-').map(Number);
      if (parts.length < 3 || parts.some(isNaN)) return null;
      const [y, m, d] = parts;
      return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
    };

    return appointments
      .filter(app => {
        const appDate = new Date(app.created_at);

        if (fromDate) {
          const from = parseLocalDate(fromDate);
          if (from && appDate < from) return false;
        }

        if (toDate) {
          const to = parseLocalDate(toDate, true);
          if (to && appDate > to) return false;
        }

        if (monthFilter === 'this_month') {
          const now = new Date();
          return (
            appDate.getMonth() === now.getMonth() &&
            appDate.getFullYear() === now.getFullYear()
          );
        }

        if (monthFilter === 'last_month') {
          const now = new Date();
          const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
          const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
          return appDate.getMonth() === lastMonth && appDate.getFullYear() === year;
        }

        return true;
      })
      .filter(app => filterStatus === 'All' || app.status === filterStatus)
      .filter(app =>
        app.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.customer_phone.includes(searchTerm)
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [appointments, filterStatus, monthFilter, searchTerm, fromDate, toDate]);

  /* ================= COUNTS ================= */
  // Counts reflect the currently filtered set (date/search/status filters)
  const counts = useMemo(() => {
    return filteredAppointments.reduce((acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1;
      return acc;
    }, {} as Record<AppointmentStatus, number>);
  }, [filteredAppointments]);

  /* ================= REPORT ================= */
  const generateReport = () => {
    if (filteredAppointments.length === 0) {
      alert('No data available for report');
      return;
    }

    const headers = ['Customer Name', 'Phone', 'Status', 'Submitted Date', 'Admin Notes'];

    const rows = filteredAppointments.map(app => [
      app.customer_name,
      app.customer_phone,
      app.status,
      new Date(app.created_at).toLocaleString(),
      app.admin_notes || ''
    ]);

    const csv =
      'data:text/csv;charset=utf-8,' +
      [headers, ...rows].map(r => r.join(',')).join('\n');

    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = 'appointments_report.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ================= UI HELPERS ================= */
  const StatusBadge = ({ status }: { status: AppointmentStatus }) => {
    const colors: Record<AppointmentStatus, string> = {
      Pending: 'bg-yellow-100 text-yellow-800',
      Accepted: 'bg-teal-100 text-teal-800',
      Rejected: 'bg-red-100 text-red-800',
      Done: 'bg-green-100 text-green-800'
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full font-medium ${colors[status]}`}>
        {status}
      </span>
    );
  };

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    setUpdatingId(id);
    await onUpdateAppointment(id, status);
    setUpdatingId(null);
  };

  // PDF/Filter helpers
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const [pdfError, setPdfError] = useState<string | null>(null);

  const clearFilters = () => {
    setSearchTerm('');
    setFromDate('');
    setToDate('');
    setFilterStatus('All');
    setMonthFilter('all');
    setQuickDate('all');
    setPdfError(null);
  };

  // When a quick-date preset is chosen, compute and populate the from/to (or monthFilter) accordingly
  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (quickDate === 'all') {
      setFromDate('');
      setToDate('');
      setMonthFilter('all');
      return;
    }

    const now = new Date();

    if (quickDate === 'today') {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      setFromDate(toYmd(s));
      setToDate(toYmd(s));
      setMonthFilter('all');
      return;
    }

    if (quickDate === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const s = new Date(y.getFullYear(), y.getMonth(), y.getDate());
      setFromDate(toYmd(s));
      setToDate(toYmd(s));
      setMonthFilter('all');
      return;
    }

    if (quickDate === 'last_week') {
      const end = new Date(now);
      end.setDate(now.getDate() - 1); // end yesterday
      const start = new Date(end);
      start.setDate(end.getDate() - 6); // 7 days window
      setFromDate(toYmd(start));
      setToDate(toYmd(end));
      setMonthFilter('all');
      return;
    }

    if (quickDate === 'last_month') {
      setMonthFilter('last_month');
      setFromDate('');
      setToDate('');
      return;
    }

    if (quickDate === 'this_month') {
      setMonthFilter('this_month');
      setFromDate('');
      setToDate('');
      return;
    }
  }, [quickDate]);

  const testPdf = async () => {
    setPdfError(null);
    try {
      const pdf = new jsPDF();
      pdf.text('PDF test - jsPDF is working', 20, 20);
      pdf.save('pdf-test.pdf');
      alert('Test PDF generated (check downloads). If this succeeded but full PDF fails, the issue is in the table/image code.');
    } catch (err: any) {
      console.error('Test PDF failed:', err);
      setPdfError(`Test PDF failed: ${err?.message || err}`);
      alert(`Test PDF failed: ${err?.message || err}`);
    }
  };

  const generatePdf = async () => {
    setPdfError(null);
    if (filteredAppointments.length === 0) {
      alert('No data to generate PDF');
      return;
    }

    const loadImageAsDataUrl = (url: string) => {
      return new Promise<{ dataUrl: string; width: number; height: number } | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0);
          resolve({ dataUrl: c.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    };

    try {
      setGeneratingPdf(true);

      // totals and counts
      const totals = {
        total: filteredAppointments.length,
        Pending: counts.Pending || 0,
        Accepted: counts.Accepted || 0,
        Rejected: counts.Rejected || 0,
        Done: counts.Done || 0
      };

      const pdf = new jsPDF('p', 'mm', 'a4');

      // add logo if available (place public/logo.png in project root)
      const logoImg = await loadImageAsDataUrl('/logo.png');
      let headerHeight = 20; // default space used by header/title
      let logoPlacement: { x: number; y: number; w: number; h: number } | null = null;
      if (logoImg) {
        const pageWidth = pdf.internal.pageSize.getWidth();
        const maxWidth = 60; // mm
        const maxHeight = 22; // mm
        const ratio = logoImg.width / logoImg.height;
        let drawW = maxHeight * ratio;
        let drawH = maxHeight;
        if (drawW > maxWidth) {
          drawW = maxWidth;
          drawH = maxWidth / ratio;
        }
        const x = (pageWidth - drawW) / 2;
        const y = 8;
        pdf.addImage(logoImg.dataUrl, 'PNG', x, y, drawW, drawH);
        headerHeight = y + drawH + 4;
        logoPlacement = { x, y, w: drawW, h: drawH };
      }

      // Title & Filters: place dynamically under the logo/header to avoid overlaps
      const titleFontSize = 16;
      const titleX = 14;
      // ensure title is placed below headerHeight with a small gap
      const titleY = (headerHeight ? headerHeight + 2 : 20);
      pdf.setFontSize(titleFontSize);
      pdf.text('Appointments Report', titleX, titleY);

      const appliedFilters: string[] = [];
      if (searchTerm) appliedFilters.push(`Search: ${searchTerm}`);
      if (fromDate) appliedFilters.push(`From: ${fromDate}`);
      if (toDate) appliedFilters.push(`To: ${toDate}`);
      if (filterStatus !== 'All') appliedFilters.push(`Status: ${filterStatus}`);
      if (quickDate !== 'all') appliedFilters.push(`Quick: ${quickDate}`);
      if (monthFilter !== 'all') appliedFilters.push(`Month: ${monthFilter}`);

      // filters appear below title
      const filtersY = titleY + 8;
      pdf.setFontSize(11);
      pdf.text(`Filters: ${appliedFilters.join(' | ') || 'None'}`, 14, filtersY);

      // draw status summary badges below filters
      const badges = [
        { label: 'Total', value: totals.total, color: '#BFDBFE' },
        { label: 'Pending', value: totals.Pending, color: '#FDE68A' },
        { label: 'Accepted', value: totals.Accepted, color: '#BBF7D0' },
        { label: 'Rejected', value: totals.Rejected, color: '#FCA5A5' },
        { label: 'Done', value: totals.Done, color: '#86EFAC' }
      ];

      let bx = 14;
      // place badges below filters (with minimum to keep original spacing)
      const by = Math.max(36, filtersY + 10);
      const bw = 34;
      const bh = 12;

      badges.forEach(b => {
        // convert hex to rgb
        const r = parseInt(b.color.slice(1, 3), 16);
        const g = parseInt(b.color.slice(3, 5), 16);
        const bl = parseInt(b.color.slice(5, 7), 16);
        pdf.setFillColor(r, g, bl);
        pdf.rect(bx, by, bw, bh, 'F');
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(10);
        pdf.text(`${b.label}: ${b.value}`, bx + 4, by + 8);
        bx += bw + 6;
      });

      // use autoTable to create a more robust table of entries with colored status text
      const body = filteredAppointments.map(a => ([
        a.customer_name,
        a.customer_phone,
        a.status,
        new Date(a.created_at).toLocaleString(),
        a.admin_notes || ''
      ]));

      // Ensure autoTable function reference is available (use imported default or dynamic import fallback)
      let autoTableFn: any = (autoTable as any) || null;
      if (!autoTableFn) {
        try {
          const mod = await import('jspdf-autotable');
          autoTableFn = (mod && (mod.default || mod));
        } catch (e) {
          console.error('autoTable plugin missing and dynamic import failed', e);
          alert('PDF table generation plugin is not available. Please install "jspdf-autotable". Falling back to CSV.');
          // fallback: open CSV report
          generateReport();
          return;
        }
      }

      try {
        const tableOptions = {
          startY: by + bh + 8,
          head: [['Name', 'Phone', 'Status', 'Submitted', 'Notes']],
          body,
          styles: { cellPadding: 3, fontSize: 9 },
          headStyles: { fillColor: [230,230,230], textColor: [0,0,0], fontStyle: 'bold' },
          didParseCell: (data: any) => {
            if (data.column.index === 2 && data.cell.text) {
              const val = data.cell.text[0];
              let tc: [number, number, number] = [0, 0, 0];
              if (val === 'Pending') tc = [245, 158, 11];
              if (val === 'Accepted') tc = [34, 197, 94];
              if (val === 'Rejected') tc = [239, 68, 68];
              if (val === 'Done') tc = [16, 185, 129];
              data.cell.styles.textColor = tc;
            }
          }
        };

        // Diagnostic log to help identify runtime shape
        console.debug('autoTableFn type:', typeof autoTableFn, 'has pdf.autoTable:', typeof (pdf as any).autoTable === 'function');

        // Try invocation patterns until one succeeds
        if (typeof autoTableFn === 'function') {
          // Common: autoTable(doc, options)
          await autoTableFn(pdf, tableOptions);
        } else if (typeof (pdf as any).autoTable === 'function') {
          // Plugin attached to pdf instance: pdf.autoTable(options)
          (pdf as any).autoTable(tableOptions);
        } else if (autoTableFn && typeof autoTableFn.default === 'function') {
          // Sometimes the module provides a .default callable
          await autoTableFn.default(pdf, tableOptions);
        } else {
          console.warn('autoTable plugin not callable; using simple table renderer fallback.');

          // Simple, dependency-free table renderer as a guaranteed fallback
          const drawSimpleTable = (doc: any, opts: any) => {
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;
            const colCount = opts.head[0].length;
            const contentWidth = pageWidth - margin * 2;
            const colWidth = contentWidth / colCount;
            const rowHeight = 8;
            let yPos = opts.startY || (by + bh + 8);
            doc.setFontSize(9);

            // header (bold, dark)
            doc.setFillColor(230,230,230);
            doc.rect(margin, yPos, contentWidth, rowHeight, 'F');
            // bold header text
            try { doc.setFont(undefined, 'bold'); } catch (e) { /* ignore if font style not available */ }
            doc.setTextColor(0,0,0);
            doc.setFontSize(10);
            opts.head[0].forEach((h: string, i: number) => {
              const x = margin + i * colWidth + 2;
              doc.text(String(h), x, yPos + 6);
            });
            // reset font to normal for body
            try { doc.setFont(undefined, 'normal'); } catch (e) { /* ignore */ }
            doc.setFontSize(9);
            yPos += rowHeight + 2;

            // rows
            for (const row of opts.body) {
              if (yPos + rowHeight > doc.internal.pageSize.getHeight() - margin) {
                doc.addPage();
                yPos = margin;
              }

              // write each cell, wrapping text as needed
              let maxLines = 1;
              row.forEach((cell: any, i: number) => {
                const x = margin + i * colWidth + 2;
                const text = String(cell || '');
                const lines = doc.splitTextToSize(text, colWidth - 4);
                doc.setTextColor(0,0,0);
                doc.text(lines, x, yPos + 4);
                if (lines.length > maxLines) maxLines = lines.length;
              });

              // advance y by row height + wrapped lines
              yPos += rowHeight + (maxLines - 1) * 4;
            }
          };

          drawSimpleTable(pdf, tableOptions);
        }
      } catch (autoErr: any) {
        console.error('autoTable error:', autoErr);
        setPdfError(`autoTable error: ${autoErr?.message || autoErr}`);
        alert(`PDF table generation failed: ${autoErr?.message || autoErr}`);
        // fallback to CSV export and stop
        generateReport();
        return;
      }

      // If logo exists, redraw it on every page as a header (helps multi-page reports)
      if (logoImg && logoPlacement) {
        const totalPages = pdf.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
          pdf.setPage(p);
          pdf.addImage(logoImg.dataUrl, 'PNG', logoPlacement.x, logoPlacement.y, logoPlacement.w, logoPlacement.h);
        }
        pdf.setPage(1);
      }

      pdf.save(`appointments_report_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err: any) {
      console.error('PDF generation error:', err);
      alert(`Failed to generate PDF: ${err?.message || err}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const SummaryCard = ({
    title,
    count,
    icon,
    bgColor
  }: {
    title: string;
    count: number;
    icon: React.ReactNode;
    bgColor: string;
  }) => (
    <div className="bg-white p-4 rounded-lg border shadow-sm flex items-center">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${bgColor}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold">{count}</p>
      </div>
    </div>
  );

  const statusOptions: AppointmentStatus[] = ['Pending', 'Accepted', 'Rejected', 'Done'];

  /* ================= RENDER ================= */
  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold mb-6">Admin Dashboard</h2>

      {/* SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <SummaryCard title="Total Requests" count={filteredAppointments.length} icon={<TotalRequestsIcon />} bgColor="bg-blue-100" />
        <SummaryCard title="Pending" count={counts.Pending || 0} icon={<PendingIcon />} bgColor="bg-yellow-100" />
        <SummaryCard title="Accepted" count={counts.Accepted || 0} icon={<AcceptedIcon />} bgColor="bg-teal-100" />
        <SummaryCard title="Rejected" count={counts.Rejected || 0} icon={<RejectedIcon />} bgColor="bg-red-100" />
        <SummaryCard title="Done" count={counts.Done || 0} icon={<DoneIcon />} bgColor="bg-green-100" />
      </div>

      {/* FILTERS */}
      <div className="bg-white p-4 rounded-lg border shadow-sm mb-6">
        <div className="flex flex-wrap gap-3 justify-between">
          <input
            type="text"
            placeholder="Search name or phone"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="p-2 border rounded-lg text-sm"
          />

          <select value={quickDate} onChange={e => setQuickDate(e.target.value as any)} className="p-2 border rounded-lg text-sm">
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_week">Last Week</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
          </select>

          <div className="flex gap-2 items-center">
            <input type="date" value={fromDate} onChange={e => { setQuickDate('all'); setFromDate(e.target.value); }} className="p-2 border rounded-lg text-sm" />
            <span className="text-sm text-gray-500">to</span>
            <input type="date" value={toDate} onChange={e => { setQuickDate('all'); setToDate(e.target.value); }} className="p-2 border rounded-lg text-sm" />
          </div>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="p-2 border rounded-lg text-sm">
            <option value="All">All Status</option>
            {statusOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <button onClick={generateReport} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">CSV Report</button>
            <button onClick={generatePdf} disabled={generatingPdf} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm">{generatingPdf ? 'Generating...' : 'Generate PDF'}</button>
            <button onClick={testPdf} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm">Test PDF</button>
            <button onClick={clearFilters} className="px-3 py-2 bg-gray-200 text-gray-800 rounded-lg text-sm">Clear Filters</button>
          </div>

        </div>

        <div className="mt-2 text-sm text-gray-600">
          Showing <strong>{filteredAppointments.length}</strong> of <strong>{appointments.length}</strong>
          {(searchTerm || fromDate || toDate || filterStatus !== 'All' || monthFilter !== 'all' || quickDate !== 'all') && (
            <span> • Filters: {[
              searchTerm ? `search=${searchTerm}` : null,
              fromDate ? `from=${fromDate}` : null,
              toDate ? `to=${toDate}` : null,
              filterStatus !== 'All' ? `status=${filterStatus}` : null,
              quickDate !== 'all' ? `quick=${quickDate}` : null,
              monthFilter !== 'all' ? monthFilter : null
            ].filter(Boolean).join(', ')}</span>
          )}
          {pdfError && <div className="mt-2 p-2 text-sm text-red-700 bg-red-50 rounded">PDF Error: {pdfError}</div>}
        </div>
      </div>

      {/* LIST */}
      {loading ? (
        <p className="text-center text-gray-500">Loading...</p>
      ) : filteredAppointments.length === 0 ? (
        <p className="text-center text-gray-500">No appointments found</p>
      ) : (
        <div className="space-y-4">
          {filteredAppointments.map(app => (
            <div key={app.id} className="bg-white border rounded-lg p-4 flex flex-col md:flex-row justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold">{app.customer_name}</h4>
                  <StatusBadge status={app.status} />
                </div>
                <p className="text-sm text-gray-500">
                  {app.customer_phone} • {new Date(app.created_at).toLocaleString()}
                </p>

                <div className="flex gap-2 flex-wrap">
                  {Array.isArray(app.image_urls) &&
                    app.image_urls.map((img, i) => (
                      <a key={i} href={img} target="_blank" rel="noreferrer">
                        <img src={img} className="w-20 h-20 object-cover rounded border" />
                      </a>
                    ))}
                </div>
              </div>

              <select
                value={app.status}
                onChange={e => handleStatusChange(app.id, e.target.value as AppointmentStatus)}
                disabled={updatingId === app.id}
                className="p-2 border rounded-lg text-sm"
              >
                {statusOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
