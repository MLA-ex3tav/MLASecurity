/*
 * MLA Security - Supabase & Electron Integration
 * Seguridad: Uso de textContent para evitar XSS y validación de cliente
 */

let supabaseClient = null;

document.addEventListener('DOMContentLoaded', () => {
    const idSearch = document.getElementById('idSearch');
    const licenseTable = document.getElementById('licenseTable');

    /**
     * DEBUG 1: Detección de Host (Web vs Electron)
     */
    function checkHost() {
        const electronPill = document.getElementById('electronStatus');
        const statusText = electronPill.querySelector('.status-text');
        
        // Verificamos si existe el objeto process (típico de Electron con nodeIntegration)
        // o si el userAgent contiene "Electron"
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
     * CARGA DE DATOS SEGURA
     */
    async function loadLicenses() {
        if (!supabaseClient) return;

        const { data, error } = await supabaseClient
            .from('licenses')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error al obtener datos:", error.message);
            return;
        }

        if (data && data.length > 0) {
            licenseTable.innerHTML = ''; // Limpiar tabla
            
            data.forEach(item => {
                const row = document.createElement('tr');
                
                // Creamos los elementos de forma segura para evitar XSS
                const idCell = document.createElement('td');
                idCell.className = 'id-machine';
                idCell.textContent = item.id_machine || item.id;

                const statusCell = document.createElement('td');
                const statusDiv = document.createElement('div');
                statusDiv.className = 'status-cell';
                const dot = document.createElement('span');
                const isActive = item.status === 'active';
                dot.className = `status-dot ${isActive ? 'active' : 'blocked'}`;
                statusDiv.appendChild(dot);
                statusDiv.appendChild(document.createTextNode(isActive ? ' Activo' : ' Bloqueado'));
                statusCell.appendChild(statusDiv);

                const actionsCell = document.createElement('td');
                actionsCell.className = 'actions';
                
                const btnAuth = document.createElement('button');
                btnAuth.className = 'btn-authorize';
                btnAuth.textContent = 'Autorizar';
                btnAuth.onclick = () => updateStatus(item.id, 'active');

                const btnBlock = document.createElement('button');
                btnBlock.className = 'btn-block';
                btnBlock.textContent = 'Bloquear';
                btnBlock.onclick = () => updateStatus(item.id, 'blocked');

                actionsCell.appendChild(btnAuth);
                actionsCell.appendChild(btnBlock);

                row.appendChild(idCell);
                row.appendChild(statusCell);
                row.appendChild(actionsCell);
                
                licenseTable.appendChild(row);
            });
        } else {
            // Caso: Conexión OK pero base de datos vacía
            licenseTable.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 11px; text-transform: uppercase;">
                        No hay licencias registradas en la base de datos
                    </td>
                </tr>
            `;
        }
    }

    // Inicializar verificaciones
    checkHost();
    checkSupabase();

    // Filtro de búsqueda optimizado
    if (idSearch) {
        idSearch.addEventListener('input', (e) => {
            const filter = e.target.value.toUpperCase();
            const rows = licenseTable.getElementsByTagName('tr');
            
            for (let row of rows) {
                const idText = row.querySelector('.id-machine')?.textContent || "";
                row.style.display = idText.toUpperCase().includes(filter) ? "" : "none";
            }
        });
    }
});

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
        location.reload(); 
    } catch (err) {
        alert("Error de seguridad o red: " + err.message);
    }
}
