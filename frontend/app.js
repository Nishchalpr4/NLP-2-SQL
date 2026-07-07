// ==========================================================================
// Config & State Management
// ==========================================================================
const API_BASE_URL = 'http://127.0.0.1:8000';
let groqApiKey = localStorage.getItem('groq_api_key') || '';
let queryHistory = JSON.parse(localStorage.getItem('sql_query_history')) || [];
let currentResults = []; // Holds current query execution rows
let currentColumns = []; // Holds current columns
let currentPage = 1;
const ROWS_PER_PAGE = 10;

// ==========================================================================
// DOM Elements
// ==========================================================================
const groqKeyInput = document.getElementById('groq-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const connectionBadge = document.getElementById('connection-badge');

const schemaContent = document.getElementById('schema-explorer-content');
const refreshSchemaBtn = document.getElementById('refresh-schema-btn');

const historyContent = document.getElementById('query-history-content');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const promptInput = document.getElementById('prompt-input');
const generateSqlBtn = document.getElementById('generate-sql-btn');
const chips = document.querySelectorAll('.chip');

const sqlCardWrapper = document.getElementById('sql-card-wrapper');
const sqlEditor = document.getElementById('sql-editor');
const executeSqlBtn = document.getElementById('execute-sql-btn');

const resultsCardWrapper = document.getElementById('results-card-wrapper');
const resultsTableHead = document.getElementById('results-thead');
const resultsTableBody = document.getElementById('results-tbody');
const rowCountIndicator = document.getElementById('row-count-indicator');
const exportCsvBtn = document.getElementById('export-csv-btn');

const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageNumIndicator = document.getElementById('page-num-indicator');

const alertContainer = document.getElementById('alert-container');

// ==========================================================================
// Init & Event Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Load saved API key
    if (groqApiKey) {
        groqKeyInput.value = groqApiKey;
        saveKeyBtn.classList.add('saved');
        updateConnectionBadge(true);
    } else {
        updateConnectionBadge(false);
    }

    // Set up events
    saveKeyBtn.addEventListener('click', saveApiKey);
    refreshSchemaBtn.addEventListener('click', fetchSchema);
    clearHistoryBtn.addEventListener('click', clearHistory);
    generateSqlBtn.addEventListener('click', generateSQL);
    executeSqlBtn.addEventListener('click', executeSQL);
    exportCsvBtn.addEventListener('click', exportToCSV);
    prevPageBtn.addEventListener('click', () => changePage(-1));
    nextPageBtn.addEventListener('click', () => changePage(1));

    // Keyboard shortcut to run SQL (Ctrl + Enter)
    sqlEditor.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            executeSQL();
        }
    });

    // Chips click handling
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            promptInput.value = chip.getAttribute('data-prompt');
            promptInput.focus();
        });
    });

    // Initial loads
    fetchSchema();
    renderHistory();
});

// ==========================================================================
// API Key Management
// ==========================================================================
function saveApiKey() {
    const key = groqKeyInput.value.trim();
    if (key) {
        localStorage.setItem('groq_api_key', key);
        groqApiKey = key;
        saveKeyBtn.classList.add('saved');
        updateConnectionBadge(true);
        showAlert('Groq API Key saved successfully!', 'success');
        fetchSchema(); // re-fetch schema on key update if database was disconnected
    } else {
        localStorage.removeItem('groq_api_key');
        groqApiKey = '';
        saveKeyBtn.classList.remove('saved');
        updateConnectionBadge(false);
        showAlert('Groq API Key cleared.', 'warning');
    }
}

function updateConnectionBadge(isConnected) {
    if (isConnected) {
        connectionBadge.className = 'badge badge-connected';
        connectionBadge.querySelector('.label').textContent = 'Groq Ready';
    } else {
        connectionBadge.className = 'badge badge-disconnected';
        connectionBadge.querySelector('.label').textContent = 'Key Missing';
    }
}

