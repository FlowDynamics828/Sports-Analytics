/**
 * Base Component class for Sports Analytics Pro
 * This serves as the foundation for all UI components
 */
class Component {
  /**
   * Initialize a new component
   * @param {string|HTMLElement} container - Element ID or HTML Element that will contain this component
   * @param {Object} options - Configuration options for the component
   */
  constructor(container, options = {}) {
    // Store options
    this.options = Object.assign({
      autoInit: true,      // Whether to automatically initialize the component
      autoRender: true,    // Whether to automatically render after initialization
      debug: false,        // Whether to log debug information
      events: {},          // Event handlers for this component
    }, options);
    
    // Find the container element
    this.container = typeof container === 'string' 
      ? document.getElementById(container) 
      : container;
      
    if (!this.container && this.options.debug) {
      console.warn(`Component: Container not found: ${container}`);
      return;
    }
    
    // Create an event emitter for this component
    this.events = {
      on: (eventName, handler) => {
        if (!this._eventHandlers) this._eventHandlers = {};
        if (!this._eventHandlers[eventName]) this._eventHandlers[eventName] = [];
        this._eventHandlers[eventName].push(handler);
      },
      off: (eventName, handler) => {
        if (!this._eventHandlers || !this._eventHandlers[eventName]) return;
        this._eventHandlers[eventName] = this._eventHandlers[eventName]
          .filter(h => h !== handler);
      },
      emit: (eventName, ...args) => {
        if (!this._eventHandlers || !this._eventHandlers[eventName]) return;
        this._eventHandlers[eventName].forEach(handler => handler.apply(this, args));
      }
    };
    
    // Bind user-defined event handlers
    if (this.options.events) {
      Object.entries(this.options.events).forEach(([event, handler]) => {
        this.events.on(event, handler);
      });
    }
    
    // Auto-initialize if specified
    if (this.options.autoInit) {
      this.init();
    }
  }
  
  /**
   * Initialize the component
   * This should be overridden by child classes
   */
  init() {
    this.debug('Component initialized');
    
    // Auto-render if specified
    if (this.options.autoRender) {
      this.render();
    }
  }
  
  /**
   * Render the component
   * This should be overridden by child classes
   */
  render() {
    this.debug('Component rendered');
    return this;
  }
  
  /**
   * Update the component with new data
   * @param {Object} data - New data for the component
   */
  update(data = {}) {
    this.data = Object.assign(this.data || {}, data);
    this.debug('Component updated with data', this.data);
    return this;
  }
  
  /**
   * Detach event listeners and remove the component
   */
  destroy() {
    this.debug('Component destroyed');
    // Component-specific cleanup should happen in child classes
    this._eventHandlers = {};
  }
  
  /**
   * Log debug messages if debugging is enabled
   * @param {...any} args - Arguments to log
   */
  debug(...args) {
    if (this.options.debug) {
      console.log(`[${this.constructor.name}]`, ...args);
    }
  }
  
  /**
   * Create a DOM element with attributes and content
   * @param {string} tag - HTML tag name
   * @param {Object} attrs - HTML attributes
   * @param {string|Array|HTMLElement} content - Element content
   * @returns {HTMLElement} The created element
   */
  createElement(tag, attrs = {}, content = null) {
    const element = document.createElement(tag);
    
    // Set attributes
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.substring(2).toLowerCase(), value);
      } else {
        element.setAttribute(key, value);
      }
    });
    
    // Set content
    if (content !== null) {
      if (Array.isArray(content)) {
        content.forEach(item => {
          if (item instanceof HTMLElement) {
            element.appendChild(item);
          } else {
            element.appendChild(document.createTextNode(String(item)));
          }
        });
      } else if (content instanceof HTMLElement) {
        element.appendChild(content);
      } else {
        element.textContent = String(content);
      }
    }
    
    return element;
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Component;
} 