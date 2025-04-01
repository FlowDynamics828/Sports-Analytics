/**
 * Sports Analytics Pro - Enterprise Dashboard Initialization
 * Simple initialization script to bootstrap the dashboard functionality
 */

// Load dashboard data and initialize components
document.addEventListener('DOMContentLoaded', function() {
    // Simulate loading
    simulateLoading();
    
    // Initialize dashboard components
    initializeDashboard();
});

// Simulate loading for demo purposes
function simulateLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    const progressBar = document.getElementById('loading-progress-bar');
    let progress = 0;
    
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 100) {
            progress = 100;
            clearInterval(interval);
            setTimeout(() => {
                loadingOverlay.classList.add('opacity-0');
                setTimeout(() => {
                    loadingOverlay.classList.add('hidden');
                }, 500);
            }, 500);
        }
        progressBar.style.width = `${progress}%`;
    }, 200);
}

// Initialize dashboard
function initializeDashboard() {
    // Set initial values for metrics
    document.getElementById('gamesPlayedMetric').textContent = '1,024';
    document.getElementById('averageScoreMetric').textContent = '112.4';
    document.getElementById('winRateMetric').textContent = '62.3%';
    document.getElementById('predictionAccuracyMetric').textContent = '76.8%';
    
    // Add event listeners for tab navigation
    const tabButtons = document.querySelectorAll('.dashboard-tab-button');
    const tabContents = document.querySelectorAll('.dashboard-tab');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // Update tab button states
            tabButtons.forEach(btn => {
                btn.classList.remove('text-blue-500', 'bg-gray-700', 'bg-opacity-50');
                btn.classList.add('text-gray-400', 'hover:text-white', 'hover:bg-gray-700');
            });
            
            button.classList.remove('text-gray-400', 'hover:text-white', 'hover:bg-gray-700');
            button.classList.add('text-blue-500', 'bg-gray-700', 'bg-opacity-50');
            
            // Update tab content visibility
            tabContents.forEach(content => {
                content.classList.add('hidden');
            });
            
            document.getElementById(tabId).classList.remove('hidden');
            document.getElementById('dashboard-section-title').textContent = tabId.replace('dashboard', '');
        });
    });
    
    // Initialize prediction tab functionality
    initializePredictionTabs();
    
    // Handle settings modal
    const settingsButton = document.getElementById('settings-button');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    
    if (settingsButton && settingsModal && closeSettingsBtn) {
        settingsButton.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
        });
        
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    }
    
    // Add event listener for sidebar toggle
    const sidebarToggle = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            const isCollapsed = sidebar.getAttribute('data-collapsed') === 'true';
            
            if (isCollapsed) {
                sidebar.setAttribute('data-collapsed', 'false');
                sidebar.classList.remove('w-16');
                sidebar.classList.add('w-64');
            } else {
                sidebar.setAttribute('data-collapsed', 'true');
                sidebar.classList.remove('w-64');
                sidebar.classList.add('w-16');
            }
        });
    }
    
    // Handle user menu
    const userMenuButton = document.getElementById('userMenuButton');
    const userMenu = document.getElementById('userMenu');
    
    if (userMenuButton && userMenu) {
        userMenuButton.addEventListener('click', () => {
            userMenu.classList.toggle('hidden');
        });
        
        // Close when clicking outside
        document.addEventListener('click', (event) => {
            if (!userMenuButton.contains(event.target) && !userMenu.contains(event.target)) {
                userMenu.classList.add('hidden');
            }
        });
    }
    
    // Initialize actions dropdown
    const actionsButton = document.getElementById('actions-dropdown-button');
    const actionsMenu = document.getElementById('actions-dropdown-menu');
    
    if (actionsButton && actionsMenu) {
        actionsButton.addEventListener('click', () => {
            actionsMenu.classList.toggle('hidden');
        });
        
        // Close when clicking outside
        document.addEventListener('click', (event) => {
            if (!actionsButton.contains(event.target) && !actionsMenu.contains(event.target)) {
                actionsMenu.classList.add('hidden');
            }
        });
    }
    
    // Initialize mobile sidebar toggle
    const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
    
    if (mobileSidebarToggle && sidebar) {
        mobileSidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('-translate-x-full');
        });
    }
    
    // Create a simple performance chart
    const performanceCtx = document.getElementById('performance-chart');
    if (performanceCtx) {
        const performanceChart = new Chart(performanceCtx, {
            type: 'line',
            data: {
                labels: ['Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5', 'Game 6'],
                datasets: [{
                    label: 'Lakers',
                    data: [98, 105, 92, 110, 107, 118],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    tension: 0.3
                }, {
                    label: 'Warriors',
                    data: [102, 98, 88, 105, 114, 110],
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: 'rgb(209, 213, 219)',
                            font: { family: 'Inter' }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(75, 85, 99, 0.2)'
                        },
                        ticks: {
                            color: 'rgb(156, 163, 175)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(75, 85, 99, 0.2)'
                        },
                        ticks: {
                            color: 'rgb(156, 163, 175)'
                        }
                    }
                }
            }
        });
    }
}