// ==========================================================================
// Schema Explorer (Part 3 Bonus)
// ==========================================================================
async function fetchSchema() {
    try {
        schemaContent.innerHTML = `
            <div class="loading-state">
                <i class="fa-solid fa-circle-notch fa-spin"></i> Loading schema...
            </div>
        `;
        const res = await fetch(`${API_BASE_URL}/api/schema`);
        if (!res.ok) throw new Error('Failed to fetch schema');
        
        const data = await res.json();
        renderSchema(data.schema);
    } catch (err) {
        schemaContent.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation text-error"></i>
                <p>Failed to connect to backend server. Make sure FastAPI is running.</p>
            </div>
        `;
    }
}

function renderSchema(schema) {
    if (!schema || Object.keys(schema).length === 0) {
        schemaContent.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-database"></i>
                <p>No tables found in database. Run seed.py.</p>
            </div>
        `;
        return;
    }

    schemaContent.innerHTML = '';
    
    for (const [tableName, columns] of Object.entries(schema)) {
        const tableDiv = document.createElement('div');
        tableDiv.className = 'schema-table-item';
        
        // Header
        const header = document.createElement('div');
        header.className = 'schema-table-header';
        header.innerHTML = `
            <span class="schema-table-name"><i class="fa-solid fa-table"></i> ${tableName}</span>
            <i class="fa-solid fa-chevron-down chevron"></i>
        `;
        header.addEventListener('click', () => {
            tableDiv.classList.toggle('collapsed');
        });
        
        // Column list
        const columnList = document.createElement('div');
        columnList.className = 'schema-column-list';
        
        columns.forEach(col => {
            const colDiv = document.createElement('div');
            colDiv.className = 'schema-column-item';
            
            // Double click insertion helper
            colDiv.title = "Double-click to insert into editors";
            colDiv.addEventListener('dblclick', () => {
                insertTextAtCursor(col.name);
            });
            
            colDiv.innerHTML = `
                <div class="schema-col-info">
                    <span class="schema-col-name">${col.name}</span>
                    ${col.pk ? '<i class="fa-solid fa-key schema-col-pk" title="Primary Key"></i>' : ''}
                </div>
                <span class="schema-col-type">${col.type.toLowerCase()}</span>
            `;
            columnList.appendChild(colDiv);
        });
        
        tableDiv.appendChild(header);
        tableDiv.appendChild(columnList);
        schemaContent.appendChild(tableDiv);
    }
}

// Helper to double click insert column/table names into textarea
function insertTextAtCursor(text) {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.id === 'prompt-input' || activeEl.id === 'sql-editor')) {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        const val = activeEl.value;
        activeEl.value = val.substring(0, start) + text + val.substring(end);
        activeEl.selectionStart = activeEl.selectionEnd = start + text.length;
        activeEl.focus();
    } else {
        // Default to prompt input if no active target
        const start = promptInput.selectionStart;
        const end = promptInput.selectionEnd;
        const val = promptInput.value;
        promptInput.value = val.substring(0, start) + text + val.substring(end);
        promptInput.focus();
    }
}

