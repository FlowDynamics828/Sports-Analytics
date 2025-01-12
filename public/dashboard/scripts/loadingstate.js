class LoadingState {
    constructor() {
        this.loadingElements = new Map();
    }

    show(elementId, message = 'Loading...') {
        const element = document.getElementById(elementId);
        if (!element) return;

        const loadingHtml = `
            <div class="loading-overlay absolute inset-0 bg-gray-900/50 flex items-center justify-center">
                <div class="text-center">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    <p class="mt-2 text-sm text-gray-300">${message}</p>
                </div>
            </div>
        `;

        this.loadingElements.set(elementId, element.innerHTML);
        element.style.position = 'relative';
        element.insertAdjacentHTML('beforeend', loadingHtml);
    }

    hide(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const loadingOverlay = element.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }

        element.style.position = '';
    }
}

export default new LoadingState();