// Initialize prediction tabs functionality
function initializePredictionTabs() {
    const predictionTabs = document.querySelectorAll('.prediction-tab');
    const predictionPanels = document.querySelectorAll('.prediction-panel');
    
    if (predictionTabs.length > 0 && predictionPanels.length > 0) {
        predictionTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.getAttribute('data-tab');
                
                // Update tab active states
                predictionTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update panel visibility
                predictionPanels.forEach(panel => panel.classList.remove('active'));
                const targetPanel = document.getElementById(`${tabId}-panel`);
                if (targetPanel) {
                    targetPanel.classList.add('active');
                }
            });
        });
    }
    
    // Initialize single factor prediction
    initializeSingleFactorPrediction();
    
    // Initialize multi-factor prediction
    initializeMultiFactorPrediction();
}

// Initialize single factor prediction functionality
function initializeSingleFactorPrediction() {
    const submitButton = document.getElementById('submit-single-factor');
    if (!submitButton) return;
    
    submitButton.addEventListener('click', async () => {
        const inputElement = document.getElementById('single-factor-input');
        const resultContainer = document.getElementById('single-factor-result');
        const probabilityElement = document.getElementById('single-factor-probability');
        const probabilityBar = document.getElementById('single-factor-probability-bar');
        const explanationElement = document.getElementById('single-factor-explanation');
        
        if (!inputElement || !resultContainer || !probabilityElement || !probabilityBar || !explanationElement) return;
        
        const factor = inputElement.value.trim();
        if (!factor) {
            showToast('Please enter a prediction factor', 'error');
            return;
        }
        
        try {
            // Show loading state
            submitButton.disabled = true;
            submitButton.textContent = 'Calculating...';
            
            const response = await fetch('/api/predictions/single-factor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    factor: { description: factor },
                    confidence: 0.8
                })
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const result = await response.json();
            
            // Display the result
            resultContainer.classList.remove('hidden');
            
            const probabilityPercent = Math.round(result.probability * 100);
            probabilityElement.textContent = `${probabilityPercent}%`;
            probabilityBar.style.width = `${probabilityPercent}%`;
            explanationElement.textContent = result.explanation || 'Prediction based on provided factor.';
            
            showToast('Prediction completed successfully', 'success');
        } catch (error) {
            console.error('Error submitting prediction:', error);
            showToast(`Failed to calculate prediction: ${error.message}`, 'error');
        } finally {
            // Reset button state
            submitButton.disabled = false;
            submitButton.textContent = 'Calculate Probability';
        }
    });
}