// ==========================================================================
// Part 1: Natural Language Translation
// ==========================================================================
async function generateSQL() {
    const prompt = promptInput.value.trim();
    
    // Check Part 1 edge case: Empty or too short
    if (!prompt || prompt.length < 3) {
        showAlert('Please enter a descriptive natural language prompt first.', 'danger');
        promptInput.focus();
        return;
    }

    if (!groqApiKey) {
        showAlert('Missing Groq API Key! Please paste your key in the header input and save.', 'danger');
        groqKeyInput.focus();
        return;
    }

    setGeneratingState(true);
    hideAlerts();
    resultsCardWrapper.classList.add('hidden');

    try {
        const res = await fetch(`${API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Groq-Api-Key': groqApiKey
            },
            body: JSON.stringify({ prompt: prompt })
        });

        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.detail || 'Failed to translate query.');
        }

        // Show SQL Card and set SQL Editor contents
        sqlCardWrapper.classList.remove('hidden');
        sqlEditor.value = data.sql;
        
        // Auto-scroll to SQL block
        sqlCardWrapper.scrollIntoView({ behavior: 'smooth' });
        
    } catch (err) {
        showAlert(err.message, 'danger');
    } finally {
        setGeneratingState(false);
    }
}

function setGeneratingState(isGenerating) {
    if (isGenerating) {
        generateSqlBtn.disabled = true;
        generateSqlBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Generating SQL...`;
    } else {
        generateSqlBtn.disabled = false;
        generateSqlBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate SQL`;
    }
}

// ==========================================================================
// Part 2 & 3: Run SQL and Fetch Data
// ==========================================================================
async function executeSQL() {
    const sql = sqlEditor.value.trim();
    const prompt = promptInput.value.trim();

    if (!sql) {
        showAlert('SQL text is empty.', 'danger');
        return;
    }

    setExecutingState(true);
    hideAlerts();
    resultsCardWrapper.classList.add('hidden');

    try {
        const res = await fetch(`${API_BASE_URL}/api/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sql: sql })
        });

        const data = await res.json();

        if (!res.ok) {
            // Save failure item to history as failed run
            addToHistory(prompt, sql, false, data.detail || 'SQL Error');
            throw new Error(data.detail || 'Failed to execute query.');
        }

        currentResults = data.rows;
        currentColumns = data.columns;
        currentPage = 1;

        // Display results
        resultsCardWrapper.classList.remove('hidden');
        renderResultsTable();

        // Save successfully run query to history
        addToHistory(prompt, sql, true);

        // Scroll to results
        resultsCardWrapper.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        showAlert(err.message, 'danger');
    } finally {
        setExecutingState(false);
    }
}

function setExecutingState(isExecuting) {
    if (isExecuting) {
        executeSqlBtn.disabled = true;
        executeSqlBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Executing...`;
    } else {
        executeSqlBtn.disabled = false;
        executeSqlBtn.innerHTML = `<i class="fa-solid fa-play"></i> Run Query`;
    }
}

// ==========================================================================
// Part 4: Results Display with Pagination
// ==========================================================================
function renderResultsTable() {
    resultsTableHead.innerHTML = '';
    resultsTableBody.innerHTML = '';

    // Handle Edge Case: 0 rows returned
    if (currentResults.length === 0) {
        rowCountIndicator.textContent = 'Showing 0 results';
        exportCsvBtn.disabled = true;
        
        // Render 0 rows placeholder inside the table body
        resultsTableBody.innerHTML = `
            <tr>
                <td colspan="100" class="text-center" style="padding: 2rem; color: var(--text-muted);">
                    <i class="fa-solid fa-circle-info" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>
                    Query executed successfully, but returned 0 results.
                </td>
            </tr>
        `;
        
        // Hide pagination controls
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        pageNumIndicator.textContent = 'Page 0 of 0';
        return;
    }

    exportCsvBtn.disabled = false;
    rowCountIndicator.textContent = `Showing ${currentResults.length} result${currentResults.length === 1 ? '' : 's'}`;

    // 1. Generate Headers
    const trHead = document.createElement('tr');
    currentColumns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        trHead.appendChild(th);
    });
    resultsTableHead.appendChild(trHead);

    // 2. Paginate Rows
    const totalPages = Math.ceil(currentResults.length / ROWS_PER_PAGE);
    const startIdx = (currentPage - 1) * ROWS_PER_PAGE;
    const endIdx = Math.min(startIdx + ROWS_PER_PAGE, currentResults.length);
    const pageRows = currentResults.slice(startIdx, endIdx);

    pageRows.forEach(row => {
        const trRow = document.createElement('tr');
        currentColumns.forEach(col => {
            const td = document.createElement('td');
            // Format object or nulls nicely
            const val = row[col];
            td.textContent = val === null ? 'NULL' : val;
            trRow.appendChild(td);
        });
        resultsTableBody.appendChild(trRow);
    });

    // 3. Update Pagination Buttons
    pageNumIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
}

function changePage(direction) {
    const totalPages = Math.ceil(currentResults.length / ROWS_PER_PAGE);
    currentPage += direction;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    renderResultsTable();
}

// ==========================================================================
// Part 5: Query History with Session Recall
// ==========================================================================
function addToHistory(prompt, sql, isSuccess, errorDetail = '') {
    // Avoid exact duplicate consecutive records
    if (queryHistory.length > 0 && queryHistory[0].sql === sql && queryHistory[0].isSuccess === isSuccess) {
        return;
    }

    const historyItem = {
        prompt: prompt || `Manual SQL: ${sql.slice(0, 30)}...`,
        sql: sql,
        isSuccess: isSuccess,
        error: errorDetail,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    queryHistory.unshift(historyItem);
    // Limit history length to 20
    if (queryHistory.length > 20) {
        queryHistory.pop();
    }

    localStorage.setItem('sql_query_history', JSON.stringify(queryHistory));
    renderHistory();
}

function renderHistory() {
    if (queryHistory.length === 0) {
        historyContent.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-clock-rotate-left"></i>
                <p>No queries executed yet in this session.</p>
            </div>
        `;
        return;
    }

    historyContent.innerHTML = '';
    
    queryHistory.forEach((item, idx) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'history-item';
        itemDiv.addEventListener('click', () => loadHistoryItem(idx));
        
        itemDiv.innerHTML = `
            <span class="history-prompt" title="${item.prompt}">${item.prompt}</span>
            <div class="history-meta">
                <span class="history-time"><i class="fa-regular fa-clock"></i> ${item.timestamp}</span>
                <span class="${item.isSuccess ? 'history-status-success' : 'history-status-error'}">
                    <i class="fa-solid ${item.isSuccess ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        `;
        historyContent.appendChild(itemDiv);
    });
}

