let currentChartInstance = null;
let plantChartInstance = null;
let signaturePieInstance = null;

// 1. Line Chart for Sensor Degradation
function renderSensorChart(canvasId, historyData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (currentChartInstance) currentChartInstance.destroy();

    const labels = historyData && historyData.length > 0 
        ? historyData.map(item => `W${item.Week || item.week || ''}`)
        : ['W1', 'W5', 'W10', 'W15', 'W20 (Trip)'];

    const values = historyData && historyData.length > 0
        ? historyData.map(item => parseFloat(item["Overall Vibration (mm/s)"] || item["Overall Vibration  (mm/s)"] || item.val || 4.0))
        : [4.0, 4.4, 5.8, 8.5, 11.2];

    currentChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sensor Trend',
                data: values,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

// 2. Bar Chart for Plant Financial Loss Breakdown
function renderPlantLossChart(canvasId, plantLossData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (plantChartInstance) plantChartInstance.destroy();

    const labels = Object.keys(plantLossData);
    const values = Object.values(plantLossData).map(v => v / 1000);

    plantChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Loss ($k)',
                data: values,
                backgroundColor: '#f97316',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
            }
        }
    });
}

// 3. Pie Chart for Signature Distribution
function renderSignaturePieChart(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (signaturePieInstance) signaturePieInstance.destroy();

    signaturePieInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Bearing Vibration', 'Coupling Loose', 'Seal Leakage', 'Tube Fouling', 'Motor Overheat'],
            datasets: [{
                data: [35, 25, 20, 12, 8],
                backgroundColor: ['#ef4444', '#f97316', '#3b82f6', '#8b5cf6', '#10b981'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 } } }
            }
        }
    });
}