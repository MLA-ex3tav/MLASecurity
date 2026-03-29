/*
 * MLA Security - Supabase & Electron Integration
 * Seguridad: Uso de textContent para evitar XSS y validación de cliente
 */

let supabaseClient = null;

// Referencias globales para evitar recargas constantes del DOM
let licenseTableElement = null;

document.addEventListener('DOMContentLoaded', () => {
    licenseTableElement = document.getElementById('licenseTable');
    const idSearch = document.getElementById('idSearch');
    const refreshBtn = document.getElementById('refreshBtn');

    // Inicializar verificaciones
    checkHost();
    checkSupabase();

    // Filtro de búsqueda optimizado
    if (idSearch) {
        idSearch.addEventListener('input', (e) => {
            const filter = e.target.value.toUpperCase();
            const rows = licenseTableElement.getElementsByTagName('tr');
            
            for (let row of rows) {
                const idText = row.querySelector('.id-machine')?.textContent || "";
                const hostText = row.querySelector('.host-name')?.textContent || "";
                
                const matches = idText.toUpperCase().includes(filter) || 
                               hostText.toUpperCase().includes(filter);
                               
                row.style.display = matches ? "" : "none";
            }
        });
    }

    if (refreshBtn) {
        refreshBtn.onclick = () => loadLicenses();
    }
});

/**
 * DEBUG 1: Detección de Host (Web vs Electron)
 */
function checkHost() {
    const electronPill = document.getElementById('electronStatus');
    if (!electronPill) return;
    
    const statusText = electronPill.querySelector('.status-text');
    const isElectron = navigator.userAgent.toLowerCase().includes('electron') || (window.process && window.process.type);

    if (isElectron) {
        electronPill.className = 'status-pill electron';
        statusText.innerText = 'App: Electron Host';
    } else {
        electronPill.className = 'status-pill web';
        statusText.innerText = 'App: Navegador Web';
    }
}

/**
 * DEBUG 2: Conexión con Supabase
 */
async function checkSupabase() {
    const statusElement = document.getElementById('connectionStatus');
    if (!statusElement) return;

    const statusText = statusElement.querySelector('.status-text');
    
    try {
        if (typeof CONFIG === 'undefined' || !supabase) {
            throw new Error("Librerías o Configuración faltantes");
        }

        if (!supabaseClient) {
            supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
        }

        // Validamos conexión consultando la tabla 'licenses'
        const { data, error } = await supabaseClient
            .from('licenses')
            .select('count', { count: 'exact', head: true });

        if (error) {
            if (error.code === 'PGRST116' || error.message.includes('relation "licenses" does not exist')) {
                statusElement.className = 'status-pill online';
                statusText.innerText = 'DB: Conectada (Sin Tabla)';
            } else {
                throw error;
            }
        } else {
            statusElement.className = 'status-pill online';
            statusText.innerText = 'DB: Supabase Online';
            loadLicenses();
        }
    } catch (error) {
        console.error("Error de DB:", error);
        statusElement.className = 'status-pill offline';
        statusText.innerText = 'DB: Desconectada';
    }
}

/**
 * CARGA DE DATOS DINÁMICA (Sin recargar página)
 */
async function loadLicenses() {
    if (!supabaseClient || !licenseTableElement) return;

    const { data, error } = await supabaseClient
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error al obtener datos:", error.message);
        return;
    }

    if (data && data.length > 0) {
        licenseTableElement.innerHTML = '';
        console.log("Datos recibidos:", data[0]); // Para ver qué campos tiene el primer registro
        
        data.forEach(item => {
            const row = document.createElement('tr');
            
            // 1. ID Máquina (Copy on click)
            const idCell = document.createElement('td');
            idCell.className = 'id-machine';
            idCell.style.cursor = 'pointer';
            idCell.title = "Click para copiar";
            idCell.textContent = item.id_machine || item.id;
            idCell.onclick = () => {
                navigator.clipboard.writeText(idCell.textContent);
                const old = idCell.textContent;
                idCell.textContent = "COPIADO";
                setTimeout(() => idCell.textContent = old, 800);
            };

            // 2. Nombre del Equipo (hostname)
            const hostCell = document.createElement('td');
            hostCell.className = 'host-name'; // Clase para búsqueda
            hostCell.style.fontSize = '12px';
            hostCell.textContent = item.hostname || "Sin nombre";

            // 3. Fecha Registro
            const createdCell = document.createElement('td');
            createdCell.style.color = 'var(--text-muted)';
            createdCell.textContent = formatDT(item.created_at);

            // 4. Último Visto (last_seen)
            const updatedCell = document.createElement('td');
            updatedCell.style.color = 'var(--text-muted)';
            updatedCell.textContent = formatDT(item.last_seen);

            // 5. Estado / Acción
            const statusCell = document.createElement('td');
            const btn = document.createElement('button');
            const isActive = item.status === 'active';
            
            btn.textContent = isActive ? 'Activo' : 'Bloqueado';
            btn.className = isActive ? 'status-btn active' : 'status-btn blocked';
            
            btn.onclick = async () => {
                btn.style.opacity = '0.5';
                btn.disabled = true;
                await updateStatus(item.id, isActive ? 'blocked' : 'active');
            };
            
            statusCell.appendChild(btn);
            
            row.appendChild(idCell);
            row.appendChild(hostCell);
            row.appendChild(createdCell);
            row.appendChild(updatedCell);
            row.appendChild(statusCell);
            licenseTableElement.appendChild(row);
        });
    } else {
        licenseTableElement.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;">No hay registros de licencias</td></tr>`;
    }
}

/**
 * Helper: Formateo de fecha y hora local
 */
function formatDT(dateStr) {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { 
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
}

/**
 * ACCIONES DE BASE DE DATOS
 */
async function updateStatus(id, newStatus) {
    if (!supabaseClient) return;
    
    try {
        const { error } = await supabaseClient
            .from('licenses')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) throw error;
        
        // En lugar de location.reload(), recargamos solo los datos
        await loadLicenses(); 
    } catch (err) {
        alert("Error de seguridad o red: " + err.message);
        await loadLicenses(); // Restaurar estado visual
    }
}