function loadHistoryItem(index) {
    const item = queryHistory[index];
    if (!item) return;

    // Restore inputs
    promptInput.value = item.prompt.startsWith('Manual SQL:') ? '' : item.prompt;
    sqlEditor.value = item.sql;
    sqlCardWrapper.classList.remove('hidden');

    hideAlerts();
    resultsCardWrapper.classList.add('hidden');

    if (!item.isSuccess) {
        showAlert(item.error, 'danger');
    } else {
        // Execute the SQL again to display current results
        executeSQL();
    }
}

function clearHistory() {
    queryHistory = [];
    localStorage.removeItem('sql_query_history');
    renderHistory();
    showAlert('Query history cleared.', 'info');
}

// ==========================================================================
// Query Result Export (Bonus Feature)
// ==========================================================================
function exportToCSV() {
    if (currentResults.length === 0) return;

    // Construct CSV Header
    let csvContent = currentColumns.map(col => `"${col.replace(/"/g, '""')}"`).join(',') + '\n';

    // Construct CSV Rows
    currentResults.forEach(row => {
        const rowStr = currentColumns.map(col => {
            let val = row[col];
            if (val === null) return '""';
            val = String(val).replace(/"/g, '""');
            return `"${val}"`;
        }).join(',');
        csvContent += rowStr + '\n';
    });

    // Create Blob download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Create meaningful filename
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `sql_results_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showAlert('Results exported as CSV successfully!', 'success');
}

// ==========================================================================
// Alerts and Helpers
// ==========================================================================
function showAlert(message, type = 'info') {
    // Translate alert types to icons
    let icon = 'fa-circle-info';
    let alertClass = 'alert-info';
    
    if (type === 'danger') {
        icon = 'fa-solid fa-triangle-exclamation';
        alertClass = 'alert-danger';
    } else if (type === 'success') {
        icon = 'fa-solid fa-circle-check';
        alertClass = 'alert-success';
    } else if (type === 'warning') {
        icon = 'fa-solid fa-circle-exclamation';
        alertClass = 'alert-warning';
    }

    // Set inside container
    alertContainer.innerHTML = `
        <div class="alert ${alertClass}">
            <i class="${icon}"></i>
            <div class="alert-content">${message}</div>
        </div>
    `;
    alertContainer.classList.remove('hidden');

    // Auto dismiss after 10 seconds for standard success/warnings
    if (type !== 'danger') {
        setTimeout(() => {
            hideAlerts();
        }, 8000);
    }
}

function hideAlerts() {
    alertContainer.classList.add('hidden');
    alertContainer.innerHTML = '';
}
