class Toast {
    constructor() {
        this.createContainer();
    }

    createContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed top-4 right-4 z-50 space-y-2';
        document.body.appendChild(container);
    }

    show(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `
            ${type === 'error' ? 'bg-red-500' : 'bg-blue-500'} 
            text-white px-4 py-2 rounded shadow-lg transform transition-all duration-300
        `;
        toast.textContent = message;

        const container = document.getElementById('toast-container');
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

export default new Toast();