// Initialize multi-factor prediction functionality
function initializeMultiFactorPrediction() {
    const addFactorButton = document.getElementById('add-factor');
    const removeFactorButton = document.getElementById('remove-factor');
    const submitButton = document.getElementById('submit-multi-factor');
    
    if (!addFactorButton || !removeFactorButton || !submitButton) return;
    
    // Add factor button
    addFactorButton.addEventListener('click', () => {
        const container = document.getElementById('multi-factors-container');
        if (!container) return;
        
        const factorCount = container.querySelectorAll('.factor-input').length;
        if (factorCount >= 5) {
            showToast('Maximum of 5 factors allowed', 'warning');
            return;
        }
        
        const newFactorDiv = document.createElement('div');
        newFactorDiv.className = 'factor-input mb-3';
        newFactorDiv.innerHTML = `
            <label class="block text-sm font-medium text-gray-400 mb-1">Factor ${factorCount + 1}</label>
            <input type="text" class="multi-factor-input w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g., Enter a prediction factor">
        `;
        
        container.appendChild(newFactorDiv);
    });
    
    // Remove factor button
    removeFactorButton.addEventListener('click', () => {
        const container = document.getElementById('multi-factors-container');
        if (!container) return;
        
        const factorInputs = container.querySelectorAll('.factor-input');
        if (factorInputs.length <= 2) {
            showToast('Minimum of 2 factors required', 'warning');
            return;
        }
        
        container.removeChild(factorInputs[factorInputs.length - 1]);
    });
    
    // Submit button
    submitButton.addEventListener('click', async () => {
        const factorInputs = document.querySelectorAll('.multi-factor-input');
        const resultContainer = document.getElementById('multi-factor-result');
        const probabilityElement = document.getElementById('multi-factor-probability');
        const probabilityBar = document.getElementById('multi-factor-probability-bar');
        const explanationElement = document.getElementById('multi-factor-explanation');
        const breakdownList = document.getElementById('factor-breakdown-list');
        
        if (!factorInputs.length || !resultContainer || !probabilityElement || !probabilityBar || !explanationElement || !breakdownList) return;
        
        const factors = Array.from(factorInputs).map(input => input.value.trim());
        
        // Validate inputs
        if (factors.some(factor => !factor)) {
            showToast('Please fill in all factor fields', 'error');
            return;
        }
        
        try {
            // Show loading state
            submitButton.disabled = true;
            submitButton.textContent = 'Calculating...';
            
            const response = await fetch('/api/predictions/multi-factor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    factors: factors.map(factor => ({ description: factor }))
                })
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const result = await response.json();
            
            // Display the result
            resultContainer.classList.remove('hidden');
            
            const probabilityPercent = Math.round(result.compositeProbability * 100);
            probabilityElement.textContent = `${probabilityPercent}%`;
            probabilityBar.style.width = `${probabilityPercent}%`;
            explanationElement.textContent = result.explanation || 'Composite prediction based on provided factors.';
            
            // Display factor breakdown
            breakdownList.innerHTML = '';
            if (result.breakdown && result.breakdown.length) {
                result.breakdown.forEach((item, index) => {
                    const factorContribution = Math.round(item.contribution * 100);
                    const li = document.createElement('li');
                    li.className = 'mb-1 flex justify-between';
                    li.innerHTML = `
                        <span>Factor ${index + 1}:</span>
                        <span class="font-semibold">${factorContribution}% contribution</span>
                    `;
                    breakdownList.appendChild(li);
                });
            }
            
            showToast('Multi-factor prediction completed successfully', 'success');
        } catch (error) {
            console.error('Error submitting multi-factor prediction:', error);
            showToast(`Failed to calculate composite prediction: ${error.message}`, 'error');
        } finally {
            // Reset button state
            submitButton.disabled = false;
            submitButton.textContent = 'Calculate Composite Probability';
        }
    });
}

// Show a toast notification
function showToast(message, type = 'info', duration = 5000) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon mr-2">
            <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                ${type === 'error' ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>' :
                type === 'success' ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>' :
                '<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>'}
            </svg>
        </div>
        <div class="toast-message flex-grow">${message}</div>
        <button class="toast-close ml-2">
            <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
            </svg>
        </button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Close button functionality
    const closeButton = toast.querySelector('.toast-close');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            toast.classList.add('opacity-0');
            setTimeout(() => {
                toast.remove();
            }, 300);
        });
    }
    
    // Auto-dismiss after duration
    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
} 